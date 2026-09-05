import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { brand } from '@/constants/brand';
import type { Coordinates } from '@/hooks/user-order.socket';
import type { OrderTrackingMapProps } from './order-tracking-map.types';

export type { OrderTrackingMapProps };

function regionForPoints(
  delivery: Coordinates,
  driver?: Coordinates | null,
): Region {
  if (!driver) {
    return {
      latitude: delivery.latitude,
      longitude: delivery.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
  }

  const minLat = Math.min(delivery.latitude, driver.latitude);
  const maxLat = Math.max(delivery.latitude, driver.latitude);
  const minLng = Math.min(delivery.longitude, driver.longitude);
  const maxLng = Math.max(delivery.longitude, driver.longitude);
  const latDelta = Math.max((maxLat - minLat) * 1.8, 0.01);
  const lngDelta = Math.max((maxLng - minLng) * 1.8, 0.01);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export function OrderTrackingMap({
  delivery,
  driver,
  live = false,
  destinationTitle = 'Your delivery',
  destinationDescription = 'Drop-off location',
}: OrderTrackingMapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    const region = regionForPoints(delivery, driver);
    mapRef.current?.animateToRegion(region, 450);
  }, [delivery, driver]);

  return (
    <View style={styles.wrap}>
      <MapView
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        ref={mapRef}
        style={styles.map}
        initialRegion={regionForPoints(delivery, driver)}
        showsUserLocation={false}
        showsMyLocationButton={false}
        rotateEnabled={false}>
        <Marker
          coordinate={delivery}
          title={destinationTitle}
          description={destinationDescription}
          pinColor={brand.colors.light.primary}
        />
        {driver ? (
          <Marker
            coordinate={driver}
            title="Driver"
            description={live ? 'Live location' : 'Last known location'}
            pinColor={brand.colors.light.mint}
          />
        ) : null}
      </MapView>
      {live ? (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Driver live</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: brand.radius.large,
    overflow: 'hidden',
    height: 220,
    borderWidth: 1,
    borderColor: brand.colors.light.border,
  },
  map: {
    flex: 1,
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(37,25,42,0.82)',
    borderRadius: brand.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: brand.colors.light.mint,
  },
  liveText: {
    color: '#FFF8F4',
    fontSize: 11,
    fontWeight: '800',
  },
});
