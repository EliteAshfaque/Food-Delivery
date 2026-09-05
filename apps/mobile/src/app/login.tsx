import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";

import { useAuth } from "@/context/auth-context";
import { brand } from "@/constants/brand";
import { WasilLogo } from "@/components/wasil-brand";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api-error";
import { validateLoginDetails } from "@/lib/form-validation";

type GoogleSigninModule = typeof import("@react-native-google-signin/google-signin");

export default function LoginScreen() {
  const { login, googleLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setLoading] = useState(false);
  const [nativeGoogleSignin, setNativeGoogleSignin] =
    useState<GoogleSigninModule | null>(null);
  const googleWebClientId =
    typeof Constants.expoConfig?.extra?.googleWebClientId === "string"
      ? Constants.expoConfig.extra.googleWebClientId
      : "";

  useEffect(() => {
    let isMounted = true;

    // Expo Go does not include this native module. Load it only in an Android
    // development/production build so Expo Go remains usable for local work.
    if (Platform.OS !== "android" || Constants.appOwnership === "expo") {
      return () => {
        isMounted = false;
      };
    }

    void import("@react-native-google-signin/google-signin")
      .then((module) => {
        if (isMounted) setNativeGoogleSignin(module);
      })
      .catch(() => {
        // The regular sign-in form remains available if the optional native
        // Google module is unavailable in a custom build.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (nativeGoogleSignin && googleWebClientId) {
      nativeGoogleSignin.GoogleSignin.configure({ webClientId: googleWebClientId });
    }
  }, [googleWebClientId, nativeGoogleSignin]);

  const GoogleSigninButton = nativeGoogleSignin?.GoogleSigninButton;

  async function handleLogin() {
    const validationError = validateLoginDetails({ email, password });
    if (validationError) {
      Alert.alert("Check sign-in details", validationError);
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (error) {
      const status = getApiErrorStatus(error);
      if (status === 401) {
        Alert.alert("Login failed", "Check your email and password, then try again.");
      } else if (status === 403) {
        Alert.alert(
          "Account access unavailable",
          getApiErrorMessage(
            error,
            "This account cannot sign in right now. Contact support if you need help.",
          ),
        );
      } else {
        Alert.alert("Could not sign in", getApiErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (!nativeGoogleSignin) {
      Alert.alert(
        "Install the Android development build",
        "Google sign-in uses native Android code, so it cannot run inside Expo Go.",
      );
      return;
    }

    if (!googleWebClientId) {
      Alert.alert(
        "Google sign-in unavailable",
        "The Google Web Client ID has not been configured.",
      );
      return;
    }

    setLoading(true);
    try {
      await nativeGoogleSignin.GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const result = await nativeGoogleSignin.GoogleSignin.signIn();
      if (!nativeGoogleSignin.isSuccessResponse(result)) return;

      if (!result.data.idToken) {
        throw new Error("Google did not return an identity token");
      }

      await googleLogin(result.data.idToken);
      router.replace("/");
    } catch (error) {
      if (
        nativeGoogleSignin.isErrorWithCode(error) &&
        error.code === nativeGoogleSignin.statusCodes.SIGN_IN_CANCELLED
      ) {
        return;
      }

      const status = getApiErrorStatus(error);
      if (status === 403) {
        Alert.alert(
          "Account access unavailable",
          getApiErrorMessage(
            error,
            "This account cannot sign in right now. Contact support if you need help.",
          ),
        );
      } else if (status === 409) {
        Alert.alert(
          "Google account conflict",
          "This email is already linked to a different Google account. Sign in with your email and password, or choose the Google account originally linked to it.",
        );
      } else {
        Alert.alert(
          "Google sign-in failed",
          getApiErrorMessage(
            error,
            "Use an Android development build and check the package name and SHA-1 in Firebase.",
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <WasilLogo showTagline size={46} style={styles.logo} />
          <Text style={styles.title}>Welcome back!</Text>
          <Text style={styles.subtitle}>
            Sign in and let Wasil bring the city to you.
          </Text>

          <TextInput
            accessibilityLabel="Email address"
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={brand.colors.light.inkMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
            returnKeyType="next"
          />
          <TextInput
            accessibilityLabel="Password"
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={brand.colors.light.inkMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            maxLength={128}
            returnKeyType="done"
            onSubmitEditing={() => void handleLogin()}
          />

          <Pressable
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={() => void handleLogin()}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </Pressable>

          {Platform.OS === "android" ? (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.divider} />
              </View>
              {GoogleSigninButton ? (
                <GoogleSigninButton
                  color={GoogleSigninButton.Color.Light}
                  disabled={isLoading}
                  onPress={() => void handleGoogleLogin()}
                  size={GoogleSigninButton.Size.Wide}
                  style={styles.googleButton}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={isLoading}
                  onPress={() => void handleGoogleLogin()}
                  style={styles.googleFallbackButton}
                >
                  <Text style={styles.googleFallbackText}>Continue with Google</Text>
                </Pressable>
              )}
            </>
          ) : null}

          <Pressable
            onPress={() => router.push("/register")}
            disabled={isLoading}
          >
            <Text style={styles.link}>
              Don&apos;t have an account? Register
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: brand.colors.light.canvas,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  form: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  logo: {
    marginBottom: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 8,
    color: brand.colors.light.ink,
  },
  subtitle: {
    fontSize: 16,
    color: brand.colors.light.inkMuted,
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: brand.colors.light.surface,
    color: brand.colors.light.ink,
  },
  button: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  divider: {
    backgroundColor: brand.colors.light.border,
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
  },
  googleButton: {
    alignSelf: "center",
    height: 48,
    marginBottom: 20,
    width: "100%",
  },
  googleFallbackButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    marginBottom: 20,
  },
  googleFallbackText: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  link: {
    textAlign: "center",
    color: brand.colors.light.primary,
    fontSize: 15,
  },
});
