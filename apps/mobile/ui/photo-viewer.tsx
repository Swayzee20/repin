import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radii, spacing } from "./theme";

type NaturalSize = { height: number; width: number };

export type PhotoViewerImage = {
  accessibilityLabel?: string;
  uri: string;
};

export function PhotoViewer({
  images,
  initialIndex = 0,
  onRequestClose,
  visible,
}: {
  images: PhotoViewerImage[];
  initialIndex?: number;
  onRequestClose: () => void;
  visible: boolean;
}) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const imageScale = useRef(new Animated.Value(0.97)).current;
  const closing = useRef(false);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null);
  const useNativeDriver = Platform.OS !== "web";
  const activeImage = images[activeIndex];
  const stageInsets = {
    bottom: Math.max(insets.bottom, spacing.lg),
    left: spacing.lg,
    right: spacing.lg,
    top: Math.max(insets.top, spacing.lg),
  };
  const mediaSize = useMemo(() => {
    if (!naturalSize) return null;
    const availableWidth = Math.max(0, viewportWidth - stageInsets.left - stageInsets.right);
    const availableHeight = Math.max(0, viewportHeight - stageInsets.top - stageInsets.bottom);
    const scale = Math.min(availableWidth / naturalSize.width, availableHeight / naturalSize.height);
    return {
      height: naturalSize.height * scale,
      width: naturalSize.width * scale,
    };
  }, [naturalSize, stageInsets.bottom, stageInsets.left, stageInsets.right, stageInsets.top, viewportHeight, viewportWidth]);

  useEffect(() => {
    if (!visible) return;
    Keyboard.dismiss();
    closing.current = false;
    setNaturalSize(null);
    setActiveIndex(Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0)));
    backdropOpacity.setValue(0);
    imageOpacity.setValue(0);
    imageScale.setValue(0.97);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 180,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver,
      }),
      Animated.timing(imageOpacity, {
        duration: 210,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver,
      }),
      Animated.timing(imageScale, {
        duration: 210,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver,
      }),
    ]).start();
  }, [backdropOpacity, imageOpacity, imageScale, images.length, initialIndex, useNativeDriver, visible]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 160,
        easing: Easing.in(Easing.quad),
        toValue: 0,
        useNativeDriver,
      }),
      Animated.timing(imageOpacity, {
        duration: 180,
        easing: Easing.in(Easing.quad),
        toValue: 0,
        useNativeDriver,
      }),
      Animated.timing(imageScale, {
        duration: 180,
        easing: Easing.in(Easing.cubic),
        toValue: 0.97,
        useNativeDriver,
      }),
    ]).start(onRequestClose);
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={close}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View
        accessibilityViewIsModal
        style={[
          styles.viewport,
          Platform.OS === "web" ? { flex: undefined, height: viewportHeight, width: viewportWidth } : null,
        ]}
      >
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            accessibilityLabel="Close photo"
            accessibilityRole="button"
            onPress={close}
            style={styles.backdropPressable}
          />
        </Animated.View>
        {activeImage ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.imageStage,
              stageInsets,
            ]}
          >
            <Animated.View
              style={[
                styles.media,
                mediaSize ?? styles.unmeasuredMedia,
                {
                  opacity: imageOpacity,
                  transform: [{ scale: imageScale }],
                },
              ]}
            >
              <Pressable accessibilityRole="imagebutton" onPress={() => undefined} style={styles.mediaPressable}>
                <Image
                  accessibilityLabel={activeImage.accessibilityLabel ?? "Workout photo"}
                  onLoad={(event) => {
                    const { height, width } = event.nativeEvent.source;
                    if (height > 0 && width > 0) setNaturalSize({ height, width });
                  }}
                  resizeMode="contain"
                  source={{ uri: activeImage.uri }}
                  style={styles.image}
                />
              </Pressable>
            </Animated.View>
          </View>
        ) : null}
        <Pressable
          accessibilityLabel="Close photo"
          accessibilityRole="button"
          hitSlop={8}
          onPress={close}
          style={({ pressed }) => [
            styles.closeButton,
            { right: spacing.lg, top: Math.max(insets.top, spacing.lg) },
            pressed && styles.pressed,
          ]}
        >
          <Feather color={colors.surface} name="x" size={22} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  backdrop: { backgroundColor: "rgba(18,18,18,0.88)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  backdropPressable: { flex: 1 },
  imageStage: { alignItems: "center", justifyContent: "center", position: "absolute" },
  media: { borderRadius: radii.sm, overflow: "hidden" },
  unmeasuredMedia: { height: "100%", width: "100%" },
  mediaPressable: { height: "100%", width: "100%" },
  image: { borderRadius: radii.sm, height: "100%", width: "100%" },
  closeButton: { alignItems: "center", backgroundColor: "rgba(34,34,34,0.72)", borderRadius: radii.pill, height: 44, justifyContent: "center", position: "absolute", width: 44, zIndex: 2 },
  pressed: { opacity: 0.68 },
});
