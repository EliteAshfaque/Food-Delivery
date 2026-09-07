import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { brand } from '@/constants/brand';

export default function OwnerIndexLayout() {
  return (
    <View style={styles.safe}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="create-restaurant" />
        <Stack.Screen
          name="update-restaurant"
          options={{ headerShown: false, gestureEnabled: true }}
        />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: brand.colors.light.canvas,
    flex: 1,
    // Top inset comes from RoleSafeArea in (owner)/_layout.
    // Bottom inset comes from NativeTabs.
  },
});
