import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { goalCopy } from "@repin/validation";
import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "./components";
import { ChoiceTile, DateRow, FieldLabel, NumberField, TextField } from "./form-fields";
import { goalFormSheetFrame } from "./goal-form-layout";
import {
  formatGoalDate,
  goalKindTiles,
  laneTiles,
  scheduleTiles,
  timeSportTiles,
  volumeMetricTiles,
  volumeSportsFor,
  type GoalFormDraft,
} from "./goal-form-state";
import { keyboardScrollProps } from "./keyboard";
import { MovementPicker, type PickerMovement } from "./movement-picker";
import { RoundIconButton } from "./primitives";
import { colors, size, spacing, type } from "./theme";
import { CardHeading, FormCard, FormError } from "./workout-form-frame";

export function GoalFormScaffold({
  error,
  eyebrow,
  fields,
  onClose,
  submit,
  title,
}: {
  error?: string | null;
  eyebrow: string;
  fields: ReactNode;
  onClose: () => void;
  submit: ReactNode;
  title: string;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const frame = goalFormSheetFrame({
    frameWidth,
    insets: { left: insets.left, right: insets.right },
    windowWidth,
  });
  const footerBottom = Math.max(insets.bottom, spacing.lg);

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
          styles.column,
          {
            marginLeft: frame.left,
            paddingHorizontal: spacing.xl,
            width: frame.width,
          },
        ]}
      >
        <View style={[styles.closeRow, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.closeButtonSlot}>
            <RoundIconButton accessibilityLabel="Close" kind="close" onPress={onClose} />
            <View pointerEvents="none" style={styles.closeEyebrow}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
            </View>
          </View>
        </View>
        <FieldsScroll>
          <Text style={styles.title}>{title}</Text>
          {fields}
        </FieldsScroll>
        <View style={[styles.footer, { paddingBottom: footerBottom }]}>
          {error ? <FormError message={error} /> : null}
          {submit}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function FieldsScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      {...keyboardScrollProps(Platform.OS)}
      contentContainerStyle={styles.fields}
      showsVerticalScrollIndicator={false}
      style={styles.fieldsScroll}
    >
      {children}
    </ScrollView>
  );
}

