import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/wasil-icon-system';
import { brand } from '@/constants/brand';
import type { OrderTrackingMapProps } from './order-tracking-map.types';

/** Web build — react-native-maps is native-only. */
export function OrderTrackingMap({
  delivery,
  driver,
  live = false,
}: OrderTrackingMapProps) {
  return (
    <View style={styles.webFallback}>
      <AppIcon color={brand.colors.light.primary} name="map" size="md" />
      <Text style={styles.webFallbackText}>
        Live map is available in the Expo Go app on iOS or Android.
      </Text>
      <Text style={styles.coordsText}>
        Delivery: {delivery.latitude.toFixed(5)}, {delivery.longitude.toFixed(5)}
      </Text>
      {driver ? (
        <Text style={styles.coordsText}>
          Driver{live ? ' (live)' : ''}: {driver.latitude.toFixed(5)},{' '}
          {driver.longitude.toFixed(5)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  webFallback: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surfaceMuted,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    gap: 8,
    minHeight: 160,
    justifyContent: 'center',
    padding: 16,
  },
  webFallbackText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  coordsText: {
    color: brand.colors.light.ink,
    fontFamily: 'monospace',
    fontSize: 11,
  },
});
