import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type Coordinates = { latitude: number; longitude: number };

export type AddressSuggestion = {
  /** Google Places resource name, e.g. `places/ChIJ...`. */
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
};

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';

const placesApiUrl = 'https://places.googleapis.com/v1';

function placeHeaders(fieldMask: string) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': googleMapsApiKey,
    'X-Goog-FieldMask': fieldMask,
  };
}

/**
 * Returns address predictions while the customer types. It uses Places API
 * (New), which is much more accurate for building/area searches than plain
 * geocoding. The UAE location bias stops "Marina" from resolving overseas.
 */
export async function getAddressSuggestions(
  input: string,
): Promise<AddressSuggestion[]> {
  const query = input.trim();
  if (query.length < 3 || !googleMapsApiKey) return [];

  const response = await fetch(`${placesApiUrl}/places:autocomplete`, {
    method: 'POST',
    headers: placeHeaders(
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
    ),
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ['ae'],
      locationBias: {
        rectangle: {
          low: { latitude: 22.5, longitude: 51.4 },
          high: { latitude: 26.2, longitude: 56.5 },
        },
      },
    }),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }[];
  };

  return (payload.suggestions ?? []).flatMap(({ placePrediction }) => {
    const placeId = placePrediction?.placeId;
    const fullText = placePrediction?.text?.text?.trim();
    if (!placeId || !fullText) return [];

    return [
      {
        placeId,
        fullText,
        primaryText:
          placePrediction?.structuredFormat?.mainText?.text?.trim() ?? fullText,
        secondaryText:
          placePrediction?.structuredFormat?.secondaryText?.text?.trim() ?? '',
      },
    ];
  });
}

/** Resolves an autocomplete result to the exact map pin chosen by the user. */
export async function getCoordinatesForPlace(
  placeId: string,
): Promise<Coordinates | null> {
  if (!placeId || !googleMapsApiKey) return null;

  const response = await fetch(
    `${placesApiUrl}/places/${encodeURIComponent(placeId)}`,
    {
      headers: placeHeaders('location'),
    },
  );
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    location?: { latitude?: number; longitude?: number };
  };
  const latitude = payload.location?.latitude;
  const longitude = payload.location?.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude: latitude!, longitude: longitude! };
}

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
    results?: {
      geometry?: { location?: { lat?: number; lng?: number } };
    }[];
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
    results?: { formatted_address?: string }[];
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
