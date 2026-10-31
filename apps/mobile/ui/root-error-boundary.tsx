import { Component, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { colors, spacing } from "./theme";
import { StateCard } from "./components";

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
        <StateCard
          actionLabel="Reload"
          icon="exclamationmark.triangle"
          message="The screen could not be shown. Reload to try again."
          onAction={this.reset}
          title="Something went wrong"
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: spacing.xxl,
  },
});
