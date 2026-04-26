// HMANApp.swift — SwiftUI entry point.
//
// The app is a thin shell: a tab bar wrapping the placeholder views that
// mirror the React member-app routes. Real logic comes in Wave 2 sub-issues
// (#14 motion, #15 PACT, #16 HealthKit, #17 APNs, #18 voice biometric).
//
// The `AppDelegate` adapter is what lets us receive APNs callbacks
// (`didRegisterForRemoteNotificationsWithDeviceToken:`) inside a pure
// SwiftUI app. It also wires the `UNUserNotificationCenter` delegate so
// actionable notifications route through `NotificationActions`.

import SwiftUI
#if canImport(UIKit)
import UIKit
import UserNotifications
#endif

@main
public struct HMANApp: App {
    #if canImport(UIKit)
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    #endif

    public init() {}

    public var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

#if canImport(UIKit)

/// `UIApplicationDelegate` adapter for SwiftUI. Owns the long-lived
/// `NotificationActions` instance (it's the `UNUserNotificationCenter`
/// delegate, so it must outlive the launch handshake). We deliberately
/// keep this thin — heavy lifting lives in `Push/`.
public final class AppDelegate: NSObject, UIApplicationDelegate {

    /// Strong reference: `UNUserNotificationCenter.delegate` is a weak
    /// property, so something else has to keep this alive.
    public let notificationActions = NotificationActions()

    public func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = notificationActions
        return true
    }

    public func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            await APNsRegistration.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
        }
    }

    public func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            APNsRegistration.shared.didFailToRegisterForRemoteNotifications(error: error)
        }
    }
}

#endif
