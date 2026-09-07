import { useEffect } from 'react';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { api } from '@/lib/axios';
import { useAuth } from '@/context/auth-context';

// Expo Go no longer bundles remote push support. Keep the ordinary app
// experience usable there; development/release builds still register normally.
const supportsRemoteNotifications =
  Constants.expoGoConfig == null && Constants.appOwnership !== 'expo';

if (supportsRemoteNotifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Registers an Expo push token (routed to FCM/APNs) and handles order taps. */
export function OrderTrackingNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!supportsRemoteNotifications) {
      if (__DEV__) {
        console.log(
          '[notifications] Push token skipped: open the Wasil development build, not Expo Go.',
        );
      }
      return;
    }

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const orderId = response.notification.request.content.data?.orderId;
        if (user?.role === 'DRIVER') {
          router.push('/(driver)/active' as never);
        } else if (user?.role === 'RESTAURANT_OWNER') {
          router.push('/(owner)/(index)' as never);
        } else if (typeof orderId === 'string') {
          router.push(`/(customer)/(index)/oder/${orderId}` as never);
        }
      },
    );

    void registerForOrderNotifications();
    return () => responseSubscription.remove();
  }, [user?.role]);

  return null;
}

async function registerForOrderNotifications() {
  try {
    if (!supportsRemoteNotifications || !Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    const permission = existing.granted
      ? existing
      : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('active-order-tracking', {
        name: 'Active order tracking',
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: null,
        vibrationPattern: [0],
      });
    }

    // Expo Push Service routes this token to FCM/APNs. It matches the backend
    // delivery provider; raw device tokens would require direct FCM/APNs keys.
    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (__DEV__) {
      console.log('[notifications] Expo push token:', token.data);
    }
    await api.post('/auth/push-token', {
      token: token.data,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
  } catch (error) {
    // Push registration must never block ordering or tracking.
    if (__DEV__) console.warn('Push registration failed', error);
  }
}
