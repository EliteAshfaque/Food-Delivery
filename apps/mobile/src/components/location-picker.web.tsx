import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { brand } from '@/constants/brand';
import { validateCoordinates } from '@/lib/form-validation';
import {
  getCoordinatesForAddress,
  type Coordinates,
} from '@/lib/location';

type LocationPickerProps = {
  initialCoordinates: Coordinates | null;
  onClose: () => void;
  onConfirm: (coordinates: Coordinates) => void;
  title: string;
  visible: boolean;
};

/**
 * Web fallback — `react-native-maps` is native-only and crashes Expo web SSR
 * with `codegenNativeComponent is not a function`. Address search still works.
 */
export function LocationPicker({
  initialCoordinates,
  onClose,
  onConfirm,
  title,
  visible,
}: LocationPickerProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Coordinates | null>(
    initialCoordinates,
  );
  const [isSearching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function searchLocation() {
    if (!search.trim() || isSearching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const coordinates = await getCoordinatesForAddress(search.trim());
      if (!coordinates) {
        setSearchError('Location not found. Try a city or fuller address.');
        return;
      }
      setSelected(coordinates);
    } catch {
      setSearchError('Unable to search right now. Try again.');
    } finally {
      setSearching(false);
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
            Map pins are available in Expo Go on iOS/Android. On web, search an
            address to set the delivery pin.
          </Text>

          <View style={styles.searchRow}>
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={200}
              onChangeText={setSearch}
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
            if (selected) onConfirm(selected);
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
  searchError: { color: '#B42318', fontSize: 12 },
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
