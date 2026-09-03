import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  type GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Image, type ImageSource } from "expo-image";
import {
  Camera,
  Play,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react-native";
import { router } from "expo-router";
import type { GeneratedMedia, MediaOffer } from "../types";
import { colors, radius } from "../theme";
import { rateGeneratedMedia } from "../lib/api";
import { mediaViewerHref, navigateLocalRouteOnWeb } from "../lib/conversationNavigation";
import { generatedMediaImageSource } from "../lib/mediaImageSource";
import { KivelleCreditIcon } from "./KivelleCreditIcon";

const PHOTO_GENERATION_LOADER = require(
  "../../assets/loaders/sparkles-loop-loader.svg",
);

function openGeneratedMedia(mediaId: string) {
  const returnTo = Platform.OS === "web" && typeof window !== "undefined"
    ? `${window.location.pathname}${window.location.search}`
    : null;
  const href = mediaViewerHref(mediaId, returnTo);
  if (Platform.OS === "web" && navigateLocalRouteOnWeb(href)) return;
  router.push(href as never);
}

export function MediaTile(
  { media, style, onRetry, contentFit = "cover" }: {
    media: GeneratedMedia;
    style?: ViewStyle;
    onRetry?: () => void;
    contentFit?: "cover" | "contain";
  },
) {
  const noun = media.media_type === "video" ? "Video" : "Photo";
  if (media.status === "queued" || media.status === "generating") {
    return <MediaProgress media={media} style={style} />;
  }
  if (media.status === "failed") {
    return (
      <View style={[styles.tile, styles.pending, style]}>
        <Camera color={colors.muted} />
        <Text style={styles.pendingTitle}>
          That {noun.toLowerCase()} didn’t come through
        </Text>
        <Text style={styles.caption}>
          {media.failure_reason_safe ?? "Ask again or retry."}
        </Text>
        {onRetry
          ? (
            <Pressable onPress={onRetry} style={styles.retry}>
              <RefreshCw size={14} color={colors.rose} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          )
          : null}
      </View>
    );
  }
  if (!media.signed_url) return null;
  return (
    <View style={[styles.tile, style]}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Open ${noun.toLowerCase()}`}
        onPress={() => openGeneratedMedia(media.id)}
        style={[
          styles.mediaPressable,
          media.media_type === "image" && styles.mediaPressableWithFeedback,
        ]}
      >
        {media.media_type === "video" && media.parent_media_id
          ? <VideoPoster />
          : (
            <Image
              source={generatedMediaImageSource(media)}
              style={StyleSheet.absoluteFill}
              contentFit={contentFit}
              transition={180}
              cachePolicy="memory-disk"
              priority="low"
              recyclingKey={media.id}
            />
          )}
        {media.media_type === "video"
          ? (
            <View style={styles.play}>
              <Play size={20} color="#fff" fill="#fff" />
            </View>
          )
          : null}
      </Pressable>
      {media.media_type === "image"
        ? <MediaFeedbackControls media={media} style={styles.feedbackBelow} />
        : null}
    </View>
  );
}

export function MediaFeedbackControls(
  { media, style }: { media: GeneratedMedia; style?: ViewStyle },
) {
  const [selected, setSelected] = useState<"positive" | "negative" | null>(
    media.user_feedback ?? null,
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => setSelected(media.user_feedback ?? null), [
    media.id,
    media.user_feedback,
  ]);
  const submit = async (
    event: GestureResponderEvent,
    feedback: "positive" | "negative",
  ) => {
    event.stopPropagation?.();
    if (busy || selected === feedback) return;
    const previous = selected;
    setSelected(feedback);
    setBusy(true);
    try {
      await rateGeneratedMedia(media.id, feedback);
    } catch (error) {
      setSelected(previous);
      Alert.alert(
        "Feedback not saved",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View accessibilityLabel="Rate this photo" style={[styles.feedback, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="This photo looks good"
        accessibilityState={{
          selected: selected === "positive",
          disabled: busy,
        }}
        disabled={busy}
        onPress={(event) =>
          void submit(event, "positive")}
        style={[
          styles.feedbackButton,
          selected === "positive" && styles.feedbackButtonSelected,
        ]}
      >
        <ThumbsUp
          size={13}
          color="#fff"
          fill={selected === "positive" ? "#fff" : "transparent"}
          strokeWidth={2}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="This photo looks wrong"
        accessibilityState={{
          selected: selected === "negative",
          disabled: busy,
        }}
        disabled={busy}
        onPress={(event) =>
          void submit(event, "negative")}
        style={[
          styles.feedbackButton,
          selected === "negative" && styles.feedbackButtonSelected,
        ]}
      >
        <ThumbsDown
          size={13}
          color="#fff"
          fill={selected === "negative" ? "#fff" : "transparent"}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
}

export function ChatPhotoRequestCard({
  offer,
  media,
  previewSource,
  previewSources,
  preparing = false,
  busy,
  onAccept,
  onDecline,
  onBuyCredits,
  onRetry,
  readyContentFit = "cover",
}: {
  offer?: MediaOffer | null;
  media?: GeneratedMedia;
  previewSource?: ImageSource | number;
  previewSources?: Array<ImageSource | number>;
  preparing?: boolean;
  busy: boolean;
  onAccept: (paymentMethod: "credits" | "daily_included") => void;
  onDecline: () => void;
  onBuyCredits: () => void;
  onRetry?: () => void;
  readyContentFit?: "cover" | "contain";
}) {
  const ready = media?.status === "ready" && Boolean(media.signed_url),
    failed = media?.status === "failed" || offer?.status === "failed",
    generating = !ready && !failed &&
      (media?.status === "queued" || media?.status === "generating" ||
        offer?.status === "accepted"),
    included = offer?.included_subscription_benefit === true,
    dailyRemaining = offer?.source === "user_request"
      ? Math.max(0, Number(offer.preview_metadata?.dailyPhotoAllowanceRemaining ?? 0))
      : 0,
    requestedSetting = String(offer?.preview_metadata?.requestedSetting ?? "").trim(),
    resolvedLocation = String(offer?.preview_metadata?.resolvedLocationName ?? "").trim(),
    resolvedWorld = String(offer?.preview_metadata?.resolvedWorldName ?? "").trim(),
    resolvedSettingLabel = requestedSetting && resolvedLocation
      ? `${requestedSetting.toLocaleLowerCase() === resolvedLocation.toLocaleLowerCase() ? resolvedLocation : `${requestedSetting} → ${resolvedLocation}`}${resolvedWorld ? ` · ${resolvedWorld}` : ""}`
      : "";
  if (ready && media?.signed_url) {
    return (
      <View style={styles.chatPhotoCard}>
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel="Open generated photo"
          onPress={() => openGeneratedMedia(media.id)}
          style={StyleSheet.absoluteFill}
        >
          <Image
            source={generatedMediaImageSource(media)}
            style={StyleSheet.absoluteFill}
            contentFit={readyContentFit}
            contentPosition="top"
            transition={220}
            cachePolicy="memory-disk"
            priority="normal"
            recyclingKey={media.id}
          />
        </Pressable>
        <MediaFeedbackControls media={media} style={styles.chatPhotoFeedback} />
      </View>
    );
  }
  return (
    <View
      accessible={generating || preparing || !offer}
      accessibilityLiveRegion={generating ? "polite" : "none"}
      accessibilityLabel={generating
        ? "Taking your photo"
        : offer?.companion_message ?? "Preparing photo request"}
      style={styles.chatPhotoCard}
    >
      {previewSources?.length
        ? (
          <View pointerEvents="none" style={styles.chatPhotoPreviewRow}>
            {previewSources.slice(0, 2).map((source, index) => (
              <Image
                key={index}
                source={source}
                style={styles.chatPhotoPreviewPart}
                contentFit="cover"
                contentPosition="top"
                blurRadius={30}
              />
            ))}
          </View>
        )
        : previewSource
        ? (
          <Image
            pointerEvents="none"
            source={previewSource}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="top"
            blurRadius={30}
          />
        )
        : null}
      <View pointerEvents="none" style={styles.chatPhotoScrim} />
      {generating
        ? (
          <View style={styles.chatPhotoGenerating}>
            <PhotoGenerationLoader />
            <Text style={styles.chatPhotoGeneratingText}>
              Taking your photo…
            </Text>
          </View>
        )
        : failed
        ? (
          <View style={styles.chatPhotoFailure}>
            <Camera size={31} color="#FFF4F8" />
            <Text style={styles.chatPhotoFailureTitle}>
              That photo didn&apos;t come through
            </Text>
            <Text style={styles.chatPhotoFailureCopy}>
              {media?.failure_reason_safe ?? offer?.failure_reason_safe ??
                "Please try again."}
            </Text>
            {onRetry
              ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry photo generation"
                  accessibilityState={{ disabled: busy, busy }}
                  disabled={busy}
                  onPress={onRetry}
                  style={[styles.chatPhotoRetry, busy && { opacity: .6 }]}
                >
                  {busy?<ActivityIndicator size="small" color="#FFF"/>:<RefreshCw size={14} color="#FFF" />}
                  <Text style={styles.chatPhotoRetryText}>{busy?"Retrying…":"Try again"}</Text>
                </Pressable>
              )
              : null}
          </View>
        )
        : preparing || !offer
        ? (
          <View style={styles.chatPhotoPreparing}>
            <Text style={styles.chatPhotoPreparingText}>
              Preparing photo request…
            </Text>
          </View>
        )
        : (
          <View style={styles.chatPhotoOfferContent}>
            <Text accessibilityRole="header" style={styles.offerMessage}>
              {offer.companion_message}
            </Text>
            {resolvedSettingLabel
              ? <Text style={styles.offerResolvedSetting}>{resolvedSettingLabel}</Text>
              : null}
            <View style={styles.offerIcon}>
              <Camera size={29} color="#FFF8FB" strokeWidth={1.8} />
            </View>
            {!included && dailyRemaining > 0
              ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Use an included daily photo. ${dailyRemaining} remaining today.`}
                    disabled={busy}
                    onPress={() => onAccept("daily_included")}
                    style={[styles.offerIncluded, busy && { opacity: .55 }]}
                  >
                    <Sparkles size={17} color="#FFD8E7" />
                    <Text style={styles.offerIncludedText}>Use today&apos;s included photo</Text>
                    <Text style={styles.offerIncludedCount}>{dailyRemaining} left</Text>
                  </Pressable>
                  <View accessibilityLabel="or" style={styles.offerOrRow}>
                    <View style={styles.offerOrLine} />
                    <Text style={styles.offerOrText}>OR</Text>
                    <View style={styles.offerOrLine} />
                  </View>
                </>
              )
              : null}
            <View style={styles.offerCost}>
              {included
                ? <Sparkles size={18} color="#FFD8E7" />
                : <KivelleCreditIcon size={21} />}
              <Text style={styles.offerCostText}>
                {included ? "Included" : offer.credit_cost}
              </Text>
              {included
                ? null
                : <Text style={styles.offerCostUnit}>KIVELLE CREDITS</Text>}
            </View>
            <View style={styles.offerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decline photo"
                disabled={busy}
                onPress={onDecline}
                style={[styles.offerSecondary, busy && { opacity: .55 }]}
              >
                <Text style={styles.offerSecondaryText}>Decline</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Accept photo for ${
                  included ? "no credits" : `${offer.credit_cost} credits`
                }`}
                disabled={busy}
                onPress={() => onAccept("credits")}
                style={[styles.offerPrimary, busy && { opacity: .55 }]}
              >
                <Text style={styles.offerPrimaryText}>
                  {busy ? "Preparing…" : dailyRemaining > 0 ? `Use ${offer.credit_cost} Credits` : "Accept"}
                </Text>
              </Pressable>
            </View>
            {offer.status === "failed"
              ? (
                <Pressable onPress={onBuyCredits}>
                  <Text style={styles.offerFailure}>
                    {offer.failure_reason_safe ??
                      "The photo could not be created."}
                  </Text>
                </Pressable>
              )
              : null}
          </View>
        )}
    </View>
  );
}

function PhotoGenerationLoader() {
  return (
    <Image
      pointerEvents="none"
      source={PHOTO_GENERATION_LOADER}
      style={styles.photoLoader}
      contentFit="contain"
    />
  );
}

function MediaProgress(
  { media, style }: { media: GeneratedMedia; style?: ViewStyle },
) {
  const pulse = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: 1300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]));
    const scanLoop = Animated.loop(Animated.timing(scan, {
      toValue: 1,
      duration: 2400,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }));
    pulseLoop.start();
    scanLoop.start();
    return () => {
      pulseLoop.stop();
      scanLoop.stop();
    };
  }, [pulse, scan]);

  const isVideo = media.media_type === "video";
  const title = isVideo
    ? "Bringing the moment to life…"
    : media.status === "queued"
    ? "Getting the photo ready…"
    : "Taking the photo…";
  const context = pendingContext(media.metadata ?? {});

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={isVideo
        ? "Companion video is being generated"
        : "Companion photo is being generated"}
      style={[styles.tile, styles.progressCard, style]}
    >
      <View pointerEvents="none" style={styles.progressBackdrop}>
        <View style={[styles.glow, styles.glowRose]} />
        <View style={[styles.glow, styles.glowViolet]} />
        <Animated.View
          style={[
            styles.scanLine,
            {
              opacity: scan.interpolate({
                inputRange: [0, 0.18, 0.82, 1],
                outputRange: [0, 0.7, 0.7, 0],
              }),
              transform: [{
                translateY: scan.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-92, 92],
                }),
              }],
            },
          ]}
        />
      </View>
      <View style={styles.progressBadge}>
        <Sparkles size={11} color="#FFD8E7" />
        <Text style={styles.progressBadgeText}>
          {isVideo ? "MOMENT IN PROGRESS" : "PHOTO IN PROGRESS"}
        </Text>
      </View>
      <View style={styles.captureStage}>
        <Animated.View
          style={[
            styles.captureHalo,
            {
              opacity: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.28, 0.72],
              }),
              transform: [{
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.88, 1.12],
                }),
              }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.captureFrame,
            {
              transform: [{
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.96],
                }),
              }],
            },
          ]}
        >
          <Camera size={31} color={colors.cream} strokeWidth={1.6} />
          <View style={styles.captureSpark}>
            <Sparkles size={13} color="#FF9CC0" fill="rgba(255,156,192,.2)" />
          </View>
        </Animated.View>
      </View>
      <View style={styles.progressCopy}>
        <Text style={styles.progressTitle}>{title}</Text>
        {context
          ? (
            <Text style={styles.progressContext} numberOfLines={1}>
              {context}
            </Text>
          )
          : null}
        <Text style={styles.progressHint}>
          You can keep chatting while it develops.
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              transform: [{
                scaleX: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.28, 1],
                }),
              }],
            },
          ]}
        />
      </View>
    </View>
  );
}

function pendingContext(metadata: Record<string, unknown>): string {
  const place = asRecord(metadata.placeContext);
  const location = asRecord(place?.location);
  const locationName = stringValue(location?.name) ??
    stringValue(place?.locationName);
  const activity = stringValue(metadata.activity);
  return [activity, locationName].filter((value): value is string =>
    Boolean(value)
  ).join(" · ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function VideoPoster() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.videoPoster]}>
      <Play size={34} color={colors.rose} />
      <Text style={styles.pendingTitle}>Shared video</Text>
    </View>
  );
}

export function MediaGallery(
  { media, emptyText = "Photos from your story will appear here." }: {
    media: GeneratedMedia[];
    emptyText?: string;
  },
) {
  const ready = media.filter((item) =>
    item.status === "ready" && item.signed_url
  );
  if (!ready.length) {
    return (
      <View style={styles.empty}>
        <Camera size={20} color={colors.rose} />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View style={styles.grid}>
      {ready.map((item) => (
        <MediaTile key={item.id} media={item} style={styles.gridTile} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    height: 238,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "flex-end",
  },
  pending: {
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 18,
  },
  pendingTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  caption: { color: "#F3EAF0", fontSize: 11, lineHeight: 15 },
  progressCard: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: "#130E19",
    borderColor: "rgba(255,190,215,.22)",
  },
  progressBackdrop: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  glow: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    opacity: 0.32,
  },
  glowRose: { left: -92, top: -86, backgroundColor: "#7E234F" },
  glowViolet: { right: -98, bottom: -104, backgroundColor: "#533376" },
  scanLine: {
    position: "absolute",
    left: 18,
    right: 18,
    top: "50%",
    height: 1,
    backgroundColor: "rgba(255,209,227,.34)",
    shadowColor: "#FF8FBB",
    shadowOpacity: 0.9,
    shadowRadius: 10,
  },
  progressBadge: {
    position: "absolute",
    left: 14,
    top: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(23,15,30,.72)",
    borderWidth: 1,
    borderColor: "rgba(255,225,237,.18)",
  },
  progressBadgeText: {
    color: "#FFD8E7",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.05,
  },
  captureStage: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  captureHalo: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(239,82,137,.18)",
    borderWidth: 1,
    borderColor: "rgba(255,156,192,.45)",
  },
  captureFrame: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.085)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.24)",
    shadowColor: "#D83EEA",
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
  },
  captureSpark: { position: "absolute", right: 7, top: 7 },
  progressCopy: { alignItems: "center", gap: 3, marginTop: 7 },
  progressTitle: {
    color: colors.cream,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.1,
    textAlign: "center",
  },
  progressContext: {
    color: "#E7C8D8",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "capitalize",
  },
  progressHint: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: "center",
  },
  progressTrack: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 13,
    height: 2,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,.08)",
  },
  progressFill: {
    width: "100%",
    height: "100%",
    borderRadius: 2,
    backgroundColor: colors.rose,
  },
  play: {
    position: "absolute",
    left: "50%",
    top: "44%",
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,8,17,.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.3)",
  },
  videoPoster: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.elevated,
  },
  mediaPressable: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  mediaPressableWithFeedback: { bottom: 25 },
  feedbackBelow: { position: "absolute", right: 4, bottom: 0 },
  feedback: { flexDirection: "row", alignItems: "center", gap: 1, height: 24 },
  feedbackButton: {
    width: 25,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    opacity: .58,
  },
  feedbackButtonSelected: { opacity: 1 },
  chatPhotoCard: {
    position: "relative",
    overflow: "hidden",
    alignSelf: "flex-start",
    width: "92%",
    maxWidth: 430,
    height: 390,
    borderRadius: 30,
    backgroundColor: "#241A31",
    borderWidth: 1,
    borderColor: "rgba(255,214,232,.22)",
    shadowColor: "#000",
    shadowOpacity: .35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  chatPhotoPreviewRow: { ...StyleSheet.absoluteFill, flexDirection: "row" },
  chatPhotoPreviewPart: { flex: 1, height: "100%" },
  chatPhotoScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(22,15,29,.64)",
  },
  chatPhotoOfferContent: {
    flex: 1,
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
    justifyContent: "space-between",
  },
  chatPhotoPreparing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  chatPhotoPreparingText: {
    color: "#FFF4F8",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,.55)",
    textShadowRadius: 9,
  },
  chatPhotoGenerating: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    padding: 28,
  },
  chatPhotoGeneratingText: {
    color: "#FFF9FC",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,.58)",
    textShadowRadius: 10,
  },
  photoLoader: {
    width: 94,
    height: 94,
  },
  chatPhotoFailure: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 28,
  },
  chatPhotoFailureTitle: {
    color: "#FFF9FC",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  chatPhotoFailureCopy: {
    color: "#F3DDE7",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  chatPhotoRetry: {
    marginTop: 6,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "rgba(216,62,234,.36)",
    borderWidth: 1,
    borderColor: "rgba(255,216,231,.3)",
  },
  chatPhotoRetryText: { color: "#FFF", fontSize: 13, fontWeight: "900" },
  chatPhotoFeedback: {
    position: "absolute",
    right: 8,
    bottom: 5,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: "rgba(10,7,14,.55)",
  },
  offerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,237,243,.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.16)",
  },
  offerMessage: {
    color: "#FFF9FC",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    textAlign: "center",
    maxWidth: 310,
    textShadowColor: "rgba(0,0,0,.38)",
    textShadowRadius: 8,
  },
  offerResolvedSetting: {
    marginTop: -4,
    color: "rgba(255,241,248,.82)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  offerCost: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(20,14,27,.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.09)",
  },
  offerCostText: { color: "#FFF7F1", fontSize: 21, fontWeight: "900" },
  offerCostUnit: {
    color: "#F3C9D8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: .8,
  },
  offerIncluded: {
    width: "100%",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(116,72,154,.62)",
    borderWidth: 1,
    borderColor: "rgba(224,184,255,.38)",
  },
  offerIncludedText: { color: "#FFF8FC", fontSize: 13, fontWeight: "900" },
  offerIncludedCount: { color: "#DCC9E8", fontSize: 10, fontWeight: "800" },
  offerOrRow: { width: "72%", flexDirection: "row", alignItems: "center", gap: 9 },
  offerOrLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,.22)" },
  offerOrText: { color: "rgba(255,248,252,.72)", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  offerActions: { width: "100%", flexDirection: "row", gap: 10 },
  offerPrimary: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(95,177,147,.68)",
    borderWidth: 1,
    borderColor: "rgba(130,242,198,.55)",
  },
  offerPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "900", textAlign: "center" },
  offerSecondary: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(177,92,128,.58)",
    borderWidth: 1,
    borderColor: "rgba(255,166,202,.38)",
  },
  offerSecondaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  offerFailure: { color: colors.danger, fontSize: 10, lineHeight: 15 },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: "rgba(216,62,234,.10)",
  },
  retryText: { color: colors.rose, fontWeight: "800", fontSize: 11 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridTile: { width: "31.5%", minWidth: 118, height: 180 },
  empty: {
    minHeight: 100,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyText: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
