import { useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Compass,
  Home,
  Images,
  MessageCircle,
  Plus,
  Settings,
  UsersRound,
} from 'lucide-react-native';
import { CharacterAvatar } from '../components/ui';
import { KivelleLogo } from '../components/KivelleLogo';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import { desktopNavigationKey, type DesktopNavigationKey } from '../lib/desktopNavigation';
import { isActiveInboxConversation } from '../lib/messageInbox';
import { useTogether } from '../store/useTogether';
import { colors, typography } from '../theme';

type Props = { expanded: boolean; onToggle: () => void };
type NavItem = { key: DesktopNavigationKey; label: string; href: string; icon: (color: string) => ReactNode; count?: number };

export function DesktopSidebar({ expanded, onToggle }: Props) {
  const pathname = usePathname();
  const snapshot = useTogether((state) => state.snapshot);
  const browsedWorldId = useTogether((state) => state.browsedWorldId);
  const { data: subscription } = useSubscriptionStatus(Boolean(snapshot));
  const activeKey = desktopNavigationKey(pathname);
  const conversations = useMemo(() => (snapshot?.conversations ?? [])
    .filter(isActiveInboxConversation)
    .sort((left, right) => timestamp(right.last_message_at) - timestamp(left.last_message_at)), [snapshot?.conversations]);
  const unreadCount = conversations.filter((conversation) => conversation.unread).length;
  const currentWorld = snapshot?.worlds.find((world) => world.id === browsedWorldId)
    ?? (snapshot?.currentPlaceContext ? snapshot.worlds.find((world) => world.id === snapshot.currentPlaceContext?.world.id) : undefined)
    ?? snapshot?.worlds.find((world) => world.published);
  const personaName = snapshot?.activePersona?.display_name ?? snapshot?.profile?.display_name ?? 'You';
  const mainItems: NavItem[] = [
    { key: 'home', label: 'Home', href: '/home', icon: (color) => <Home size={19} color={color} /> },
    { key: 'explore', label: 'Explore', href: '/explore', icon: (color) => <Compass size={19} color={color} /> },
    { key: 'messages', label: 'Messages', href: '/chat', icon: (color) => <MessageCircle size={19} color={color} />, count: unreadCount },
    { key: 'moments', label: 'Moments', href: '/moments', icon: (color) => <Images size={19} color={color} /> },
    { key: 'plans', label: 'Plans & Dates', href: '/dates', icon: (color) => <CalendarDays size={19} color={color} /> },
    { key: 'companions', label: 'Companions', href: '/companions', icon: (color) => <UsersRound size={19} color={color} /> },
  ];

  return <View accessibilityLabel="Desktop navigation" style={[styles.sidebar, expanded ? styles.sidebarExpanded : styles.sidebarCollapsed]}>
    <BlurView tint="systemMaterialDark" intensity={84} style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={styles.wash} />
    <View pointerEvents="none" style={styles.glow} />
    <View style={[styles.brandRow, !expanded && styles.brandRowCollapsed]}>
      {expanded ? <KivelleLogo height={26} /> : <Text style={styles.brandMark}>K</Text>}
      <Pressable accessibilityLabel={expanded ? 'Collapse navigation' : 'Expand navigation'} onPress={onToggle} style={({ pressed }) => [styles.collapse, pressed && styles.pressed]}>
        {expanded ? <ChevronLeft size={17} color={colors.muted} /> : <ChevronRight size={17} color={colors.muted} />}
      </Pressable>
    </View>

    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <SidebarAction expanded={expanded} label="New conversation" icon={<Plus size={19} color="#EBA7F6" />} accent onPress={() => router.push(`/chat?compose=${Date.now()}` as never)} />
      <View style={styles.navGroup}>
        {mainItems.map((item) => <SidebarAction key={item.key} expanded={expanded} label={item.label} icon={item.icon(activeKey === item.key ? '#E3A4F2' : colors.muted)} active={activeKey === item.key} count={item.count} onPress={() => router.push(item.href as never)} />)}
      </View>

      {expanded && currentWorld ? <View style={styles.section}>
        <Text style={styles.sectionLabel}>CURRENT WORLD</Text>
        <Text style={styles.worldName} numberOfLines={1}>{currentWorld.name}</Text>
        <View style={styles.inlineLinks}>
          <Pressable onPress={() => router.push(`/world/places?world=${encodeURIComponent(currentWorld.slug)}` as never)} style={({ pressed }) => [styles.inlineLink, pressed && styles.pressed]}><Text style={styles.inlineLinkText}>Places</Text></Pressable>
          <View style={styles.inlineDivider} />
          <Pressable onPress={() => router.push(`/singles?world=${encodeURIComponent(currentWorld.slug)}` as never)} style={({ pressed }) => [styles.inlineLink, pressed && styles.pressed]}><Text style={styles.inlineLinkText}>People</Text></Pressable>
        </View>
      </View> : null}

      {expanded && conversations.length ? <View style={styles.section}>
        <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>RECENT</Text><Pressable onPress={() => router.push('/chat')}><Text style={styles.viewAll}>View all</Text></Pressable></View>
        <View style={styles.recentList}>{conversations.slice(0, 4).map((conversation) => {
          const character = snapshot?.characters.find((item) => item.id === conversation.character_instance_id);
          const group = conversation.kind === 'group';
          const name = group ? conversation.title || 'Group chat' : character?.together_character_templates.name ?? conversation.title ?? 'Conversation';
          const href = group ? `/group-chat?id=${encodeURIComponent(conversation.id)}` : character ? `/chat?character=${encodeURIComponent(character.together_character_templates.public_handle ?? character.together_character_templates.slug)}` : '/chat';
          return <Pressable key={conversation.id} accessibilityLabel={`Open ${name}${conversation.unread ? ', unread' : ''}`} onPress={() => router.push(href as never)} style={({ pressed }) => [styles.recentRow, pressed && styles.rowPressed]}>
            {group ? <View style={styles.groupMark}><UsersRound size={15} color={colors.violet} /></View> : character ? <CharacterAvatar name={name} template={character.together_character_templates} version={character.together_character_versions} size={28} /> : <View style={styles.groupMark}><MessageCircle size={14} color={colors.muted} /></View>}
            <View style={styles.recentCopy}><Text style={[styles.recentName, conversation.unread && styles.recentUnread]} numberOfLines={1}>{name}</Text><Text style={styles.recentPreview} numberOfLines={1}>{conversation.last_message_preview?.trim() || 'Continue the conversation'}</Text></View>
            {conversation.unread ? <View accessibilityLabel="Unread" style={styles.unreadDot} /> : null}
          </Pressable>;
        })}</View>
      </View> : null}
    </ScrollView>

    <View style={styles.footer}>
      <SidebarAction expanded={expanded} label={subscription ? `${subscription.creditBalance.total.toLocaleString()} Credits` : 'Kivelle Credits'} icon={<Coins size={18} color={colors.warm} />} onPress={() => router.push('/subscription')} />
      <SidebarAction expanded={expanded} label="Notifications" icon={<Bell size={18} color={colors.muted} />} onPress={() => router.push('/notifications')} />
      <Pressable accessibilityLabel="Open Settings" onPress={() => router.push('/settings')} style={({ pressed }) => [styles.account, !expanded && styles.accountCollapsed, activeKey === 'settings' && styles.accountActive, pressed && styles.rowPressed]}>
        <View style={styles.initial}><Text style={styles.initialText}>{personaName.trim()[0]?.toUpperCase() || 'Y'}</Text></View>
        {expanded ? <View style={styles.accountCopy}><Text style={styles.accountName} numberOfLines={1}>{personaName}</Text><Text style={styles.accountTier}>{subscriptionLabel(subscription?.tier ?? snapshot?.entitlements?.tier)}</Text></View> : null}
        {expanded ? <Settings size={17} color={activeKey === 'settings' ? colors.text : colors.muted} /> : null}
      </Pressable>
    </View>
  </View>;
}

