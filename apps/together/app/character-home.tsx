import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Home, MapPin, MessageCircle } from "lucide-react-native";
import { EmptyState, GradientButton, Screen } from "../src/components/ui";
import { ImageLightbox } from "../src/components/ImageLightbox";
import {
  loadCharacterHome,
  prepareCharacterHomePlan,
} from "../src/lib/api/places";
import { chatHrefFromInboxParams } from "../src/lib/messageInbox";
import { useTogether } from "../src/store/useTogether";
import { useAuth } from "../src/hooks/useAuth";
import { colors } from "../src/theme";

export default function CharacterHomeScreen() {
  const { character: characterId } = useLocalSearchParams<
    { character: string }
  >();
  const { snapshot, setSnapshot } = useTogether();
  const { session } = useAuth();
  const [lightbox, setLightbox] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    request.current++;
    setBusy(false);
    setError("");
    setLightbox(false);
    return () => {
      request.current++;
    };
  }, [characterId, session?.user.id, snapshot?.activeContinuity?.id]);
  const companion = snapshot?.characters.find((c) => c.id === characterId);
  const query = useQuery({
    queryKey: [
      "character-home",
      session?.user.id,
      snapshot?.activeContinuity?.id,
      characterId,
    ],
    queryFn: () => loadCharacterHome(characterId),
    enabled: Boolean(session && companion),
    staleTime: 60000,
  });
  const data = query.data, home = data?.home;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [home?.image_url]);
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)" as never);
  async function plan(activity?: string) {
    if (busy || !companion) return;
    setBusy(true);
    setError("");
    const token = ++request.current;
    try {
      const result = await prepareCharacterHomePlan(companion.id);
      const current = useTogether.getState().snapshot;
      if (token !== request.current) return;
      if (current) {
        setSnapshot({
          ...current,
          locations: [
            ...current.locations.filter((p) => p.id !== result.place.id),
            result.place,
          ],
        });
      }
      const href = chatHrefFromInboxParams({
        character: companion.together_character_templates.public_handle ??
          companion.together_character_templates.slug ?? companion.id,
        plan: "1",
        location: result.place.slug,
        activity: activity ?? result.home.possible_activities?.[0],
      });
      if (href) router.push(href as never);
    } catch (e) {
      if (token === request.current) {
        setError(
          e instanceof Error
            ? e.message
            : "Their home could not be opened. Please try again.",
        );
      }
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  function ask(detail?: string) {
    if (!companion || !home) return;
    const draft = detail
      ? `Tell me about this at your place: ${detail}`
      : `What do you like about living at ${home.name}?`;
    const href = chatHrefFromInboxParams({
      character: companion.together_character_templates.public_handle ??
        companion.together_character_templates.slug ?? companion.id,
      draft,
    });
    if (href) router.push(href as never);
  }
  return (
    <Screen>
      <View style={styles.content}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={goBack}
          style={styles.back}
        >
          <ArrowLeft color={colors.text} size={23} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        {!home
          ? (
            <EmptyState
              title={query.isPending
                ? "Opening their home…"
                : "Their home is unavailable"}
              body={query.isError
                ? "We couldn’t load their home. Try again."
                : !companion
                ? "Choose a companion you have met."
                : "Getting the details ready."}
              action={query.isError ? "Try again" : undefined}
              onAction={() => void query.refetch()}
            />
          )
          : (
            <>
              <Text style={styles.eyebrow}>
                AT HOME WITH {data.characterName.toUpperCase()}
              </Text>
              <Text style={styles.title}>{home.name}</Text>
              <View style={styles.row}>
                <MapPin size={15} color={colors.rose} />
                <Text style={styles.muted}>
                  {[
                    data.districtName,
                    snapshot?.worlds.find((w) => w.id === home.world_id)?.name,
                  ].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {home.image_url && !imageFailed
                ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="View home image full screen"
                    onPress={() => setLightbox(true)}
                  >
                    <Image
                      source={{ uri: home.image_url }}
                      onError={() => setImageFailed(true)}
                      accessibilityLabel={home.name}
                      style={styles.hero}
                      contentFit="cover"
                      transition={180}
                    />
                  </Pressable>
                )
                : (
                  <View style={[styles.hero, styles.placeholder]}>
                    <Home color={colors.rose} size={42} />
                    <Text style={styles.muted}>
                      Make yourself familiar with the place
                    </Text>
                  </View>
                )}
              <View style={styles.presence}>
                <View
                  style={[styles.dot, {
                    backgroundColor: data.availability.available
                      ? "#77D4B9"
                      : "#B6A5C2",
                  }]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.presenceTitle}>
                    {data.availability.atHome
                      ? data.availability.state === "sleeping"
                        ? "Resting at home"
                        : "At home"
                      : "Out right now"}
                  </Text>
                  {data.availability.activity
                    ? (
                      <Text style={styles.muted}>
                        {data.availability.activity}
                      </Text>
                    )
                    : null}
                </View>
              </View>
              <Text style={styles.description}>{home.description}</Text>
              <GradientButton
                label={busy ? "Opening planner…" : "Spend time together"}
                disabled={busy}
                onPress={() => void plan()}
              />
              <Pressable
                accessibilityRole="button"
                style={styles.ask}
                onPress={() => ask()}
              >
                <MessageCircle size={19} color={colors.rose} />
                <Text style={styles.link}>Ask about their home</Text>
              </Pressable>
              {error
                ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                )
                : null}
              <Text style={styles.sectionTitle}>
                A few things you’ll notice
              </Text>
              {(home.personal_details ?? []).map((detail) => (
                <Pressable
                  key={detail.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask about ${detail.description}`}
                  onPress={() => ask(detail.description)}
                  style={styles.detail}
                >
                  <Text style={styles.detailText}>{detail.description}</Text>
                  <Text style={styles.smallLink}>Ask about this →</Text>
                </Pressable>
              ))}
              <Text style={styles.sectionTitle}>Something to do together</Text>
              <View style={styles.activities}>
                {(home.possible_activities ?? []).map((activity) => (
                  <Pressable
                    key={activity}
                    disabled={busy}
                    accessibilityRole="button"
                    onPress={() => void plan(activity)}
                    style={styles.activity}
                  >
                    <Text style={styles.link}>{activity}</Text>
                  </Pressable>
                ))}
              </View>
              {home.image_url
                ? (
                  <ImageLightbox
                    visible={lightbox}
                    source={{ uri: home.image_url }}
                    accessibilityLabel={home.name}
                    onClose={() => setLightbox(false)}
                  />
                )
                : null}
            </>
          )}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
    padding: 20,
    gap: 18,
    paddingBottom: 80,
  },
  back: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  backText: { color: colors.text, fontSize: 16 },
  eyebrow: {
    color: colors.rose,
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
  },
  title: { fontSize: 36, color: colors.text, fontWeight: "600" },
  row: { flexDirection: "row", gap: 7, alignItems: "center" },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  hero: {
    width: "100%",
    aspectRatio: 1.5,
    borderRadius: 24,
    backgroundColor: "#1b1424",
  },
  placeholder: {
    aspectRatio: undefined,
    height: 150,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  presence: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(125,95,145,.12)",
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  presenceTitle: { color: colors.text, fontWeight: "600", fontSize: 16 },
  description: { color: colors.text, fontSize: 17, lineHeight: 28 },
  ask: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
  },
  link: { color: colors.rose, fontSize: 15, fontWeight: "600" },
  error: { color: "#F38C9B", lineHeight: 22 },
  sectionTitle: { color: colors.text, fontSize: 23, marginTop: 18 },
  detail: {
    borderWidth: 1,
    borderColor: "rgba(205,147,219,.18)",
    padding: 18,
    borderRadius: 18,
    gap: 12,
  },
  detailText: { color: colors.text, fontSize: 16, lineHeight: 25 },
  smallLink: { color: colors.rose, fontSize: 13 },
  activities: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  activity: {
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 18,
    backgroundColor: "rgba(151,88,173,.13)",
    minHeight: 48,
  },
});
