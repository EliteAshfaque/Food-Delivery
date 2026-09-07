import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { brand } from '@/constants/brand';

export default function CustomerHomeLayout() {
  return (
    <View style={styles.safe}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="restaurant/[id]" options={{ gestureEnabled: true }} />
        <Stack.Screen name="oder/[id]" options={{ gestureEnabled: true }} />
        <Stack.Screen name="addresses" options={{ gestureEnabled: true }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: brand.colors.light.canvas,
    flex: 1,
    // Top inset comes from RoleSafeArea in (customer)/_layout.
    // Bottom inset comes from NativeTabs — do not add BottomTabInset here.
  },
});
