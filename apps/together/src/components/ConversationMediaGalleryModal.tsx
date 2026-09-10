import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Images, Play, X } from "lucide-react-native";
import { colors, radius } from "../theme";
import { chatMediaVideoPreview, type ChatMediaGalleryItem } from "../lib/chatMediaGallery";
import { VideoMomentThumbnail } from "./VideoMomentThumbnail";
import { privateStoredImageSource } from "../lib/mediaImageSource";
import type { GeneratedMedia } from "../types";
import { FrostedBackdrop, FrostedSurface } from "./FrostedGlass";

type Props = {
  visible: boolean;
  items: ChatMediaGalleryItem[];
  generatedMedia: GeneratedMedia[];
  title: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onOpenGenerated: (mediaId: string) => void;
  onClose: () => void;
};

export function ConversationMediaGalleryModal({
  visible,
  items,
  generatedMedia,
  title,
  loading,
  error,
  onRetry,
  onOpenGenerated,
  onClose,
}: Props) {
  const generatedById = new Map(generatedMedia.map((item) => [item.id, item]));
  const openItem = (item: ChatMediaGalleryItem) => {
    onClose();
    if (item.kind === "generated") {
      onOpenGenerated(item.media.id);
      return;
    }
    if (item.attachment.signed_url) void Linking.openURL(item.attachment.signed_url);
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <FrostedBackdrop intensity={38}/>
      <Pressable accessibilityLabel="Close conversation media" onPress={onClose} style={StyleSheet.absoluteFill}/>
      <FrostedSurface intensity={94} style={styles.modal}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>CONVERSATION MEDIA</Text>
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{items.length ? `${items.length} ${items.length === 1 ? "item" : "items"}` : "Photos and videos"}</Text>
          </View>
          {loading && items.length ? <ActivityIndicator size="small" color={colors.rose}/> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Close conversation media" onPress={onClose} style={styles.close}>
            <X size={19} color={colors.text}/>
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {error ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading conversation media" onPress={onRetry} style={styles.error}>
            <Text style={styles.errorText}>Media could not be loaded.</Text><Text style={styles.retry}>Try again</Text>
          </Pressable> : null}
          {items.length ? <View style={styles.grid}>{items.map((item) => {
            const generated = item.kind === "generated" ? item.media : null;
            const attachment = item.kind === "attachment" ? item.attachment : null;
            const isVideo = generated?.media_type === "video" || attachment?.kind === "video";
            const videoPreview = chatMediaVideoPreview(item, generatedById);
            const poster = videoPreview.poster;
            const posterUri = poster?.signed_url ?? null;
            const uri = generated?.signed_url ?? attachment?.signed_url ?? null;
            const pending = generated?.status === "queued" || generated?.status === "generating";
            return <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${isVideo ? "video" : "photo"} from ${new Date(item.createdAt).toLocaleDateString()}`}
              onPress={() => openItem(item)}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            >
              {isVideo ? <>
                <View style={styles.videoFallback}><Play size={32} color={colors.dimmed}/></View>
                {posterUri ? <GalleryPhoto uri={posterUri} storagePath={poster?.storage_path}/> : null}
                {visible && videoPreview.uri ? <VideoMomentThumbnail uri={videoPreview.uri} posterUri={posterUri} contentFit="contain"/> : null}
                <View style={styles.play}>{pending ? <ActivityIndicator size="small" color="#fff"/> : <Play size={16} color="#fff" fill="#fff"/>}</View>
              </> : uri ? <GalleryPhoto uri={uri} storagePath={generated?.storage_path ?? attachment?.storage_path}/> : <View style={styles.videoFallback}>{pending ? <ActivityIndicator color={colors.rose}/> : null}</View>}
              <View style={styles.shade}/>
              <View style={styles.meta}><Text style={styles.type}>{pending ? "CREATING" : isVideo ? "VIDEO" : "PHOTO"}</Text><Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</Text></View>
            </Pressable>;
          })}</View> : loading ? <View accessibilityLiveRegion="polite" style={styles.empty}><ActivityIndicator color={colors.rose}/><Text style={styles.emptyTitle}>Gathering your media…</Text></View> : <View style={styles.empty}><Images size={34} color={colors.dimmed}/><Text style={styles.emptyTitle}>No shared media yet</Text><Text style={styles.emptyCopy}>Photos and videos from this conversation will appear here.</Text></View>}
        </ScrollView>
      </FrostedSurface>
    </View>
  </Modal>;
}

function GalleryPhoto({ uri, storagePath }: { uri: string; storagePath?: string | null }) {
  const source = privateStoredImageSource(uri, storagePath);
  return <View style={StyleSheet.absoluteFill}>
    <Image accessible={false} source={source} style={[StyleSheet.absoluteFill, styles.photoBackdrop]} contentFit="cover" contentPosition="center" blurRadius={24} cachePolicy="memory-disk"/>
    <View pointerEvents="none" style={styles.photoMatte}/>
    <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" contentPosition="center" cachePolicy="memory-disk" transition={0}/>
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18, backgroundColor: "rgba(4,3,9,.58)" },
  modal: { width: "100%", maxWidth: 780, maxHeight: "88%", overflow: "hidden", borderRadius: 26, backgroundColor: "rgba(20,15,29,.97)", borderWidth: 1, borderColor: "rgba(205,174,255,.24)", shadowColor: "#000", shadowOpacity: .5, shadowRadius: 30, shadowOffset: { width: 0, height: 16 } },
  header: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 1.35 },
  title: { color: colors.text, fontFamily: "Georgia", fontSize: 25, lineHeight: 30, marginTop: 3 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.055)", borderWidth: 1, borderColor: colors.border },
  content: { padding: 14, paddingBottom: 22 },
  error: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 13, marginBottom: 12, borderRadius: radius.md, backgroundColor: "rgba(219,72,86,.08)", borderWidth: 1, borderColor: "rgba(219,72,86,.25)" },
  errorText: { flex: 1, color: colors.danger, fontSize: 11, fontWeight: "700" },
  retry: { color: colors.text, fontSize: 11, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { position: "relative", flexGrow: 1, flexBasis: 220, minWidth: 145, height: 190, overflow: "hidden", borderRadius: radius.lg, backgroundColor: colors.elevated, borderWidth: 1, borderColor: "rgba(255,255,255,.10)" },
  tilePressed: { opacity: .78, transform: [{ scale: .99 }] },
  videoFallback: { ...StyleSheet.absoluteFill, backgroundColor: "#11101A", alignItems: "center", justifyContent: "center" },
  photoBackdrop: { opacity: .38, transform: [{ scale: 1.06 }] },
  photoMatte: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(8,7,12,.34)" },
  play: { position: "absolute", top: 11, right: 11, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(7,6,12,.68)", borderWidth: 1, borderColor: "rgba(255,255,255,.22)" },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(5,5,10,.08)", ...(Platform.OS === "web" ? ({ backgroundImage: "linear-gradient(180deg, transparent 48%, rgba(5,5,10,.78) 100%)" } as never) : {}) },
  meta: { position: "absolute", left: 11, right: 11, bottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  type: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  date: { color: "rgba(255,255,255,.78)", fontSize: 10, fontWeight: "700" },
  empty: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 9, padding: 28 },
  emptyTitle: { color: colors.text, fontFamily: "Georgia", fontSize: 22 },
  emptyCopy: { maxWidth: 360, color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
