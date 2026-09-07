import { useEffect } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { brand } from "@/constants/brand";
import { AppIcon } from "./wasil-icon-system";

type PaymentSuccessCelebrationProps = {
  amount: string;
  onComplete: () => void;
  visible: boolean;
};

const CELEBRATION_SPARKS = [
  { color: "#F6B93B", x: -48, y: -37 },
  { color: "#F2552C", x: 48, y: -35 },
  { color: "#16856B", x: -57, y: 4 },
  { color: "#F6B93B", x: 57, y: 7 },
  { color: "#F2552C", x: -34, y: 46 },
  { color: "#16856B", x: 35, y: 46 },
] as const;

const PAYMENT_STEPS = [
  { icon: "creditCard", label: "Paid" },
  { icon: "orderConfirmed", label: "Confirmed" },
  { icon: "orderPreparing", label: "Preparing" },
] as const;

function PaymentJourneyStep({
  delay,
  icon,
  label,
  progress,
  reduceMotion,
}: {
  delay: number;
  icon: (typeof PAYMENT_STEPS)[number]["icon"];
  label: string;
  progress: SharedValue<number>;
  reduceMotion: boolean | null;
}) {
  const stepStyle = useAnimatedStyle(() => {
    const stepProgress = Math.max(
      0,
      Math.min((progress.value - delay) / 0.22, 1),
    );

    return {
      opacity: reduceMotion ? 1 : stepProgress,
      transform: [{ scale: reduceMotion ? 1 : 0.82 + stepProgress * 0.18 }],
    };
  });

  return (
    <Animated.View style={[styles.journeyStep, stepStyle]}>
      <View style={styles.journeyDot}>
        <AppIcon color="#FFFFFF" name={icon} size="xs" />
      </View>
      <Text style={styles.journeyLabel}>{label}</Text>
    </Animated.View>
  );
}

function SuccessSpark({
  color,
  progress,
  x,
  y,
}: {
  color: string;
  progress: SharedValue<number>;
  x: number;
  y: number;
}) {
  const sparkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.16, 1], [0, 1, 0]),
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [0, x]) },
      { translateY: interpolate(progress.value, [0, 1], [0, y]) },
      { scale: interpolate(progress.value, [0, 0.16, 1], [0.5, 1, 0.8]) },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.spark, { backgroundColor: color }, sparkStyle]}
    />
  );
}

/**
 * A short confirmation burst feels celebratory without the noisy, falling
 * confetti pattern that competes with the success message.
 */
