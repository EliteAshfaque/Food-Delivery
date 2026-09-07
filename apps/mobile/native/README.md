# Native order tracking handoff

Expo configuration and native-device token registration are active in the app. Run `npx expo prebuild` or use an EAS development build before testing notifications.

`android/OrderTrackingFirebaseMessagingService.kt` is the data-only FCM listener. Add it to the generated Android app and declare it with the `com.google.firebase.MESSAGING_EVENT` intent filter.

`ios/OrderTrackingAttributes.swift` belongs in a Live Activity widget extension. Its APNs update payload must use `apns-push-type: liveactivity` and the topic `<bundle-id>.push-type.liveactivity`.

Do not send background pushes every 5–10 seconds. Display a countdown from the server ETA locally, use the existing order Socket.IO room while the tracking screen is open, and send push only on status/rider/material ETA changes.
