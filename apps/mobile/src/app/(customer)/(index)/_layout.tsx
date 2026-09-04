import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';

export default function CustomerHomeLayout() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="restaurant/[id]" options={{ gestureEnabled: true }} />
        <Stack.Screen name="oder/[id]" options={{ gestureEnabled: true }} />
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
