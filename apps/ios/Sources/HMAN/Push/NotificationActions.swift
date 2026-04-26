// NotificationActions.swift — actionable notification handling.
//
// When the receptivity gate (issue #4) decides to surface an intention
// as `channel: "text"` and the member has a registered device token, the
// bridge sends an APNs push with category `INTENTION_DECISION` whose
// `userInfo` carries:
//
//     {
//       "intention_id": "<uuid>",
//       "summary":      "<short string, lock-screen safe>",
//       "expires_at":   "<ISO 8601>"
//     }
//
// The notification surfaces with two custom buttons: **Approve** and
// **Deny**. Tapping either one fires `userNotificationCenter(_:didReceive:withCompletionHandler:)`,
// which posts the decision back to the bridge. Tapping the body of the
// notification opens the app to the consent prompt — full intention
// details are fetched on-device once the app is in the foreground, so
// nothing sensitive ever sits on the lock screen.
//
// Privacy boundaries enforced here:
//   - `summary` must already be lock-screen safe before it leaves the
//     bridge. This file does not strip or sanitise — that's the gate's
//     responsibility (see packages/core/src/messaging/push.ts).
//   - We never attach the bearer token to notification payloads.
//   - We never log payload contents in release builds.

#if canImport(UIKit)
import Foundation
import UIKit
import UserNotifications

/// Definition of the `INTENTION_DECISION` notification category and the
/// delegate that handles user responses. Wired up in `HMANApp` at launch
/// via the standard `UNUserNotificationCenter.delegate` hook.
public final class NotificationActions: NSObject, UNUserNotificationCenterDelegate {

    // MARK: - Identifiers

    public enum CategoryId {
        public static let intentionDecision = "INTENTION_DECISION"
    }

    public enum ActionId {
        public static let approve = "INTENTION_APPROVE"
        public static let deny = "INTENTION_DENY"
    }

    public enum PayloadKey {
        public static let intentionId = "intention_id"
        public static let summary = "summary"
        public static let expiresAt = "expires_at"
    }

    // MARK: - Category factory

    /// `UNNotificationCategory` registered with `UNUserNotificationCenter`.
    /// The category id matches what the bridge sets on the outgoing aps
    /// payload (`aps.category`).
    public static var intentionDecisionCategory: UNNotificationCategory {
        let approve = UNNotificationAction(
            identifier: ActionId.approve,
            title: "Approve",
            options: [.authenticationRequired]
        )
        let deny = UNNotificationAction(
            identifier: ActionId.deny,
            title: "Deny",
            options: [.destructive]
        )
        return UNNotificationCategory(
            identifier: CategoryId.intentionDecision,
            actions: [approve, deny],
            intentIdentifiers: [],
            options: []
        )
    }

    // MARK: - Stored deps

    private let client: HMANBridgeClient
    /// Posted on the main `NotificationCenter` when the body of an
    /// `INTENTION_DECISION` notification is tapped (default action).
    /// SwiftUI views observe this to deep-link into the consent prompt.
    public static let openIntentionNotification = Notification.Name("ai.hman.openIntention")

    public init(client: HMANBridgeClient = HMANBridgeClient()) {
        self.client = client
        super.init()
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Called when iOS surfaces a notification while the app is in the
    /// foreground. We let it show — banner + sound — so the member sees
    /// the consent prompt without having to switch screens.
    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    /// Called when the user taps the notification body or one of its
    /// custom actions. Routes to `decide(...)` for Approve/Deny, or
    /// posts an in-app notification for the open-app default action.
    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        defer { completionHandler() }

        let userInfo = response.notification.request.content.userInfo
        guard let intentionId = userInfo[PayloadKey.intentionId] as? String, !intentionId.isEmpty else {
            // Malformed payload — drop quietly. Logging the userInfo
            // might leak a summary, so we don't.
            return
        }

        switch response.actionIdentifier {
        case ActionId.approve:
            Task { try? await self.client.decideIntention(id: intentionId, decision: .approve, channel: .apns) }
        case ActionId.deny:
            Task { try? await self.client.decideIntention(id: intentionId, decision: .deny, channel: .apns) }
        case UNNotificationDefaultActionIdentifier:
            // Body tap: app is opening anyway, hand the intention id to
            // the SwiftUI layer so it can present the detail screen.
            NotificationCenter.default.post(
                name: NotificationActions.openIntentionNotification,
                object: nil,
                userInfo: [PayloadKey.intentionId: intentionId]
            )
        default:
            break  // dismissals, custom actions added later, etc.
        }
    }
}

#endif
