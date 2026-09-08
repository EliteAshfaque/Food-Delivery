import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';

import {
  getAddressSuggestions,
  getCoordinatesForAddress,
  getCoordinatesForPlace,
  getCurrentCoordinates,
  type AddressSuggestion,
  type Coordinates,
} from '@/lib/location';
import { validateCoordinates } from '@/lib/form-validation';

const UAE_REGION: Region = {
  latitude: 24.4539,
  longitude: 54.3773,
  latitudeDelta: 4.8,
  longitudeDelta: 4.8,
};

type LocationPickerProps = {
  initialCoordinates: Coordinates | null;
  /** Optional text to use as the first autocomplete query. */
  initialSearch?: string;
  onClose: () => void;
  onConfirm: (coordinates: Coordinates, addressLabel?: string) => void;
  title: string;
  visible: boolean;
};

export function LocationPicker(props: LocationPickerProps) {
  // A location picker is a short-lived draft. Giving the draft a fresh
  // component instance on each open avoids copying props into state in an
  // effect, and prevents a pin from an earlier session leaking into the next.
  const { initialCoordinates, visible } = props;
  const draftKey = `${visible}-${initialCoordinates?.latitude ?? 'uae'}-${initialCoordinates?.longitude ?? 'uae'}-${props.initialSearch ?? ''}`;

  return <LocationPickerDraft key={draftKey} {...props} />;
}

