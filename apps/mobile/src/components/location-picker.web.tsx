import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { brand } from '@/constants/brand';
import { validateCoordinates } from '@/lib/form-validation';
import {
  getAddressSuggestions,
  getCoordinatesForAddress,
  getCoordinatesForPlace,
  getCurrentCoordinates,
  type AddressSuggestion,
  type Coordinates,
} from '@/lib/location';

type LocationPickerProps = {
  initialCoordinates: Coordinates | null;
  /** Optional text to use as the first autocomplete query. */
  initialSearch?: string;
  onClose: () => void;
  onConfirm: (coordinates: Coordinates, addressLabel?: string) => void;
  title: string;
  visible: boolean;
};

/**
 * Web fallback — `react-native-maps` is native-only and crashes Expo web SSR
 * with `codegenNativeComponent is not a function`. Address search still works.
 */
export function LocationPicker({
  initialCoordinates,
  initialSearch,
  onClose,
  onConfirm,
  title,
  visible,
}: LocationPickerProps) {
  const [search, setSearch] = useState(initialSearch?.trim() ?? '');
  const [selected, setSelected] = useState<Coordinates | null>(
    initialCoordinates,
  );
  const [isSearching, setSearching] = useState(false);
  const [isResolvingSuggestion, setResolvingSuggestion] = useState(false);
  const [isLocatingCurrent, setLocatingCurrent] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [selectedAddressLabel, setSelectedAddressLabel] = useState<string | null>(null);
  const searchRequest = useRef(0);
  const skipNextAutocomplete = useRef(false);

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
      const coordinates =
        (await getCoordinatesForPlace(suggestion.placeId)) ??
        (await getCoordinatesForAddress(suggestion.fullText));
      if (!coordinates || searchRequest.current !== requestId) {
        if (searchRequest.current === requestId) {
          setSearchError('That location is unavailable. Try another result.');
        }
        return;
      }
      setSelected(coordinates);
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
    } catch {
      setSearchError('Your current location is unavailable. Search an address instead.');
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
        setSearchError('Location not found. Try a city or fuller address.');
        return;
      }
      setSelected(coordinates);
      setSelectedAddressLabel(query);
    } catch {
      if (searchRequest.current === requestId) {
        setSearchError('Unable to search right now. Try again.');
      }
    } finally {
      if (searchRequest.current === requestId) setSearching(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.body}>
          <Text style={styles.hint}>
            Search for an area or building, or use your current location to set
            the delivery pin.
          </Text>

          <View style={styles.searchRow}>
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={200}
              onChangeText={handleSearchChange}
              onSubmitEditing={() => void searchLocation()}
              placeholder="Search city, area, or address"
              placeholderTextColor={brand.colors.light.inkMuted}
              returnKeyType="search"
              style={styles.searchInput}
              value={search}
            />
            <Pressable
              accessibilityRole="button"
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
              <ActivityIndicator color={brand.colors.light.primary} size="small" />
            ) : (
              <Text style={styles.currentLocationIcon}>◎</Text>
            )}
            <Text style={styles.currentLocationText}>Use my current location</Text>
          </Pressable>

          {suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {suggestions.map((suggestion) => (
                  <Pressable
                    accessibilityRole="button"
                    key={suggestion.placeId}
                    onPress={() => void selectSuggestion(suggestion)}
                    style={styles.suggestionRow}>
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
              <ActivityIndicator color={brand.colors.light.primary} size="small" />
              <Text style={styles.resolvingText}>Locating exact address…</Text>
            </View>
          ) : null}

          {searchError ? (
            <Text style={styles.searchError}>{searchError}</Text>
          ) : null}

          {selected ? (
            <Text style={styles.coords}>
              Pin · {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.coordsMuted}>No pin selected yet</Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!selected}
          onPress={() => {
            const validationError = validateCoordinates(selected);
            if (validationError) {
              setSearchError(validationError);
              return;
            }
            if (selected) onConfirm(selected, selectedAddressLabel ?? undefined);
          }}
          style={[styles.confirm, !selected && styles.confirmDisabled]}>
          <Text style={styles.confirmText}>
            {selected ? 'Use this location' : 'Search an address first'}
          </Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FFFFFF', flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  cancel: {
    color: brand.colors.light.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  title: { color: '#111111', fontSize: 17, fontWeight: '800' },
  headerSpacer: { width: 48 },
  body: { flex: 1, gap: 12, paddingHorizontal: 16 },
  hint: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  searchRow: { flexDirection: 'row', gap: 8 },
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
    backgroundColor: brand.colors.light.primary,
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
  },
  currentLocationIcon: { color: brand.colors.light.primary, fontSize: 20, fontWeight: '800' },
  currentLocationText: { color: brand.colors.light.primary, fontSize: 13, fontWeight: '800' },
  searchError: { color: '#B42318', fontSize: 12 },
  suggestions: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E9DED8',
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 188,
    overflow: 'hidden',
  },
  suggestionRow: {
    borderBottomColor: '#F0E7E2',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestionCopy: { flex: 1 },
  suggestionPrimary: { color: brand.colors.light.ink, fontSize: 14, fontWeight: '700' },
  suggestionSecondary: { color: brand.colors.light.inkMuted, fontSize: 12, marginTop: 2 },
  resolvingRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  resolvingText: { color: brand.colors.light.inkMuted, fontSize: 13, fontWeight: '600' },
  coords: {
    color: brand.colors.light.ink,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  coordsMuted: { color: brand.colors.light.inkMuted, fontSize: 13 },
  confirm: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primary,
    borderRadius: 12,
    margin: 16,
    padding: 16,
  },
  confirmDisabled: { backgroundColor: '#F6B59C' },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
