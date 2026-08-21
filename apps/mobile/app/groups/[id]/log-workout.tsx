import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../../lib/supabase";
import { BackButton, Button, TextField } from "../../../ui/components";
import { colors, fonts, radii, spacing, type } from "../../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

function getLocalDateParts() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

export default function LogWorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const initialDate = getLocalDateParts();
  const [workoutType, setWorkoutType] = useState("");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [completedDate, setCompletedDate] = useState(initialDate.date);
  const [completedTime, setCompletedTime] = useState(initialDate.time);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitWorkout = useCallback(async () => {
    setError(null);

    const durationMinutes = Number(duration);
    const completedAt = new Date(`${completedDate}T${completedTime}:00`);

    if (!workoutType.trim() || !title.trim()) {
      setError("Workout type and title are required.");
      return;
    }

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      setError("Duration must be a whole number of minutes.");
      return;
    }

    if (Number.isNaN(completedAt.getTime())) {
      setError("Use YYYY-MM-DD for the date and HH:MM for the time.");
      return;
    }

    if (!supabase || !groupId) {
      setError("This workout cannot be submitted from the current screen.");
      return;
    }

    setSubmitting(true);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !data.session) {
        throw new Error("Sign in to log a workout.");
      }

      const response = await fetch(
        `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workoutType,
            title,
            durationMinutes,
            notes,
            completedAt: completedAt.toISOString(),
          }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "Workout could not be created.");
      }

      router.back();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Workout could not be created.",
      );
      setSubmitting(false);
    }
  }, [completedDate, completedTime, duration, groupId, notes, router, title, workoutType]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.container}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          style={styles.scrollView}
        >
          <BackButton label="Cancel" onPress={() => router.back()} />
          <Text style={styles.eyebrow}>QUICK CHECK-IN</Text>
          <Text style={styles.title}>Log a workout</Text>
          <Text style={styles.intro}>Add the essentials now. You can keep the notes short.</Text>

          <View style={styles.formCard}>
            <View style={styles.fieldGroup}>
              <TextField label="Workout type" maxLength={50} onChangeText={setWorkoutType} placeholder="Strength, run, yoga…" value={workoutType} />
              <View style={styles.quickRow}>
                {["Strength", "Run", "Yoga"].map((value) => <QuickChoice key={value} label={value} onPress={() => setWorkoutType(value)} selected={workoutType === value} />)}
              </View>
            </View>
            <TextField label="Title" maxLength={120} onChangeText={setTitle} placeholder="Morning strength session" value={title} />
            <View style={styles.fieldGroup}>
              <TextField inputMode="numeric" label="Duration in minutes" maxLength={4} onChangeText={setDuration} placeholder="45" value={duration} />
              <View style={styles.quickRow}>
                {["20", "30", "45", "60"].map((value) => <QuickChoice key={value} label={`${value} min`} onPress={() => setDuration(value)} selected={duration === value} />)}
              </View>
            </View>
            <TextField label="Notes" maxLength={2_000} multiline onChangeText={setNotes} placeholder="Optional — how did it go?" value={notes} />
          </View>

          <Text style={styles.sectionLabel}>COMPLETED</Text>
          <View style={styles.dateCard}>
            <View style={styles.dateField}><TextField autoCapitalize="none" label="Date" onChangeText={setCompletedDate} placeholder="YYYY-MM-DD" value={completedDate} /></View>
            <View style={styles.dateField}><TextField autoCapitalize="none" label="Time" onChangeText={setCompletedTime} placeholder="HH:MM" value={completedTime} /></View>
          </View>
          {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
          <Button loading={submitting} onPress={() => void submitWorkout()} style={styles.submitButton}>Save Workout</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function QuickChoice({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboardAvoidingView: { flex: 1 },
  scrollView: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.xxl, paddingBottom: 120 },
  eyebrow: { color: colors.brand, ...type.eyebrow }, title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  intro: { color: colors.muted, ...type.body, marginBottom: spacing.xxl, marginTop: spacing.sm },
  formCard: { gap: spacing.xl }, fieldGroup: { gap: spacing.sm }, quickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, minHeight: 38, justifyContent: "center", paddingHorizontal: spacing.md },
  choiceSelected: { backgroundColor: colors.brand, borderColor: colors.brand }, choiceText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 12 }, choiceTextSelected: { color: colors.surface },
  sectionLabel: { color: colors.subtle, ...type.eyebrow, marginBottom: spacing.sm, marginTop: spacing.xxl }, dateCard: { flexDirection: "row", gap: spacing.md }, dateField: { flex: 1 },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, marginTop: spacing.lg, padding: spacing.md }, errorText: { color: colors.danger, ...type.bodySmall },
  submitButton: { marginTop: spacing.xl },
});
