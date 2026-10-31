import { Component, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing } from "./theme";

type BoundaryState = { error: Error | null };

/** Last-resort screen when a render throws. Production builds have no redbox, so a throw otherwise looks blank. */
export class RootErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>The screen could not be shown. Reload to try again.</Text>
        <Pressable accessibilityRole="button" onPress={this.reset} style={styles.button}>
          <Text style={styles.buttonText}>Reload</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: spacing.xxl,
  },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700", textAlign: "center" },
  body: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: spacing.md, textAlign: "center" },
  button: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    justifyContent: "center",
    marginTop: spacing.xxl,
    minHeight: 52,
    paddingHorizontal: spacing.xxl,
  },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: "800" },
});
