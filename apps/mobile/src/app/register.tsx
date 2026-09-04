import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
} from "react-native";
import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { router } from "expo-router";
import { UserRole } from "@food-delivery/types";

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
    if (!firstName || !lastName || !email || !password) {
      return Alert.alert("Please fill all the required fields");
    }
    setLoading(true);
    try {
      await register({ firstName, lastName, email, password, role });
    //   router.push("/dashboard");
    } catch (error) {
      Alert.alert("Error while Registering the User");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Text style={styles.title}>Create Account!</Text>

        <TextInput
          style={styles.input}
          placeholder="First Name"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />

        <TextInput
          style={styles.input}
          placeholder="Last Name"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}  // Fixed: was email
          onChangeText={setPassword}
          secureTextEntry
        />

        <Text style={styles.label}>Select Your Role</Text>

        <View style={styles.roleContainer}>
          {ROLES.map((r) => (
            <Pressable
              key={r.value}
              style={[
                styles.roleButton,
                role === r.value && styles.roleButtonActive,  // Fixed: was rPressed
              ]}
              onPress={() => setRole(r.value)}
            >
              <Text
                style={[
                  styles.roleText,
                  role === r.value && styles.roleTextActive,  // Fixed: was rLabel
                ]}
              >
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleRegister}  // Fixed: was incorrect syntax
          disabled={isLoading}
        >
          {isLoading ? (  // Fixed: conditional rendering
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Register</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.back()}>  {/* Fixed: was incorrect syntax */}
          <Text style={styles.link}>Already have an account? Login</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,  // Fixed: was flexRow
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
    color: '#333',
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  roleButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  roleButtonActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  roleText: {
    fontSize: 13,
    color: '#666',
  },
  roleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#FF6B35',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: '#FFB088',
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    textAlign: 'center',
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default RegisterScreen;