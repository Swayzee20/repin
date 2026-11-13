import { Linking, StyleSheet, Text } from "react-native";

import { extractPublicationUrls } from "@repin/validation";

import { colors, fonts, type } from "./theme";

export function GeneralPostBody({
  body,
  numberOfLines,
}: {
  body: string | null;
  numberOfLines?: number;
}) {
  if (!body?.trim()) return null;
  const urls = extractPublicationUrls(body);
  if (!urls.length) {
    return (
      <Text numberOfLines={numberOfLines} style={styles.body}>{body}</Text>
    );
  }

  const parts: Array<{ key: string; text: string; url?: string }> = [];
  let remaining = body;
  let index = 0;
  for (const url of urls) {
    const at = remaining.indexOf(url);
    if (at < 0) continue;
    if (at > 0) {
      parts.push({ key: `t-${index}`, text: remaining.slice(0, at) });
      index += 1;
    }
    parts.push({ key: `u-${index}`, text: url, url });
    remaining = remaining.slice(at + url.length);
    index += 1;
  }
  if (remaining) parts.push({ key: `t-${index}`, text: remaining });

  return (
    <Text numberOfLines={numberOfLines} style={styles.body}>
      {parts.map((part) => (
        part.url ? (
          <Text
            accessibilityRole="link"
            key={part.key}
            onPress={() => {
              const href = part.url!.startsWith("http") ? part.url! : `https://${part.url}`;
              void Linking.openURL(href);
            }}
            style={styles.link}
          >
            {part.text}
          </Text>
        ) : (
          <Text key={part.key}>{part.text}</Text>
        )
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.ink, ...type.body },
  link: {
    color: colors.brand,
    fontFamily: fonts.semibold,
    textDecorationLine: "underline",
  },
});
