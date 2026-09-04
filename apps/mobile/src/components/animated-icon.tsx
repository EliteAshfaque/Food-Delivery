import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { brand } from "@/constants/brand";
import { useAuth } from "@/context/auth-context";
import { WasilMark } from "./wasil-brand";

// Expo recommends preventing the native splash from hiding at module scope.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 420, fade: true });

/**
 * Carries the native Wasil splash into the app while the auth session restores.
 * Keeping the dark-plum background consistent avoids a visible launch flash.
 */
export function AnimatedSplashOverlay() {
  const { isLoading } = useAuth();
  const [visible, setVisible] = useState(true);
  const reduceMotion = useReducedMotion();
  const logoScale = useSharedValue(reduceMotion ? 1 : 0.82);
  const wordmarkOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      logoScale.value = 1;
      wordmarkOpacity.value = 1;
      return;
    }

    logoScale.value = withSpring(1, { damping: 13, stiffness: 170 });
    wordmarkOpacity.value = withDelay(150, withTiming(1, { duration: 340 }));
  }, [logoScale, reduceMotion, wordmarkOpacity]);

  useEffect(() => {
    if (isLoading) return;

    const beginExit = setTimeout(
      () => {
        void SplashScreen.hideAsync();
        overlayOpacity.value = reduceMotion
          ? 0
          : withTiming(0, {
              duration: 360,
              easing: Easing.out(Easing.cubic),
            });
      },
      reduceMotion ? 0 : 620,
    );
    const finishExit = setTimeout(
      () => setVisible(false),
      reduceMotion ? 0 : 1040,
    );

    return () => {
      clearTimeout(beginExit);
      clearTimeout(finishExit);
    };
  }, [isLoading, overlayOpacity, reduceMotion]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
  }));
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View
      accessibilityLabel="Loading Wasil"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessibilityViewIsModal
      pointerEvents="auto"
      style={[styles.overlay, overlayStyle]}
    >
      <Animated.View style={logoStyle}>
        <WasilMark size={104} inverted />
      </Animated.View>
      <Animated.View style={wordmarkStyle}>
        <Text style={styles.wordmark}>wasil</Text>
        <Text style={styles.tagline}>YOUR CITY, DELIVERED.</Text>
      </Animated.View>
    </Animated.View>
  );
}

/** A reusable compact identity lockup for empty, loading, and health states. */
export function AnimatedIcon() {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 0.88);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    scale.value = reduceMotion
      ? 1
      : withSpring(1, { damping: 11, stiffness: 165 });
  }, [reduceMotion, scale]);

  return (
    <View style={styles.iconContainer}>
      <Animated.View style={style}>
        <WasilMark size={86} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: brand.colors.light.ink,
    justifyContent: "center",
    zIndex: 1000,
  },
  wordmark: {
    color: "#FFFFFF",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -2.2,
    marginTop: 18,
    textAlign: "center",
  },
  tagline: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginTop: 2,
    textAlign: "center",
  },
  iconContainer: {
    alignItems: "center",
    height: 96,
    justifyContent: "center",
    width: 96,
  },
});
