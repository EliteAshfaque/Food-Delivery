import { StripeProvider } from '@stripe/stripe-react-native';
import type { ReactNode } from 'react';

export function AppStripeProvider({ children }: { children: ReactNode }) {
  return (
    <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}>
      {children}
    </StripeProvider>
  );
}
