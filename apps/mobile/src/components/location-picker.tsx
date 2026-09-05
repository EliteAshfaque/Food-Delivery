import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
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
  getCoordinatesForAddress,
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
  onClose: () => void;
  onConfirm: (coordinates: Coordinates) => void;
  title: string;
  visible: boolean;
};

export function LocationPicker(props: LocationPickerProps) {
  // A location picker is a short-lived draft. Giving the draft a fresh
  // component instance on each open avoids copying props into state in an
  // effect, and prevents a pin from an earlier session leaking into the next.
  const { initialCoordinates, visible } = props;
  const draftKey = `${visible}-${initialCoordinates?.latitude ?? 'uae'}-${initialCoordinates?.longitude ?? 'uae'}`;

  return <LocationPickerDraft key={draftKey} {...props} />;
}

function LocationPickerDraft({
  initialCoordinates,
  onClose,
  onConfirm,
  title,
  visible,
}: LocationPickerProps) {
  const [selected, setSelected] = useState<Coordinates | null>(
    initialCoordinates,
  );
  const [search, setSearch] = useState('');
  const [isSearching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const initialRegion: Region = initialCoordinates
    ? {
        ...initialCoordinates,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : UAE_REGION;

  async function searchLocation() {
    if (!search.trim() || isSearching) return;

    setSearching(true);
    setSearchError(null);
    try {
      const coordinates = await getCoordinatesForAddress(search.trim());
      if (!coordinates) {
        setSearchError(
          'Location not found. Try “Dubai, UAE” or add more detail. Android needs location permission to search.',
        );
        return;
      }
      setSelected(coordinates);
      mapRef.current?.animateToRegion(
        { ...coordinates, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    } catch {
      setSearchError('Unable to search right now. Check your connection and try again.');
    } finally {
      setSearching(false);
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

        <Text style={styles.hint}>Search a city or address, then tap the map to refine the exact pin.</Text>
        <View style={styles.searchRow}>
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            clearButtonMode="while-editing"
            maxLength={200}
            onChangeText={setSearch}
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
        {searchError ? <Text style={styles.searchError}>{searchError}</Text> : null}
        <MapView
          key={`${visible}-${initialCoordinates?.latitude ?? 'uae'}-${initialCoordinates?.longitude ?? 'uae'}`}
          initialRegion={initialRegion}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          ref={mapRef}
          style={styles.map}
          onPress={(event) => {
            setSelected(event.nativeEvent.coordinate);
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
            if (selected) onConfirm(selected);
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
  searchError: { color: '#B42318', fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
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
