import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import type { GeneralPostPhoto } from "@repin/types";

import { PhotoViewer } from "./photo-viewer";
import { radii, spacing } from "./theme";

export function GeneralPostPhotoGrid({
  photos,
}: {
  photos: GeneralPostPhoto[];
}) {
  const visible = photos.filter((photo) => photo.url).slice(0, 6);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (!visible.length) return null;
  const count = visible.length;

  const tile = (index: number, style?: object) => {
    const photo = visible[index];
    if (!photo?.url) return null;
    return (
      <Pressable
        accessibilityLabel={`Photo ${index + 1} of ${count}`}
        accessibilityRole="imagebutton"
        key={photo.id}
        onPress={() => setViewerIndex(index)}
        style={[styles.tile, style]}
      >
        <Image source={{ uri: photo.url }} style={styles.image} />
      </Pressable>
    );
  };

  return (
    <>
      <View style={styles.grid}>
        {count === 1 ? tile(0, styles.single) : null}
        {count === 2 ? <View style={styles.row}>{tile(0)}{tile(1)}</View> : null}
        {count === 3 ? (
          <View style={styles.row}>
            {tile(0, styles.hero)}
            <View style={styles.stack}>{tile(1)}{tile(2)}</View>
          </View>
        ) : null}
        {count === 4 ? (
          <>
            <View style={styles.row}>{tile(0)}{tile(1)}</View>
            <View style={styles.row}>{tile(2)}{tile(3)}</View>
          </>
        ) : null}
        {count === 5 ? (
          <>
            <View style={styles.row}>{tile(0)}{tile(1)}</View>
            <View style={styles.row}>{tile(2)}{tile(3)}{tile(4)}</View>
          </>
        ) : null}
        {count === 6 ? (
          <>
            <View style={styles.row}>{tile(0)}{tile(1)}{tile(2)}</View>
            <View style={styles.row}>{tile(3)}{tile(4)}{tile(5)}</View>
          </>
        ) : null}
      </View>
      <PhotoViewer
        images={visible.map((photo, index) => ({
          accessibilityLabel: `Photo ${index + 1} of ${count}`,
          uri: photo.url ?? "",
        }))}
        initialIndex={viewerIndex ?? 0}
        onRequestClose={() => setViewerIndex(null)}
        showPaging
        visible={viewerIndex != null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.xs, marginTop: spacing.md },
  row: { flexDirection: "row", gap: spacing.xs },
  stack: { flex: 1, gap: spacing.xs },
  tile: { aspectRatio: 1, borderRadius: radii.md, flex: 1, overflow: "hidden" },
  hero: { flex: 1.2 },
  single: { aspectRatio: 16 / 10, flex: undefined, width: "100%" },
  image: { height: "100%", width: "100%" },
});
