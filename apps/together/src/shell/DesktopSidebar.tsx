import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import {
  Bell,
  CalendarDays,
  Compass,
  Home,
  Images,
  MessageCircle,
  Settings,
  UsersRound,
} from 'lucide-react-native';
import { CharacterAvatar } from '../components/ui';
import { KivelleLogo } from '../components/KivelleLogo';
import { KivelleCreditIcon } from '../components/KivelleCreditIcon';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import { useProfileAvatarUrl } from '../hooks/useProfileAvatarUrl';
import { desktopNavigationKey, type DesktopNavigationKey } from '../lib/desktopNavigation';
import { isActiveInboxConversation, MESSAGES_INBOX_HREF, mostRecentChatHref, shouldOpenMostRecentChat, WEB_MESSAGES_INBOX_HREF } from '../lib/messageInbox';
import { useTogether } from '../store/useTogether';
import { colors, typography } from '../theme';
import { markRouteIntent, warmRoute } from '../lib/routeWarmup';
import { subscriptionHref } from '../lib/subscriptionPresentation';
import { conversationRouteTarget, navigateLocalRouteOnWeb, webConversationHref } from '../lib/conversationNavigation';
import { characterConversationHref } from '../lib/chatRoute';

type Props = { expanded: boolean; onHoverChange: (hovered: boolean) => void };
type NavItem = { key: DesktopNavigationKey; label: string; href: string; icon: (color: string) => ReactNode; count?: number };

