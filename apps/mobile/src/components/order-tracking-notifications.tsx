import { isAxiosError } from 'axios';
import { isRunningInExpoGo } from 'expo';
import { useEffect } from 'react';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { api } from '@/lib/axios';
import { getApiUrl } from '@/lib/api-config';
import { useAuth } from '@/context/auth-context';

// Expo Go no longer bundles remote push support. Keep the ordinary app
// experience usable there; development/release builds still register normally.
// `executionEnvironment === StoreClient` is also true in an Expo development
// build, so use Expo's native check instead of trying to infer it from that.
const isExpoGo = isRunningInExpoGo();
const supportsRemoteNotifications = !isExpoGo;

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: Promise<NotificationsModule | null> | null = null;

// Expo Go SDK 53+ throws if this native module is loaded. A dynamic import
// keeps that runtime-only dependency out of Expo Go while development/release
// builds still initialize it once for the app session.
function loadNotifications() {
  if (!supportsRemoteNotifications) return Promise.resolve(null);

  notificationsModule ??= import('expo-notifications')
    .then((notificationApi) => {
      notificationApi.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      return notificationApi;
    })
    .catch((error) => {
      if (__DEV__) console.warn('Notification module unavailable', error);
      return null;
    });

  return notificationsModule;
}

/** Registers an Expo push token (routed to FCM/APNs) and handles order taps. */
export function OrderTrackingNotifications() {
  const { user } = useAuth();
  const userId = user?.id;
  const userRole = user?.role;

  useEffect(() => {
    // A token belongs to the currently authenticated account. Delaying all
    // registration until login prevents an unauthenticated 401 from being
    // silently swallowed and makes account switching safe.
    if (!userId) return;

    let isCurrent = true;
    let removeListeners: (() => void) | undefined;

    void loadNotifications().then((notificationApi) => {
      if (!isCurrent) return;
      if (!notificationApi) {
        console.warn(
          '[notifications] Remote push is unavailable in Expo Go. Open the installed Wasil development or release build, then sign in again.',
        );
        return;
      }

      const responseSubscription =
        notificationApi.addNotificationResponseReceivedListener((response) => {
          const orderId = response.notification.request.content.data?.orderId;
          if (userRole === 'DRIVER') {
            router.push('/(driver)/active' as never);
          } else if (userRole === 'RESTAURANT_OWNER') {
            router.push('/(owner)/(index)' as never);
          } else if (typeof orderId === 'string') {
            router.push(`/(customer)/(index)/oder/${orderId}` as never);
          }
        });

      // Expo emits a native-token change when FCM/APNs rolls a device token.
      // Fetching a new Expo token here keeps the server's token valid for the
      // signed-in user rather than continuing to send to a stale token.
      const tokenSubscription = notificationApi.addPushTokenListener(() => {
        if (!isCurrent) return;
        if (__DEV__) {
          console.log('[notifications] Device push token changed; re-syncing.');
        }
        void registerForOrderNotifications(notificationApi, () => isCurrent);
      });

      removeListeners = () => {
        responseSubscription.remove();
        tokenSubscription.remove();
      };
      void registerForOrderNotifications(notificationApi, () => isCurrent);
    });

    return () => {
      isCurrent = false;
      removeListeners?.();
    };
  }, [userId, userRole]);

  return null;
}

function getEasProjectId() {
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  return typeof projectId === 'string' && projectId.trim()
    ? projectId.trim()
    : null;
}

function describeRegistrationError(error: unknown) {
  if (isAxiosError(error)) {
    if (error.response) {
      return `The API rejected push-token registration (HTTP ${error.response.status}). Sign in again and retry.`;
    }
    return `Could not reach ${getApiUrl()} to save the push token. On a physical phone, set EXPO_PUBLIC_DEV_HOST to your Mac LAN IP and restart Metro.`;
  }

  return error instanceof Error
    ? error.message
    : 'Unknown push registration error';
}

async function registerForOrderNotifications(
  notificationApi: NotificationsModule,
  isCurrent: () => boolean,
) {
  try {
    if (!isCurrent()) return;

    if (Platform.OS === 'web') {
      if (__DEV__) {
        console.log('[notifications] Web does not register mobile push tokens.');
      }
      return;
    }

    if (!Device.isDevice) {
      console.warn(
        '[notifications] Push token registration is skipped on this simulator. Test with the installed Wasil app on a physical device.',
      );
      return;
    }

    const projectId = getEasProjectId();
    if (!projectId) {
      console.warn(
        '[notifications] Push registration is not configured: missing EAS project ID. Set EXPO_PUBLIC_EAS_PROJECT_ID to the Expo/EAS project UUID (not the Firebase project ID), restart Metro, then reload the Wasil development build.',
      );
      return;
    }

    // Android 13+ needs a channel before the system permission/token flow.
    if (Platform.OS === 'android') {
      await notificationApi.setNotificationChannelAsync('active-order-tracking', {
        name: 'Active order tracking',
        importance: notificationApi.AndroidImportance.DEFAULT,
        lockscreenVisibility: notificationApi.AndroidNotificationVisibility.PUBLIC,
        sound: null,
        vibrationPattern: [0],
      });
    }

    const existing = await notificationApi.getPermissionsAsync();
    const permission = existing.granted
      ? existing
      : await notificationApi.requestPermissionsAsync();
    if (!permission.granted) {
      console.warn(
        permission.canAskAgain
          ? '[notifications] Notification permission was not granted. Approve the system prompt to receive order updates.'
          : '[notifications] Notifications are disabled for Wasil. Enable them in the device Settings, then reopen the app.',
      );
      return;
    }

    // Expo Push Service routes this token to FCM/APNs. It matches the backend
    // delivery provider; raw device tokens would require direct FCM/APNs keys.
    const token = await notificationApi.getExpoPushTokenAsync({ projectId });
    if (!isCurrent()) return;

    if (__DEV__) {
      console.log('[notifications] Expo push token:', token.data);
    }

    await api.post('/auth/push-token', {
      token: token.data,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (__DEV__) {
      console.log('[notifications] Push token saved for the signed-in user.');
    }
  } catch (error) {
    // Push registration must never block ordering or tracking.
    console.warn(
      '[notifications] Push registration failed:',
      describeRegistrationError(error),
    );
  }
}
