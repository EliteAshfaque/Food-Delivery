import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const API_PORT = 3000;

function getLanHostFromExpo(): string | null {
  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.expoConfig?.hostUri ??
    // Legacy manifests (Expo Go / older dev clients)
    (Constants.manifest as { debuggerHost?: string } | null)?.debuggerHost;

  if (!debuggerHost) return null;

  const host = String(debuggerHost).split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return null;
  }

  return host;
}

function getDevHost(): string {
  const manualHost = process.env.EXPO_PUBLIC_DEV_HOST?.trim();
  if (manualHost) {
    return manualHost;
  }

  // Android emulator must use 10.0.2.2 (Expo also reports LAN IP, but prefer emulator alias)
  if (Platform.OS === 'android' && !Device.isDevice) {
    return '10.0.2.2';
  }

  // Physical phone / iOS: use Mac LAN IP from Metro (e.g. 192.168.8.24)
  const lanHost = getLanHostFromExpo();
  if (lanHost) {
    return lanHost;
  }

  if (Platform.OS === 'android') {
    console.warn(
      '[api-config] Physical Android: set EXPO_PUBLIC_DEV_HOST to your Mac LAN IP',
    );
  }

  return 'localhost';
}

/** API base URL — auto-detects host in dev, uses .env in production. */
export function getApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!__DEV__ && fromEnv) {
    return fromEnv;
  }

  return `http://${getDevHost()}:${API_PORT}/api`;
}

/** Server origin without /api — used for UploadThing etc. */
export function getServerUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SERVER_URL?.trim();
  if (!__DEV__ && fromEnv) {
    return fromEnv;
  }

  return `http://${getDevHost()}:${API_PORT}`;
}

if (__DEV__) {
  console.log('[api-config] API URL:', getApiUrl());
}
