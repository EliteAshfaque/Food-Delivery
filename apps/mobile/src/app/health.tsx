import { api } from "@/lib/axios";
import { useQuery } from "@tanstack/react-query";
import { HealthCheckResponse } from "@food-delivery/types";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
export default function HomeScreen() {
  const {
    data: health,
    error,
    isLoading,
  } = useQuery<HealthCheckResponse>({
    queryKey: ["health"],
    queryFn: () =>
      api.get<HealthCheckResponse>("/health").then((res) => res.data),
  });
  return (
    <View style={styleSheet.Container}>
      <Text style={styleSheet.title}>Food Delivery</Text>
      <Text style={styleSheet.Subtitle}>Connection Text</Text>
      {isLoading && <ActivityIndicator size={"large"} color={"#ff6b35 "} />}

      {health && (
        <View style={styleSheet.statusBox}>
          <Text style={styleSheet.statusText}>API Status: {health.status}</Text>
          <Text>{new Date(health.timestamp).toLocaleTimeString()}</Text>
        </View>
      )}
      {error ? (
        <View style={styleSheet.errorBox}>
          <Text style={styleSheet.errorText}>
            {error instanceof Error ? error.message : 'Could not reach the API'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
const styleSheet = StyleSheet.create({
  Container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    marginBottom: 6,
  },
  Subtitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4,
  },
  statusBox: {
    backgroundColor: "#F0FFF4",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    width: "100%",
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: "#FFF5F5",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    width: "100%",
  },

  errorText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#E53E3E",
    textAlign: "center",
  },
});
