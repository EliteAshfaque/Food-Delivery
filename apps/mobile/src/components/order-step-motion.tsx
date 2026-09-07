import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import LottieView from "lottie-react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { brand } from "@/constants/brand";
import { AppIcon, type AppIconName } from "@/components/wasil-icon-system";
import { OrderStatus, type OrderStatus as OrderStatusType } from "@food-delivery/types";

type OrderStepMotionProps = {
  status: OrderStatusType;
  tone: string;
};

function FloatingParticle({
  color,
  delay,
  progress,
  x,
  y,
}: {
  color: string;
  delay: number;
  progress: SharedValue<number>;
  x: number;
  y: number;
}) {
  const style = useAnimatedStyle(() => {
    const local = Math.max(0, Math.min((progress.value - delay) / 0.7, 1));
    return {
      opacity: interpolate(local, [0, 0.2, 1], [0, 0.9, 0]),
      transform: [
        { translateX: interpolate(local, [0, 1], [0, x]) },
        { translateY: interpolate(local, [0, 1], [0, y]) },
        { scale: interpolate(local, [0, 0.3, 1], [0.4, 1, 0.6]) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.particle, { backgroundColor: color }, style]}
    />
  );
}

/**
 * Looping, status-specific motion for the live tracking card — the same role
 * GIF/Lottie scenes play in Talabat and Uber Eats, built with Reanimated so it
 * works offline and respects reduced-motion.
 */
export function OrderStepMotion({ status, tone }: OrderStepMotionProps) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const bob = useSharedValue(0);
  const spin = useSharedValue(0);
  const ride = useSharedValue(0);
  const burst = useSharedValue(0);
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = 0;
    enter.value = withSpring(1, { damping: 14, stiffness: 180 });

    if (reduceMotion) {
      pulse.value = 1;
      bob.value = 0;
      spin.value = 0;
      ride.value = 0;
      burst.value = 1;
      return;
    }

    pulse.value = 0;
    bob.value = 0;
    spin.value = 0;
    ride.value = 0;
    burst.value = 0;

    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    bob.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );

    if (status === OrderStatus.PREPARING) {
      spin.value = withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.linear }),
        -1,
        false,
      );
    }

    if (status === OrderStatus.PICKED_UP) {
      ride.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    }

    if (
      status === OrderStatus.CONFIRMED ||
      status === OrderStatus.DELIVERED ||
      status === OrderStatus.READY
    ) {
      burst.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
          withDelay(500, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      );
    }
  }, [bob, burst, enter, pulse, reduceMotion, ride, spin, status]);

  const stage = getStageVisual(status, tone);

  const shellStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { scale: interpolate(enter.value, [0, 1], [0.92, 1]) },
      { translateY: interpolate(enter.value, [0, 1], [8, 0]) },
    ],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.18, 0.42]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.88, 1.18]) }],
  }));

  const iconStyle = useAnimatedStyle(() => {
    if (status === OrderStatus.PREPARING) {
      return {
        transform: [
          { rotate: `${spin.value * 360}deg` },
          { translateY: interpolate(bob.value, [0, 1], [0, -3]) },
        ],
      };
    }
    if (status === OrderStatus.PICKED_UP) {
      return {
        transform: [
          { translateX: interpolate(ride.value, [0, 1], [-18, 18]) },
          { translateY: interpolate(bob.value, [0, 1], [0, -4]) },
        ],
      };
    }
    if (status === OrderStatus.PENDING) {
      return {
        transform: [
          { scale: interpolate(pulse.value, [0, 1], [0.94, 1.06]) },
        ],
      };
    }
    return {
      transform: [{ translateY: interpolate(bob.value, [0, 1], [0, -4]) }],
    };
  });

  const orbitStyle = useAnimatedStyle(() => ({
    opacity: status === OrderStatus.PREPARING ? 0.55 : 0,
    transform: [{ rotate: `${spin.value * -360}deg` }],
  }));

  const roadStyle = useAnimatedStyle(() => ({
    opacity: status === OrderStatus.PICKED_UP ? 0.35 : 0,
    transform: [{ translateX: interpolate(ride.value, [0, 1], [10, -10]) }],
  }));

  return (
    <Animated.View style={[styles.shell, shellStyle]}>
      <Animated.View
        style={[styles.halo, { backgroundColor: tone }, haloStyle]}
      />
      <View style={[styles.stage, { backgroundColor: stage.backdrop }]}>
        {stage.particles.map((particle, index) => (
          <FloatingParticle
            color={particle.color}
            delay={particle.delay}
            key={`${status}-${index}`}
            progress={burst}
            x={particle.x}
            y={particle.y}
          />
        ))}

        <Animated.View style={[styles.orbitRing, orbitStyle]}>
          <View style={[styles.orbitDot, { backgroundColor: tone }]} />
        </Animated.View>

        {status === OrderStatus.CONFIRMED ? (
          <Animated.View style={[styles.confirmedLottieWrap, iconStyle]}>
            <LottieView
              autoPlay
              loop={false}
              resizeMode="contain"
              source={require("../../assets/lottie/confirmed.json")}
              style={styles.confirmedLottie}
            />
          </Animated.View>
        ) : (
          <Animated.View style={[styles.iconWrap, iconStyle]}>
            <AppIcon color={tone} name={stage.icon} size="xl" />
          </Animated.View>
        )}

        {status === OrderStatus.PREPARING ? (
          <>
            <SteamWisp delay={0} progress={bob} x={-16} />
            <SteamWisp delay={0.25} progress={pulse} x={0} />
            <SteamWisp delay={0.45} progress={bob} x={16} />
          </>
        ) : null}

        <Animated.View style={[styles.road, roadStyle]} />
      </View>
    </Animated.View>
  );
}

