import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { brand } from "@/constants/brand";

type RoleSafeAreaProps = {
  children: ReactNode;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Standard top inset for customer / driver / owner tab shells.
 * Bottom inset stays with NativeTabs so tab screens are not double-padded.
 */
export function RoleSafeArea({
  children,
  backgroundColor = brand.colors.light.canvas,
  style,
}: RoleSafeAreaProps) {
  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safe, { backgroundColor }, style]}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
});