export function GoalFormFields({
  draft,
  onChange,
}: {
  draft: GoalFormDraft;
  onChange: (next: GoalFormDraft) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const set = (patch: Partial<GoalFormDraft>) => onChange({ ...draft, ...patch });
  const deadlineLabel = draft.kind === "volume" && draft.schedule === "one_time" ? "End date" : "Deadline";
  const needsDate = draft.kind !== "volume" || draft.schedule === "one_time";

  return (
    <>
      <FormCard>
        <CardHeading>Type</CardHeading>
        <View style={styles.tiles}>
          {goalKindTiles.map((tile) => (
            <ChoiceTile
              key={tile.value}
              label={tile.label}
              onPress={() => set({
                kind: tile.value,
                displayUnit: tile.value === "lift" ? "lb" : tile.value === "volume" ? "mi" : draft.displayUnit,
                schedule: tile.value === "volume" ? draft.schedule : "one_time",
              })}
              selected={draft.kind === tile.value}
            />
          ))}
        </View>
      </FormCard>

      {draft.kind === "volume" ? (
        <>
          <FormCard>
            <CardHeading>Metric</CardHeading>
            <View style={styles.tiles}>
              {volumeMetricTiles.map((tile) => (
                <ChoiceTile
                  key={tile.value}
                  label={tile.label}
                  onPress={() => set({
                    volumeMetric: tile.value,
                    displayUnit: tile.value === "distance" ? "mi" : tile.value === "minutes" ? "min" : "count",
                    sportFilter: compatibleSportFilter(tile.value, draft.sportFilter),
                  })}
                  selected={draft.volumeMetric === tile.value}
                />
              ))}
            </View>
          </FormCard>
          <FormCard>
            <CardHeading>Sport</CardHeading>
            <View style={styles.tiles}>
              {volumeSportsFor(draft.volumeMetric).map((tile) => (
                <ChoiceTile
                  key={tile.label}
                  label={tile.label}
                  onPress={() => set({ sportFilter: tile.value })}
                  selected={draft.sportFilter === tile.value}
                />
              ))}
            </View>
          </FormCard>
          <FormCard>
            <NumberField
              kind="decimal"
              label="Target"
              onChangeText={(targetText) => set({ targetText })}
              placeholder={draft.volumeMetric === "distance" ? "20" : "5"}
              suffix={draft.volumeMetric === "distance" ? undefined : draft.volumeMetric === "minutes" ? "min" : undefined}
              value={draft.targetText}
            />
            {draft.volumeMetric === "distance" ? (
              <View style={styles.unitRow}>
                {(["mi", "km"] as const).map((unit) => (
                  <ChoiceTile
                    key={unit}
                    label={unit}
                    onPress={() => set({ displayUnit: unit })}
                    selected={draft.displayUnit === unit}
                    style={styles.unitTile}
                  />
                ))}
              </View>
            ) : null}
          </FormCard>
          <FormCard>
            <CardHeading>Repeats</CardHeading>
            <View style={styles.tiles}>
              {scheduleTiles.map((tile) => (
                <ChoiceTile
                  key={tile.value}
                  label={tile.label}
                  onPress={() => set({ schedule: tile.value })}
                  selected={draft.schedule === tile.value}
                />
              ))}
            </View>
            {draft.schedule === "weekly" ? (
              <Text style={styles.helper}>{goalCopy.weeklyHelper}</Text>
            ) : null}
          </FormCard>
        </>
      ) : null}

      {draft.kind === "time" ? (
        <>
          <FormCard>
            <CardHeading>Sport</CardHeading>
            <View style={styles.tiles}>
              {timeSportTiles.map((tile) => (
                <ChoiceTile
                  key={tile.value}
                  label={tile.label}
                  onPress={() => set({ timeSport: tile.value })}
                  selected={draft.timeSport === tile.value}
                />
              ))}
            </View>
          </FormCard>
          <FormCard>
            <CardHeading>Distance</CardHeading>
            <View style={styles.tiles}>
              {laneTiles.map((tile) => (
                <ChoiceTile
                  key={tile.value}
                  label={tile.label}
                  onPress={() => set({ lane: tile.value })}
                  selected={draft.lane === tile.value}
                />
              ))}
            </View>
          </FormCard>
          <FormCard>
            <View style={styles.timeRow}>
              <NumberField
                containerStyle={styles.timeField}
                kind="number"
                label="Minutes"
                onChangeText={(targetMinutes) => set({ targetMinutes })}
                placeholder="20"
                value={draft.targetMinutes}
              />
              <NumberField
                containerStyle={styles.timeField}
                kind="number"
                label="Seconds"
                onChangeText={(targetSeconds) => set({ targetSeconds })}
                placeholder="00"
                value={draft.targetSeconds}
              />
            </View>
            <Text style={styles.helper}>
              {goalCopy.timeRule(draft.timeSport === "cycling" ? "ride" : draft.timeSport, `${draft.targetMinutes || "0"}:${(draft.targetSeconds || "00").padStart(2, "0")}`)}
            </Text>
            <Text style={styles.helper}>{goalCopy.handMarkHelper}</Text>
          </FormCard>
        </>
      ) : null}

      {draft.kind === "lift" ? (
        <>
          <FormCard>
            <FieldLabel label="Movement" />
            <Button
              onPress={() => setPickerOpen(true)}
              variant="secondary"
            >
              {draft.movementName.trim() || "Choose a movement"}
            </Button>
            <View style={styles.liftTarget}>
              <NumberField
                kind="decimal"
                label="Target"
                onChangeText={(targetText) => set({ targetText })}
                placeholder="225"
                value={draft.targetText}
              />
              <View style={styles.unitRow}>
                {(["lb", "kg"] as const).map((unit) => (
                  <ChoiceTile
                    key={unit}
                    label={unit}
                    onPress={() => set({ displayUnit: unit })}
                    selected={draft.displayUnit === unit}
                    style={styles.unitTile}
                  />
                ))}
              </View>
            </View>
            <Text style={styles.helper}>
              {goalCopy.liftRule(`${draft.targetText || "0"} ${draft.displayUnit}`)}
            </Text>
            <Text style={styles.helper}>{goalCopy.handMarkHelper}</Text>
          </FormCard>
          <MovementPicker
            initialSelection={draft.movementName ? [{
              category: null,
              custom: !draft.movementId,
              defaultMeasure: "reps",
              equipment: null,
              key: draft.movementId ?? `name:${draft.movementName}`,
              lastUsedAt: null,
              movementId: draft.movementId,
              movementName: draft.movementName,
            }] : []}
            onConfirm={(selections: PickerMovement[]) => {
              const picked = selections[0];
              set({
                movementId: picked?.movementId ?? null,
                movementName: picked?.movementName ?? "",
              });
              setPickerOpen(false);
            }}
            onDismiss={() => setPickerOpen(false)}
            visible={pickerOpen}
          />
        </>
      ) : null}

      {needsDate ? (
        <FormCard flush={Platform.OS !== "web"}>
          <DateRow
            label={deadlineLabel}
            onPress={() => setDateOpen(true)}
            value={formatGoalDate(draft.deadline)}
          />
          {draft.kind !== "volume" ? (
            <Text style={styles.dateHelper}>Optional</Text>
          ) : null}
          {dateOpen && Platform.OS !== "web" ? (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                mode="date"
                onChange={(event: DateTimePickerEvent, value?: Date) => {
                  if (event.type === "dismissed") {
                    setDateOpen(false);
                    return;
                  }
                  if (value) set({ deadline: value });
                  if (Platform.OS === "android") setDateOpen(false);
                }}
                value={draft.deadline ?? new Date()}
              />
              {Platform.OS === "ios" ? (
                <Button onPress={() => setDateOpen(false)} variant="tonal">Done</Button>
              ) : null}
              {draft.kind !== "volume" && draft.deadline ? (
                <Button onPress={() => { set({ deadline: null }); setDateOpen(false); }} variant="secondary">
                  Clear deadline
                </Button>
              ) : null}
            </View>
          ) : null}
          {Platform.OS === "web" ? (
            <TextField
              autoCapitalize="none"
              label={deadlineLabel}
              onChangeText={(value) => {
                if (!value.trim()) {
                  set({ deadline: null });
                  return;
                }
                const next = new Date(`${value}T12:00:00`);
                if (!Number.isNaN(next.getTime())) set({ deadline: next });
              }}
              optional={draft.kind !== "volume"}
              placeholder="YYYY-MM-DD"
              value={draft.deadline ? draft.deadline.toISOString().slice(0, 10) : ""}
            />
          ) : null}
        </FormCard>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
  column: { alignSelf: "flex-start", flex: 1 },
  closeRow: { paddingBottom: spacing.sm },
  closeButtonSlot: { justifyContent: "center", minHeight: size.hit },
  closeEyebrow: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: size.hit,
    position: "absolute",
    right: size.hit,
    top: 0,
  },
  fieldsScroll: { flex: 1 },
  fields: { flexGrow: 1, gap: spacing.lg, paddingBottom: spacing.xxl },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  footer: { gap: spacing.md, paddingTop: spacing.md },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  helper: { color: colors.muted, marginTop: spacing.md, ...type.bodySmall },
  dateHelper: { color: colors.muted, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, ...type.bodySmall },
  unitRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  unitTile: { flex: 1 },
  timeRow: { flexDirection: "row", gap: spacing.md },
  timeField: { flex: 1 },
  liftTarget: { marginTop: spacing.lg },
  pickerWrap: { gap: spacing.sm, paddingBottom: spacing.lg, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
});

function compatibleSportFilter(
  metric: GoalFormDraft["volumeMetric"],
  sportFilter: GoalFormDraft["sportFilter"],
) {
  if (metric !== "distance") return sportFilter;
  if (sportFilter == null || sportFilter === "run" || sportFilter === "walk" || sportFilter === "cycling") {
    return sportFilter;
  }
  return "run";
}
