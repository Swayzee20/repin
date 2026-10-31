import { useRef, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useReservedRegions } from "./reserved-regions";

import {
  centeredCardFrame,
  resolveLayout,
  type ActiveDivision,
  type LayoutSnapshot,
} from "./layout-math";
import {
  AnchorRegistryProvider,
  PaneScope,
  ScrollAnchorProvider,
  useScrollAnchor,
  type ScrollAnchorController,
} from "./scroll-anchor";
import { colors, layout, spacing } from "./theme";

export type { LayoutMode, LayoutSnapshot, LayoutSplit } from "./layout-math";

function useActiveDivision(): ActiveDivision | null {
  const regions = useReservedRegions();
  if (Platform.OS !== "ios") return null;
  const division = regions.find((region) => region.kind === "division");
  if (!division || division.kind !== "division") return null;
  return {
    centerX: division.frame.x + division.frame.width / 2,
    centerY: division.frame.y + division.frame.height / 2,
    height: division.frame.height,
    width: division.frame.width,
  };
}

export function useLayoutMode(): LayoutSnapshot {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const division = useActiveDivision();
  return resolveLayout({
    division,
    insets: { left: insets.left, right: insets.right },
    width,
  });
}

export function useCenteredCardFrame() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const division = useActiveDivision();
  return centeredCardFrame({
    division,
    height,
    insets,
    width,
  });
}

export function WideColumn({
  children,
  fill = false,
  max = "readable",
  style,
}: {
  children: ReactNode;
  fill?: boolean;
  max?: "form" | "readable";
  style?: StyleProp<ViewStyle>;
}) {
  const cap = max === "form" ? layout.formMax : layout.maxReadable;
  return (
    <View style={[styles.wideOuter, fill && styles.fill]}>
      <View style={[{ maxWidth: cap, width: "100%" }, fill && styles.fill, style]}>
        {children}
      </View>
    </View>
  );
}

export function CenteredCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const frame = useCenteredCardFrame();
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        pointerEvents="box-none"
        style={{
          height: frame.height,
          justifyContent: frame.justifyContent,
          left: frame.left,
          position: "absolute",
          top: frame.top,
          width: frame.width,
        }}
      >
        <View style={style}>{children}</View>
      </View>
    </View>
  );
}

type TwoPaneFallback = "hide-left" | "hide-right" | "stack";

export function TwoPane({
  bleedLeading = false,
  column = "none",
  contentPaddingBottom = 0,
  fallback = "stack",
  keyboardShouldPersistTaps = "handled",
  leadingFill,
  left,
  leftAnchorKey = null,
  right,
  rightAnchorKey = null,
  scrollableLeft = true,
  scrollableRight = true,
}: {
  bleedLeading?: boolean;
  column?: "form" | "none" | "readable";
  contentPaddingBottom?: number;
  fallback?: TwoPaneFallback;
  keyboardShouldPersistTaps?: "always" | "handled" | "never";
  leadingFill?: string;
  left: ReactNode;
  leftAnchorKey?: string | null;
  right: ReactNode;
  rightAnchorKey?: string | null;
  scrollableLeft?: boolean;
  scrollableRight?: boolean;
}) {
  const { height, width } = useWindowDimensions();
  const { mode, split } = useLayoutMode();
  const relayoutKey = `${mode}:${width}:${height}:${split.gap}:${split.left.width}:${split.right.width}:${split.splitX}`;
  const leftScroll = useScrollAnchor(relayoutKey, leftAnchorKey);
  const rightScroll = useScrollAnchor(relayoutKey, rightAnchorKey);
  const collapsedScroll = useScrollAnchor(relayoutKey, fallback === "hide-right" ? leftAnchorKey : rightAnchorKey);
  const registry = useRef(new Map<string, "left" | "right">());
  const modeRef = useRef(mode);

  if (modeRef.current !== mode) {
    const previous = modeRef.current;
    modeRef.current = mode;
    if (previous === "twoPane") {
      collapsedScroll.anchorRef.current = fallback === "hide-left"
        ? rightScroll.anchorRef.current
        : leftScroll.anchorRef.current ?? rightScroll.anchorRef.current;
      collapsedScroll.requestRestore();
    } else if (mode === "twoPane") {
      const saved = collapsedScroll.anchorRef.current;
      const pane = saved ? registry.current.get(saved.id) : undefined;
      if (saved && pane === "right") {
        rightScroll.anchorRef.current = saved;
        rightScroll.requestRestore();
      } else if (saved) {
        leftScroll.anchorRef.current = saved;
        leftScroll.requestRestore();
      }
    }
  }

  const showLeft = mode === "twoPane" || fallback !== "hide-left";
  const showRight = mode === "twoPane" || fallback !== "hide-right";

  return (
    <AnchorRegistryProvider registry={registry}>
      <View style={styles.panes}>
        {mode === "twoPane" ? (
          <>
            {leadingFill ? (
              <View
                pointerEvents="none"
                style={[styles.leadingFill, { backgroundColor: leadingFill, width: split.splitX }]}
              />
            ) : null}
            {showLeft ? (
              <PaneScroll
                anchor={leftScroll}
                frame={bleedLeading ? { width: split.splitX, x: 0 } : split.left}
                keyboardShouldPersistTaps={keyboardShouldPersistTaps}
                paddingBottom={contentPaddingBottom}
                pane="left"
                pointerEvents={bleedLeading ? "none" : "auto"}
                scrollable={scrollableLeft}
              >
                {left}
              </PaneScroll>
            ) : null}
            {showRight ? (
              <PaneScroll
                anchor={rightScroll}
                frame={split.right}
                keyboardShouldPersistTaps={keyboardShouldPersistTaps}
                paddingBottom={contentPaddingBottom}
                pane="right"
                scrollable={scrollableRight}
              >
                {right}
              </PaneScroll>
            ) : null}
          </>
        ) : (
          <CollapsedColumn
            anchor={collapsedScroll}
            column={column}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            paddingBottom={contentPaddingBottom}
          >
            {showLeft ? <PaneScope pane="left">{left}</PaneScope> : null}
            {showRight ? <PaneScope pane="right">{right}</PaneScope> : null}
          </CollapsedColumn>
        )}
      </View>
    </AnchorRegistryProvider>
  );
}

