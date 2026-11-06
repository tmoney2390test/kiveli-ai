import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { ArrowUpRight, Home } from "lucide-react-native";
import { router } from "expo-router";
import type { CharacterHome } from "../types";
import { colors } from "../theme";
import { useEffect, useState } from "react";

export function CharacterHomeCard(
  { home, characterInstanceId, area }: {
    home?: CharacterHome;
    characterInstanceId: string;
    area?: string;
  },
) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [home?.thumbnail_url]);
  if (!home?.visits_enabled) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Visit ${home.name}`}
      onPress={() =>
        router.push(
          `/character-home?character=${
            encodeURIComponent(characterInstanceId)
          }` as never,
        )}
      style={styles.card}
    >
      {home.thumbnail_url && !failed
        ? (
          <Image
            source={{ uri: home.thumbnail_url }}
            onError={() => setFailed(true)}
            style={styles.image}
            contentFit="cover"
            accessibilityLabel={home.name}
          />
        )
        : (
          <View
            style={[styles.image, styles.placeholder]}
            accessibilityLabel="Home image unavailable"
          >
            <Home size={32} color={colors.rose} />
          </View>
        )}
      <View style={styles.copy}>
        <View style={styles.row}>
          <Text style={styles.label}>HOME</Text>
          <ArrowUpRight size={18} color={colors.rose} />
        </View>
        <Text style={styles.title}>{home.name}</Text>
        {area ? <Text style={styles.description}>{area}</Text> : null}
        <Text style={styles.description} numberOfLines={3}>
          {home.description}
        </Text>
        <Text style={styles.link}>Visit home</Text>
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "rgba(205,147,219,.22)",
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(126,73,142,.08)",
    marginVertical: 18,
  },
  image: { width: "100%", height: 190 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  copy: { padding: 18, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  label: {
    color: colors.rose,
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: "700",
  },
  title: { color: colors.text, fontSize: 23, fontWeight: "600" },
  description: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  link: { color: colors.rose, fontWeight: "600", marginTop: 6 },
});
