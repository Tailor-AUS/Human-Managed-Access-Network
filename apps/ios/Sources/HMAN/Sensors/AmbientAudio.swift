// AmbientAudio.swift — always-on circular ambient-audio buffer.
//
// The "40 words a day" model rests on listening cheaply, transcribing rarely.
// This file owns the *cheap* half: a 60-second `RingBuffer<Float>` fed by
// `AVAudioEngine.inputNode.installTap`. Nothing is written to disk. The
// receptivity gate (#4) borrows the most recent N seconds via `lastWindow`
// only when it has decided the moment is worth surfacing — at which point
// the bridge can transcribe the snippet in memory and discard.
//
// Background mode: with `UIBackgroundModes = ["audio", "processing"]` and an
// active audio session in `.record`/`.playAndRecord` category, iOS keeps the
// tap running while the screen is locked. The manual test plan in the PR
// description verifies this for 30+ minutes.
//
// Threading: the engine's render thread invokes the tap callback off the main
// actor. We keep the ring buffer behind a lock and only publish derived stats
// (`@Published var rms`) from `MainActor.run`.

import Foundation
import Combine
#if canImport(AVFoundation)
import AVFoundation
#endif

/// Generic fixed-capacity ring buffer for `Float` samples. Internally
/// non-locking — the owner serialises access. Exposed at file scope so other
/// sensors (EEG-on-iOS, future watch-bridge) can reuse the type.
public struct RingBuffer<Element> {
    public private(set) var capacity: Int
    private var storage: [Element]
    private var head: Int = 0
    public private(set) var count: Int = 0

    public init(capacity: Int, fill: Element) {
        precondition(capacity > 0, "RingBuffer needs positive capacity")
        self.capacity = capacity
        self.storage = Array(repeating: fill, count: capacity)
    }

    public mutating func append(_ value: Element) {
        storage[head] = value
        head = (head + 1) % capacity
        if count < capacity { count += 1 }
    }

    public mutating func append(contentsOf values: UnsafeBufferPointer<Element>) {
        for v in values { append(v) }
    }

    /// Read the last `n` samples in chronological order. If `n` exceeds
    /// `count`, returns whatever is available.
    public func suffix(_ n: Int) -> [Element] {
        let take = Swift.min(n, count)
        guard take > 0 else { return [] }
        var out: [Element] = []
        out.reserveCapacity(take)
        let start = (head - take + capacity) % capacity
        for i in 0..<take {
            out.append(storage[(start + i) % capacity])
        }
        return out
    }

    public var allSamples: [Element] { suffix(count) }
}

/// Always-on ambient-audio capture. Not `@MainActor`-isolated — the engine's
/// tap callback fires on a render thread and we need to push samples into the
/// ring buffer from there. `@Published` mutations are hopped to the main
/// queue explicitly via `DispatchQueue.main.async`.
public final class AmbientAudio: ObservableObject, @unchecked Sendable {
    /// Most recent root-mean-square level over the last ~50ms tap, normalised
    /// to roughly `[0, 1]`. The receptivity gate uses this as a coarse
    /// "is something happening" signal.
    @Published public private(set) var rms: Float = 0

    /// True while the engine is running and tapping the input node.
    @Published public private(set) var isCapturing: Bool = false

    /// Human-readable last error, surfaced to the debug view. We don't throw
    /// from `start()` because the receptivity gate must keep working even if
    /// audio capture fails (no permission, no input device, etc.).
    @Published public private(set) var lastError: String?

    /// Sample rate the engine is running at. Captured on `start()` so
    /// `lastWindow(seconds:)` can convert correctly.
    @Published public private(set) var sampleRate: Double = 0

    private let bufferSeconds: Int
    private let bufferLock = NSLock()
    private var buffer: RingBuffer<Float>

    #if canImport(AVFoundation) && !os(macOS)
    private let engine = AVAudioEngine()
    #endif

    public init(bufferSeconds: Int = 60) {
        self.bufferSeconds = bufferSeconds
        // Provisional capacity at 16 kHz; resized on `start()` once we know
        // the actual hardware sample rate.
        self.buffer = RingBuffer(capacity: bufferSeconds * 16_000, fill: 0)
    }

    /// Start capturing. Idempotent. Returns `true` if the engine is running
    /// after the call (already-running counts as success).
    @discardableResult
    public func start() -> Bool {
        #if canImport(AVFoundation) && !os(macOS)
        if engine.isRunning { return true }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth, .mixWithOthers, .defaultToSpeaker])
            try session.setActive(true, options: [])

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            // Resize the buffer now we know the real rate.
            let newCap = max(1, Int(format.sampleRate) * bufferSeconds)
            bufferLock.lock()
            self.buffer = RingBuffer(capacity: newCap, fill: 0)
            bufferLock.unlock()

            input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buf, _ in
                self?.consume(buffer: buf)
            }
            try engine.start()
            publishMain {
                self.sampleRate = format.sampleRate
                self.isCapturing = true
                self.lastError = nil
            }
            return true
        } catch {
            publishMain {
                self.lastError = String(describing: error)
                self.isCapturing = false
            }
            return false
        }
        #else
        publishMain { self.lastError = "AVAudioEngine unavailable on this platform" }
        return false
        #endif
    }

    public func stop() {
        #if canImport(AVFoundation) && !os(macOS)
        guard engine.isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        publishMain { self.isCapturing = false }
        #endif
    }

    /// Hop to the main queue if we aren't already there. `@Published`
    /// requires main-thread mutation; the engine's render thread does not
    /// qualify.
    private func publishMain(_ block: @escaping () -> Void) {
        if Thread.isMainThread {
            block()
        } else {
            DispatchQueue.main.async(execute: block)
        }
    }

    /// Snapshot RMS over the most recent tap callback. Exposed so the
    /// receptivity gate can poll without subscribing to `$rms`.
    public func currentRMS() -> Float { rms }

    /// Copy out the last `seconds` of samples in chronological order. Returns
    /// `[]` when capture isn't running or the buffer is empty.
    public func lastWindow(seconds: Double) -> [Float] {
        let n = Int(Double(seconds) * sampleRate)
        guard n > 0 else { return [] }
        bufferLock.lock()
        defer { bufferLock.unlock() }
        return buffer.suffix(n)
    }

    // ── Tap callback (engine render thread) ────────────────────────────

    #if canImport(AVFoundation) && !os(macOS)
    private func consume(buffer pcm: AVAudioPCMBuffer) {
        guard let channelData = pcm.floatChannelData else { return }
        let frameCount = Int(pcm.frameLength)
        let channel0 = UnsafeBufferPointer(start: channelData[0], count: frameCount)

        // Compute RMS off-actor; we only hop to main to publish.
        var sumSquares: Float = 0
        for i in 0..<frameCount {
            let s = channel0[i]
            sumSquares += s * s
        }
        let rmsValue = frameCount > 0 ? (sumSquares / Float(frameCount)).squareRoot() : 0

        // Append into the ring buffer under the lock.
        bufferLock.lock()
        buffer.append(contentsOf: channel0)
        bufferLock.unlock()

        publishMain { self.rms = rmsValue }
    }
    #endif
}

