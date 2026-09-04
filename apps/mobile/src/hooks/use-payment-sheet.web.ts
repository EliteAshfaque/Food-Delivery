type PaymentSheetResult = { error?: { code?: string; message: string } };

/** Stripe Payment Sheet is native-only. */
export function usePaymentSheet() {
  return {
    isSupported: false as const,
    initPaymentSheet: async () =>
      ({
        error: {
          message: 'Stripe payments are only available in the iOS/Android app.',
        },
      }) as PaymentSheetResult,
    presentPaymentSheet: async () =>
      ({
        error: {
          message: 'Stripe payments are only available in the iOS/Android app.',
        },
      }) as PaymentSheetResult,
  };
}
