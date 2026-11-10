import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { getGoal, updateGoal, deviceTimeZone } from "../../../lib/goals-api";
import { isLayoutPreview } from "../../../lib/layout-preview";
import { Button, LoadingState } from "../../../ui/components";
import { GoalFormFields, GoalFormScaffold } from "../../../ui/goal-form";
import { emptyGoalForm, hydrateGoalForm, validateGoalForm, goalFormPayload, type GoalFormDraft } from "../../../ui/goal-form-state";
import { colors } from "../../../ui/theme";

export default function EditGoalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const goalId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [draft, setDraft] = useState<GoalFormDraft>(() => emptyGoalForm());
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const deviceZone = deviceTimeZone();
  const [timeZone, setTimeZone] = useState(deviceZone);

  useEffect(() => {
    if (!goalId) {
      setError("Goal could not be loaded.");
      setReady(true);
      return;
    }
    if (__DEV__ && isLayoutPreview()) {
      setReady(true);
      return;
    }
    let active = true;
    void getGoal(goalId).then((goal) => {
      if (!active) return;
      setDraft(hydrateGoalForm(goal));
      setTimeZone(goal.timeZone);
      setReady(true);
    }).catch((loadError) => {
      if (!active) return;
      setError(loadError instanceof Error ? loadError.message : "Goal could not be loaded.");
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [goalId]);

  const save = async () => {
    if (!goalId) return;
    const invalid = validateGoalForm(draft, timeZone ?? "");
    if (invalid) {
      setError(invalid);
      return;
    }
    if (__DEV__ && isLayoutPreview()) {
      router.back();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateGoal(goalId, goalFormPayload(draft, timeZone));
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Goal could not be saved.");
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <View style={styles.screen}>
        <LoadingState message="Loading goal…" />
      </View>
    );
  }

  return (
    <GoalFormScaffold
      error={error}
      eyebrow="EDIT GOAL"
      fields={<GoalFormFields draft={draft} onChange={setDraft} />}
      onClose={() => router.back()}
      submit={(
        <Button loading={saving} loadingLabel="Saving" onPress={() => void save()}>
          Save changes
        </Button>
      )}
      title="Edit goal"
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1, justifyContent: "center" },
});
