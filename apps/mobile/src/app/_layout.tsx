import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppStripeProvider } from '@/components/app-stripe-provider';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { UserRole } from '@food-delivery/types';

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

      <Stack.Screen name="index" />
      <Stack.Screen name="health" />
    </Stack>
  );
}

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppStripeProvider>
        <AuthProvider>
          <AnimatedSplashOverlay />
          <RootNavigator />
        </AuthProvider>
      </AppStripeProvider>
    </QueryClientProvider>
  );
}
