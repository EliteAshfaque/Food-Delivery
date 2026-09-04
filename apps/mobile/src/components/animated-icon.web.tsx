import { StyleSheet, View } from "react-native";

import { WasilMark } from "./wasil-brand";

// Browser launches do not use Expo's native splash screen.
export function AnimatedSplashOverlay() {
  return null;
}

export function AnimatedIcon() {
  return (
    <View style={styles.container}>
      <WasilMark size={86} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    height: 96,
    justifyContent: "center",
    width: 96,
  },
});
