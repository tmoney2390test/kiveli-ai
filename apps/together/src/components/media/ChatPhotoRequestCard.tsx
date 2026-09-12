import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { Camera, RefreshCw, Sparkles, X } from 'lucide-react-native';
import type { GeneratedMedia, MediaOffer } from '../../types';
import { generatedMediaImageSource } from '../../lib/mediaImageSource';
import { photoOfferDismissAction } from '../../lib/photoRequestPresentation';
import { styles } from '../../styles/mediaStyles';
import { KivelleCreditIcon } from '../KivelleCreditIcon';
import { MediaFeedbackControls } from './MediaFeedbackControls';
import { openGeneratedMedia } from './openGeneratedMedia';

const PHOTO_GENERATION_LOADER = require(
  "../../../assets/loaders/sparkles-loop-loader.svg",
);

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
    acceptQueued = offer?.preview_metadata?.acceptQueued === true,
    included = offer?.included_subscription_benefit === true,
    dailyRemaining = offer?.source === "user_request"
      ? Math.max(0, Number(offer.preview_metadata?.dailyPhotoAllowanceRemaining ?? 0))
      : 0,
    requestedSetting = String(offer?.preview_metadata?.requestedSetting ?? "").trim(),
    resolvedLocation = String(offer?.preview_metadata?.resolvedLocationName ?? "").trim(),
    resolvedWorld = String(offer?.preview_metadata?.resolvedWorldName ?? "").trim(),
    resolvedSettingLabel = requestedSetting && resolvedLocation
      ? `${requestedSetting.toLocaleLowerCase() === resolvedLocation.toLocaleLowerCase() ? resolvedLocation : `${requestedSetting} → ${resolvedLocation}`}${resolvedWorld ? ` · ${resolvedWorld}` : ""}`
      : "",
    dismissAction = photoOfferDismissAction(offer?.status, preparing, generating);
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
      {dismissAction
        ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={dismissAction === "remove" ? "Remove failed photo request" : "Cancel photo request"}
            accessibilityHint={dismissAction === "remove" ? "Permanently removes this failed request from the chat" : "Removes this photo offer without starting generation"}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            hitSlop={8}
            onPress={onDecline}
            style={({ pressed }) => [
              styles.chatPhotoCancel,
              (pressed || busy) && styles.chatPhotoCancelPressed,
            ]}
          >
            <X size={18} color="#FFF" strokeWidth={2.5} />
          </Pressable>
        )
        : null}
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
                    disabled={busy || acceptQueued}
                    onPress={() => onAccept("daily_included")}
                    style={[styles.offerIncluded, (busy || acceptQueued) && { opacity: .55 }]}
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
                accessibilityLabel={`Accept photo for ${
                  included ? "no credits" : `${offer.credit_cost} credits`
                }`}
                accessibilityState={{ disabled: busy || acceptQueued, busy: busy || acceptQueued }}
                disabled={busy || acceptQueued}
                onPress={() => onAccept("credits")}
                style={[styles.offerPrimary, (busy || acceptQueued) && { opacity: .55 }]}
              >
                <Text style={styles.offerPrimaryText}>
                  {busy || acceptQueued ? "Starting…" : dailyRemaining > 0 ? `Use ${offer.credit_cost} Credits` : "Accept"}
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
