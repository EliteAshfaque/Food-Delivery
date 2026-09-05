import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { router } from "expo-router";
import { UserRole } from "@food-delivery/types";
import { brand } from "@/constants/brand";
import { WasilLogo } from "@/components/wasil-brand";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api-error";
import { validateRegistrationDetails } from "@/lib/form-validation";

const ROLES = [
  { label: "Customer", value: UserRole.CUSTOMER },
  { label: "Restaurant Owner", value: UserRole.RESTAURANT_OWNER },
  { label: "Driver", value: UserRole.DRIVER },
];

const RegisterScreen = () => {
  const { register } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  const [isLoading, setLoading] = useState(false);

  async function handleRegister() {
    const validationError = validateRegistrationDetails({
      firstName,
      lastName,
      email,
      password,
    });
    if (validationError) {
      Alert.alert("Check account details", validationError);
      return;
    }

    setLoading(true);
    try {
      const result = await register({ firstName, lastName, email, password, role });
      if (result.requiresApproval) {
        Alert.alert(
          "Application received",
          result.message ??
            "Your account needs administrator approval before you can sign in.",
          [{ text: "OK", onPress: () => router.replace("/login") }],
        );
        return;
      }

      router.replace("/");
    } catch (error) {
      const status = getApiErrorStatus(error);
      if (status === 409) {
        Alert.alert(
          "Email already registered",
          "Sign in instead, or use another email address.",
        );
      } else {
        Alert.alert("Could not create account", getApiErrorMessage(error));
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
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <WasilLogo showTagline size={44} style={styles.logo} />
          <Text style={styles.title}>Create your account</Text>

        <TextInput
          accessibilityLabel="First name"
          style={styles.input}
          placeholder="First Name"
          placeholderTextColor={brand.colors.light.inkMuted}
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={80}
          returnKeyType="next"
        />

        <TextInput
          accessibilityLabel="Last name"
          style={styles.input}
          placeholder="Last Name"
          placeholderTextColor={brand.colors.light.inkMuted}
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={80}
          returnKeyType="next"
        />

        <TextInput
          accessibilityLabel="Email address"
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={brand.colors.light.inkMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          maxLength={254}
          returnKeyType="next"
        />

        <TextInput
          accessibilityLabel="Password"
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={brand.colors.light.inkMuted}
          maxLength={128}
          returnKeyType="done"
          onSubmitEditing={() => void handleRegister()}
        />

        <Text style={styles.label}>Select Your Role</Text>

        <View style={styles.roleContainer}>
          {ROLES.map((r) => (
            <Pressable
              key={r.value}
              accessibilityRole="button"
              accessibilityState={{ selected: role === r.value }}
              style={[
                styles.roleButton,
                role === r.value && styles.roleButtonActive,
              ]}
              onPress={() => setRole(r.value)}
            >
              <Text
                style={[
                  styles.roleText,
                  role === r.value && styles.roleTextActive,
                ]}
              >
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {role !== UserRole.CUSTOMER ? (
          <Text style={styles.approvalHint}>
            Driver and restaurant-owner accounts require administrator approval
            before they can sign in.
          </Text>
        ) : null}

        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={() => void handleRegister()}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Register</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Already have an account? Login</Text>
        </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  flex: {
    flex: 1,
    backgroundColor: brand.colors.light.canvas,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: brand.colors.light.canvas,
  },
  logo: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 32,
    color: brand.colors.light.ink,
  },
  input: {
    borderWidth: 1,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: brand.colors.light.surface,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 12,
    color: brand.colors.light.ink,
  },
  roleContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  approvalHint: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: -14,
    marginBottom: 20,
  },
  roleButton: {
    flex: 1,
    padding: 12,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    borderColor: brand.colors.light.border,
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
  },
  roleButtonActive: {
    backgroundColor: brand.colors.light.primary,
    borderColor: brand.colors.light.primary,
  },
  roleText: {
    fontSize: 13,
    color: "#666",
  },
  roleTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  button: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: "#FFB088",
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
    fontSize: 14,
    fontWeight: "500",
  },
});

export default RegisterScreen;
