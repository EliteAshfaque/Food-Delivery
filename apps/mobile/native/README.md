# Native order tracking handoff

Expo configuration and native-device token registration are active in the app.
Remote push requires an installed Wasil development/release build; Expo Go cannot
register a remote token.

Before testing push:

1. Run `npx eas init` from `apps/mobile` and copy the generated Expo project UUID
   to `EXPO_PUBLIC_EAS_PROJECT_ID` in `apps/mobile/.env`. Do not use the Firebase
   project ID from `google-services.json`.
2. Configure FCM v1 credentials for Android and an APNs key for iOS in the Expo/EAS
   project.
3. Rebuild the native app with `npx expo run:android` or `npx expo run:ios`, start
   Metro again, sign into the installed app, and allow notification permission.

The Metro console should print an `ExpoPushToken[...]` after the app registers it.
That token is then saved to the API for the signed-in customer, driver, or owner.

`android/OrderTrackingFirebaseMessagingService.kt` is the data-only FCM listener. Add it to the generated Android app and declare it with the `com.google.firebase.MESSAGING_EVENT` intent filter.

`ios/OrderTrackingAttributes.swift` belongs in a Live Activity widget extension. Its APNs update payload must use `apns-push-type: liveactivity` and the topic `<bundle-id>.push-type.liveactivity`.

Do not send background pushes every 5–10 seconds. Display a countdown from the server ETA locally, use the existing order Socket.IO room while the tracking screen is open, and send push only on status/rider/material ETA changes.
