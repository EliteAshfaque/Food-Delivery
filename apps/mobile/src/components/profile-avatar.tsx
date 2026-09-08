import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";

import { brand } from "@/constants/brand";

type ProfileAvatarProps = {
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

function getInitials(firstName?: string | null, lastName?: string | null) {
  const first = firstName?.trim().charAt(0) ?? "";
  const last = lastName?.trim().charAt(0) ?? "";
  return `${first}${last}`.toUpperCase() || "W";
}

export function ProfileAvatar({
  imageUrl,
  ...props
}: ProfileAvatarProps) {
  // Image failures belong to a particular source. A keyed inner avatar retries
  // when the profile receives a new URL, without resetting state in an effect.
  return <ProfileAvatarContent key={imageUrl ?? "initials"} imageUrl={imageUrl} {...props} />;
}

function ProfileAvatarContent({
  firstName,
  lastName,
  imageUrl,
  size = 72,
  style,
}: ProfileAvatarProps) {
  const [failed, setFailed] = useState(false);
  const radius = size / 2;
  const fontSize = Math.round(size * 0.34);
  const showPhoto = Boolean(imageUrl) && !failed;

  return (
    <View
      accessibilityLabel={showPhoto ? "Profile photo" : "Profile initials"}
      style={[
        styles.frame,
        {
          borderRadius: radius,
          height: size,
          width: size,
        },
        style,
      ]}
    >
      {showPhoto ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={() => setFailed(true)}
          source={imageUrl}
          style={styles.image}
          transition={160}
        />
      ) : (
        <Text style={[styles.initials, { fontSize }]}>
          {getInitials(firstName, lastName)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primary,
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  initials: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
});