export function DesktopSidebar({ expanded, onHoverChange }: Props) {
  const pathname = usePathname();
  const settingsOpen = pathname === '/settings';
  const snapshot = useTogether((state) => state.snapshot);
  const browsedWorldId = useTogether((state) => state.browsedWorldId);
  const { data: subscription } = useSubscriptionStatus(Boolean(snapshot));
  const personaAvatarPath=typeof snapshot?.activePersona?.appearance_config?.avatarPath==='string'
    ?snapshot.activePersona.appearance_config.avatarPath
    :snapshot?.activePersona?.is_default?snapshot?.profile?.avatar_path:null;
  const profileAvatarUrl = useProfileAvatarUrl(personaAvatarPath);
  const [profileAvatarFailed, setProfileAvatarFailed] = useState(false);
  useEffect(() => setProfileAvatarFailed(false), [profileAvatarUrl]);
  const activeKey = desktopNavigationKey(pathname);
  const conversations = useMemo(() => (snapshot?.conversations ?? [])
    .filter(isActiveInboxConversation)
    .sort((left, right) => timestamp(right.last_message_at) - timestamp(left.last_message_at)), [snapshot?.conversations]);
  const unreadCount = conversations.filter((conversation) => conversation.unread).length;
  const latestChatHref=snapshot?mostRecentChatHref(snapshot.conversations,snapshot.characters):null;
  const inboxHref=Platform.OS==='web'?WEB_MESSAGES_INBOX_HREF:MESSAGES_INBOX_HREF;
  const messagesHref=shouldOpenMostRecentChat(pathname)?latestChatHref??inboxHref:inboxHref;
  const currentWorld = snapshot?.worlds.find((world) => world.id === browsedWorldId)
    ?? (snapshot?.currentPlaceContext ? snapshot.worlds.find((world) => world.id === snapshot.currentPlaceContext?.world.id) : undefined)
    ?? snapshot?.worlds.find((world) => world.published);
  const personaName = snapshot?.activePersona?.display_name ?? snapshot?.profile?.display_name ?? 'You';
  const showProfileAvatar = Boolean(profileAvatarUrl && !profileAvatarFailed);
  const navigate = (href: string) => {
    // Keep the rail expanded while its action swaps the active route. A genuine
    // pointer leave still collapses it through ResponsiveAppShell.
    onHoverChange(true);
    markRouteIntent(href);
    warmRoute(href,(value)=>router.prefetch(value as never));
    const conversationTarget = conversationRouteTarget(href);
    if (Platform.OS === 'web') {
      const destination = conversationTarget ? webConversationHref(href) ?? href : href;
      if (navigateLocalRouteOnWeb(destination, conversationTarget ? 'replace' : 'push')) return;
    }
    router.push((conversationTarget ?? href) as never);
  };
  const openMessagesInbox = () => navigate(inboxHref);
  const mainItems: NavItem[] = [
    { key: 'home', label: 'Home', href: '/home', icon: (color) => <Home size={24} color={color} /> },
    { key: 'explore', label: 'Explore', href: '/explore', icon: (color) => <Compass size={24} color={color} /> },
    { key: 'messages', label: 'Messages', href: messagesHref, icon: (color) => <MessageCircle size={24} color={color} />, count: unreadCount },
    { key: 'moments', label: 'Moments', href: '/moments', icon: (color) => <Images size={24} color={color} /> },
    { key: 'plans', label: 'Plans & Dates', href: '/dates', icon: (color) => <CalendarDays size={24} color={color} /> },
    { key: 'companions', label: 'Companions', href: '/companions', icon: (color) => <UsersRound size={24} color={color} /> },
  ];

  return <View
    nativeID="kivelle-desktop-sidebar"
    accessibilityLabel="Desktop navigation"
    onPointerEnter={() => onHoverChange(true)}
    onPointerLeave={() => onHoverChange(false)}
    style={[styles.sidebar, settingsOpen && styles.sidebarAboveSettings, expanded ? styles.sidebarExpanded : styles.sidebarCollapsed]}
  >
    <View
      nativeID="kivelle-desktop-sidebar-contents"
      style={styles.sidebarContents}
    >
      <BlurView tint="systemMaterialDark" intensity={84} style={StyleSheet.absoluteFill} />
      <View style={[styles.brandRow, !expanded && styles.brandRowCollapsed]}>
        {expanded ? <KivelleLogo height={33} /> : <Image accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" alt="" source={require('../../assets/kivelle-icon-transparent.png')} style={styles.brandIcon} contentFit="contain" transition={0} />}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.navGroup}>
          {mainItems.map((item) => <SidebarAction key={item.key} expanded={expanded} label={item.label} icon={item.icon(activeKey === item.key ? '#E3A4F2' : colors.muted)} active={activeKey === item.key} count={item.count} onWarm={()=>warmRoute(item.href,(value)=>router.prefetch(value as never))} onPress={() => navigate(item.href)} />)}
        </View>

      {expanded && currentWorld ? <View style={styles.section}>
        <Text style={styles.sectionLabel}>CURRENT WORLD</Text>
        <Text style={styles.worldName} numberOfLines={1}>{currentWorld.name}</Text>
        <View style={styles.inlineLinks}>
          <Pressable onPress={() => navigate(`/world/places?world=${encodeURIComponent(currentWorld.slug)}`)} style={({ pressed }) => [styles.inlineLink, pressed && styles.pressed]}><Text style={styles.inlineLinkText}>Places</Text></Pressable>
          <View style={styles.inlineDivider} />
          <Pressable onPress={() => navigate(`/singles?world=${encodeURIComponent(currentWorld.slug)}`)} style={({ pressed }) => [styles.inlineLink, pressed && styles.pressed]}><Text style={styles.inlineLinkText}>People</Text></Pressable>
        </View>
      </View> : null}

      {expanded && conversations.length ? <View style={styles.section}>
        <View style={styles.sectionHeading}><Text style={styles.sectionLabel}>RECENT</Text><Pressable onPress={openMessagesInbox}><Text style={styles.viewAll}>View all</Text></Pressable></View>
        <View style={styles.recentList}>{conversations.slice(0, 4).map((conversation) => {
          const character = snapshot?.characters.find((item) => item.id === conversation.character_instance_id);
          const group = conversation.kind === 'group';
          const name = group ? conversation.title || 'Group chat' : character?.together_character_templates.name ?? conversation.title ?? 'Conversation';
          const href = group
            ? `/group-chat?id=${encodeURIComponent(conversation.id)}`
            : character
            ? characterConversationHref(
              character.together_character_templates.public_handle ?? character.together_character_templates.slug,
              conversation.id,
            )
            : '/chat';
          return <Pressable key={conversation.id} accessibilityLabel={`Open ${name}${conversation.unread ? ', unread' : ''}`} onPress={() => navigate(href)} style={({ pressed }) => [styles.recentRow, pressed && styles.rowPressed]}>
            {group ? <View style={styles.groupMark}><UsersRound size={19} color={colors.violet} /></View> : character ? <CharacterAvatar name={name} template={character.together_character_templates} version={character.together_character_versions} size={35} /> : <View style={styles.groupMark}><MessageCircle size={18} color={colors.muted} /></View>}
            <View style={styles.recentCopy}><Text style={[styles.recentName, conversation.unread && styles.recentUnread]} numberOfLines={1}>{name}</Text><Text style={styles.recentPreview} numberOfLines={1}>{conversation.last_message_preview?.trim() || 'Continue the conversation'}</Text></View>
            {conversation.unread ? <View accessibilityLabel="Unread" style={styles.unreadDot} /> : null}
          </Pressable>;
        })}</View>
      </View> : null}
      </ScrollView>

      <View style={styles.footer}>
        <SidebarAction expanded={expanded} label={subscription ? `${subscription.creditBalance.total.toLocaleString()} Credits` : 'Kivelle Credits'} icon={<KivelleCreditIcon size={24} />} onPress={() => navigate(subscriptionHref({intent:'credits'}))} />
        <SidebarAction expanded={expanded} label="Notifications" icon={<Bell size={23} color={colors.muted} />} onPress={() => navigate('/notifications')} />
        <Pressable accessibilityRole="button" accessibilityLabel="Open Settings" onPress={() => navigate('/settings')} style={({ pressed }) => [styles.account, !expanded && styles.accountCollapsed, activeKey === 'settings' && styles.accountActive, pressed && styles.rowPressed]}>
          <View style={styles.initial}>{showProfileAvatar ? <Image accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" alt="" source={{ uri: profileAvatarUrl!, cacheKey: `kivelle-persona-avatar:${personaAvatarPath}` }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setProfileAvatarFailed(true)} /> : <Text style={styles.initialText}>{personaName.trim()[0]?.toUpperCase() || 'Y'}</Text>}</View>
          {expanded ? <View style={styles.accountCopy}><Text style={styles.accountName} numberOfLines={1}>{personaName}</Text><Text style={styles.accountTier}>{subscriptionLabel(subscription?.tier ?? snapshot?.entitlements?.tier)}</Text></View> : null}
          {expanded ? <Settings size={22} color={activeKey === 'settings' ? colors.text : colors.muted} /> : null}
        </Pressable>
      </View>
    </View>
  </View>;
}

function SidebarAction({ expanded, label, icon, onPress, onWarm, active = false, count = 0 }: { expanded: boolean; label: string; icon: ReactNode; onPress: () => void; onWarm?:()=>void; active?: boolean; count?: number }) {
  const [hovered, setHovered] = useState(false);
  return <View style={styles.actionWrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onHoverIn={() => {setHovered(true);onWarm?.();}} onHoverOut={() => setHovered(false)} onPressIn={onWarm} onPress={onPress} style={({ pressed }) => [styles.action, !expanded && styles.actionCollapsed, active && styles.actionActive, pressed && styles.rowPressed]}>
      {active ? <View style={styles.activeLine} /> : null}
      <View style={styles.actionIcon}>{icon}</View>
      {expanded ? <Text style={[styles.actionLabel, active && styles.actionLabelActive]} numberOfLines={1}>{label}</Text> : null}
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
  sidebar: { position: 'relative', zIndex: 300, flexShrink: 0, height: '100%', minHeight: 0, borderRightWidth: 1, borderRightColor: 'rgba(255,248,244,.10)', backgroundColor: 'rgba(11,10,14,.94)', ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(30px) saturate(122%)', transitionProperty: 'width', transitionDuration: '180ms', transitionTimingFunction: 'ease-out' } as never) : {}) },
  sidebarAboveSettings: { zIndex: 1400 },
  sidebarContents: { position: 'relative', flex: 1, minHeight: 0 },
  sidebarExpanded: { width: 280, shadowColor: '#000', shadowOpacity: .48, shadowRadius: 24, shadowOffset: { width: 10, height: 0 }, elevation: 20 },
  sidebarCollapsed: { width: 72 },
  brandRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 21, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.08)' },
  brandRowCollapsed: { justifyContent: 'center', paddingHorizontal: 7, gap: 5 },
  brandIcon: { width: 47, height: 42 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 9, paddingTop: 15, paddingBottom: 23, gap: 20 },
  navGroup: { gap: 4 },
  actionWrap: { position: 'relative' },
  action: { position: 'relative', minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 15, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, borderColor: 'transparent' },
  actionCollapsed: { width: 54, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 0 },
  actionActive: { backgroundColor: 'rgba(155,78,184,.17)', borderColor: 'rgba(214,151,230,.13)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, rgba(170,91,198,.20), rgba(113,58,139,.09) 72%, transparent)' } as never) : {}) },
  activeLine: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, backgroundColor: '#D278EA' },
  actionIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', color: colors.muted },
  actionLabel: { flex: 1, color: colors.muted, fontSize: 15, fontWeight: '700' },
  actionLabelActive: { color: colors.text, fontWeight: '900' },
  count: { color: '#E5A0F1', fontSize: 12.5, fontWeight: '900' },
  compactUnread: { position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: '#4AA4FF' },
  tooltip: { position: 'absolute', zIndex: 500, left: 74, top: 9, minHeight: 39, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', backgroundColor: '#211827', shadowColor: '#000', shadowOpacity: .4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  tooltipText: { color: colors.text, fontSize: 14, fontWeight: '800', whiteSpace: 'nowrap' } as never,
  section: { gap: 10, paddingHorizontal: 14, paddingTop: 19, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.08)' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { color: colors.dimmed, fontSize: 10, fontWeight: '900', letterSpacing: 1.35 },
  worldName: { color: colors.text, fontFamily: typography.display, fontSize: 22 },
  inlineLinks: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 13 },
  inlineLink: { paddingVertical: 8 },
  inlineLinkText: { color: '#D9B6E0', fontSize: 12.5, fontWeight: '800' },
  inlineDivider: { width: 1, height: 15, backgroundColor: 'rgba(255,255,255,.12)' },
  viewAll: { color: '#CE8CDD', fontSize: 11.5, fontWeight: '800' },
  recentList: { gap: 3 },
  recentRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 11, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 9 },
  recentCopy: { flex: 1, minWidth: 0 },
  recentName: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  recentUnread: { color: colors.text, fontWeight: '900' },
  recentPreview: { color: colors.dimmed, fontSize: 11, marginTop: 3 },
  groupMark: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(154,99,215,.10)', borderWidth: 1, borderColor: 'rgba(154,99,215,.18)' },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4AA4FF' },
  footer: { flexShrink: 0, paddingHorizontal: 9, paddingTop: 11, paddingBottom: 14, gap: 3, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.09)', backgroundColor: 'rgba(7,5,11,.34)' },
  account: { minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 11, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.08)' },
  accountCollapsed: { justifyContent: 'center', paddingHorizontal: 0 },
  accountActive: { backgroundColor: 'rgba(155,78,184,.15)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, rgba(170,91,198,.18), rgba(113,58,139,.07) 72%, transparent)' } as never) : {}) },
  initial: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,99,215,.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' },
  initialText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  accountTier: { color: colors.dimmed, fontSize: 11, marginTop: 3 },
  rowPressed: { backgroundColor: 'rgba(255,255,255,.055)' },
  pressed: { opacity: .72 },
});
