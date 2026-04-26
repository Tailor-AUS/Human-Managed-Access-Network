// HMANBridgeClient.swift — typed wrapper around the FastAPI bridge surface.
//
// The bridge runs on the member's own device (default http://127.0.0.1:8765
// in development; reachable over an attested tunnel in production). All
// calls are bearer-token authenticated. The token lives in the iOS Keychain
// (KeychainAccess wrapper) so reinstall / app-relaunch keeps the trust
// relationship.
//
// JSON convention: snake_case on the wire (matches `packages/shared/src/types`
// when those are serialised by FastAPI), ISO-8601 dates. The shared
// `JSONDecoder` and `JSONEncoder` factories below enforce that.
//
// Wave 2 sub-issues will extend this client:
//   #14 — motion telemetry POST
//   #15 — PACT signature submission
//   #16 — HealthKit ingest
//   #17 — APNs device-token registration
//   #18 — voice-biometric verify
// Stubbed methods are kept minimal here: health, gates, enrollment kickoff.

import Foundation
import KeychainAccess

public enum BridgeError: Error, Sendable, Equatable {
    /// Bridge URL was malformed.
    case invalidURL
    /// Underlying URLSession transport failure (network, TLS, host unreachable).
    case transport(String)
    /// Non-2xx HTTP status. `detail` is the bridge's `{"detail": "..."}` body
    /// when present, mirroring FastAPI's error shape.
    case http(status: Int, detail: String?)
    /// JSON decode/encode failure on a 2xx response or a request body.
    case decoding(String)
    /// Bearer token not configured. Caller should drive the user through
    /// onboarding to mint and store one.
    case missingToken
}

public protocol BridgeTokenStore: Sendable {
    func token() -> String?
    func setToken(_ token: String?) throws
}

/// Default Keychain-backed token store. Service id is namespaced so a
/// future multi-account flow can swap it without colliding.
public struct KeychainTokenStore: BridgeTokenStore {
    private let keychain: Keychain
    private let key: String

    public init(service: String = "ai.hman.bridge", key: String = "bearer-token") {
        self.keychain = Keychain(service: service)
        self.key = key
    }

    public func token() -> String? {
        try? keychain.get(key)
    }

    public func setToken(_ token: String?) throws {
        if let token, !token.isEmpty {
            try keychain.set(token, key: key)
        } else {
            try keychain.remove(key)
        }
    }
}

public final class HMANBridgeClient: @unchecked Sendable {
    public static let defaultBaseURL = URL(string: "http://127.0.0.1:8765")!

    private let baseURL: URL
    private let session: URLSession
    private let tokenStore: BridgeTokenStore

    public init(
        baseURL: URL = HMANBridgeClient.defaultBaseURL,
        session: URLSession = .shared,
        tokenStore: BridgeTokenStore = KeychainTokenStore()
    ) {
        self.baseURL = baseURL
        self.session = session
        self.tokenStore = tokenStore
    }

    // ── Public surface ──────────────────────────────────────────────

    /// `GET /api/health`. Doesn't require auth in dev mode but we still
    /// attach the token if present — the bridge accepts it either way.
    public func health() async throws -> BridgeHealth {
        try await get("/api/health", requiresAuth: false)
    }

    /// `GET /api/gates`. Aggregate Gate 1..5 status.
    public func gatesStatus() async throws -> GatesResponse {
        try await get("/api/gates")
    }

    /// `POST /api/enrollment/session` — kicks off voice enrolment for #18.
    public func enrollmentBegin(passphrase: String, memberId: String = "member") async throws -> EnrollmentSession {
        struct Body: Encodable {
            let passphrase: String
            let memberId: String

            enum CodingKeys: String, CodingKey {
                case passphrase
                case memberId = "member_id"
            }
        }
        return try await post("/api/enrollment/session", body: Body(passphrase: passphrase, memberId: memberId))
    }

    // ── Token management (delegates to the configured store) ────────

    public func setBearerToken(_ token: String?) throws {
        try tokenStore.setToken(token)
    }

    public func currentBearerToken() -> String? {
        tokenStore.token()
    }

    // ── URL construction (testable in isolation) ────────────────────

    /// Build a request URL by appending `path` (which must start with `/`)
    /// to the configured base URL. Exposed for tests.
    public func url(forPath path: String) throws -> URL {
        guard path.hasPrefix("/"), var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw BridgeError.invalidURL
        }
        // Append path without dropping the base path (none today, but
        // future tunnel deployments might mount the bridge under a prefix).
        components.path = (components.path == "/" ? "" : components.path) + path
        guard let url = components.url else {
            throw BridgeError.invalidURL
        }
        return url
    }

    // ── Internals ───────────────────────────────────────────────────

    private func get<Response: Decodable>(_ path: String, requiresAuth: Bool = true) async throws -> Response {
        var request = URLRequest(url: try url(forPath: path))
        request.httpMethod = "GET"
        try attachAuth(&request, required: requiresAuth)
        return try await send(request)
    }

    private func post<Body: Encodable, Response: Decodable>(
        _ path: String,
        body: Body,
        requiresAuth: Bool = true
    ) async throws -> Response {
        var request = URLRequest(url: try url(forPath: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        try attachAuth(&request, required: requiresAuth)
        do {
            request.httpBody = try Self.encoder.encode(body)
        } catch {
            throw BridgeError.decoding("encode: \(error)")
        }
        return try await send(request)
    }

    private func attachAuth(_ request: inout URLRequest, required: Bool) throws {
        if let token = tokenStore.token(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else if required {
            throw BridgeError.missingToken
        }
    }

    private func send<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw BridgeError.transport(String(describing: error))
        }
        guard let http = response as? HTTPURLResponse else {
            throw BridgeError.transport("non-HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let detail = Self.decodeErrorDetail(data)
            throw BridgeError.http(status: http.statusCode, detail: detail)
        }
        do {
            return try Self.decoder.decode(Response.self, from: data)
        } catch {
            throw BridgeError.decoding(String(describing: error))
        }
    }

    private static func decodeErrorDetail(_ data: Data) -> String? {
        // FastAPI returns {"detail": "..."} on HTTPException. Decode loosely.
        struct Body: Decodable { let detail: String? }
        return (try? JSONDecoder().decode(Body.self, from: data))?.detail
    }

    // ── Shared coders ───────────────────────────────────────────────
    //
    // FastAPI emits snake_case JSON keys and ISO-8601 timestamps. Our
    // Swift models declare CodingKeys explicitly where the mapping is
    // non-obvious; for any model that doesn't, .convertFromSnakeCase
    // falls through. ISO-8601 covers `Date` round-trip.

    public static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    public static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}
