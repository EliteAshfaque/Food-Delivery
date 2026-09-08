import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type MapMarker,
  type Region,
} from 'react-native-maps';

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
  const driverMarkerRef = useRef<MapMarker>(null);
  const lastDriverRef = useRef<Coordinates | null>(null);
  const hasFittedLiveRoute = useRef(false);
  // Keep the React prop on the first GPS point. On Android, changing this
  // prop for every socket event teleports the marker before the native map has
  // a chance to interpolate. Later points are sent straight to the native map.
  const [driverMarkerCoordinate, setDriverMarkerCoordinate] =
    useState<Coordinates | null>(driver ?? null);

  useEffect(() => {
    // Keep the map stable during tracking. Re-centering it every two seconds
    // makes a real moving rider look like a jumping pin. We fit both points
    // once when the first location arrives; the customer can then inspect the
    // route while Android/iOS moves the marker between incoming GPS samples.
    if (driver && !hasFittedLiveRoute.current) {
      mapRef.current?.animateToRegion(regionForPoints(delivery, driver), 450);
      hasFittedLiveRoute.current = true;
    }
    if (!driver) {
      hasFittedLiveRoute.current = false;
      lastDriverRef.current = null;
      const frame = requestAnimationFrame(() => setDriverMarkerCoordinate(null));
      return () => cancelAnimationFrame(frame);
    }

    if (!lastDriverRef.current) {
      const frame = requestAnimationFrame(() => setDriverMarkerCoordinate(driver));
      lastDriverRef.current = driver;
      return () => cancelAnimationFrame(frame);
    } else if (Platform.OS === 'android') {
      // Native Google Maps interpolation is considerably smoother than a
      // React re-render for a marker. A 1.8 s duration leaves a small buffer
      // before the API's two-second GPS tick arrives.
      driverMarkerRef.current?.animateMarkerToCoordinate(driver, 1_800);
    } else {
      // Apple Maps does not expose the Android marker command. Preserve a
      // correct current position there while Android gets continuous motion.
      const frame = requestAnimationFrame(() => setDriverMarkerCoordinate(driver));
      lastDriverRef.current = driver;
      return () => cancelAnimationFrame(frame);
    }
    lastDriverRef.current = driver;
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
        {driverMarkerCoordinate ? (
          <Marker
            coordinate={driverMarkerCoordinate}
            ref={driverMarkerRef}
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
