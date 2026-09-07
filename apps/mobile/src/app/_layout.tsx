import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppStripeProvider } from '@/components/app-stripe-provider';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { UserRole } from '@food-delivery/types';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OrderTrackingNotifications } from '@/components/order-tracking-notifications';

function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>

      <Stack.Protected guard={user?.role === UserRole.CUSTOMER}>
        <Stack.Screen name="(customer)" />
      </Stack.Protected>

      <Stack.Protected guard={user?.role === UserRole.RESTAURANT_OWNER}>
        <Stack.Screen name="(owner)" />
      </Stack.Protected>

      <Stack.Protected guard={user?.role === UserRole.DRIVER}>
        <Stack.Screen name="(driver)" />
      </Stack.Protected>

      <Stack.Protected guard={user?.role === UserRole.ADMIN}>
        <Stack.Screen name="(admin)" />
      </Stack.Protected>

      <Stack.Screen name="index" />
      <Stack.Screen name="health" />
    </Stack>
  );
}

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppStripeProvider>
          <AuthProvider>
            <OrderTrackingNotifications />
            <StatusBar style="dark" />
            <AnimatedSplashOverlay />
            <RootNavigator />
          </AuthProvider>
        </AppStripeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
