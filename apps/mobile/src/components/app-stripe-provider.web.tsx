import type { ReactNode } from 'react';

/** Stripe React Native is not supported on web — pass children through. */
export function AppStripeProvider({ children }: { children: ReactNode }) {
  return children;
}
