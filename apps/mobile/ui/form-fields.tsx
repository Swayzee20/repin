import { useState, type ComponentRef, type ReactNode, type Ref } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { pressableFocused, webFocusRing } from "./focus-ring";
import {
  choiceText,
  choiceTileChrome,
  dateRowHeight,
  dateRowLabelText,
  dateRowValueText,
  effortLabels,
  errorText,
  fieldChrome,
  fieldLabelText,
  flameGlyphSize,
  flameTileState,
  formSpacing,
  helperText,
  numberFieldKeyboard,
  optionalText,
  photoAddLabel,
  photoDismissChrome,
  photoTileChrome,
  photoUploadErrorMessage,
  photoUploadFieldError,
  pickerPlaceholder,
  resolveFieldInteraction,
  secondsRangeError,
  secondsRangeMessage,
  suffixText,
  textAreaHeight,
  textAreaMaxHeight,
  textAreaMinHeight,
  type NumberKind,
} from "./form-field-state";
import { Chevron, Icon } from "./icons";
import { colors, radii, size, spacing, type } from "./theme";

export {
  effortLabels,
  photoUploadErrorMessage,
  photoUploadFieldError,
  secondsRangeError,
  secondsRangeMessage,
};

type FieldFrameProps = {
  children: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  error?: string | null;
  hint?: string;
  label?: string;
  optional?: boolean;
};

const webInputOutline: TextStyle | null = Platform.OS === "web" ? { outlineWidth: 0 } : null;

function describedBy(label: string | undefined, optional: boolean, accessibilityLabel?: string) {
  if (accessibilityLabel) return accessibilityLabel;
  if (!label) return undefined;
  return optional ? `${label}, optional` : label;
}

export function FieldLabel({ label, optional = false }: { label: string; optional?: boolean }) {
  return (
    <View style={styles.labelRow}>
      <Text style={fieldLabelText}>{label}</Text>
      {optional ? <Text style={optionalText}>Optional</Text> : null}
    </View>
  );
}

function HiddenFieldLabel({ label, optional = false }: { label: string; optional?: boolean }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <FieldLabel label={label} optional={optional} />
    </View>
  );
}

function FieldMessage({ message }: { message: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.messageRow}>
      <Icon color={colors.danger} name="exclamationmark.circle" size={size.icon.sm} />
      <Text accessibilityRole="alert" style={[errorText, styles.messageCopy]}>{message}</Text>
    </View>
  );
}

function FieldFrame({ children, containerStyle, error, hint, label, optional = false }: FieldFrameProps) {
  const errorMessage = error?.trim() ? error : undefined;
  const hintMessage = hint?.trim() ? hint : undefined;
  return (
    <View style={containerStyle}>
      {label ? <HiddenFieldLabel label={label} optional={optional} /> : null}
      <View style={label ? styles.afterLabel : undefined}>{children}</View>
      {errorMessage ? (
        <View style={styles.afterControl}>
          <FieldMessage message={errorMessage} />
        </View>
      ) : hintMessage ? (
        <Text style={[helperText, styles.afterControl]}>{hintMessage}</Text>
      ) : null}
    </View>
  );
}

export type TextFieldProps = Omit<TextInputProps, "editable" | "style"> & {
  containerStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  editable?: boolean;
  error?: string | null;
  hint?: string;
  label?: string;
  optional?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
  style?: StyleProp<TextStyle>;
};

