import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import {
  Image,
  type ImageContentFit,
  type ImageContentPosition,
} from "expo-image";

import { brand } from "@/constants/brand";
import { AppIcon } from "./wasil-icon-system";

type WasilImageProps = {
  accessibilityLabel?: string;
  contentFit?: ImageContentFit;
  contentPosition?: ImageContentPosition;
  style: StyleProp<ViewStyle>;
  uri?: string | null;
};

/**
 * Cached remote images with a deliberate fallback. Restaurant branding can be
 * portrait, square, or wide; callers choose `contain` when every part of the
 * image matters and `cover` for food photography.
 */
export function WasilImage({
  accessibilityLabel,
  contentFit = "cover",
  contentPosition = "center",
  style,
  uri,
}: WasilImageProps) {
  // An image failure belongs to a particular URI. Remount the small inner
  // component when its source changes so a successful replacement never
  // inherits the previous source's failure state.
  return (
    <WasilImageContent
      key={uri ?? "image-placeholder"}
      accessibilityLabel={accessibilityLabel}
      contentFit={contentFit}
      contentPosition={contentPosition}
      style={style}
      uri={uri}
    />
  );
}

function WasilImageContent({
  accessibilityLabel,
  contentFit,
  contentPosition,
  style,
  uri,
}: WasilImageProps) {
  const [failed, setFailed] = useState(false);

  const canDisplay = Boolean(uri) && !failed;

  return (
    <View style={[styles.frame, style]}>
      {canDisplay ? (
        <Image
          accessible={Boolean(accessibilityLabel)}
          accessibilityLabel={accessibilityLabel}
          cachePolicy="memory-disk"
          contentFit={contentFit}
          contentPosition={contentPosition}
          onError={() => setFailed(true)}
          source={uri}
          style={styles.image}
          transition={180}
        />
      ) : (
        <View
          accessible={Boolean(accessibilityLabel)}
          accessibilityLabel={
            accessibilityLabel
              ? `${accessibilityLabel}, image unavailable`
              : undefined
          }
          style={styles.fallback}
        >
          <AppIcon
            color={brand.colors.light.primary}
            name="restaurant"
            size="xl"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: brand.colors.light.surfaceMuted,
    overflow: "hidden",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  fallback: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    flex: 1,
    justifyContent: "center",
  },
});
