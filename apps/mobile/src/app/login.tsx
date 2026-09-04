import { useState } from "react";
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

import { useAuth } from "@/context/auth-context";
import { brand } from "@/constants/brand";
import { WasilLogo } from "@/components/wasil-brand";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Missing details", "Please fill in all required fields.");
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch {
      Alert.alert("Login failed", "Please check your email and password.");
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
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={brand.colors.light.inkMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={brand.colors.light.inkMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
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
  link: {
    textAlign: "center",
    color: brand.colors.light.primary,
    fontSize: 15,
  },
});