function PaneScroll({
  anchor,
  children,
  frame,
  keyboardShouldPersistTaps,
  paddingBottom,
  pane,
  pointerEvents = "auto",
  scrollable,
}: {
  anchor: ScrollAnchorController;
  children: ReactNode;
  frame: { width: number; x: number };
  keyboardShouldPersistTaps: "always" | "handled" | "never";
  paddingBottom: number;
  pane: "left" | "right";
  pointerEvents?: "auto" | "none";
  scrollable: boolean;
}) {
  const frameStyle = { bottom: 0, left: frame.x, position: "absolute" as const, top: 0, width: frame.width };
  if (!scrollable) {
    return (
      <View pointerEvents={pointerEvents} style={frameStyle}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      contentContainerStyle={styles.paneContent}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      onContentSizeChange={anchor.onContentSizeChange}
      onLayout={anchor.onViewportLayout}
      onScroll={anchor.onScroll}
      pointerEvents={pointerEvents}
      ref={anchor.scrollRef}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={frameStyle}
    >
      <View collapsable={false} ref={anchor.contentRef} style={{ flexGrow: 1, paddingBottom }}>
        <ScrollAnchorProvider contentRef={anchor.contentRef} onItemLayout={anchor.onItemLayout} pane={pane}>
          {children}
        </ScrollAnchorProvider>
      </View>
    </ScrollView>
  );
}

function CollapsedColumn({
  anchor,
  children,
  column,
  keyboardShouldPersistTaps,
  paddingBottom,
}: {
  anchor: ScrollAnchorController;
  children: ReactNode;
  column: "form" | "none" | "readable";
  keyboardShouldPersistTaps: "always" | "handled" | "never";
  paddingBottom: number;
}) {
  const body = (
    <View collapsable={false} ref={anchor.contentRef} style={[styles.collapsedContent, { paddingBottom }]}>
      <CollapsedAnchor anchor={anchor}>{children}</CollapsedAnchor>
    </View>
  );
  return (
    <ScrollView
      contentContainerStyle={styles.collapsedScroll}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      onContentSizeChange={anchor.onContentSizeChange}
      onLayout={anchor.onViewportLayout}
      onScroll={anchor.onScroll}
      ref={anchor.scrollRef}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={styles.fill}
    >
      <SafeAreaView edges={["left", "right"]} style={styles.collapsedSafe}>
        {column === "none" ? body : <WideColumn max={column}>{body}</WideColumn>}
      </SafeAreaView>
    </ScrollView>
  );
}

function CollapsedAnchor({ anchor, children }: { anchor: ScrollAnchorController; children: ReactNode }) {
  return (
    <ScrollAnchorProvider contentRef={anchor.contentRef} onItemLayout={anchor.onItemLayout} pane={null}>
      {children}
    </ScrollAnchorProvider>
  );
}

const styles = StyleSheet.create({
  collapsedContent: { flexGrow: 1, paddingHorizontal: spacing.xxl },
  collapsedSafe: { flexGrow: 1 },
  collapsedScroll: { flexGrow: 1 },
  fill: { flex: 1 },
  leadingFill: { bottom: 0, left: 0, position: "absolute", top: 0 },
  paneContent: { flexGrow: 1 },
  panes: { backgroundColor: colors.background, flex: 1 },
  wideOuter: { alignItems: "center", width: "100%" },
});
