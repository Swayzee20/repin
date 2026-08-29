import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { radii, spacing } from "./theme";

type NaturalSize = { height: number; width: number };

export function WorkoutPhoto({
  detailMaxHeight,
  onError,
  onPress,
  uri,
  variant,
}: {
  detailMaxHeight?: number;
  onError?: () => void;
  onPress?: () => void;
  uri: string;
  variant: "detail" | "feed";
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null);
  const presentation = useMemo(() => {
    if (!naturalSize || !containerWidth) return null;
    const aspectRatio = naturalSize.width / naturalSize.height;
    if (aspectRatio > 1.1) return { kind: "landscape" as const };
    if (variant === "feed") {
      const maxHeight = containerWidth / (16 / 10);
      const height = Math.min(maxHeight, naturalSize.height);
      return {
        height,
        kind: aspectRatio >= 0.9 ? "square" as const : "portrait" as const,
        width: height * aspectRatio,
      };
    }

    const square = aspectRatio >= 0.9;
    const widthFraction = square ? 0.94 : 0.76;
    const maxHeight = square ? 460 : (detailMaxHeight ?? 420);
    const preferredWidth = Math.min(containerWidth * widthFraction, naturalSize.width);
    const height = Math.min(preferredWidth / aspectRatio, maxHeight);
    return {
      height,
      kind: square ? "square" as const : "portrait" as const,
      width: height * aspectRatio,
    };
  }, [containerWidth, detailMaxHeight, naturalSize, variant]);

  return (
    <View
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      style={[styles.container, variant === "detail" ? styles.detailContainer : styles.feedContainer]}
    >
      <Image
        accessibilityLabel="Workout photo"
        onError={onError}
        onLoad={(event) => {
          const { height, width } = event.nativeEvent.source;
          if (height > 0 && width > 0) setNaturalSize({ height, width });
        }}
        resizeMode={presentation?.kind === "landscape" || !presentation ? "cover" : "contain"}
        source={{ uri }}
        style={presentation?.kind === "portrait" || presentation?.kind === "square"
          ? [styles.image, { height: presentation.height, width: presentation.width }]
          : [styles.image, styles.landscapeImage]}
      />
      {onPress ? (
        <Pressable
          accessibilityLabel="View photo full screen"
          accessibilityRole="button"
          onPress={onPress}
          style={styles.pressTarget}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", width: "100%" },
  feedContainer: { marginTop: spacing.md },
  detailContainer: { marginTop: spacing.lg },
  image: { borderRadius: radii.md },
  landscapeImage: { aspectRatio: 16 / 10, width: "100%" },
  pressTarget: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
});
