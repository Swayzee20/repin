import { ScrollView, StyleSheet, Text, View } from "react-native";

import { profileDashboardCopy, totalsHelpParagraphs, type TotalsCoverageInput } from "@repin/validation";

import { BottomSheet } from "./sheet";
import { colors, spacing, type } from "./theme";

export function TotalsHelpSheet({
  onDismiss,
  timeZoneLabel,
  visible,
  week,
  weekTimeLabel,
}: {
  onDismiss: () => void;
  timeZoneLabel: string;
  visible: boolean;
  week: TotalsCoverageInput;
  weekTimeLabel: string | null;
}) {
  const paragraphs = totalsHelpParagraphs({ timeZoneLabel, week, weekTimeLabel });
  return (
    <BottomSheet
      closeLabel="Close what's included"
      onDismiss={onDismiss}
      title={profileDashboardCopy.whatsIncluded}
      visible={visible}
    >
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {paragraphs.map((paragraph) => (
          <Text key={paragraph} style={styles.copy}>{paragraph}</Text>
        ))}
        <View style={styles.spacer} />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxl },
  copy: { color: colors.inkSoft, ...type.body },
  spacer: { height: spacing.lg },
});
