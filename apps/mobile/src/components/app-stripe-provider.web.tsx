import type { ReactElement } from "react";

/** Stripe React Native is not supported on web — pass children through. */
export function AppStripeProvider({ children }: { children: ReactElement }) {
  return children;
}
