import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card } from "./components";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { DateRow, TextField } from "./form-fields";
import { Chevron } from "./icons";
import { TwoPane, useLayoutMode } from "./layout";
import { workoutFormTwoPane } from "./layout-math";
import { RoundIconButton } from "./primitives";
import { ScrollAnchorProvider, type ScrollAnchorController } from "./scroll-anchor";
import { BottomSheet } from "./sheet";
import { colors, elevation, layout, radii, size, spacing, type } from "./theme";

/**
 * T4 workout forms. When this scaffold fills the window and `useLayoutMode`
 * is `"twoPane"` (not web), fields sit in the leading pane and the preview
 * plus submit sit in the trailing pane, clear of the crease. A page sheet is
 * narrower than the window — a form opened folded and then unfolded, or an
 * iPad sheet — so it stays one column: a Preview row and a pinned submit.
 * Until the root is measured, the mode decision stands so a full-screen form
 * does not flash to one column.
 *
 * Close stays the round 44pt X at the top-left.
 */
export function WorkoutFormScaffold({
  anchor,
  eyebrow,
  fields,
  notice,
  onClose,
  preview,
  scrollRef,
  submit,
  title,
}: {
  anchor?: ScrollAnchorController;
  eyebrow: string;
  fields: ReactNode;
  notice?: ReactNode;
  onClose: () => void;
  preview: ReactNode;
  scrollRef?: RefObject<ScrollViewInstance | null>;
  submit: ReactNode;
  title: string;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const { mode, split } = useLayoutMode();
  const twoPane = workoutFormTwoPane({
    frameWidth,
    mode,
    os: Platform.OS,
    windowWidth,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const contentBottom = twoPane ? Math.max(insets.bottom, spacing.xxl) : spacing.xxl;

  useEffect(() => {
    if (twoPane) setPreviewOpen(false);
  }, [twoPane]);

  const body = (
    <>
      <TitleBlock eyebrow={eyebrow} title={title} />
      {fields}
    </>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setFrameWidth((current) => (current === next ? current : next));
      }}
      style={styles.root}
    >
      <View
        style={[
          styles.root,
          twoPane ? null : styles.compactFrame,
          twoPane
            ? null
            : { paddingLeft: insets.left + spacing.xl, paddingRight: insets.right + spacing.xl },
        ]}
      >
        <View
          style={[
            styles.closeRow,
            {
              paddingLeft: twoPane ? split.left.x : 0,
              paddingTop: insets.top + spacing.sm,
            },
          ]}
        >
          <View style={styles.closeButtonSlot}>
            <RoundIconButton accessibilityLabel="Close" kind="close" onPress={onClose} />
            {twoPane ? null : (
              <View pointerEvents="none" style={styles.closeEyebrow}>
                <Text style={styles.eyebrow}>{eyebrow}</Text>
              </View>
            )}
          </View>
        </View>

        {twoPane ? (
          <View style={styles.panes}>
            <TwoPane
              keyboardShouldPersistTaps="handled"
              left={(
                <FieldsScroll
                  anchor={anchor}
                  contentPaddingBottom={contentBottom}
                  fill="absolute"
                  scrollRef={scrollRef}
                >
                  <TitleBlock eyebrow={eyebrow} showEyebrow title={title} />
                  {fields}
                </FieldsScroll>
              )}
              right={(
                <View style={styles.previewColumn}>
                  <ScrollView
                    contentContainerStyle={styles.previewScrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    style={styles.previewScroll}
                  >
                    <View style={styles.previewHeading}>
                      <Text style={styles.eyebrow}>PREVIEW</Text>
                      <Text style={styles.previewHint}>how your crew sees it</Text>
                    </View>
                    {preview}
                  </ScrollView>
                  <View style={[styles.previewFooter, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
                    {notice}
                    {submit}
                  </View>
                </View>
              )}
              scrollableLeft={false}
              scrollableRight={false}
            />
          </View>
        ) : (
          <>
            <FieldsScroll
              anchor={anchor}
              contentPaddingBottom={contentBottom}
              fill="flex"
              scrollRef={scrollRef}
            >
              {body}
            </FieldsScroll>
            <View style={[styles.compactFooter, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
              <Pressable
                accessibilityLabel="Preview. See how your crew sees it"
                accessibilityRole="button"
                onPress={() => setPreviewOpen(true)}
                style={(state) => [styles.previewRow, webFocusRing(pressableFocused(state))]}
              >
                <Text style={styles.eyebrow}>PREVIEW</Text>
                <Text numberOfLines={1} style={styles.previewRowHint}>See how your crew sees it</Text>
                <Chevron />
              </Pressable>
              {notice}
              {submit}
            </View>
            <BottomSheet
              closeLabel="Close preview"
              onDismiss={() => setPreviewOpen(false)}
              title="Preview"
              visible={previewOpen}
            >
              <ScrollView
                contentContainerStyle={styles.sheetContent}
                keyboardShouldPersistTaps="handled"
                style={styles.sheetScroll}
              >
                {preview}
              </ScrollView>
            </BottomSheet>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function FieldsScroll({
  anchor,
  children,
  contentPaddingBottom,
  fill,
  scrollRef,
}: {
  anchor?: ScrollAnchorController;
  children: ReactNode;
  contentPaddingBottom: number;
  fill: "absolute" | "flex";
  scrollRef?: RefObject<ScrollViewInstance | null>;
}) {
  const stack = <View style={styles.fieldsContent}>{children}</View>;
  const content = (
    <View collapsable={false} ref={anchor?.contentRef} style={{ paddingBottom: contentPaddingBottom }}>
      {anchor ? (
        <ScrollAnchorProvider contentRef={anchor.contentRef} onItemLayout={anchor.onItemLayout} pane={null}>
          {stack}
        </ScrollAnchorProvider>
      ) : stack}
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={styles.fieldsContainer}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={anchor?.onContentSizeChange}
      onLayout={anchor?.onViewportLayout}
      onScroll={anchor?.onScroll}
      ref={(node) => {
        if (anchor) anchor.scrollRef.current = node;
        if (scrollRef) scrollRef.current = node;
      }}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={fill === "absolute" ? styles.fieldsScrollAbsolute : styles.fieldsScrollFlex}
    >
      {content}
    </ScrollView>
  );
}

function TitleBlock({
  eyebrow,
  showEyebrow = false,
  title,
}: {
  eyebrow: string;
  showEyebrow?: boolean;
  title: string;
}) {
  return (
    <View>
      {showEyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

export function FormCard({ children, flush = false }: { children: ReactNode; flush?: boolean }) {
  return <Card style={flush ? styles.flushCard : styles.formCard}>{children}</Card>;
}

export function CardHeading({ children }: { children: string }) {
  return <Text style={styles.cardHeading}>{children}</Text>;
}

export function FormError({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function CompletedCard({
  occurredAt,
  onOccurredAt,
  onPicker,
  onWebDate,
  onWebTime,
  pickerMode,
  showPicker,
  webDate,
  webTime,
}: {
  occurredAt: Date;
  onOccurredAt: (value: Date) => void;
  onPicker: (next: { pickerMode?: "date" | "time"; showPicker: boolean }) => void;
  onWebDate: (value: string) => void;
  onWebTime: (value: string) => void;
  pickerMode: "date" | "time";
  showPicker: boolean;
  webDate: string;
  webTime: string;
}) {
  const handleNativeChange = (event: DateTimePickerEvent, value?: Date) => {
    if (event.type === "dismissed" || !value) {
      onPicker({ showPicker: false });
      return;
    }
    onOccurredAt(value);
    if (Platform.OS === "android" && pickerMode === "date") {
      onPicker({ pickerMode: "time", showPicker: false });
      requestAnimationFrame(() => onPicker({ pickerMode: "time", showPicker: true }));
      return;
    }
    if (Platform.OS === "android") onPicker({ showPicker: false });
  };

  if (Platform.OS === "web") {
    return (
      <FormCard>
        <CardHeading>Completed</CardHeading>
        <View style={styles.webDateRow}>
          <TextField
            autoCapitalize="none"
            containerStyle={styles.webDateField}
            label="Date"
            onBlur={() => onOccurredAt(fromLocalParts(webDate, webTime, occurredAt))}
            onChangeText={onWebDate}
            placeholder="YYYY-MM-DD"
            value={webDate}
          />
          <TextField
            autoCapitalize="none"
            containerStyle={styles.webDateField}
            label="Time"
            onBlur={() => onOccurredAt(fromLocalParts(webDate, webTime, occurredAt))}
            onChangeText={onWebTime}
            placeholder="HH:MM"
            value={webTime}
          />
        </View>
      </FormCard>
    );
  }

  return (
    <FormCard flush>
      <DateRow label="Completed" onPress={() => onPicker({ pickerMode: "date", showPicker: true })} value={formatFriendlyDate(occurredAt)} />
      {showPicker ? (
        <View style={styles.pickerWrap}>
          <DateTimePicker mode={Platform.OS === "ios" ? "datetime" : pickerMode} onChange={handleNativeChange} value={occurredAt} />
          {Platform.OS === "ios" ? (
            <Button onPress={() => onPicker({ showPicker: false })} variant="tonal">Done</Button>
          ) : null}
        </View>
      ) : null}
    </FormCard>
  );
}

export function getLocalDateParts(value: Date) {
  const year = String(value.getFullYear());
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function fromLocalParts(date: string, time: string, fallback: Date) {
  const next = new Date(`${date}T${time}:00`);
  return Number.isNaN(next.getTime()) ? fallback : next;
}

function formatFriendlyDate(value: Date) {
  const today = new Date();
  const date = value.toDateString() === today.toDateString()
    ? "Today"
    : value.toLocaleDateString([], { month: "short", day: "numeric", year: value.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  return `${date}, ${value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
  compactFrame: { alignSelf: "center", maxWidth: layout.maxReadable, width: "100%" },
  closeRow: { paddingBottom: spacing.sm },
  closeButtonSlot: { justifyContent: "center", minHeight: size.hit },
  closeEyebrow: { alignItems: "center", bottom: 0, justifyContent: "center", left: size.hit, position: "absolute", right: size.hit, top: 0 },
  panes: { flex: 1 },
  fieldsScrollFlex: { flex: 1, marginHorizontal: -spacing.md },
  fieldsScrollAbsolute: { bottom: 0, left: -spacing.md, position: "absolute", right: -spacing.md, top: 0 },
  fieldsContainer: { flexGrow: 1, paddingHorizontal: spacing.md },
  fieldsContent: { flexGrow: 1, gap: spacing.lg },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  formCard: { padding: spacing.xl },
  flushCard: { paddingHorizontal: 0, paddingVertical: 0 },
  cardHeading: { ...type.section, color: colors.ink, marginBottom: spacing.sm },
  webDateRow: { flexDirection: "row", gap: spacing.md },
  webDateField: { flex: 1 },
  pickerWrap: { alignItems: "flex-start", gap: spacing.sm, paddingBottom: spacing.lg, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  previewColumn: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  previewScroll: { flex: 1, marginHorizontal: -spacing.md },
  previewScrollContent: { paddingBottom: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  previewHeading: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  previewHint: { color: colors.muted, ...type.bodySmall },
  previewFooter: { gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  compactFooter: { gap: spacing.md, paddingTop: spacing.md },
  previewRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    boxShadow: elevation.e1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: size.hit,
    paddingHorizontal: spacing.lg,
  },
  previewRowHint: { color: colors.muted, flex: 1, ...type.bodySmall },
  sheetScroll: { flexGrow: 0, flexShrink: 1, maxHeight: "70%" },
  sheetContent: { paddingBottom: spacing.md },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, padding: spacing.md },
  errorText: { color: colors.danger, ...type.bodySmall },
});
