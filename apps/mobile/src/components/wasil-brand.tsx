import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { brand } from "@/constants/brand";

type MarkProps = {
  /** On a dark background, renders just the ivory route mark. */
  decorative?: boolean;
  inverted?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Wasil's route-W: a single continuous journey ending at a saffron destination.
 * The geometry stays clear at the tiny sizes used by a phone home screen.
 */
export function WasilMark({
  decorative = false,
  size = 44,
  inverted = false,
  style,
}: MarkProps) {
  return (
    <View
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : "Wasil"}
      accessibilityRole={decorative ? undefined : "image"}
      importantForAccessibility={decorative ? "no" : "yes"}
      style={[styles.mark, { height: size, width: size }, style]}
    >
      <Svg height={size} viewBox="0 0 100 100" width={size}>
        {!inverted ? (
          <Rect
            fill={brand.colors.light.ink}
            height="96"
            rx="30"
            width="96"
            x="2"
            y="2"
          />
        ) : null}
        <Path
          d="M22 32L36 66L50 45L64 66L78 32"
          fill="none"
          stroke="#FFF8F4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="9"
        />
        <Path
          d="M73 45L78 32"
          fill="none"
          stroke={brand.colors.light.accent}
          strokeLinecap="round"
          strokeWidth="9"
        />
      </Svg>
    </View>
  );
}

type LogoProps = Omit<MarkProps, "decorative" | "inverted"> & {
  showTagline?: boolean;
  tone?: "default" | "inverse";
};

export function WasilLogo({
  size = 42,
  showTagline = false,
  tone = "default",
  style,
}: LogoProps) {
  const inverse = tone === "inverse";
  const textColor = inverse ? "#FFF8F4" : brand.colors.light.ink;
  const mutedColor = inverse
    ? "rgba(255,248,244,0.72)"
    : brand.colors.light.inkMuted;

  return (
    <View
      accessible
      accessibilityLabel={
        showTagline ? "Wasil, Your city, delivered." : "Wasil"
      }
      accessibilityRole="image"
      style={[styles.logo, style]}
    >
      <WasilMark decorative inverted={inverse} size={size} />
      <View accessible={false}>
        <Text
          style={[
            styles.wordmark,
            { color: textColor, fontSize: Math.round(size * 0.62) },
          ]}
        >
          wasil
        </Text>
        {showTagline ? (
          <Text style={[styles.tagline, { color: mutedColor }]}>
            Your city, delivered.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  wordmark: {
    fontWeight: "900",
    letterSpacing: -1.2,
    lineHeight: 28,
  },
  tagline: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: -2,
  },
});
