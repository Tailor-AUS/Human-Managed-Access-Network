// PushTests.swift — APNs push integration tests (issue #17).
//
// We don't drive `UNUserNotificationCenter` from these tests — that
// requires a host app and a running simulator. Instead we cover:
//   - the bridge URL construction for `/api/push/register` and
//     `/api/intentions/{id}/decide`,
//   - JSON encode/decode of the new payload shapes,
//   - the `NotificationActions` category factory.

import XCTest
@testable import HMAN

final class PushTests: XCTestCase {

    // MARK: - URL construction

    func testPushRegisterURL() throws {
        let client = HMANBridgeClient(
            baseURL: URL(string: "http://127.0.0.1:8765")!,
            tokenStore: PushInMemoryTokenStore()
        )
        let url = try client.url(forPath: "/api/push/register")
        XCTAssertEqual(url.absoluteString, "http://127.0.0.1:8765/api/push/register")
    }

    func testIntentionDecideURLContainsId() throws {
        let client = HMANBridgeClient(
            baseURL: URL(string: "https://bridge.example.com")!,
            tokenStore: PushInMemoryTokenStore()
        )
        let url = try client.url(forPath: "/api/intentions/abc-123/decide")
        XCTAssertEqual(url.absoluteString, "https://bridge.example.com/api/intentions/abc-123/decide")
    }

    // MARK: - Payload shapes

    func testPushRegisterResponseDecodesSnakeCase() throws {
        let json = #"""
        {"stored": true, "member_id": "member", "registered_at": "2026-04-26T10:00:00+10:00"}
        """#.data(using: .utf8)!
        let response = try HMANBridgeClient.decoder.decode(PushRegisterResponse.self, from: json)
        XCTAssertTrue(response.stored)
        XCTAssertEqual(response.memberId, "member")
        XCTAssertEqual(response.registeredAt, "2026-04-26T10:00:00+10:00")
    }

    func testIntentionDecisionRoundTrip() throws {
        let original = IntentionDecisionResponse(
            intentionId: "abc-123",
            decision: .approve,
            channel: .apns,
            recordedAt: "2026-04-26T10:01:00+10:00"
        )
        let data = try HMANBridgeClient.encoder.encode(original)
        // Confirm wire format is snake_case + lowercase enum strings.
        let raw = String(data: data, encoding: .utf8) ?? ""
        XCTAssertTrue(raw.contains("\"intention_id\":\"abc-123\""))
        XCTAssertTrue(raw.contains("\"decision\":\"approve\""))
        XCTAssertTrue(raw.contains("\"channel\":\"apns\""))

        let decoded = try HMANBridgeClient.decoder.decode(IntentionDecisionResponse.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testIntentionDecisionEnumRawValues() {
        XCTAssertEqual(IntentionDecision.approve.rawValue, "approve")
        XCTAssertEqual(IntentionDecision.deny.rawValue, "deny")
        XCTAssertEqual(IntentionDecisionChannel.apns.rawValue, "apns")
        XCTAssertEqual(IntentionDecisionChannel.signal.rawValue, "signal")
        XCTAssertEqual(IntentionDecisionChannel.voice.rawValue, "voice")
    }

    // MARK: - Notification category

    #if canImport(UIKit)
    func testIntentionDecisionCategoryHasApproveAndDeny() {
        let category = NotificationActions.intentionDecisionCategory
        XCTAssertEqual(category.identifier, NotificationActions.CategoryId.intentionDecision)
        let actionIds = category.actions.map(\.identifier)
        XCTAssertTrue(actionIds.contains(NotificationActions.ActionId.approve))
        XCTAssertTrue(actionIds.contains(NotificationActions.ActionId.deny))
    }

    func testPayloadKeysMatchBridgeContract() {
        // These keys are part of the wire contract with `api/push.py`'s
        // `payload["intention_id"]` etc. — changing them silently breaks
        // the iOS-side handler.
        XCTAssertEqual(NotificationActions.PayloadKey.intentionId, "intention_id")
        XCTAssertEqual(NotificationActions.PayloadKey.summary, "summary")
        XCTAssertEqual(NotificationActions.PayloadKey.expiresAt, "expires_at")
    }
    #endif
}

// In-memory token store so tests don't touch the real Keychain.
private final class PushInMemoryTokenStore: BridgeTokenStore, @unchecked Sendable {
    private var stored: String?
    func token() -> String? { stored }
    func setToken(_ token: String?) throws { stored = token }
}