function SteamWisp({
  delay,
  progress,
  x,
}: {
  delay: number;
  progress: SharedValue<number>;
  x: number;
}) {
  const style = useAnimatedStyle(() => {
    const wave = (progress.value + delay) % 1;
    return {
      opacity: interpolate(wave, [0, 0.4, 1], [0, 0.55, 0]),
      transform: [
        { translateX: x },
        { translateY: interpolate(wave, [0, 1], [8, -22]) },
        { scale: interpolate(wave, [0, 1], [0.7, 1.15]) },
      ],
    };
  });

  return <Animated.View pointerEvents="none" style={[styles.steam, style]} />;
}

function getStageVisual(status: OrderStatusType, tone: string) {
  const spark = [
    { color: tone, delay: 0, x: -36, y: -28 },
    { color: brand.colors.light.accent, delay: 0.08, x: 38, y: -24 },
    { color: brand.colors.light.mint, delay: 0.14, x: -40, y: 18 },
    { color: tone, delay: 0.2, x: 36, y: 22 },
  ];

  switch (status) {
    case OrderStatus.PENDING:
      return {
        icon: "creditCard" as AppIconName,
        backdrop: "#FFF4EC",
        particles: spark,
      };
    case OrderStatus.CONFIRMED:
      return {
        icon: "orderConfirmed" as AppIconName,
        backdrop: "#FFF0EB",
        particles: spark,
      };
    case OrderStatus.PREPARING:
      return {
        icon: "orderPreparing" as AppIconName,
        backdrop: "#FFF7E8",
        particles: spark,
      };
    case OrderStatus.READY:
      return {
        icon: "orderReady" as AppIconName,
        backdrop: "#EAF8F3",
        particles: spark,
      };
    case OrderStatus.PICKED_UP:
      return {
        icon: "orderPickedUp" as AppIconName,
        backdrop: "#EAF8F3",
        particles: spark,
      };
    case OrderStatus.DELIVERED:
      return {
        icon: "orderCompleted" as AppIconName,
        backdrop: "#EAF8F3",
        particles: spark,
      };
    default:
      return {
        icon: "orderDetails" as AppIconName,
        backdrop: brand.colors.light.canvas,
        particles: spark,
      };
  }
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    borderRadius: 28,
    justifyContent: "center",
    marginBottom: 14,
    overflow: "hidden",
  },
  halo: {
    borderRadius: 64,
    height: 120,
    position: "absolute",
    width: 120,
  },
  stage: {
    alignItems: "center",
    borderRadius: 28,
    height: 132,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  iconWrap: {
    alignItems: "center",
    height: 56,
    justifyContent: "center",
    width: 56,
    zIndex: 2,
  },
  confirmedLottieWrap: {
    alignItems: "center",
    height: 116,
    justifyContent: "center",
    width: 150,
    zIndex: 2,
  },
  confirmedLottie: {
    height: 150,
    width: 150,
  },
  particle: {
    borderRadius: 4,
    height: 8,
    position: "absolute",
    width: 8,
    zIndex: 3,
  },
  orbitRing: {
    borderColor: "rgba(37,25,42,0.08)",
    borderRadius: 40,
    borderWidth: 1.5,
    height: 80,
    position: "absolute",
    width: 80,
  },
  orbitDot: {
    borderRadius: 4,
    height: 8,
    position: "absolute",
    right: -3,
    top: 34,
    width: 8,
  },
  steam: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 8,
    height: 10,
    position: "absolute",
    top: 34,
    width: 10,
    zIndex: 1,
  },
  road: {
    backgroundColor: "rgba(37,25,42,0.12)",
    borderRadius: 2,
    bottom: 28,
    height: 3,
    position: "absolute",
    width: 88,
  },
});
