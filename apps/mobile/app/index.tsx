import type { HealthResponse } from "@repin/types";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

type ApiState = "checking" | "reachable" | "unreachable";

export default function HomeScreen() {
  const [apiState, setApiState] = useState<ApiState>("checking");

  const checkApi = useCallback(async () => {
    setApiState("checking");

    try {
      const response = await fetch(`${apiUrl}/api/health`, {
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        throw new Error(`Health check returned ${response.status}`);
      }

      const health = (await response.json()) as HealthResponse;
      setApiState(health.status === "ok" ? "reachable" : "unreachable");
    } catch {
      setApiState("unreachable");
    }
  }, []);

  useEffect(() => {
    void checkApi();
  }, [checkApi]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>REPIN</Text>
        <Text style={styles.title}>Ready to move.</Text>
        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusDot,
              apiState === "reachable" && styles.statusDotReachable,
              apiState === "unreachable" && styles.statusDotUnreachable,
            ]}
          />
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>API status</Text>
            <Text style={styles.statusValue}>
              {apiState === "checking" && "Checking…"}
              {apiState === "reachable" && "Reachable"}
              {apiState === "unreachable" && "Unreachable"}
            </Text>
          </View>
          {apiState === "checking" ? (
            <ActivityIndicator color="#2563eb" />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => void checkApi()}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
        <Text selectable style={styles.endpoint}>
          {apiUrl}/api/health
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f8fafc" },
  container: { flex: 1, justifyContent: "center", padding: 24 },
  eyebrow: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    color: "#0f172a",
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
    marginBottom: 32,
  },
  statusCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    padding: 20,
  },
  statusDot: {
    backgroundColor: "#94a3b8",
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  statusDotReachable: { backgroundColor: "#16a34a" },
  statusDotUnreachable: { backgroundColor: "#dc2626" },
  statusCopy: { flex: 1, marginLeft: 14 },
  statusLabel: { color: "#64748b", fontSize: 13 },
  statusValue: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "600",
    marginTop: 2,
  },
  retryButton: {
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  retryText: { color: "#1d4ed8", fontSize: 14, fontWeight: "600" },
  endpoint: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 14,
    textAlign: "center",
  },
});