export function TextField({
  accessibilityLabel,
  accessibilityState,
  containerStyle,
  disabled = false,
  editable = true,
  error,
  hint,
  label,
  multiline = false,
  onBlur,
  onContentSizeChange,
  onFocus,
  optional = false,
  ref,
  style,
  ...props
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [grown, setGrown] = useState(textAreaMinHeight);
  const isDisabled = disabled || editable === false;
  const chrome = fieldChrome(resolveFieldInteraction({
    disabled: isDisabled,
    error: Boolean(error?.trim()),
    focused,
  }));
  const inputLabel = describedBy(label, optional, accessibilityLabel);

  return (
    <FieldFrame containerStyle={containerStyle} error={error} hint={hint} label={label} optional={optional}>
      <TextInput
        {...props}
        accessibilityHint={error?.trim() || hint || undefined}
        accessibilityLabel={inputLabel}
        accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
        editable={!isDisabled}
        multiline={multiline}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onContentSizeChange={(event) => {
          if (multiline) setGrown(textAreaHeight(event.nativeEvent.contentSize.height));
          onContentSizeChange?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={chrome.placeholderColor}
        ref={ref}
        scrollEnabled={!multiline || grown >= textAreaMaxHeight}
        selectionColor={colors.brand}
        style={[
          styles.input,
          multiline ? styles.inputMultiline : styles.inputSingle,
          style,
          {
            backgroundColor: chrome.backgroundColor,
            borderColor: chrome.borderColor,
            borderRadius: chrome.borderRadius,
            borderWidth: chrome.borderWidth,
            color: chrome.color,
            height: multiline ? grown : chrome.height,
            paddingHorizontal: chrome.paddingHorizontal,
            paddingVertical: multiline ? chrome.paddingHorizontal : 0,
          },
          webInputOutline,
        ]}
      />
    </FieldFrame>
  );
}

export function TextArea(props: Omit<TextFieldProps, "multiline">) {
  return <TextField {...props} multiline />;
}

export function NumberField({
  accessibilityLabel,
  containerStyle,
  disabled = false,
  error,
  hint,
  kind = "number",
  label,
  onBlur,
  onChangeText,
  onFocus,
  optional = false,
  placeholder,
  suffix,
  value,
  ...props
}: Omit<TextFieldProps, "keyboardType" | "inputMode" | "value" | "onChangeText" | "multiline"> & {
  kind?: NumberKind;
  onChangeText: (value: string) => void;
  suffix?: string;
  value: string;
}) {
  const [focused, setFocused] = useState(false);
  const isDisabled = disabled || props.editable === false;
  const chrome = fieldChrome(resolveFieldInteraction({
    disabled: isDisabled,
    error: Boolean(error?.trim()),
    focused,
  }));
  const keyboard = numberFieldKeyboard(kind);
  const inputLabel = describedBy(label, optional, accessibilityLabel) ?? suffix;

  return (
    <FieldFrame containerStyle={containerStyle} error={error} hint={hint} label={label} optional={optional}>
      <View
        style={[
          styles.numberBox,
          {
            backgroundColor: chrome.backgroundColor,
            borderColor: chrome.borderColor,
            borderRadius: chrome.borderRadius,
            borderWidth: chrome.borderWidth,
            height: chrome.height,
            paddingHorizontal: chrome.paddingHorizontal,
          },
        ]}
      >
        <TextInput
          {...props}
          accessibilityHint={error?.trim() || hint || undefined}
          accessibilityLabel={inputLabel}
          accessibilityState={{ disabled: isDisabled }}
          editable={!isDisabled}
          inputMode={keyboard.inputMode}
          keyboardType={keyboard.keyboardType}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onChangeText={onChangeText}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholder={placeholder}
          placeholderTextColor={chrome.placeholderColor}
          selectionColor={colors.brand}
          style={[styles.numberInput, { color: chrome.color }, webInputOutline]}
          value={value}
        />
        {suffix ? (
          <Text accessible={false} importantForAccessibility="no" style={suffixText}>{suffix}</Text>
        ) : null}
      </View>
    </FieldFrame>
  );
}

export function Picker({
  accessibilityHint,
  accessibilityLabel,
  containerStyle,
  disabled = false,
  error,
  hint,
  label,
  onPress,
  optional = false,
  placeholder = pickerPlaceholder,
  value,
}: {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  error?: string | null;
  hint?: string;
  label?: string;
  onPress: () => void;
  optional?: boolean;
  placeholder?: string;
  value?: string | null;
}) {
  const shown = value?.trim() ? value : null;
  const inputLabel = describedBy(label, optional, accessibilityLabel) ?? (shown ?? placeholder);
  return (
    <FieldFrame containerStyle={containerStyle} error={error} hint={hint} label={label} optional={optional}>
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={inputLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={(state) => {
          const chrome = fieldChrome(resolveFieldInteraction({
            disabled,
            error: Boolean(error?.trim()),
            focused: !disabled && (pressableFocused(state) || state.pressed),
          }));
          return [
            styles.picker,
            {
              backgroundColor: chrome.backgroundColor,
              borderColor: chrome.borderColor,
              borderRadius: chrome.borderRadius,
              borderWidth: chrome.borderWidth,
              height: chrome.height,
              paddingHorizontal: chrome.paddingHorizontal,
            },
            webFocusRing(pressableFocused(state)),
          ];
        }}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.pickerValue,
            { color: disabled ? colors.disabledText : shown ? colors.ink : colors.subtle },
          ]}
        >
          {shown ?? placeholder}
        </Text>
        <Chevron color={disabled ? colors.disabledText : colors.muted} direction="down" />
      </Pressable>
    </FieldFrame>
  );
}

export function ChoiceTile({
  disabled = false,
  label,
  onPress,
  selected,
  style,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const chrome = choiceTileChrome({ disabled, selected });
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={(state) => [
        styles.choice,
        {
          backgroundColor: !disabled && !selected && state.pressed ? colors.selection : chrome.backgroundColor,
          borderColor: chrome.borderColor,
          borderRadius: chrome.radius,
          borderWidth: chrome.borderWidth,
          height: chrome.height,
          paddingHorizontal: chrome.paddingHorizontal,
        },
        webFocusRing(pressableFocused(state)),
        style,
      ]}
    >
      <Text numberOfLines={1} style={[choiceText, styles.choiceLabel, { color: chrome.color }]}>{label}</Text>
      {chrome.showCheck ? <Icon color={colors.brand} name="checkmark" size={size.icon.sm} /> : null}
    </Pressable>
  );
}

export function FlameRating({
  labels = effortLabels,
  onChange,
  value,
}: {
  labels?: readonly string[];
  onChange: (value: number | null) => void;
  value: number | null;
}) {
  const word = value == null ? undefined : labels[value - 1];
  return (
    <View accessibilityLabel="Effort" accessibilityRole="radiogroup">
      <View style={styles.flames}>
        {labels.map((levelLabel, index) => {
          const level = index + 1;
          const tile = flameTileState(level, value);
          return (
            <Pressable
              accessibilityLabel={`${level}: ${levelLabel}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: tile.selected }}
              key={levelLabel}
              onPress={() => onChange(tile.selected ? null : level)}
              style={(state) => [
                styles.flame,
                {
                  backgroundColor: state.pressed ? colors.selection : colors.surface,
                  borderColor: tile.borderColor,
                  borderWidth: tile.borderWidth,
                  height: tile.size,
                  width: tile.size,
                },
                webFocusRing(pressableFocused(state)),
              ]}
            >
              <View style={{ opacity: tile.opacity }}>
                <Icon color={tile.color} name="flame" size={flameGlyphSize} />
              </View>
            </Pressable>
          );
        })}
      </View>
      {word ? (
        <Text accessibilityLiveRegion="polite" style={styles.flameWord}>{word}</Text>
      ) : null}
    </View>
  );
}

export function DateRow({
  label,
  onPress,
  value,
}: {
  label: string;
  onPress: () => void;
  value: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => [
        styles.dateRow,
        state.pressed && styles.dateRowPressed,
        webFocusRing(pressableFocused(state)),
      ]}
    >
      <Text style={[dateRowLabelText, styles.dateLabel]}>{label}</Text>
      <View style={styles.dateTrailing}>
        <Text style={dateRowValueText}>{value}</Text>
        <Chevron />
      </View>
    </Pressable>
  );
}

export function PhotoTile({
  busy = false,
  error,
  label,
  onAdd,
  onRemove,
  onRetry,
  optional = false,
  uri,
}: {
  busy?: boolean;
  error?: string | null;
  label?: string;
  onAdd: () => void;
  onRemove: () => void;
  onRetry?: () => void;
  optional?: boolean;
  uri?: string | null;
}) {
  const errorMessage = error?.trim() ? error : undefined;
  return (
    <View>
      {label ? <HiddenFieldLabel label={label} optional={optional} /> : null}
      <View style={label ? styles.afterLabel : undefined}>
        {uri ? (
          <View style={styles.filledPhoto}>
            <Pressable
              accessibilityLabel="Change photo"
              accessibilityRole="button"
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              onPress={onAdd}
              style={(state) => [styles.photoPress, webFocusRing(pressableFocused(state))]}
            >
              <Image accessibilityLabel="Selected workout photo" resizeMode="cover" source={{ uri }} style={styles.photo} />
            </Pressable>
            <Pressable
              accessibilityLabel="Remove photo"
              accessibilityRole="button"
              disabled={busy}
              hitSlop={photoDismissChrome.hitSlop}
              onPress={onRemove}
              style={(state) => [
                styles.photoDismiss,
                {
                  backgroundColor: photoDismissChrome.backgroundColor,
                  borderColor: photoDismissChrome.borderColor,
                  borderRadius: photoDismissChrome.borderRadius,
                  borderWidth: photoDismissChrome.borderWidth,
                  height: photoDismissChrome.size,
                  width: photoDismissChrome.size,
                },
                webFocusRing(pressableFocused(state)),
              ]}
            >
              <Icon color={photoDismissChrome.iconColor} name="xmark" size={size.icon.sm} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityLabel={photoAddLabel}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={onAdd}
            style={(state) => [
              styles.photoEmpty,
              {
                borderColor: photoTileChrome.borderColor,
                borderRadius: photoTileChrome.borderRadius,
                borderWidth: photoTileChrome.borderWidth,
                height: photoTileChrome.height,
              },
              state.pressed && styles.photoPressed,
              webFocusRing(pressableFocused(state)),
            ]}
          >
            <Icon color={colors.inkSoft} name="camera" size={size.icon.md} />
            <Text style={styles.photoLabel}>{photoAddLabel}</Text>
          </Pressable>
        )}
      </View>
      {errorMessage ? (
        <View style={styles.afterControl}>
          {onRetry ? (
            <Pressable accessibilityLabel={errorMessage} accessibilityRole="button" onPress={onRetry} style={styles.retry}>
              <FieldMessage message={errorMessage} />
            </Pressable>
          ) : (
            <FieldMessage message={errorMessage} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.sm,
  },
  afterLabel: {
    marginTop: formSpacing.labelGap,
  },
  afterControl: {
    marginTop: formSpacing.helperGap,
  },
  messageRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  messageCopy: {
    flexShrink: 1,
  },
  input: {
    ...type.body,
    alignSelf: "stretch",
  },
  inputSingle: {
    textAlignVertical: "center",
  },
  inputMultiline: {
    maxHeight: textAreaMaxHeight,
    minHeight: textAreaMinHeight,
    textAlignVertical: "top",
  },
  numberBox: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: spacing.sm,
  },
  numberInput: {
    ...type.body,
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
  },
  picker: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: spacing.sm,
  },
  pickerValue: {
    ...type.body,
    flex: 1,
  },
  choice: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: spacing.sm,
  },
  choiceLabel: {
    flex: 1,
    textAlign: "left",
  },
  flames: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  flame: {
    alignItems: "center",
    borderRadius: radii.md,
    justifyContent: "center",
  },
  flameWord: {
    ...type.bodySmall,
    color: colors.inkSoft,
    marginTop: formSpacing.labelGap,
  },
  dateRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    minHeight: dateRowHeight,
    paddingHorizontal: spacing.lg,
  },
  dateRowPressed: {
    backgroundColor: colors.selection,
  },
  dateLabel: {
    flex: 1,
  },
  dateTrailing: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.sm,
  },
  photoEmpty: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderStyle: photoTileChrome.borderStyle,
    gap: spacing.sm,
    justifyContent: "center",
  },
  photoPressed: {
    backgroundColor: colors.selection,
  },
  photoLabel: {
    ...type.body,
    color: colors.inkSoft,
  },
  filledPhoto: {
    alignSelf: "stretch",
    borderRadius: radii.lg,
    height: photoTileChrome.height,
    overflow: "hidden",
  },
  photoPress: {
    flex: 1,
  },
  photo: {
    height: "100%",
    width: "100%",
  },
  photoDismiss: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    right: spacing.sm,
    top: spacing.sm,
  },
  retry: {
    justifyContent: "center",
    minHeight: size.hit,
  },
});
