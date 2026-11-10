import { useRouter } from "expo-router";
import { useState } from "react";

import { createGoal, deviceTimeZone } from "../../lib/goals-api";
import { isLayoutPreview } from "../../lib/layout-preview";
import { Button } from "../../ui/components";
import { GoalFormFields, GoalFormScaffold } from "../../ui/goal-form";
import { emptyGoalForm, validateGoalForm, goalFormPayload, type GoalFormDraft } from "../../ui/goal-form-state";

export default function NewGoalScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<GoalFormDraft>(() => emptyGoalForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timeZone = deviceTimeZone();

  const save = async () => {
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
      await createGoal(goalFormPayload(draft, timeZone));
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Goal could not be saved.");
      setSaving(false);
    }
  };

  return (
    <GoalFormScaffold
      error={error}
      eyebrow="NEW GOAL"
      fields={<GoalFormFields draft={draft} onChange={setDraft} />}
      onClose={() => router.back()}
      submit={(
        <Button loading={saving} loadingLabel="Saving" onPress={() => void save()}>
          Save goal
        </Button>
      )}
      title="New goal"
    />
  );
}
