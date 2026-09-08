import { isAxiosError } from 'axios';
import { isRunningInExpoGo } from 'expo';
import { useEffect } from 'react';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

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

/** Registers a device push token and handles order notification taps. */
export function OrderTrackingNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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

      // A foreground notification has already been written to
      // notification_deliveries by the API. Refresh the in-app inbox so the
      // user sees the same update immediately without needing to pull-to-
      // refresh or leave/reopen the screen.
      const receivedSubscription =
        notificationApi.addNotificationReceivedListener(() => {
          void queryClient.invalidateQueries({
            // Customer/driver/owner inboxes use `mine`; the admin mobile
            // screen uses the operations delivery log. Invalidate the shared
            // prefix so either view refreshes after a foreground push.
            queryKey: ['notifications'],
          });
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
        receivedSubscription.remove();
        tokenSubscription.remove();
      };
      void registerForOrderNotifications(notificationApi, () => isCurrent);
    });

    return () => {
      isCurrent = false;
      removeListeners?.();
    };
  }, [queryClient, userId, userRole]);

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

/**
 * Android can use Firebase Cloud Messaging directly when an Expo/EAS project
 * has not been configured yet. This is also useful for teams that manage FCM
 * credentials in their own API rather than through Expo's push service.
 *
 * The setting is deliberately opt-in when EAS is available. Without an EAS
 * project ID, Android falls back to FCM so a valid native token is never only
 * printed to Metro and then discarded.
 */
function prefersDirectFcm() {
  return process.env.EXPO_PUBLIC_ANDROID_PUSH_PROVIDER?.trim().toLowerCase() === 'fcm';
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

    // Android 13+ needs a channel before the system permission/token flow.
    if (Platform.OS === 'android') {
      // New channel ID intentionally avoids an Android limitation: once a
      // user/device has created the old quiet channel, an app cannot elevate
      // it programmatically. This channel makes active-order status visible
      // in the status bar and lock screen on Android 13+.
      await notificationApi.setNotificationChannelAsync('active-order-tracking-v2', {
        name: 'Active order tracking',
        importance: notificationApi.AndroidImportance.HIGH,
        lockscreenVisibility: notificationApi.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
        vibrationPattern: [0, 160],
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

    const projectId = getEasProjectId();
    const useDirectFcm =
      Platform.OS === 'android' && (prefersDirectFcm() || !projectId);

    // Expo Push and Firebase Console use different tokens. Fetch the native
    // Android token for a direct-FCM delivery route, and print it only in a
    // development build so it can be tested through Firebase Console.
    if (Platform.OS === 'android' && (useDirectFcm || __DEV__)) {
      try {
        const deviceToken = await notificationApi.getDevicePushTokenAsync();
        const fcmToken =
          deviceToken.type === 'android' && typeof deviceToken.data === 'string'
            ? deviceToken.data.trim()
            : '';
        if (!fcmToken) {
          throw new Error('Android did not return an FCM registration token');
        }

        if (__DEV__) {
          console.log(
            '[notifications] FCM registration token (Firebase Console test):',
            fcmToken,
          );
        }

        if (useDirectFcm) {
          if (!isCurrent()) return;
          // `fcm:` tells the API to use its direct Firebase HTTP v1 provider.
          // The API stores it as `android:fcm:<token>`; an Expo token remains
          // unmodified and continues through the Expo provider below.
          await api.post('/auth/push-token', {
            token: `fcm:${fcmToken}`,
            platform: 'android',
          });
          if (__DEV__) {
            console.log(
              '[notifications] Direct FCM token saved for the signed-in user.',
            );
          }
          return;
        }
      } catch (error) {
        console.warn(
          '[notifications] Could not obtain or save the Android FCM registration token:',
          describeRegistrationError(error),
        );
        // If Expo is configured, keep going: it may still obtain and save an
        // Expo token even if the optional development-token log failed.
        if (useDirectFcm) return;
      }
    }

    if (!projectId) {
      console.warn(
        '[notifications] Push registration is not configured for iOS: set EXPO_PUBLIC_EAS_PROJECT_ID for Expo/APNs delivery, then restart Metro and reload the app.',
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
