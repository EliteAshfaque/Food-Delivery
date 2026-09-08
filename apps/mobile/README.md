# Wasil Mobile App

Expo / React Native client for customers, drivers, restaurant owners, and
mobile administrators.

## Setup

```bash
cp apps/mobile/.env.example apps/mobile/.env
pnpm install
pnpm --dir apps/api dev
```

For a physical device, set the Mac LAN IP in `apps/mobile/.env`:

```bash
ipconfig getifaddr en0
```

```env
EXPO_PUBLIC_DEV_HOST=192.168.x.x
```

## Commands

```bash
# Metro / Expo
pnpm --dir apps/mobile start
pnpm --dir apps/mobile start --clear
pnpm --dir apps/mobile start --dev-client

# Native development builds
pnpm --dir apps/mobile android
pnpm --dir apps/mobile ios

# Web, lint, and typecheck
pnpm --dir apps/mobile web
pnpm --dir apps/mobile lint
pnpm --dir apps/mobile exec tsc --noEmit
```

After changing maps, notifications, native permissions, `app.config.ts`, or
Google services, rerun `android` or `ios` to rebuild and install the app.

## Physical Android device

1. Enable USB debugging and connect phone.
2. Confirm it appears with `adb devices`.
3. Install build: `pnpm --dir apps/mobile android`.
4. Start Metro: `pnpm --dir apps/mobile start --dev-client`.
5. Open installed Wasil app, not Expo Go.

If Expo says no development build exists, install it again for that device with
the `android` command.

## iOS

On macOS, install Xcode and CocoaPods, select a simulator/signed device, then:

```bash
pnpm --dir apps/mobile ios
pnpm --dir apps/mobile start --dev-client
```

Physical iPhones require a valid Apple signing profile. APNs and Live Activity
capabilities require a native build; they cannot be fully tested in Expo Go.

## Configuration

See `.env.example` for API, Stripe, Maps, Google Sign-In, EAS, and direct FCM
variables. `EXPO_PUBLIC_ANDROID_PUSH_PROVIDER=fcm` enables direct FCM token
registration. Test remote push only in the installed development/release app,
not Expo Go.