function LocationPickerDraft({
  initialCoordinates,
  initialSearch,
  onClose,
  onConfirm,
  title,
  visible,
}: LocationPickerProps) {
  const [selected, setSelected] = useState<Coordinates | null>(
    initialCoordinates,
  );
  const [search, setSearch] = useState(initialSearch?.trim() ?? '');
  const [isSearching, setSearching] = useState(false);
  const [isResolvingSuggestion, setResolvingSuggestion] = useState(false);
  const [isLocatingCurrent, setLocatingCurrent] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [selectedAddressLabel, setSelectedAddressLabel] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const searchRequest = useRef(0);
  const skipNextAutocomplete = useRef(false);
  const initialRegion: Region = initialCoordinates
    ? {
        ...initialCoordinates,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : UAE_REGION;

  // Search after a short pause, rather than issuing a request for every
  // keystroke. The request id prevents a slow older response from replacing
  // suggestions for the newer text the customer has entered.
  useEffect(() => {
    if (skipNextAutocomplete.current) {
      skipNextAutocomplete.current = false;
      return;
    }
    const query = search.trim();
    const requestId = ++searchRequest.current;
    if (query.length < 3) {
      return;
    }

    const timer = setTimeout(() => {
      void getAddressSuggestions(query)
        .then((results) => {
          if (searchRequest.current === requestId) setSuggestions(results);
        })
        .catch(() => {
          if (searchRequest.current === requestId) setSuggestions([]);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (value.trim().length < 3) {
      // Invalidate an in-flight prediction request before hiding its prior
      // results, so a slow response cannot repopulate the list after deletion.
      ++searchRequest.current;
      setSuggestions([]);
    }
  }

  async function selectSuggestion(suggestion: AddressSuggestion) {
    const requestId = ++searchRequest.current;
    skipNextAutocomplete.current = true;
    setSearch(suggestion.fullText);
    setSuggestions([]);
    setSelectedAddressLabel(suggestion.fullText);
    setSearching(false);
    setResolvingSuggestion(true);
    setSearchError(null);

    try {
      // Place Details gives a pin for the specific prediction, not merely the
      // first possible result for the same text.
      const coordinates =
        (await getCoordinatesForPlace(suggestion.placeId)) ??
        (await getCoordinatesForAddress(suggestion.fullText));
      if (!coordinates || searchRequest.current !== requestId) {
        if (searchRequest.current === requestId) {
          setSearchError('That location is unavailable. Try another result or drop a pin on the map.');
        }
        return;
      }
      setSelected(coordinates);
      mapRef.current?.animateToRegion(
        { ...coordinates, latitudeDelta: 0.008, longitudeDelta: 0.008 },
        400,
      );
    } catch {
      if (searchRequest.current === requestId) {
        setSearchError('Unable to open that location. Check your connection and try again.');
      }
    } finally {
      if (searchRequest.current === requestId) setResolvingSuggestion(false);
    }
  }

  async function handleUseCurrentLocation() {
    if (isLocatingCurrent) return;
    setLocatingCurrent(true);
    setSearchError(null);
    try {
      const coordinates = await getCurrentCoordinates();
      if (!coordinates) {
        setSearchError('Allow location access to use your current location.');
        return;
      }
      setSelected(coordinates);
      setSuggestions([]);
      setSelectedAddressLabel(null);
      mapRef.current?.animateToRegion(
        { ...coordinates, latitudeDelta: 0.008, longitudeDelta: 0.008 },
        400,
      );
    } catch {
      setSearchError('Your current location is unavailable. Search or tap the map instead.');
    } finally {
      setLocatingCurrent(false);
    }
  }

  async function searchLocation() {
    if (!search.trim() || isSearching) return;

    const query = search.trim();
    const requestId = ++searchRequest.current;
    setSearching(true);
    setSearchError(null);
    setSuggestions([]);
    try {
      const coordinates = await getCoordinatesForAddress(query);
      if (searchRequest.current !== requestId) return;
      if (!coordinates) {
        setSearchError(
          'Location not found. Try “Dubai Marina, UAE” or a fuller address. On Android, allow location permission when prompted.',
        );
        return;
      }
      setSelected(coordinates);
      setSelectedAddressLabel(query);
      mapRef.current?.animateToRegion(
        { ...coordinates, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    } catch {
      if (searchRequest.current === requestId) {
        setSearchError('Unable to search right now. Check your connection and try again.');
      }
    } finally {
      if (searchRequest.current === requestId) setSearching(false);
    }
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close map" onPress={onClose} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.hint}>Search for an area or building, then tap the map to place the exact delivery pin.</Text>
        <View style={styles.searchRow}>
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            clearButtonMode="while-editing"
            maxLength={200}
            onChangeText={handleSearchChange}
            onSubmitEditing={() => void searchLocation()}
            placeholder="Search city, country, or address"
            placeholderTextColor="#888888"
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search locations"
            accessibilityState={{ disabled: !search.trim() || isSearching }}
            disabled={!search.trim() || isSearching}
            onPress={() => void searchLocation()}
            style={[
              styles.searchButton,
              (!search.trim() || isSearching) && styles.searchButtonDisabled,
            ]}>
            {isSearching ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isLocatingCurrent}
          onPress={() => void handleUseCurrentLocation()}
          style={styles.currentLocationButton}>
          {isLocatingCurrent ? (
            <ActivityIndicator color="#FF6B35" size="small" />
          ) : (
            <Text style={styles.currentLocationIcon}>◎</Text>
          )}
          <Text style={styles.currentLocationText}>Use my current location</Text>
        </Pressable>
        {suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {suggestions.map((suggestion) => (
                <Pressable
                  accessibilityRole="button"
                  key={suggestion.placeId}
                  onPress={() => void selectSuggestion(suggestion)}
                  style={styles.suggestionRow}>
                  <View style={styles.suggestionPin}>
                    <Text style={styles.suggestionPinText}>⌖</Text>
                  </View>
                  <View style={styles.suggestionCopy}>
                    <Text numberOfLines={1} style={styles.suggestionPrimary}>
                      {suggestion.primaryText}
                    </Text>
                    {suggestion.secondaryText ? (
                      <Text numberOfLines={1} style={styles.suggestionSecondary}>
                        {suggestion.secondaryText}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        {isResolvingSuggestion ? (
          <View style={styles.resolvingRow}>
            <ActivityIndicator color="#FF6B35" size="small" />
            <Text style={styles.resolvingText}>Locating exact address…</Text>
          </View>
        ) : null}
        {searchError ? <Text style={styles.searchError}>{searchError}</Text> : null}
        <MapView
          key={`${visible}-${initialCoordinates?.latitude ?? 'uae'}-${initialCoordinates?.longitude ?? 'uae'}`}
          initialRegion={initialRegion}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          ref={mapRef}
          style={styles.map}
          onPress={(event) => {
            setSelected(event.nativeEvent.coordinate);
            setSuggestions([]);
            setSelectedAddressLabel(null);
            setSearchError(null);
          }}>
          {selected ? <Marker coordinate={selected} /> : null}
        </MapView>

        <Pressable
          disabled={!selected}
          style={[styles.confirm, !selected && styles.confirmDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !selected }}
          onPress={() => {
            const validationError = validateCoordinates(selected);
            if (validationError) {
              setSearchError(validationError);
              return;
            }
            if (selected) onConfirm(selected, selectedAddressLabel ?? undefined);
          }}>
          <Text style={styles.confirmText}>
            {selected ? 'Use this location' : 'Tap the map to choose a location'}
          </Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  cancel: { color: '#FF6B35', fontSize: 16, fontWeight: '700' },
  title: { color: '#111111', fontSize: 17, fontWeight: '800' },
  headerSpacer: { width: 48 },
  hint: { color: '#666666', fontSize: 14, paddingHorizontal: 16, paddingBottom: 12 },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchInput: {
    backgroundColor: '#F7F7F7',
    borderColor: '#D9D9D9',
    borderRadius: 10,
    borderWidth: 1,
    color: '#111111',
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    justifyContent: 'center',
    minWidth: 74,
    paddingHorizontal: 10,
  },
  searchButtonDisabled: { opacity: 0.55 },
  searchButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  currentLocationButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    marginLeft: 16,
    marginBottom: 9,
  },
  currentLocationIcon: { color: '#FF6B35', fontSize: 20, fontWeight: '800' },
  currentLocationText: { color: '#FF6B35', fontSize: 13, fontWeight: '800' },
  searchError: { color: '#B42318', fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  suggestions: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E9DED8',
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 8,
    maxHeight: 188,
    overflow: 'hidden',
  },
  suggestionRow: {
    alignItems: 'center',
    borderBottomColor: '#F0E7E2',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestionPin: {
    alignItems: 'center',
    backgroundColor: '#FFF0EB',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  suggestionPinText: { color: '#FF6B35', fontSize: 18, fontWeight: '800' },
  suggestionCopy: { flex: 1 },
  suggestionPrimary: { color: '#25192A', fontSize: 14, fontWeight: '700' },
  suggestionSecondary: { color: '#756C78', fontSize: 12, marginTop: 2 },
  resolvingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  resolvingText: { color: '#756C78', fontSize: 13, fontWeight: '600' },
  map: { flex: 1 },
  confirm: {
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  confirmDisabled: { backgroundColor: '#F6B59C' },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
