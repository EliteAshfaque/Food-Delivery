import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type Coordinates = { latitude: number; longitude: number };

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

export async function getCoordinatesForAddress(address: string): Promise<Coordinates | null> {
  const query = address.trim();
  if (!query) return null;

  // Expo requires foreground permission before geocoding on Android. iOS does
  // not, so an iPhone user can still search an address after declining GPS.
  if (Platform.OS === 'android') {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
  }

  const [result] = await Location.geocodeAsync(query);
  if (!result) return null;
  return { latitude: result.latitude, longitude: result.longitude };
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

  if (Platform.OS === 'android') {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
  }

  const [place] = await Location.reverseGeocodeAsync(coordinates);
  if (!place) return null;

  const parts = [
    place.name,
    place.street,
    place.district,
    place.city,
    place.region,
    place.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
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

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
