import { useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import repinMarkLarge from "../assets/branding/repin-mark-large.png";
import { Wordmark } from "./components";
import { errorText } from "./form-field-state";
import { Icon } from "./icons";
import { TwoPane, useLayoutMode } from "./layout";
import { RoundIconButton, roundNavButtonStyle } from "./primitives";
import { colors, layout, radii, size, spacing } from "./theme";

type FieldNode = ComponentRef<typeof TextInput>;

/**
 * Keeps the focused field when TwoPane remounts its panes (fold, unfold, Split View).
 * Same approach as the sign-in form.
 */
export function usePaneFieldFocus() {
  const { mode } = useLayoutMode();
  const focusedField = useRef<string | null>(null);
  const ignoreBlur = useRef(false);
  const modeRef = useRef(mode);
  const nodes = useRef(new Map<string, FieldNode | null>());
  const refCallbacks = useRef(new Map<string, (node: FieldNode | null) => void>());

  if (modeRef.current !== mode) {
    modeRef.current = mode;
    ignoreBlur.current = true;
  }

  useEffect(() => {
    const field = focusedField.current;
    const frame = requestAnimationFrame(() => {
      if (field) nodes.current.get(field)?.focus();
      requestAnimationFrame(() => {
        ignoreBlur.current = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  return (name: string) => {
    let ref = refCallbacks.current.get(name);
    if (!ref) {
      ref = (node: FieldNode | null) => {
        nodes.current.set(name, node);
      };
      refCallbacks.current.set(name, ref);
    }
    return {
      onBlur: () => {
        if (ignoreBlur.current) return;
        if (focusedField.current === name) focusedField.current = null;
      },
      onFocus: () => {
        focusedField.current = name;
      },
      ref,
    };
  };
}

export function FormError({ message }: { message: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.formError}>
      <Icon color={colors.danger} name="exclamationmark.circle" size={size.icon.sm} />
      <Text accessibilityRole="alert" style={[errorText, styles.formErrorText]}>{message}</Text>
    </View>
  );
}

export function AuthSuccessMark() {
  return (
    <View accessible={false} style={styles.successMark}>
      <Icon color={colors.success} name="checkmark" size={size.icon.md} />
    </View>
  );
}

/**
 * T1 brand + form. Unfolded, the round back sits at the top-left of the left pane
 * (the brand pane does not receive touches). Folded, web, and Split View that
 * collapse to one column lead the form with the same button.
 */
export function AuthScreen({
  backLabel,
  children,
  onBack,
}: {
  backLabel: string;
  children: ReactNode;
  onBack: () => void;
}) {
  const { mode, split } = useLayoutMode();
  const insets = useSafeAreaInsets();
  const twoPane = mode === "twoPane";

  return (
    <SafeAreaView edges={twoPane ? [] : ["top", "bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <View style={styles.flex}>
          <TwoPane
            bleedLeading
            column="form"
            fallback="hide-left"
            keyboardShouldPersistTaps="handled"
            leadingFill={colors.surfaceMuted}
            left={<AuthBrandPanel />}
            right={(
              <View
                style={[
                  styles.formColumn,
                  twoPane && {
                    paddingBottom: insets.bottom + spacing.xxl,
                    paddingTop: insets.top + spacing.huge,
                  },
                ]}
              >
                {twoPane ? null : (
                  <RoundIconButton accessibilityLabel={backLabel} kind="back" onPress={onBack} style={roundNavButtonStyle} />
                )}
                {children}
              </View>
            )}
          />
          {twoPane ? (
            <View pointerEvents="box-none" style={styles.backOverlay}>
              <RoundIconButton
                accessibilityLabel={backLabel}
                kind="back"
                onPress={onBack}
                style={{ left: split.left.x, position: "absolute", top: insets.top + spacing.md }}
              />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuthBrandPanel() {
  const { height } = useWindowDimensions();
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.brandPanel, { minHeight: height }]}>
      <Image accessible={false} resizeMode="contain" source={repinMarkLarge} style={styles.brandMark} />
      <Wordmark decorative size={40} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  backOverlay: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0, zIndex: 1 },
  brandPanel: { alignItems: "center", flexGrow: 1, justifyContent: "center", padding: spacing.xxl },
  brandMark: { height: 96, marginBottom: spacing.lg, width: 118 },
  formColumn: {
    flexGrow: 1,
    maxWidth: layout.formMax,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.lg,
    width: "100%",
  },
  formError: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm },
  formErrorText: { flex: 1 },
  successMark: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    height: size.avatars.lg,
    justifyContent: "center",
    width: size.avatars.lg,
  },
});
