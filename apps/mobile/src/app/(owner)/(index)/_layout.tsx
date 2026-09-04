import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';

export default function OwnerIndexLayout() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="create-restaurant" />
        <Stack.Screen name="update-restaurant" options={{ headerShown: false, gestureEnabled: true }} />
      </Stack>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
    paddingBottom: BottomTabInset,
  },
});
