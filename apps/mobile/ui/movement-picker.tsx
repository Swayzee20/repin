import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";

const webInputOutline: TextStyle | null = Platform.OS === "web" ? { outlineWidth: 0 } : null;

import { supabase } from "../lib/supabase";
import { Button } from "./components";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { fieldChrome } from "./form-field-state";
import { Icon } from "./icons";
import {
  addExercisesLabel,
  catalogFromSummary,
  formatPickerMeta,
  isPickerSelected,
  movementSearchDebounceMs,
  movementSearchQuery,
  parseMovementsResponse,
  pickerChipType,
  pickerListModel,
  pickerSearchPlaceholder,
  pickerSearchRadius,
  pickerSectionLabels,
  pickerTitle,
  togglePickerSelection,
  typedMovementFromQuery,
  formatUseAsTypedLabel,
  typedNameHelper,
  type PickerMovement,
} from "./movement-picker-state";
import { pickerCheckSize, pickerRowHeight } from "./overlay-state";
import { BottomSheet } from "./sheet";
import { colors, fonts, radii, size, spacing, type } from "./theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type { PickerMovement };

export function MovementPicker({
  initialSelection = [],
  onConfirm,
  onDismiss,
  visible,
}: {
  initialSelection?: PickerMovement[];
  onConfirm: (selections: PickerMovement[]) => void;
  onDismiss: () => void;
  visible: boolean;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState<PickerMovement[]>(initialSelection);
  const [catalog, setCatalog] = useState<PickerMovement[]>([]);
  const [recentCatalog, setRecentCatalog] = useState<PickerMovement[]>([]);
  const [recentCustom, setRecentCustom] = useState<PickerMovement[]>([]);
  const [searchResults, setSearchResults] = useState<PickerMovement[]>([]);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setFocused(false);
    setSelected(initialSelection);
    setSearchResults([]);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when the sheet opens

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    void loadMovements({ recent: true, signal: controller.signal }).then((body) => {
      if (!body) return;
      const parsed = parseMovementsResponse(body);
      setCatalog(parsed.catalog);
      setRecentCatalog(parsed.recent);
      setRecentCustom(parsed.recentCustom);
    });
    return () => controller.abort();
  }, [visible]);

  useEffect(() => {
    const q = movementSearchQuery(query);
    if (!visible || !q) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void loadMovements({ q, signal: controller.signal }).then((body) => {
        if (!body) return;
        setSearchResults((body.movements ?? []).map(catalogFromSummary));
      });
    }, movementSearchDebounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, visible]);

  const list = useMemo(() => pickerListModel({
    catalog,
    query,
    recentCatalog,
    recentCustom,
    searchResults,
  }), [catalog, query, recentCatalog, recentCustom, searchResults]);

  const typed = list.showUseAsTyped ? typedMovementFromQuery(query) : null;
  const chrome = fieldChrome(focused ? "focus" : "default");

  return (
    <BottomSheet
      closeLabel="Close exercise picker"
      full
      onDismiss={onDismiss}
      title={pickerTitle}
      visible={visible}
    >
      {(close) => (
        <View style={styles.body}>
          <View
            style={[
              styles.search,
              {
                backgroundColor: chrome.backgroundColor,
                borderColor: chrome.borderColor,
                borderWidth: chrome.borderWidth,
              },
            ]}
          >
            <Icon color={colors.muted} name="magnifyingglass" size={size.icon.md} />
            <TextInput
              accessibilityLabel={pickerSearchPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              onBlur={() => setFocused(false)}
              onChangeText={setQuery}
              onFocus={() => setFocused(true)}
              placeholder={pickerSearchPlaceholder}
              placeholderTextColor={chrome.placeholderColor}
              returnKeyType="search"
              selectionColor={colors.brand}
              style={[styles.searchInput, webInputOutline]}
              value={query}
            />
            {query ? (
              <Pressable
                accessibilityLabel="Clear search"
                accessibilityRole="button"
                hitSlop={spacing.md}
                onPress={() => setQuery("")}
                style={(state) => [styles.clear, webFocusRing(pressableFocused(state))]}
              >
                <Icon color={colors.subtle} name="xmark" size={size.icon.sm} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.list}
          >
            {list.recent.length ? (
              <PickerSection title={pickerSectionLabels.recent}>
                {list.recent.map((row) => (
                  <PickerRow
                    key={row.key}
                    onPress={() => setSelected((current) => togglePickerSelection(current, row))}
                    row={row}
                    section="recent"
                    selected={isPickerSelected(selected, row.key)}
                  />
                ))}
              </PickerSection>
            ) : null}
            {list.all.length ? (
              <PickerSection title={pickerSectionLabels.all}>
                {list.all.map((row) => (
                  <PickerRow
                    key={row.key}
                    onPress={() => setSelected((current) => togglePickerSelection(current, row))}
                    row={row}
                    section="catalog"
                    selected={isPickerSelected(selected, row.key)}
                  />
                ))}
              </PickerSection>
            ) : null}
            {list.catalogMatches.length ? (
              <PickerSection title={pickerSectionLabels.movements}>
                {list.catalogMatches.map((row) => (
                  <PickerRow
                    key={row.key}
                    onPress={() => setSelected((current) => togglePickerSelection(current, row))}
                    row={row}
                    section="catalog"
                    selected={isPickerSelected(selected, row.key)}
                  />
                ))}
              </PickerSection>
            ) : null}
            {list.usedMatches.length ? (
              <PickerSection title={pickerSectionLabels.used}>
                {list.usedMatches.map((row) => (
                  <PickerRow
                    key={row.key}
                    onPress={() => setSelected((current) => togglePickerSelection(current, row))}
                    row={row}
                    section="recent"
                    selected={isPickerSelected(selected, row.key)}
                  />
                ))}
              </PickerSection>
            ) : null}
            {typed ? (
              <View style={styles.typedBlock}>
                <Pressable
                  accessibilityLabel={formatUseAsTypedLabel(query)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isPickerSelected(selected, typed.key) }}
                  onPress={() => setSelected((current) => togglePickerSelection(current, typed))}
                  style={(state) => [
                    styles.typedRow,
                    state.pressed && styles.typedRowPressed,
                    webFocusRing(pressableFocused(state)),
                  ]}
                >
                  <Icon color={colors.brandPressed} name="plus" size={size.icon.sm} />
                  <Text style={styles.typedLabel}>{formatUseAsTypedLabel(query)}</Text>
                </Pressable>
                <Text style={styles.typedHelper}>{typedNameHelper}</Text>
              </View>
            ) : null}
          </ScrollView>

          <Button
            disabled={selected.length === 0}
            disabledReason={selected.length === 0 ? "Choose at least one exercise." : undefined}
            onPress={() => close(() => onConfirm(selected))}
          >
            {addExercisesLabel(selected.length)}
          </Button>
        </View>
      )}
    </BottomSheet>
  );
}

function PickerSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function PickerRow({
  onPress,
  row,
  section,
  selected,
}: {
  onPress: () => void;
  row: PickerMovement;
  section: "catalog" | "recent";
  selected: boolean;
}) {
  const meta = formatPickerMeta(row, section);
  return (
    <Pressable
      accessibilityLabel={row.movementName}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(state) => [
        styles.row,
        (selected || state.pressed) && styles.rowPressed,
        webFocusRing(pressableFocused(state)),
      ]}
    >
      <View style={styles.rowCopy}>
        <View style={styles.rowTitle}>
          <Text numberOfLines={1} style={styles.rowName}>{row.movementName}</Text>
          {row.custom ? (
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>Custom</Text>
            </View>
          ) : null}
        </View>
        {meta ? <Text numberOfLines={1} style={styles.rowMeta}>{meta}</Text> : null}
      </View>
      <View style={[styles.check, selected && styles.checkSelected]}>
        {selected ? <Icon color={colors.surface} name="checkmark" size={size.icon.sm} /> : null}
      </View>
    </Pressable>
  );
}

async function loadMovements({
  q,
  recent = false,
  signal,
}: {
  q?: string;
  recent?: boolean;
  signal?: AbortSignal;
}) {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const search = new URLSearchParams();
  if (recent) search.set("recent", "true");
  if (q) search.set("q", q);
  const response = await fetch(`${apiUrl}/api/movements?${search.toString()}`, {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    signal,
  }).catch(() => null);
  if (!response?.ok) return null;
  return response.json() as Promise<{
    movements?: Parameters<typeof catalogFromSummary>[0][];
    recent?: Parameters<typeof catalogFromSummary>[0][];
    recentCustom?: { name: string; occurredAt?: string | null }[];
  }>;
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: spacing.md,
  },
  search: {
    alignItems: "center",
    borderRadius: pickerSearchRadius,
    flexDirection: "row",
    gap: spacing.sm,
    height: size.control,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: type.body.fontSize,
    height: size.control,
    lineHeight: type.body.lineHeight,
    padding: 0,
  },
  clear: {
    alignItems: "center",
    height: size.icon.md,
    justifyContent: "center",
    width: size.icon.md,
  },
  list: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.muted,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    textTransform: "uppercase",
    ...type.eyebrow,
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: pickerRowHeight,
  },
  rowPressed: {
    backgroundColor: colors.selection,
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  rowName: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: type.section.fontSize,
    lineHeight: type.section.lineHeight,
  },
  rowMeta: {
    color: colors.muted,
    ...type.label,
  },
  chip: {
    backgroundColor: colors.brandTint,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipLabel: {
    color: colors.brandPressed,
    ...pickerChipType,
  },
  check: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: pickerCheckSize,
    justifyContent: "center",
    width: pickerCheckSize,
  },
  checkSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  typedBlock: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  typedRow: {
    alignItems: "center",
    backgroundColor: colors.brandTint,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: size.control,
    paddingHorizontal: spacing.md,
  },
  typedRowPressed: {
    backgroundColor: colors.selection,
  },
  typedLabel: {
    color: colors.brandPressed,
    fontFamily: fonts.extrabold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  typedHelper: {
    color: colors.muted,
    ...type.label,
  },
});
