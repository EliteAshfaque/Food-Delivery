import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/wasil-icon-system';
import { brand } from '@/constants/brand';
import { getApiErrorMessage } from '@/lib/api-error';

type RequestErrorStateProps = {
  error: unknown;
  onRetry?: () => void;
  title?: string;
};

/** Consistent retryable state for failed lists and detail requests. */
export function RequestErrorState({
  error,
  onRetry,
  title = 'Couldn’t load this right now',
}: RequestErrorStateProps) {
  return (
    <View accessibilityRole="alert" style={styles.container}>
      <View style={styles.iconWrap}>
        <AppIcon name="orderFailed" size="lg" color={brand.colors.light.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{getApiErrorMessage(error)}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: '#FDECEE',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    marginBottom: 14,
    width: 56,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 340,
    textAlign: 'center',
  },
  button: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    marginTop: 18,
    minHeight: 46,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
});
