import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pressableFocused, webFocusRing } from "./focus-ring";
import { Chevron, Icon } from "./icons";
import { TwoPane, useLayoutMode } from "./layout";
import { Button, Card, TextField } from "./components";
import { ListRow, RoundIconButton } from "./primitives";
import { ScrollAnchorProvider, type ScrollAnchorController } from "./scroll-anchor";
import { colors, elevation, fonts, layout, radii, size, spacing, type } from "./theme";

const effortLabels = ["Light work", "Felt good", "Solid work", "That was rough", "I'm cooked"];

/**
 * T4 workout forms. The Duo strip is system status-bar chrome (`useStripPresent`),
 * not a slot this stack can draw into. `presentation: "modal"` does not document
 * that chrome staying above the modal, so the close control is always top-left.
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
  const { mode, split } = useLayoutMode();
  const twoPane = Platform.OS !== "web" && mode === "twoPane";
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
            <Modal
              animationType="fade"
              onRequestClose={() => setPreviewOpen(false)}
              presentationStyle="overFullScreen"
              statusBarTranslucent
              transparent
              visible={previewOpen}
            >
              <View style={styles.sheetRoot}>
                <Pressable accessibilityLabel="Close preview" onPress={() => setPreviewOpen(false)} style={styles.sheetBackdrop} />
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
                  <View style={styles.sheetGrabber} />
                  <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Preview</Text>
                    <RoundIconButton accessibilityLabel="Close preview" kind="close" onPress={() => setPreviewOpen(false)} />
                  </View>
                  <ScrollView
                    contentContainerStyle={styles.sheetContent}
                    keyboardShouldPersistTaps="handled"
                    style={styles.sheetScroll}
                  >
                    {preview}
                  </ScrollView>
                </View>
              </View>
            </Modal>
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

export function FieldLabel({ label, optional = false }: { label: string; optional?: boolean }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {optional ? <Text style={styles.optional}>Optional</Text> : null}
    </View>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function ChoiceTiles<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  value: T | null;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.choiceGrid}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={(state) => [
              styles.choiceTile,
              selected ? styles.choiceTileSelected : styles.choiceTileIdle,
              webFocusRing(pressableFocused(state)),
            ]}
          >
            <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
            {selected ? <Icon color={colors.brand} name="checkmark" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function FlameRating({
  onChange,
  value,
}: {
  onChange: (value: number | null) => void;
  value: number | null;
}) {
  return (
    <View>
      <View accessibilityLabel="How'd it feel?" accessibilityRole="radiogroup" style={styles.flameRow}>
        {effortLabels.map((label, index) => {
          const level = index + 1;
          const selected = value === level;
          const filled = (value ?? 0) >= level;
          return (
            <Pressable
              accessibilityLabel={`${level}: ${label}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={level}
              onPress={() => onChange(selected ? null : level)}
              style={(state) => [
                styles.flameTile,
                filled ? styles.flameTileFilled : styles.flameTileEmpty,
                selected && styles.flameTileSelected,
                webFocusRing(pressableFocused(state)),
              ]}
            >
              <Text style={[styles.flame, !filled && styles.flameEmpty]}>🔥</Text>
            </Pressable>
          );
        })}
        {value ? <Text style={styles.flameWord}>{effortLabels[value - 1]}</Text> : null}
      </View>
      {value ? null : <Text style={styles.flameHelper}>Tap a flame to rate your effort</Text>}
    </View>
  );
}

export function PhotoTile({
  busyLabel = null,
  onChange,
  onRemove,
  uri,
}: {
  busyLabel?: string | null;
  onChange: () => void;
  onRemove: () => void;
  uri: string | null;
}) {
  if (uri) {
    return (
      <View style={styles.photoFilled}>
        <Pressable accessibilityLabel="Change photo" accessibilityRole="button" onPress={onChange}>
          <Image accessibilityLabel="Selected workout" source={{ uri }} style={styles.photo} />
        </Pressable>
        <RoundIconButton
          accessibilityLabel="Remove photo"
          kind="close"
          look="photo"
          onPress={onRemove}
          style={styles.photoRemove}
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={Boolean(busyLabel)}
      onPress={onChange}
      style={(state) => [styles.photoEmpty, webFocusRing(pressableFocused(state))]}
    >
      <Icon color={colors.brand} name="camera" />
      <Text style={styles.photoLabel}>{busyLabel ?? "Add photo"}</Text>
    </Pressable>
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
          <View style={styles.webDateField}>
            <TextField
              autoCapitalize="none"
              compact
              label="Date"
              onBlur={() => onOccurredAt(fromLocalParts(webDate, webTime, occurredAt))}
              onChangeText={onWebDate}
              placeholder="YYYY-MM-DD"
              value={webDate}
            />
          </View>
          <View style={styles.webDateField}>
            <TextField
              autoCapitalize="none"
              compact
              label="Time"
              onBlur={() => onOccurredAt(fromLocalParts(webDate, webTime, occurredAt))}
              onChangeText={onWebTime}
              placeholder="HH:MM"
              value={webTime}
            />
          </View>
        </View>
      </FormCard>
    );
  }

  return (
    <FormCard flush>
      <ListRow label="Completed" onPress={() => onPicker({ pickerMode: "date", showPicker: true })} value={formatFriendlyDate(occurredAt)} />
      {showPicker ? (
        <View style={styles.pickerWrap}>
          <DateTimePicker mode={Platform.OS === "ios" ? "datetime" : pickerMode} onChange={handleNativeChange} value={occurredAt} />
          {Platform.OS === "ios" ? (
            <Button onPress={() => onPicker({ showPicker: false })} style={styles.tonalDone} variant="tonal">Done</Button>
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

export function fromLocalParts(date: string, time: string, fallback: Date) {
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
  labelRow: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  fieldLabel: { ...type.body, color: colors.inkSoft, fontFamily: fonts.bold },
  optional: { ...type.label, color: colors.muted, fontFamily: fonts.medium },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choiceTile: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 2,
    flexBasis: "47%",
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: size.control,
    paddingHorizontal: spacing.lg,
  },
  choiceTileIdle: { backgroundColor: colors.surface, borderColor: colors.border },
  choiceTileSelected: { backgroundColor: colors.brandTint, borderColor: colors.brand },
  choiceText: { ...type.body, color: colors.inkSoft, flex: 1 },
  choiceTextSelected: { color: colors.ink, fontFamily: fonts.semibold },
  flameRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  flameTile: { alignItems: "center", borderRadius: radii.md, borderWidth: 2, height: size.hit, justifyContent: "center", width: size.hit },
  flameTileEmpty: { backgroundColor: colors.surface, borderColor: colors.border },
  flameTileFilled: { backgroundColor: colors.brandTint, borderColor: colors.brandTint },
  flameTileSelected: { borderColor: colors.brand },
  flame: { ...type.title },
  flameEmpty: { opacity: 0.35 },
  flameWord: { ...type.body, color: colors.brand, fontFamily: fonts.bold },
  flameHelper: { color: colors.muted, marginTop: spacing.sm, ...type.bodySmall },
  photoEmpty: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: spacing.huge * 4,
    padding: spacing.lg,
  },
  photoLabel: { color: colors.brand, ...type.label },
  photoFilled: { position: "relative" },
  photo: { borderRadius: radii.lg, height: spacing.huge * 4, width: "100%" },
  photoRemove: { position: "absolute", right: spacing.sm, top: spacing.sm },
  webDateRow: { flexDirection: "row", gap: spacing.md },
  webDateField: { flex: 1 },
  pickerWrap: { alignItems: "flex-end", gap: spacing.sm, paddingBottom: spacing.lg, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  tonalDone: { alignSelf: "flex-start", paddingHorizontal: spacing.xl },
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
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { backgroundColor: colors.overlay, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    boxShadow: elevation.e3,
    maxHeight: "86%",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  sheetGrabber: { alignSelf: "center", backgroundColor: colors.borderStrong, borderRadius: radii.pill, height: spacing.xs, marginBottom: spacing.md, width: spacing.huge },
  sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md, minHeight: size.hit },
  sheetTitle: { color: colors.ink, ...type.heading },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetContent: { paddingBottom: spacing.md },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, padding: spacing.md },
  errorText: { color: colors.danger, ...type.bodySmall },
});
