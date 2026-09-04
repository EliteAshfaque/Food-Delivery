import { StripeProvider } from "@stripe/stripe-react-native";
import type { ReactElement } from "react";

export function AppStripeProvider({ children }: { children: ReactElement }) {
  return (
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}
    >
      {children}
    </StripeProvider>
  );
}