function SidebarAction({ expanded, label, icon, onPress, active = false, accent = false, count = 0 }: { expanded: boolean; label: string; icon: ReactNode; onPress: () => void; active?: boolean; accent?: boolean; count?: number }) {
  const [hovered, setHovered] = useState(false);
  return <View style={styles.actionWrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onPress={onPress} style={({ pressed }) => [styles.action, !expanded && styles.actionCollapsed, active && styles.actionActive, accent && styles.actionAccent, pressed && styles.rowPressed]}>
      {active ? <View style={styles.activeLine} /> : null}
      <View style={styles.actionIcon}>{icon}</View>
      {expanded ? <Text style={[styles.actionLabel, active && styles.actionLabelActive, accent && styles.actionLabelAccent]} numberOfLines={1}>{label}</Text> : null}
      {expanded && count > 0 ? <Text style={styles.count}>{count > 99 ? '99+' : count}</Text> : null}
      {!expanded && count > 0 ? <View style={styles.compactUnread} /> : null}
    </Pressable>
    {!expanded && hovered ? <View pointerEvents="none" style={styles.tooltip}><Text style={styles.tooltipText}>{label}</Text></View> : null}
  </View>;
}

function timestamp(value: string | null) {
  if (!value) return 0;
  const result = new Date(value).getTime();
  return Number.isNaN(result) ? 0 : result;
}

function subscriptionLabel(tier?: string | null) {
  if (tier === 'kivelle_max' || tier === 'unlimited') return 'Kivelle Max';
  if (tier === 'kivelle_plus' || tier === 'together_plus') return 'Kivelle+';
  return 'Kivelle Free';
}

const styles = StyleSheet.create({
  sidebar: { position: 'relative', zIndex: 300, flexShrink: 0, height: '100%', minHeight: 0, borderRightWidth: 1, borderRightColor: 'rgba(255,248,244,.10)', backgroundColor: 'rgba(12,9,17,.88)', ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(30px) saturate(138%)', transitionProperty: 'width', transitionDuration: '180ms', transitionTimingFunction: 'ease-out' } as never) : {}) },
  sidebarExpanded: { width: 248 },
  sidebarCollapsed: { width: 72 },
  wash: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(59,34,72,.15)' },
  glow: { position: 'absolute', top: 72, bottom: 130, left: -130, width: 250, backgroundColor: 'rgba(142,54,169,.06)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'radial-gradient(ellipse at left, rgba(167,68,195,.15), transparent 68%)' } as never) : {}) },
  brandRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.08)' },
  brandRowCollapsed: { justifyContent: 'center', paddingHorizontal: 7, gap: 5 },
  brandMark: { color: colors.text, fontFamily: typography.display, fontSize: 26, fontStyle: 'italic' },
  collapse: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,.10)' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 9, paddingTop: 12, paddingBottom: 18, gap: 16 },
  navGroup: { gap: 3 },
  actionWrap: { position: 'relative' },
  action: { position: 'relative', minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 11, borderRadius: 7 },
  actionCollapsed: { width: 52, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 0 },
  actionActive: { backgroundColor: 'rgba(155,78,184,.13)' },
  actionAccent: { minHeight: 48, borderWidth: 1, borderColor: 'rgba(216,62,234,.22)', backgroundColor: 'rgba(128,45,151,.12)' },
  activeLine: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 2, backgroundColor: '#D278EA' },
  actionIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', color: colors.muted },
  actionLabel: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: '700' },
  actionLabelActive: { color: colors.text, fontWeight: '900' },
  actionLabelAccent: { color: '#F2D7F7', fontWeight: '900' },
  count: { color: '#E5A0F1', fontSize: 10, fontWeight: '900' },
  compactUnread: { position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: '#4AA4FF' },
  tooltip: { position: 'absolute', zIndex: 500, left: 66, top: 7, minHeight: 31, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', backgroundColor: '#211827', shadowColor: '#000', shadowOpacity: .4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  tooltipText: { color: colors.text, fontSize: 11, fontWeight: '800', whiteSpace: 'nowrap' } as never,
  section: { gap: 8, paddingHorizontal: 11, paddingTop: 15, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.08)' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { color: colors.dimmed, fontSize: 8, fontWeight: '900', letterSpacing: 1.35 },
  worldName: { color: colors.text, fontFamily: typography.display, fontSize: 17 },
  inlineLinks: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineLink: { paddingVertical: 6 },
  inlineLinkText: { color: '#D9B6E0', fontSize: 10, fontWeight: '800' },
  inlineDivider: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,.12)' },
  viewAll: { color: '#CE8CDD', fontSize: 9, fontWeight: '800' },
  recentList: { gap: 2 },
  recentRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 7 },
  recentCopy: { flex: 1, minWidth: 0 },
  recentName: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  recentUnread: { color: colors.text, fontWeight: '900' },
  recentPreview: { color: colors.dimmed, fontSize: 8.5, marginTop: 2 },
  groupMark: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: 'rgba(154,99,215,.10)', borderWidth: 1, borderColor: 'rgba(154,99,215,.18)' },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4AA4FF' },
  footer: { flexShrink: 0, paddingHorizontal: 9, paddingTop: 9, paddingBottom: 11, gap: 2, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.09)', backgroundColor: 'rgba(7,5,11,.34)' },
  account: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 9, marginTop: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.08)' },
  accountCollapsed: { justifyContent: 'center', paddingHorizontal: 0 },
  accountActive: { backgroundColor: 'rgba(155,78,184,.10)' },
  initial: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,99,215,.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' },
  initialText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: { color: colors.text, fontSize: 11, fontWeight: '900' },
  accountTier: { color: colors.dimmed, fontSize: 8.5, marginTop: 2 },
  rowPressed: { backgroundColor: 'rgba(255,255,255,.055)' },
  pressed: { opacity: .72 },
});