export function PaymentSuccessCelebration({
  amount,
  onComplete,
  visible,
}: PaymentSuccessCelebrationProps) {
  const reduceMotion = useReducedMotion();
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(12);
  const medallionScale = useSharedValue(0.76);
  const contentOpacity = useSharedValue(0);
  const haloOne = useSharedValue(0);
  const haloTwo = useSharedValue(0);
  const burstProgress = useSharedValue(0);
  const journeyProgress = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;

    cardOpacity.value = 0;
    cardTranslateY.value = 12;
    medallionScale.value = 0.76;
    contentOpacity.value = 0;
    haloOne.value = 0;
    haloTwo.value = 0;
    burstProgress.value = 0;
    journeyProgress.value = 0;

    if (reduceMotion) {
      cardOpacity.value = 1;
      cardTranslateY.value = 0;
      medallionScale.value = 1;
      contentOpacity.value = 1;
      journeyProgress.value = 1;
    } else {
      cardOpacity.value = withTiming(1, { duration: 180 });
      cardTranslateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      medallionScale.value = withSpring(1, { damping: 13, stiffness: 210 });
      contentOpacity.value = withDelay(100, withTiming(1, { duration: 240 }));
      haloOne.value = withDelay(
        90,
        withTiming(1, { duration: 540, easing: Easing.out(Easing.cubic) }),
      );
      haloTwo.value = withDelay(
        190,
        withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) }),
      );
      burstProgress.value = withDelay(
        80,
        withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }),
      );
      journeyProgress.value = withDelay(
        210,
        withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [
    cardOpacity,
    cardTranslateY,
    burstProgress,
    contentOpacity,
    haloOne,
    haloTwo,
    medallionScale,
    journeyProgress,
    reduceMotion,
    visible,
  ]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));
  const medallionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: medallionScale.value }],
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));
  const haloOneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(haloOne.value, [0, 0.12, 1], [0, 0.46, 0]),
    transform: [{ scale: interpolate(haloOne.value, [0, 1], [0.72, 1.85]) }],
  }));
  const haloTwoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(haloTwo.value, [0, 0.12, 1], [0, 0.28, 0]),
    transform: [{ scale: interpolate(haloTwo.value, [0, 1], [0.72, 2.3]) }],
  }));
  const journeyFillStyle = useAnimatedStyle(() => ({
    width: `${journeyProgress.value * 82}%`,
  }));

  if (!visible) return null;

  return (
    <Modal
      animationType="none"
      onRequestClose={onComplete}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View accessibilityViewIsModal style={styles.overlay}>
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.heroPanel}>
          <View style={styles.medallionStage}>
            {!reduceMotion ? (
              <Animated.View
                style={[styles.halo, styles.haloOuter, haloTwoStyle]}
              />
            ) : null}
            {!reduceMotion ? (
              <Animated.View style={[styles.halo, haloOneStyle]} />
            ) : null}
            {!reduceMotion
              ? CELEBRATION_SPARKS.map((spark) => (
                  <SuccessSpark
                    key={`${spark.x}-${spark.y}`}
                    progress={burstProgress}
                    {...spark}
                  />
                ))
              : null}
            <Animated.View style={[styles.medallion, medallionStyle]}>
              <Image
                resizeMode="contain"
                source={require("../../assets/images/payment-confirmed-celebration.png")}
                style={styles.confirmedArtwork}
              />
            </Animated.View>
          </View>
          </View>

          <Animated.View style={[styles.copy, contentStyle]}>
            <View style={styles.securedPill}>
              <AppIcon color={brand.colors.light.mint} name="check" size="xs" />
              <Text style={styles.eyebrow}>PAYMENT SECURED</Text>
            </View>
            <Text
              accessibilityLiveRegion="polite"
              accessibilityRole="header"
              style={styles.title}
            >
              Order confirmed
            </Text>
            <Text style={styles.subtitle}>
              {amount} paid securely. The restaurant can start preparing your
              order.
            </Text>
            <View
              accessibilityLabel="Payment complete, order confirmed, preparing next"
              style={styles.journey}
            >
              <View style={styles.journeyRail} />
              <Animated.View style={[styles.journeyRailFill, journeyFillStyle]} />
              <View style={styles.journeySteps}>
                {PAYMENT_STEPS.map((step, index) => (
                  <PaymentJourneyStep
                    delay={index * 0.26}
                    icon={step.icon}
                    key={step.label}
                    label={step.label}
                    progress={journeyProgress}
                    reduceMotion={reduceMotion}
                  />
                ))}
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue to order details"
              onPress={onComplete}
              style={({ pressed }) => [
                styles.action,
                pressed && styles.actionPressed,
              ]}
            >
              <Text style={styles.actionText}>Continue</Text>
              <AppIcon color="#FFFFFF" name="navigation" size="sm" />
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(37,25,42,0.58)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    maxWidth: 360,
    overflow: "hidden",
    width: "100%",
    ...brand.shadow,
  },
  heroPanel: {
    alignItems: "center",
    backgroundColor: "#FFF2ED",
    borderBottomColor: "#F8DDD3",
    borderBottomWidth: 1,
    height: 156,
    justifyContent: "center",
    width: "100%",
  },
  medallionStage: {
    alignItems: "center",
    height: 128,
    justifyContent: "center",
    width: 128,
  },
  halo: {
    backgroundColor: "#DFF5ED",
    borderRadius: 55,
    height: 88,
    position: "absolute",
    width: 88,
  },
  haloOuter: {
    backgroundColor: "#CDEFE3",
  },
  spark: {
    borderRadius: 4,
    height: 11,
    left: "50%",
    marginLeft: -3,
    marginTop: -5.5,
    position: "absolute",
    top: "50%",
    width: 6,
  },
  medallion: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 56,
    height: 112,
    justifyContent: "center",
    overflow: "hidden",
    width: 112,
  },
  confirmedArtwork: {
    height: 112,
    width: 112,
  },
  copy: {
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 24,
    width: "100%",
  },
  eyebrow: {
    color: brand.colors.light.mint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.3,
    marginBottom: 0,
  },
  securedPill: {
    alignItems: "center",
    backgroundColor: "#E8F7F1",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginBottom: 8,
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  journey: {
    backgroundColor: "#FFF8F4",
    borderRadius: 16,
    marginTop: 20,
    paddingBottom: 9,
    paddingTop: 9,
    paddingHorizontal: 5,
    position: "relative",
    width: "100%",
  },
  journeyRail: {
    backgroundColor: "#F1E4DE",
    borderRadius: 999,
    height: 3,
    left: 27,
    position: "absolute",
    right: 27,
    top: 13,
  },
  journeyRailFill: {
    backgroundColor: brand.colors.light.mint,
    borderRadius: 999,
    height: 3,
    left: 27,
    position: "absolute",
    top: 13,
  },
  journeySteps: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  journeyStep: {
    alignItems: "center",
    width: 54,
  },
  journeyDot: {
    alignItems: "center",
    backgroundColor: brand.colors.light.mint,
    borderColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 3,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  journeyLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "center",
  },
  action: {
    alignItems: "center",
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.medium,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginTop: 22,
    minHeight: 48,
    paddingHorizontal: 18,
  },
  actionPressed: {
    opacity: 0.78,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
});
