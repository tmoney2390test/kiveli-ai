import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
  Archive,
  ChevronRight,
  Images,
  Play,
  Plus,
  UserMinus,
  UsersRound,
  Volume2,
  X,
} from "lucide-react-native";
import { currentGroupPlan, groupPlanBlockingParticipantRemoval } from "@together/domain/src/group-chat";
import { manageGroup } from "../lib/api";
import { groupAddCandidates } from "../lib/groupWorld";
import { characterResidentWorld } from "../lib/place";
import { navigateLocalRouteOnWeb } from "../lib/conversationNavigation";
import { privateStoredImageSource } from "../lib/mediaImageSource";
import { colors, radius, typography } from "../theme";
import type { GeneratedMedia, GroupDetail, Snapshot } from "../types";
import { CharacterAvatar } from "./ui";
import { FrostedSurface } from "./FrostedGlass";
import { MediaTile } from "./media";

type GroupManagementTab = "people" | "media";

type Props = {
  visible: boolean;
  detail: GroupDetail;
  snapshot: Snapshot | null;
  busy: boolean;
  onClose: () => void;
  onBusy: (value: boolean) => void;
  onChanged: (detail: GroupDetail) => void;
  onArchived: () => void | Promise<void>;
};

export function GroupManagementModal({ visible, detail, snapshot, busy, onClose, onBusy, onChanged, onArchived }: Props) {
  const [tab, setTab] = useState<GroupManagementTab>("people");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video" | "audio">("all");

  useEffect(() => {
    if (!visible) return;
    setTab("people");
    setAdding(false);
    setError("");
  }, [detail.conversation.id, visible]);

  const active = useMemo(() => new Set(detail.participants.map((participant) => participant.character_instance_id)), [detail.participants]);
  const anchor = detail.participants[0]?.together_character_instances;
  const groupWorldId = detail.conversation.group_world_id ?? (snapshot && anchor ? characterResidentWorld(snapshot, anchor)?.id : undefined);
  const groupWorld = snapshot?.worlds.find((world) => world.id === groupWorldId);
  const eligible = snapshot ? groupAddCandidates(snapshot, groupWorldId, active) : [];
  const blockingArchivePlan = currentGroupPlan(detail.sharedPlans ?? []);
  const attachments = detail.messages.flatMap((message) => (message.attachments ?? message.together_conversation_attachments ?? []).map((attachment) => ({ attachment, message })));
  const generated = (detail.generatedMedia ?? []).filter((media) => ["image", "video", "voice_note"].includes(media.media_type));
  const filteredAttachments = attachments.filter(({ attachment }) => mediaFilter === "all" || attachment.kind === mediaFilter);
  const filteredGenerated = generated.filter((media) => mediaFilter === "all" || (mediaFilter === "audio" ? media.media_type === "voice_note" : media.media_type === mediaFilter));
  const mediaCount = attachments.length + generated.length;

  const mutate = async (input: Record<string, unknown>) => {
    onBusy(true);
    setError("");
    try {
      const next = await manageGroup<GroupDetail>({ ...input, conversationId: detail.conversation.id });
      onChanged(next);
      setAdding(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That group change could not be saved.");
    } finally {
      onBusy(false);
    }
  };

  const archive = async () => {
    if (blockingArchivePlan) return;
    onBusy(true);
    setError("");
    try {
      await manageGroup({ action: "archive", conversationId: detail.conversation.id });
      onClose();
      await onArchived();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This group could not be archived.");
    } finally {
      onBusy(false);
    }
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.root}>
      <Pressable accessibilityLabel="Close group management" onPress={onClose} style={StyleSheet.absoluteFill} />
      <FrostedSurface intensity={94} style={styles.card}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.kicker}>GROUP</Text><Text numberOfLines={1} style={styles.title}>{detail.conversation.title ?? "Group chat"}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close group management" onPress={onClose} style={styles.close}><X size={20} color={colors.muted} /></Pressable>
        </View>
        <View accessibilityRole="tablist" style={styles.tabs}>
          <TabButton label="People" icon={<UsersRound size={15} color={tab === "people" ? colors.text : colors.muted} />} selected={tab === "people"} onPress={() => setTab("people")} />
          <TabButton label={`Media${mediaCount ? ` ${mediaCount}` : ""}`} icon={<Images size={15} color={tab === "media" ? colors.text : colors.muted} />} selected={tab === "media"} onPress={() => setTab("media")} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {tab === "people" ? <>
            <SectionLabel>PARTICIPANTS</SectionLabel>
            {detail.participants.map((participant) => {
              const blockingPlan = groupPlanBlockingParticipantRemoval(detail.sharedPlans ?? [], participant.character_instance_id);
              const character = participant.together_character_instances;
              const template = character.together_character_templates;
              return <View key={participant.id} style={styles.person}>
                <CharacterAvatar slug={template.slug} name={template.name} template={template} version={character.together_character_versions} size={44} />
                <Text numberOfLines={1} style={styles.personName}>{template.name}</Text>
                {blockingPlan ? <Text numberOfLines={1} style={styles.personStatus}>In {blockingPlan.title}</Text> : detail.participants.length > 2 ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${template.name}`} disabled={busy} onPress={() => void mutate({ action: "remove_participant", characterInstanceId: participant.character_instance_id })} style={styles.iconButton}><UserMinus size={18} color={colors.danger} /></Pressable> : null}
              </View>;
            })}
            {detail.participants.length < 5 ? <Pressable accessibilityRole="button" accessibilityLabel="Add a companion" onPress={() => setAdding((value) => !value)} style={styles.add}><Plus size={18} color={colors.rose} /><Text style={styles.addText}>Add companion</Text><ChevronRight size={17} color={colors.dimmed} /></Pressable> : null}
            {adding ? <View style={styles.addList}>{eligible.map((character) => {
              const template = character.together_character_templates;
              return <Pressable key={character.id} accessibilityRole="button" accessibilityLabel={`Add ${template.name}`} disabled={busy} onPress={() => void mutate({ action: "add_participant", characterInstanceId: character.id })} style={styles.person}><CharacterAvatar slug={template.slug} name={template.name} template={template} version={character.together_character_versions} size={38} /><Text style={styles.personName}>{template.name}</Text><Plus size={18} color={colors.rose} /></Pressable>;
            })}{!eligible.length ? <Text style={styles.emptyCopy}>No other companions from {groupWorld?.name ?? "this world"} are available.</Text> : null}</View> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={blockingArchivePlan ? `Resolve ${blockingArchivePlan.title} before archiving this group` : "Archive group"} disabled={busy || Boolean(blockingArchivePlan)} onPress={() => void archive()} style={[styles.archive, blockingArchivePlan && styles.disabled]}><Archive size={18} color={colors.danger} /><Text style={styles.archiveText}>{blockingArchivePlan ? `Resolve ${blockingArchivePlan.title} first` : "Archive group"}</Text></Pressable>
          </> : null}

          {tab === "media" ? <>
            <View style={styles.intro}><Text style={styles.introTitle}>Shared in this conversation</Text><Text style={styles.introCopy}>Photos, videos, and voice notes stay private and open through short-lived signed links.</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{([ ["all", "All"], ["image", "Photos"], ["video", "Videos"], ["audio", "Voice"] ] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mediaFilter === value }} onPress={() => setMediaFilter(value)} style={[styles.filter, mediaFilter === value && styles.filterActive]}><Text style={[styles.filterText, mediaFilter === value && styles.selectedText]}>{label}</Text></Pressable>)}</ScrollView>
            <View style={styles.mediaGrid}>
              {filteredAttachments.map(({ attachment, message }) => <Pressable key={attachment.id} accessibilityRole="button" accessibilityLabel={`Open shared ${attachment.kind}`} onPress={() => attachment.signed_url && void Linking.openURL(attachment.signed_url)} style={styles.mediaCard}>
                {attachment.kind === "image" ? <Image source={privateStoredImageSource(attachment.signed_url, attachment.storage_path)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : <View style={styles.mediaFallback}>{attachment.kind === "video" ? <Play size={25} color={colors.text} /> : <Volume2 size={25} color={colors.text} />}</View>}
                <View style={styles.mediaCaption}><Text numberOfLines={1} style={styles.mediaCaptionText}>{message.role === "user" ? "You" : String(message.provider_metadata?.speakerName ?? "Companion")}</Text><Text style={styles.mediaDate}>{new Date(message.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</Text></View>
              </Pressable>)}
              {filteredGenerated.map((media) => <GeneratedMediaCard key={media.id} media={media} />)}
            </View>
            {!filteredAttachments.length && !filteredGenerated.length ? <View style={styles.empty}><Images size={28} color={colors.dimmed} /><Text style={styles.emptyTitle}>{mediaCount ? "Nothing in this filter" : "No shared media yet"}</Text><Text style={styles.emptyCopy}>{mediaCount ? "Try another media type." : "Photos, videos, and voice notes from this group will collect here."}</Text></View> : null}
          </> : null}

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </ScrollView>
        {busy ? <View pointerEvents="none" style={styles.busy}><ActivityIndicator color={colors.rose} /></View> : null}
      </FrostedSurface>
    </View>
  </Modal>;
}

function GeneratedMediaCard({ media }: { media: GeneratedMedia }) {
  if (media.media_type !== "voice_note") return <MediaTile media={media} style={styles.mediaCard} contentFit="cover" />;
  const href = `/media/${encodeURIComponent(media.id)}`;
  return <Pressable accessibilityRole="button" accessibilityLabel="Open voice note" onPress={() => { if (Platform.OS !== "web" || !navigateLocalRouteOnWeb(href)) router.push(href as never); }} style={styles.mediaCard}><View style={styles.mediaFallback}><Volume2 size={26} color={colors.rose} /><Text style={styles.voiceLabel}>Voice note</Text></View></Pressable>;
}

function TabButton({ label, icon, selected, onPress }: { label: string; icon: ReactNode; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.tab, selected && styles.tabActive]}>{icon}<Text style={[styles.tabText, selected && styles.selectedText]}>{label}</Text></Pressable>;
}
function SectionLabel({ children }: { children: ReactNode }) { return <Text style={styles.sectionLabel}>{children}</Text>; }

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18, backgroundColor: "rgba(5,4,10,.72)" },
  card: { width: "100%", maxWidth: 680, maxHeight: "92%", overflow: "hidden", borderRadius: 24, backgroundColor: "rgba(27,21,35,.98)", borderWidth: 1, borderColor: "rgba(203,168,255,.22)" },
  header: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  kicker: { color: colors.rose, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 26, marginTop: 3 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.05)" },
  tabs: { flexDirection: "row", gap: 6, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 13 },
  tabActive: { backgroundColor: "rgba(133,67,158,.3)", borderWidth: 1, borderColor: "rgba(211,118,255,.25)" },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  selectedText: { color: colors.text },
  content: { padding: 20, paddingBottom: 28 },
  sectionLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 9 },
  person: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  personName: { minWidth: 0, flex: 1, color: colors.text, fontSize: 14, fontWeight: "800" },
  personStatus: { color: colors.muted, fontSize: 10, fontWeight: "700", maxWidth: 110, textAlign: "right" },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  add: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9 },
  addText: { flex: 1, color: colors.rose, fontSize: 13, fontWeight: "900" },
  addList: { paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,.025)" },
  archive: { minHeight: 52, marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: radius.lg, backgroundColor: "rgba(255,113,129,.08)", borderWidth: 1, borderColor: "rgba(255,113,129,.2)" },
  archiveText: { color: colors.danger, fontWeight: "900" },
  disabled: { opacity: .45 },
  intro: { gap: 5, marginBottom: 14 },
  introTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  introCopy: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  filters: { gap: 7, paddingBottom: 14 },
  filter: { minHeight: 36, justifyContent: "center", paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,.04)", borderWidth: 1, borderColor: colors.border },
  filterActive: { backgroundColor: "rgba(133,67,158,.3)", borderColor: "rgba(211,118,255,.34)" },
  filterText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  mediaCard: { width: "48%", minWidth: 132, aspectRatio: 1, overflow: "hidden", borderRadius: 16, backgroundColor: "rgba(255,255,255,.05)", borderWidth: 1, borderColor: colors.border },
  mediaFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(110,59,137,.18)" },
  voiceLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "900" },
  mediaCaption: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 37, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, backgroundColor: "rgba(7,5,11,.78)" },
  mediaCaptionText: { flex: 1, color: colors.text, fontSize: 10, fontWeight: "800" },
  mediaDate: { color: colors.muted, fontSize: 9 },
  empty: { minHeight: 210, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  emptyCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center", paddingVertical: 12 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: "center" },
  busy: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,8,14,.52)" },
});
