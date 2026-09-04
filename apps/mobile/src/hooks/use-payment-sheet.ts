import { useStripe } from '@stripe/stripe-react-native';

export function usePaymentSheet() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  return { initPaymentSheet, presentPaymentSheet, isSupported: true as const };
}
