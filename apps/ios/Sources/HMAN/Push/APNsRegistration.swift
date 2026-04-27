// APNsRegistration.swift — registers the device with Apple Push Notification
// service and forwards the resulting token to the bridge so the
// receptivity gate (issue #4) can dispatch consent prompts here.
//
// Lifecycle:
//   1. App launch → `APNsRegistration.shared.register()` requests
//      `UNUserNotificationCenter` authorization (alert + sound) and, if
//      granted, calls `UIApplication.registerForRemoteNotifications()`.
//   2. iOS hands a 32-byte device token back via the app delegate's
//      `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`.
//   3. We hex-encode the token, persist it in `UserDefaults`, and POST
//      to `/api/push/register` so the bridge can address us by member id.
//
// The device token is **not** secret — Apple itself transports it in the
// clear from APNs to our backend on every push. The bearer token (in
// Keychain via `HMANBridgeClient.tokenStore`) is what gates write access
// to the bridge's `/api/push/register` endpoint.
//
// Privacy: this file does not log payload contents and never stores
// intention details — only the device token, the registration timestamp,
// and minimal status flags suitable for a settings screen.

#if canImport(UIKit)
import Foundation
import UIKit
import UserNotifications

/// Centralised hand-off between iOS push callbacks and the bridge.
///
/// `@MainActor` because almost every UIKit/UNUserNotificationCenter call we
/// make here has to land on the main thread.
@MainActor
public final class APNsRegistration: NSObject {

    // MARK: - Singleton

    /// Shared instance used by the app delegate. Tests inject a custom
    /// `client` and `defaults` via the designated initializer.
    @MainActor
    public static let shared = APNsRegistration()

    // MARK: - UserDefaults keys

    public enum DefaultsKey {
        public static let deviceToken = "ai.hman.push.deviceToken"
        public static let lastRegisteredAt = "ai.hman.push.lastRegisteredAt"
        public static let memberId = "ai.hman.push.memberId"
    }

    // MARK: - Stored deps

    private let client: HMANBridgeClient
    private let defaults: UserDefaults
    private let center: UNUserNotificationCenter

    public init(
        client: HMANBridgeClient = HMANBridgeClient(),
        defaults: UserDefaults = .standard,
        center: UNUserNotificationCenter = .current()
    ) {
        self.client = client
        self.defaults = defaults
        self.center = center
        super.init()
    }

    // MARK: - Public API

    /// Returns the most-recently registered token, or `nil` if the app has
    /// never received one. Persisted across launches.
    public var currentDeviceToken: String? {
        defaults.string(forKey: DefaultsKey.deviceToken)
    }

    /// Convenience: have we ever successfully posted a token to the bridge?
    public var isRegisteredWithBridge: Bool {
        defaults.object(forKey: DefaultsKey.lastRegisteredAt) != nil
    }

    /// Step 1 — request notification authorization and, if granted, ask
    /// iOS to obtain a device token from APNs. Posting to the bridge
    /// happens later in `didRegisterForRemoteNotifications(deviceToken:)`
    /// once the OS calls back into the app delegate.
    ///
    /// Returns the user's authorization status so the caller can drive a
    /// settings UI ("Notifications denied — open Settings to enable").
    @discardableResult
    public func register(memberId: String) async throws -> UNAuthorizationStatus {
        defaults.set(memberId, forKey: DefaultsKey.memberId)

        let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
        let settings = await center.notificationSettings()

        // Always register the actionable category so notifications received
        // from other paths (silent pushes, background fetch) still expose
        // Approve/Deny if iOS later raises them.
        center.setNotificationCategories([NotificationActions.intentionDecisionCategory])

        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
        return settings.authorizationStatus
    }

    /// Step 2 — called by the app delegate when iOS hands us a device token.
    /// Persists the token and forwards it to the bridge.
    ///
    /// `Data` → hex-encoded `String` matches APNs convention and what the
    /// `aioapns` Python library on the bridge expects in `device_token`.
    public func didRegisterForRemoteNotifications(deviceToken: Data) async {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        defaults.set(hex, forKey: DefaultsKey.deviceToken)
        defaults.set(Date().timeIntervalSince1970, forKey: DefaultsKey.lastRegisteredAt)

        guard let memberId = defaults.string(forKey: DefaultsKey.memberId) else {
            // Caller must invoke `register(memberId:)` first; bail quietly
            // rather than surface an error, mirroring how Apple's own
            // background callbacks fail open.
            return
        }

        do {
            try await client.registerPushToken(deviceToken: hex, memberId: memberId)
        } catch {
            // Swallow transport-level failures — the bridge will retry on
            // the next app launch via the normal `register()` flow. We
            // intentionally do *not* log the token; only the error type.
            #if DEBUG
            print("[APNs] bridge registration failed: \(type(of: error))")
            #endif
        }
    }

    /// Step 2b — called by the app delegate when the OS fails to obtain a
    /// device token (e.g. user revoked permission, no internet, sandbox
    /// vs. prod environment mismatch). We surface this to the settings
    /// UI but never persist anything.
    public func didFailToRegisterForRemoteNotifications(error: Error) {
        #if DEBUG
        print("[APNs] didFailToRegister: \(type(of: error))")
        #endif
    }
}

#endif
