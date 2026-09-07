import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type Coordinates = { latitude: number; longitude: number };

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';

export async function getCurrentCoordinates(): Promise<Coordinates | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

async function ensureAndroidLocationPermission() {
  if (Platform.OS !== 'android') return true;
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Android emulator / Expo Go often fail native `geocodeAsync`. Fall back to
 * the Google Geocoding HTTP API when a Maps key is configured.
 */
async function geocodeWithGoogle(address: string): Promise<Coordinates | null> {
  if (!googleMapsApiKey) return null;

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(address)}` +
    `&key=${encodeURIComponent(googleMapsApiKey)}`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    return null;
  }

  const location = payload.results?.[0]?.geometry?.location;
  if (
    !location ||
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lng)
  ) {
    return null;
  }

  return { latitude: location.lat!, longitude: location.lng! };
}

async function reverseGeocodeWithGoogle(
  coordinates: Coordinates,
): Promise<string | null> {
  if (!googleMapsApiKey) return null;

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?latlng=${coordinates.latitude},${coordinates.longitude}` +
    `&key=${encodeURIComponent(googleMapsApiKey)}`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{ formatted_address?: string }>;
  };

  if (payload.status !== 'OK') return null;
  return payload.results?.[0]?.formatted_address?.trim() || null;
}

export async function getCoordinatesForAddress(
  address: string,
): Promise<Coordinates | null> {
  const query = address.trim();
  if (!query) return null;

  // Expo requires foreground permission before native geocoding on Android.
  const canUseNative = await ensureAndroidLocationPermission();

  if (canUseNative) {
    try {
      const [result] = await Location.geocodeAsync(query);
      if (result) {
        return { latitude: result.latitude, longitude: result.longitude };
      }
    } catch {
      // Fall through to Google HTTP geocoding (common on Android emulators).
    }
  }

  return geocodeWithGoogle(query);
}

export async function getAddressForCoordinates(coordinates: Coordinates) {
  if (
    !Number.isFinite(coordinates.latitude) ||
    !Number.isFinite(coordinates.longitude) ||
    coordinates.latitude < -90 ||
    coordinates.latitude > 90 ||
    coordinates.longitude < -180 ||
    coordinates.longitude > 180
  ) {
    return null;
  }

  const canUseNative = await ensureAndroidLocationPermission();
  if (canUseNative) {
    try {
      const [place] = await Location.reverseGeocodeAsync(coordinates);
      if (place) {
        const parts = [
          place.name,
          place.street,
          place.district,
          place.city,
          place.region,
          place.country,
        ].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
    } catch {
      // Fall through.
    }
  }

  return reverseGeocodeWithGoogle(coordinates);
}

export function distanceInKm(a: Coordinates, b: Coordinates) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}
