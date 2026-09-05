import type { ExpoConfig, ConfigContext } from 'expo/config';
import fs from 'fs';
import path from 'path';

/** Load apps/mobile/.env into process.env (without overriding existing vars). */
function loadDotEnv() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

export default ({ config }: ConfigContext): ExpoConfig => {
  // Native map keys are intentionally platform-specific. Keep the existing
  // public key as a temporary fallback while each platform gets its own key.
  const googleMapsAndroidApiKey =
    process.env.GOOGLE_MAPS_ANDROID_API_KEY ??
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
    '';
  const googleMapsIosApiKey =
    process.env.GOOGLE_MAPS_IOS_API_KEY ??
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
    '';
  const googleWebClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
    '181181927620-ii56m5gh1kqmq9hovj6vfquv4bm2poti.apps.googleusercontent.com';

  return {
    ...config,
    name: 'Wasil',
    slug: 'wasil',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/wasil-icon.png',
    scheme: 'wasil',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/images/wasil-icon.png',
      config: {
        googleMapsApiKey: googleMapsIosApiKey,
      },
    },
    android: {
      package: 'com.wasil.fooddelivery',
      // Uses the local Firebase file during development. For EAS builds, set
      // GOOGLE_SERVICES_JSON to the uploaded secret-file path instead.
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      usesCleartextTraffic: true,
      adaptiveIcon: {
        backgroundColor: '#25192A',
        foregroundImage: './assets/images/wasil-adaptive-foreground.png',
      },
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          apiKey: googleMapsAndroidApiKey,
        },
      },
    } as ExpoConfig['android'] & { usesCleartextTraffic: boolean },
    web: {
      output: 'static',
      favicon: './assets/images/wasil-icon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#25192A',
          image: './assets/images/wasil-splash.png',
          imageWidth: 112,
        },
      ],
      [
        '@stripe/stripe-react-native',
        {
          merchantIdentifier: 'merchant.com.fooddelivery.mobile',
          enableGooglePay: false,
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Allow Wasil to use your location for delivery tracking.',
          locationAlwaysAndWhenInUsePermission:
            'Allow Wasil to track your location in the background while delivering.',
        },
      ],
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: googleMapsAndroidApiKey,
          iosGoogleMapsApiKey: googleMapsIosApiKey,
        },
      ],
      '@react-native-google-signin/google-signin',
    ],
    extra: {
      ...config.extra,
      googleWebClientId,
    },
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
