# Native order tracking handoff

Expo configuration and native-device token registration are active in the app.
Remote push requires an installed Wasil development/release build; Expo Go cannot
register a remote token.

Before testing push:

1. Choose one Android provider:
   - **Direct FCM:** configure the API's Firebase HTTP v1 credentials. An installed
     Android Wasil build automatically saves `android:fcm:<native-token>` when no
     EAS project ID is present. Set `EXPO_PUBLIC_ANDROID_PUSH_PROVIDER=fcm` to keep
     using direct FCM even after EAS is configured.
   - **Expo Push:** run `npx eas init` from `apps/mobile`, copy the generated Expo
     project UUID to `EXPO_PUBLIC_EAS_PROJECT_ID`, and configure FCM v1 credentials
     in the Expo/EAS project. Do not use the Firebase project ID from
     `google-services.json`.
2. iOS uses Expo Push/APNs and therefore requires `EXPO_PUBLIC_EAS_PROJECT_ID` plus
   an APNs key configured in the Expo/EAS project.
3. Rebuild the native app with `npx expo run:android` or `npx expo run:ios`, start
   Metro again, sign into the installed app, and allow notification permission.

The Metro console prints an `ExpoPushToken[...]` for Expo Push or an FCM token for
direct Firebase Console testing. The selected token is saved to the API for the
signed-in customer, driver, or owner.

`android/OrderTrackingFirebaseMessagingService.kt` is installed automatically by
the `with-order-tracking-android` Expo config plugin. It replaces Expo's FCM
receiver with a subclass (ordinary Expo pushes still work), creates a public
high-priority channel, and renders the active order as one foreground
lock-screen card. Re-run `npx expo prebuild` or `npx expo run:android` after a
clean native regeneration.

`ios/OrderTrackingAttributes.swift` belongs in a Live Activity widget extension. Its APNs update payload must use `apns-push-type: liveactivity` and the topic `<bundle-id>.push-type.liveactivity`.

Do not send background pushes every 5–10 seconds. Display a countdown from the server ETA locally, use the existing order Socket.IO room while the tracking screen is open, and send push only on status/rider/material ETA changes.
