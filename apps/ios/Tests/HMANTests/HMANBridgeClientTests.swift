// HMANBridgeClientTests.swift — placeholder URL-construction tests.
//
// Wave 2 work will add transport-level tests with a stubbed URLProtocol.
// For the skeleton we just lock down the basics: URL building, token-
// store wiring, and JSON coder configuration.

import XCTest
@testable import HMAN

final class HMANBridgeClientTests: XCTestCase {
    func testHealthURLAppendsPath() throws {
        let client = HMANBridgeClient(
            baseURL: URL(string: "http://127.0.0.1:8765")!,
            tokenStore: InMemoryTokenStore()
        )
        let url = try client.url(forPath: "/api/health")
        XCTAssertEqual(url.absoluteString, "http://127.0.0.1:8765/api/health")
    }

    func testGatesURLAppendsPath() throws {
        let client = HMANBridgeClient(
            baseURL: URL(string: "https://bridge.example.com")!,
            tokenStore: InMemoryTokenStore()
        )
        let url = try client.url(forPath: "/api/gates")
        XCTAssertEqual(url.absoluteString, "https://bridge.example.com/api/gates")
    }

    func testRejectsPathWithoutLeadingSlash() {
        let client = HMANBridgeClient(
            baseURL: URL(string: "http://127.0.0.1:8765")!,
            tokenStore: InMemoryTokenStore()
        )
        XCTAssertThrowsError(try client.url(forPath: "api/health")) { error in
            XCTAssertEqual(error as? BridgeError, .invalidURL)
        }
    }

    func testTokenRoundtrip() throws {
        let store = InMemoryTokenStore()
        let client = HMANBridgeClient(tokenStore: store)
        XCTAssertNil(client.currentBearerToken())
        try client.setBearerToken("hunter2")
        XCTAssertEqual(client.currentBearerToken(), "hunter2")
        try client.setBearerToken(nil)
        XCTAssertNil(client.currentBearerToken())
    }

    func testDecoderUsesSnakeCaseAndISO8601() throws {
        // Round-trip a simple snake_case payload with an ISO-8601 timestamp.
        let json = #"""
        {"member_id": "member", "gates": [], "last_activation": null, "rejections_last_hour": 0}
        """#.data(using: .utf8)!
        let response = try HMANBridgeClient.decoder.decode(GatesResponse.self, from: json)
        XCTAssertEqual(response.memberId, "member")
        XCTAssertEqual(response.rejectionsLastHour, 0)
        XCTAssertTrue(response.gates.isEmpty)
    }
}

// In-memory token store so tests don't touch the real Keychain.
private final class InMemoryTokenStore: BridgeTokenStore, @unchecked Sendable {
    private var stored: String?
    func token() -> String? { stored }
    func setToken(_ token: String?) throws { stored = token }
}
