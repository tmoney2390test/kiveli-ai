import { cloneElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {AccountProfilePanel} from '../src/components/AccountProfilePanel';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Archive,
  ArrowLeft,
  Bell,
  Brain,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  FileText,
  Heart,
  KeyRound,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Search,
  Shield,
  Sparkles,
  UserRound,
  UsersRound,
  Volume2,
  X,
} from 'lucide-react-native';
import { cleanupNormalizedImage, normalizeUserImage, userImagePickerOptions, type NormalizedUserImage } from '../src/lib/imageUploads';
import { colors, radius, spacing, typography } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { useAuth } from '../src/hooks/useAuth';
import { useProfileAvatarUrl } from '../src/hooks/useProfileAvatarUrl';
import { authProviderState } from '../src/lib/authProviders';
import { activeCompanion } from '../src/lib/companionLife';
import { manageAccount } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import { confirmAction } from '../src/lib/dialogs';
import { shouldRenderSettingsRoute, shouldUseDesktopSettingsLayout } from '../src/lib/settingsRoute';
import { DESKTOP_SIDEBAR_EXPANDED_WIDTH } from '../src/lib/desktopNavigation';
import { startSignOutTransition } from '../src/lib/signOutTransition';
import { createClientRequestId } from '../src/lib/requestId';
import {
  settingsCloseTarget,
  settingsSearchMatches,
  settingsSectionFromParam,
  type SettingsSection,
} from '../src/lib/settingsExperience';
import { FrostedBackdrop, FrostedSurface, LoadingSkeleton } from '../src/components';
import { ContactSupportModal } from '../src/components/ContactSupportModal';

type SaveNotice = { kind: 'success' | 'error'; message: string } | null;
type Snapshot = NonNullable<ReturnType<typeof useTogether.getState>['snapshot']>;
type SectionDefinition = {
  id: SettingsSection;
  label: string;
  description: string;
  searchTerms: string;
  icon: ReactElement<{ color?: string }>;
};

const sections: SectionDefinition[] = [
  { id: 'profile', label: 'Your profile', description: 'Your account photo, highlights, companions, and media.', searchTerms: 'avatar email highlights images videos', icon: <UserRound size={20} /> },
  { id: 'account', label: 'Account & billing', description: 'Sign-in, subscription, credits, and active devices.', searchTerms: 'email code security payment plan verification', icon: <KeyRound size={20} /> },
  { id: 'identity', label: 'Personas & Lives', description: 'Manage who companions know in each separate Life.', searchTerms: 'persona identity alternate main life name bio about interests goals', icon: <Sparkles size={20} /> },
  { id: 'experience', label: 'Chat & media', description: 'Notifications, content, photos, video, voice, and calls.', searchTerms: 'push romance upload generation autoplay audio', icon: <Heart size={20} /> },
  { id: 'relationships', label: 'Relationships', description: 'Companions, conversations, archives, and memories.', searchTerms: 'chat reset history memory moments', icon: <UsersRound size={20} /> },
  { id: 'privacy', label: 'Privacy & safety', description: 'Personalization, analytics, data, policies, and deletion.', searchTerms: 'export delete account terms refund community ai disclosure', icon: <Shield size={20} /> },
  { id: 'support', label: 'Help & support', description: 'Find answers or send the support team a private request.', searchTerms: 'contact report problem ticket', icon: <LifeBuoy size={20} /> },
];

export default function Settings() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [webHydrated, setWebHydrated] = useState(Platform.OS !== 'web');
  const desktop = shouldUseDesktopSettingsLayout({ platform: Platform.OS, width, webHydrated });
  const requestedSection = settingsSectionFromParam(params.section);
  const [section, setSection] = useState<SettingsSection | null>(requestedSection);
  const activeSection = section ?? (desktop ? requestedSection ?? 'profile' : null);
  const scroll = useRef<ScrollView | null>(null);
  const { snapshot, refresh, clear } = useTogether();
  const { session, signOut, resendPendingEmailChange, signOutOthers } = useAuth();
  const providerState = authProviderState(session?.user);
  const profile = snapshot?.profile;
  const name = profile?.display_name ?? '';
  const [avatarPath, setAvatarPath] = useState<string | null>(profile?.avatar_path ?? null);
  const [busy, setBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<SaveNotice>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [supportVisible, setSupportVisible] = useState(false);
  const avatar = useProfileAvatarUrl(avatarPath);
  useEffect(() => { setWebHydrated(true); }, []);

  useEffect(() => {
    const next = settingsSectionFromParam(params.section);
    if (next) setSection(next);
    else if (!desktop) setSection(null);
  }, [desktop, params.section]);

  useEffect(() => {
    setAvatarPath(profile?.avatar_path ?? null);
  }, [profile?.avatar_path]);

  const close = () => settingsCloseTarget(router.canGoBack()) === 'back' ? router.back() : router.replace('/home' as never);
  const selectSection = (next: SettingsSection) => {
    if (next === activeSection) return;
    setSection(next);
    router.setParams({ section: next });
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const showOverview = () => {
    setSection(null);
    router.setParams({ section: undefined });
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const openRoute = (route: string) => {
    // React Navigation hides the outgoing screen immediately. Release focus
    // first so assistive technology never sees a focused control inside an
    // aria-hidden Settings surface.
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    router.push(route as never);
  };

  const chooseAvatarSource = () => {
    if (busy) return;
    if (Platform.OS === 'web') { void pickAvatar('library'); return; }
    Alert.alert('Account photo', 'Choose an existing photo or take a new one.', [
      { text: 'Choose from library', onPress: () => void pickAvatar('library') },
      { text: 'Take photo', onPress: () => void pickAvatar('camera') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickAvatar = async (source: 'camera' | 'library') => {
    const permission = Platform.OS === 'web' ? { granted: true } : source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(source === 'camera' ? 'Camera permission needed' : 'Photo permission needed', source === 'camera' ? 'Allow camera access to take an account photo.' : 'Allow photo access to choose your account photo.');
      return;
    }
    const options = { ...userImagePickerOptions(source), allowsEditing: true, aspect: [1, 1] as [number, number] };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0] || !session) return;
    setBusy(true);
    setSaveNotice(null);
    let normalized: NormalizedUserImage | null = null;
    let uploadedPath: string | null = null;
    try {
      const asset = result.assets[0];
      normalized = await normalizeUserImage({ uri: asset.uri, width: asset.width, height: asset.height, fileSize: asset.fileSize, fileName: asset.fileName }, .84, 512);
      const path = `${session.user.id}/avatar-${createClientRequestId()}.jpg`;
      const blob = await (await fetch(normalized.uri)).blob();
      const { error } = await supabase.storage.from('together-user-media').upload(path, blob, { contentType: normalized.mimeType, upsert: false, cacheControl: '31536000' });
      if (error) throw error;
      uploadedPath = path;
      await manageAccount({ action: 'avatar', avatarPath: path });
      setAvatarPath(path);
      setSaveNotice({ kind: 'success', message: 'Account photo updated.' });
      await refresh();
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('together-user-media').remove([uploadedPath]);
      setSaveNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Your avatar could not be uploaded. Please try again.' });
    } finally { cleanupNormalizedImage(normalized?.uri); setBusy(false); }
  };

  const removeAvatar = async () => {
    if (!profile?.avatar_path || busy) return;
    setBusy(true); setSaveNotice(null);
    try {
      await manageAccount({ action: 'avatar', avatarPath: null });
      setAvatarPath(null);
      setSaveNotice({ kind: 'success', message: 'Account photo removed.' });
      await refresh();
    } catch (error) { setSaveNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Your avatar could not be removed. Please try again.' }); }
    finally { setBusy(false); }
  };

  const performLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await startSignOutTransition({
        signOut,
        clearPrivateState: clear,
        openSignIn: () => router.replace('/auth?mode=signin'),
      });
    } catch (error) {
      Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSigningOut(false); }
  };
  const logout = () => confirmAction({
    title: 'Sign out?',
    message: 'Your relationships and memories will still be here when you return.',
    confirmLabel: 'Sign out',
    destructive: true,
    onConfirm: performLogout,
  });

  const modalHeight = desktop ? Math.max(520, height - 36) : height;
  const browserPath = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : null;
  if (!shouldRenderSettingsRoute({ platform: Platform.OS, routerPathname: pathname, browserPathname: browserPath })) return null;

  const settingsSurface = <View style={[styles.backdrop, desktop && styles.backdropDesktop]} accessibilityViewIsModal={!desktop}>
    <FrostedBackdrop intensity={desktop ? 72 : 22} />
    <View pointerEvents="none" style={styles.ambientOne} />
    <View pointerEvents="none" style={styles.ambientTwo} />
    <Pressable accessible={false} onPress={close} style={StyleSheet.absoluteFill} />
    <FrostedSurface intensity={68} style={[styles.modal, desktop ? styles.modalDesktop : styles.modalMobile, { height: modalHeight }]}>
      <View style={[styles.header, !desktop && { paddingTop: Math.max(insets.top, 8), minHeight: 72 + Math.max(insets.top, 8) }]}>
        <View style={styles.brandMark}><Text style={styles.brandInitial}>{(name || 'Y')[0]?.toUpperCase()}</Text></View>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>Settings</Text>
          <Text numberOfLines={1} style={styles.headerMeta}>{(snapshot?.activePersona?.display_name ?? name) || 'Your Kivelle account'} · {snapshot?.activeContinuity?.title ?? 'Main Life'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={close} hitSlop={6} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><X size={22} color={colors.textSecondary} /></Pressable>
      </View>

      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {desktop ? <View style={styles.sidebar}>
          <Text style={styles.sidebarEyebrow}>SETTINGS</Text>
          <View role={'tablist' as never} aria-label="Settings sections" style={styles.sidebarLinks}>{sections.map((item) => <SectionTab key={item.id} item={item} active={activeSection === item.id} onPress={() => selectSection(item.id)} />)}</View>
          <LogoutButton signingOut={signingOut} onPress={logout} />
        </View> : null}

        <View style={styles.contentColumn}>
          {!desktop && activeSection ? <View style={styles.mobileSectionHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to all settings" onPress={showOverview} hitSlop={6} style={({ pressed }) => [styles.mobileBack, pressed && styles.pressed]}><ArrowLeft size={21} color={colors.text} /></Pressable>
            <Text numberOfLines={1} style={styles.mobileSectionTitle}>{sections.find((item) => item.id === activeSection)?.label}</Text>
          </View> : null}

          <ScrollView
            ref={scroll}
            style={styles.main}
            contentContainerStyle={[styles.mainContent, desktop && styles.mainContentDesktop, !desktop && { paddingBottom: Math.max(54, insets.bottom + 34) }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {!snapshot ? <LoadingSkeleton label="Loading your settings…" /> : activeSection ? <>
              {activeSection === 'profile' ? <AccountProfilePanel key={snapshot.activeContinuity?.id ?? 'main'} snapshot={snapshot} avatar={avatar} avatarPath={avatarPath} name={name} busy={busy} notice={saveNotice} email={session?.user.email} onAvatar={chooseAvatarSource} onRemoveAvatar={() => void removeAvatar()} onRoute={openRoute} /> : null}
              {activeSection === 'account' ? <AccountPanel email={session?.user.email} providerLabel={providerState.label} verified={providerState.verifiedEmail} pendingEmail={providerState.pendingEmail} tier={subscriptionLabel(snapshot.entitlements?.tier)} onRoute={openRoute} onResend={() => void resendPendingEmailChange().then(() => Alert.alert('Confirmation sent', 'Check the new email address.')).catch((error) => Alert.alert('Could not send email', error.message))} onSignOutOthers={() => Alert.alert('Sign out everywhere else?', 'This device will remain signed in.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out others', style: 'destructive', onPress: () => void signOutOthers().then(() => Alert.alert('Other sessions signed out.')).catch((error) => Alert.alert('Could not update sessions', error.message)) }])} /> : null}
              {activeSection === 'identity' ? <IdentityPanel snapshot={snapshot} onRoute={openRoute} /> : null}
              {activeSection === 'experience' ? <ExperiencePanel snapshot={snapshot} onRoute={openRoute} /> : null}
              {activeSection === 'relationships' ? <RelationshipsPanel snapshot={snapshot} onRoute={openRoute} /> : null}
              {activeSection === 'privacy' ? <PrivacyPanel onRoute={openRoute} onDisclosure={() => Alert.alert('About Kivelle characters', 'Kivelle companions are fictional AI characters. They can remember shared context and simulate a life, but they are not real people and do not have human consciousness.')} /> : null}
              {activeSection === 'support' ? <SupportPanel onRoute={openRoute} onContact={() => setSupportVisible(true)} /> : null}
            </> : <SettingsOverview snapshot={snapshot} name={name} verified={providerState.verifiedEmail} tier={subscriptionLabel(snapshot.entitlements?.tier)} query={searchQuery} onQuery={setSearchQuery} onSelect={selectSection} signingOut={signingOut} onLogout={logout} />}
          </ScrollView>


        </View>
      </KeyboardAvoidingView>
    </FrostedSurface>
  </View>;
  const settingsModal = desktop
    ? settingsSurface
    : <Modal visible transparent animationType="fade" onRequestClose={close}>{settingsSurface}</Modal>;
  return <>
    {settingsModal}
    <ContactSupportModal visible={supportVisible} email={session?.user.email} onClose={() => setSupportVisible(false)} />
  </>;
}

function SectionTab({ item, active, onPress }: { item: SectionDefinition; active: boolean; onPress: () => void }) {
  return <Pressable nativeID={`settings-section-${item.id}`} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: active }} aria-selected={active} onPress={onPress} style={({ pressed }) => [styles.sidebarLink, active && styles.sidebarLinkActive, pressed && styles.pressed]}>
    <View>{cloneElement(item.icon, { color: active ? '#D59AFF' : colors.muted })}</View><Text style={[styles.sidebarLinkText, active && styles.sidebarLinkTextActive]}>{item.label}</Text>
  </Pressable>;
}

function SettingsOverview({ snapshot, name, verified, tier, query, onQuery, onSelect, signingOut, onLogout }: { snapshot: Snapshot; name: string; verified: boolean; tier: string; query: string; onQuery: (value: string) => void; onSelect: (section: SettingsSection) => void; signingOut: boolean; onLogout: () => void }) {
  const statuses: Partial<Record<SettingsSection, string>> = {
    profile: name || 'Complete profile',
    account: `${tier} · ${verified ? 'Verified' : 'Verify email'}`,
    identity: `${snapshot.continuities?.length ?? 1} ${(snapshot.continuities?.length ?? 1) === 1 ? 'Life' : 'Lives'}`,
    experience: snapshot.notificationPreferences?.push_enabled ? 'Notifications on' : 'Notifications off',
    relationships: `${snapshot.characters.length} ${snapshot.characters.length === 1 ? 'companion' : 'companions'}`,
    privacy: snapshot.profile?.privacy_settings?.analytics === false ? 'Analytics off' : 'Analytics on',
  };
  const filtered = sections.filter((item) => settingsSearchMatches(query, item.label, item.description, item.searchTerms));
  return <View style={styles.panel}>
    <PanelHeading title="All settings" body="Choose an area or search for the control you need." />
    <View style={styles.searchBox}><Search size={19} color={colors.muted} /><TextInput accessibilityLabel="Search settings" value={query} onChangeText={onQuery} placeholder="Search settings" placeholderTextColor={colors.dimmed} returnKeyType="search" style={styles.searchInput} />{query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear settings search" onPress={() => onQuery('')} hitSlop={8}><X size={18} color={colors.muted} /></Pressable> : null}</View>
    {filtered.length ? <SettingsGroup>{filtered.map((item) => <SettingsRow key={item.id} icon={item.icon} title={item.label} body={item.description} value={statuses[item.id]} onPress={() => onSelect(item.id)} />)}</SettingsGroup> : <View style={styles.emptySearch}><Search size={24} color={colors.muted} /><Text style={styles.emptySearchTitle}>No settings found</Text><Text style={styles.emptySearchBody}>Try a broader word such as “photo,” “privacy,” or “password.”</Text></View>}
    <LogoutButton signingOut={signingOut} onPress={onLogout} mobile />
  </View>;
}

function AccountPanel({ email, providerLabel, verified, pendingEmail, tier, onRoute, onResend, onSignOutOthers }: { email?: string; providerLabel: string; verified: boolean; pendingEmail: string | null; tier: string; onRoute: (route: string) => void; onResend: () => void; onSignOutOthers: () => void }) {
  return <View style={styles.panel}><PanelHeading title="Account & billing" body="Manage sign-in, subscription, credits, and account security." />
    <View style={styles.summaryCard}><View style={styles.summaryIcon}><KeyRound color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.summaryKicker}>{providerLabel.toUpperCase()}</Text><Text style={styles.summaryTitle}>{email ?? 'Your Kivelle account'}</Text><View style={styles.verified}><Check size={12} color={verified ? colors.success : colors.warm} /><Text style={[styles.verifiedText, { color: verified ? colors.success : colors.warm }]}>{verified ? 'Verified email' : 'Email verification pending'}</Text></View>{pendingEmail ? <Text style={styles.verifiedText}>Pending change: {pendingEmail}</Text> : null}</View></View>
    <SettingsGroup>
      <SettingsRow icon={<UserRound />} title="Account & security" body="Change your email or manage active sessions." onPress={() => onRoute('/account')} />
      {pendingEmail ? <SettingsRow icon={<Check />} title="Resend email confirmation" body="Send another confirmation link to your new address." value="Pending" onPress={onResend} /> : null}
      <SettingsRow icon={<CreditCard />} title="Subscription & credits" body="Manage your plan, allowances, and credit balance." value={tier} onPress={() => onRoute('/subscription')} />
      <SettingsRow icon={<Shield />} title="Other sessions" body="Sign out other browser and mobile sessions." value="Sign out" onPress={onSignOutOthers} />
    </SettingsGroup>
  </View>;
}

function IdentityPanel({ snapshot, onRoute }: { snapshot: Snapshot; onRoute: (route: string) => void }) {
  const persona = snapshot.activePersona;
  const life = snapshot.activeContinuity;
  const lifeCount = snapshot.continuities?.length ?? 1;
  return <View style={styles.panel}><PanelHeading title="Personas & Lives" body="A Persona defines who you are. A Life keeps that identity’s relationships and history isolated." />
    <View style={styles.lifeHero}><View style={styles.lifeAvatar}><Text style={styles.lifeInitial}>{(persona?.display_name ?? snapshot.profile?.display_name ?? 'Y')[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.summaryKicker}>{life?.kind === 'alternate' ? 'ACTIVE ALTERNATE LIFE' : 'ACTIVE MAIN LIFE'}</Text><Text style={styles.lifeName}>{persona?.display_name ?? snapshot.profile?.display_name ?? 'You'}</Text><Text style={styles.lifeMeta}>{[persona?.occupation, persona?.age].filter(Boolean).join(' · ') || life?.title || 'Main Life'}</Text></View><View style={styles.activePill}><Check size={12} color="#fff" /><Text style={styles.activePillText}>ACTIVE</Text></View></View>
    <SettingsGroup><SettingsRow icon={<Sparkles />} title="Manage Personas & Lives" body="Switch identities or create another separate Life." value={`${lifeCount} ${lifeCount === 1 ? 'Life' : 'Lives'}`} onPress={() => onRoute('/personas')} /><SettingsRow icon={<UserRound />} title="Edit active Persona" body="Name, pronouns, occupation, interests, and in-world identity." onPress={() => onRoute(`/persona-editor?persona=${persona?.id ?? ''}`)} /></SettingsGroup>
    <InfoCard title="Why this is separate">Your account is how you sign in. Your Persona is who companions know inside this Life. Switching Personas never relabels an existing relationship.</InfoCard>
  </View>;
}

function ExperiencePanel({ snapshot, onRoute }: { snapshot: Snapshot; onRoute: (route: string) => void }) {
  const media = snapshot.profile?.multimodal_preferences;
  const enabledMedia = [media?.userPhotoUploads !== false, media?.generatedPhotos !== false, media?.generatedVideos !== false, media?.companionVoiceNotes !== false, media?.liveVoiceCalls !== false].filter(Boolean).length;
  return <View style={styles.panel}><PanelHeading title="Chat & media" body="Choose how Kivelle communicates and which relationship experiences appear." /><SettingsGroup>
    <SettingsRow icon={<Heart />} title="Content preferences" body="Relationship tone and romantic interactions." value={snapshot.profile?.content_preferences?.romanceEnabled === false ? 'Friendship only' : 'Romance on'} onPress={() => onRoute('/content-settings')} />
    <SettingsRow icon={<Bell />} title="Notifications" body="Push alerts, initiative, reminders, and quiet hours." value={snapshot.notificationPreferences?.push_enabled ? 'On' : 'Off'} onPress={() => onRoute('/notifications')} />
    <SettingsRow icon={<Camera />} title="Companion photos" body="Contextual photos and automatic photo moments." value={snapshot.profile?.photo_preferences?.companionPhotos === false ? 'Off' : 'On'} onPress={() => onRoute('/photo-settings')} />
    <SettingsRow icon={<Volume2 />} title="Photos, video, voice & calls" body="Photo sharing, generated media, voice notes, autoplay, and live calls." value={`${enabledMedia}/5 on`} onPress={() => onRoute('/media-preferences')} />
  </SettingsGroup><InfoCard title="Your controls are canonical">These settings constrain what Kivelle may generate. They never override character boundaries, relationship state, or safety rules.</InfoCard></View>;
}

function RelationshipsPanel({ snapshot, onRoute }: { snapshot: Snapshot; onRoute: (route: string) => void }) {
  const companion = activeCompanion(snapshot);
  const memoryCount = companion ? snapshot.memoryCounts?.[companion.id] ?? snapshot.memories.filter((item) => item.character_instance_id === companion.id).length : 0;
  return <View style={styles.panel}><PanelHeading title="Relationships" body="Manage companions, shared history, and the memories that shape each relationship." />
    <View style={styles.metricRow}><Metric value={snapshot.characters.length} label="Companions" /><Metric value={snapshot.moments.length} label="Moments" /><Metric value={snapshot.sharedPlans.filter((plan) => ['scheduled', 'active'].includes(plan.status)).length} label="Upcoming" /></View>
    <SettingsGroup><SettingsRow icon={<UsersRound />} title="Your companions" body="Switch the active relationship or meet someone new." value={`${snapshot.characters.length}`} onPress={() => onRoute('/companions')} /><SettingsRow icon={<MessageCircle />} title="Conversations & resets" body="Conversation history, fresh threads, and complete character reset." onPress={() => onRoute('/conversation-controls')} /><SettingsRow icon={<Archive />} title="Archived chats" body="Restore deleted chats for up to 30 days." onPress={() => onRoute('/archived-chats')} /><SettingsRow icon={<Brain />} title="Memory Center" body={companion ? `Review memories with ${companion.together_character_templates.name}.` : 'Review and control relationship memories.'} value={companion ? `${memoryCount}` : undefined} onPress={() => onRoute('/memories')} /></SettingsGroup>
  </View>;
}

function PrivacyPanel({ onRoute, onDisclosure }: { onRoute: (route: string) => void; onDisclosure: () => void }) {
  return <View style={styles.panel}><PanelHeading title="Privacy & safety" body="Control your data, understand Kivelle’s safeguards, and review the policies that protect your account." />
    <Text style={styles.groupLabel}>YOUR DATA</Text><SettingsGroup><SettingsRow icon={<Shield />} title="Privacy and data controls" body="Personalization, analytics, memory controls, export, and account deletion." onPress={() => onRoute('/privacy')} /><SettingsRow icon={<Shield />} title="Community & Safety Guidelines" body="Rules for age, content, real people, and reports." onPress={() => onRoute('/community-guidelines')} /><SettingsRow icon={<FileText />} title="AI character disclosure" body="How fictional Kivelle characters and simulation work." onPress={onDisclosure} /></SettingsGroup>
    <Text style={styles.groupLabel}>POLICIES</Text><SettingsGroup><SettingsRow icon={<FileText />} title="Privacy Policy" body="How Kivelle processes, protects, and retains information." onPress={() => onRoute('/privacy-policy')} /><SettingsRow icon={<FileText />} title="Terms of Service" body="Account, billing, content, and acceptable use." onPress={() => onRoute('/terms')} /><SettingsRow icon={<CreditCard />} title="Refund & Cancellation Policy" body="Subscriptions, credit packs, failed generations, and refunds." onPress={() => onRoute('/refund-policy')} /></SettingsGroup>
    <Text style={styles.version}>Kivelle.AI</Text>
  </View>;
}

function SupportPanel({ onRoute, onContact }: { onRoute: (route: string) => void; onContact: () => void }) {
  return <View style={styles.panel}><PanelHeading title="Help & support" body="Find answers, contact the support team, or review an existing request." /><SettingsGroup><SettingsRow icon={<LifeBuoy />} title="Help center" body="Answers for accounts, conversations, media, billing, privacy, and safety." onPress={() => onRoute('/help')} /><SettingsRow icon={<MessageCircle />} title="Contact support" body="Send a private request to the support team." onPress={onContact} /></SettingsGroup><InfoCard title="For a specific chat message">Use the message menu in chat to report a generated response. Support requests never attach unrelated conversation history.</InfoCard></View>;
}

function LogoutButton({ signingOut, onPress, mobile = false }: { signingOut: boolean; onPress: () => void; mobile?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Sign out" accessibilityState={{ disabled: signingOut }} disabled={signingOut} onPress={onPress} style={({ pressed }) => [styles.logoutButton, mobile && styles.logoutButtonMobile, signingOut && styles.logoutButtonDisabled, pressed && styles.pressed]}><LogOut size={18} color={colors.danger} /><Text style={styles.logoutButtonText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text></Pressable>;
}

function PanelHeading({ title, body }: { title: string; body: string }) { return <View style={styles.panelHeading}><Text accessibilityRole="header" style={styles.panelTitle}>{title}</Text><Text style={styles.panelBody}>{body}</Text></View>; }
function SettingsGroup({ children }: { children: ReactNode }) { return <View style={styles.group}>{children}</View>; }
function SettingsRow({ icon, title, body, value, onPress, danger = false, disabled = false }: { icon: ReactElement<{ color?: string; size?: number }>; title: string; body?: string; value?: string; onPress: () => void; danger?: boolean; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.settingRow, disabled && styles.disabledRow, pressed && styles.rowPressed]}><View style={styles.rowIcon}>{cloneElement(icon, { color: danger ? colors.danger : colors.muted, size: 20 })}</View><View style={styles.rowCopy}><Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>{body ? <Text style={styles.rowBody}>{body}</Text> : null}</View>{value ? <Text numberOfLines={1} style={[styles.rowValue, danger && styles.rowValueDanger]}>{value}</Text> : null}<ChevronRight size={18} color={danger ? colors.danger : colors.textSecondary} /></Pressable>; }
function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function InfoCard({ title, children }: { title: string; children: ReactNode }) { return <View style={styles.infoCard}><Text style={styles.infoTitle}>{title}</Text><Text style={styles.infoBody}>{children}</Text></View>; }

function subscriptionLabel(tier?: string | null) { if (tier === 'kivelle_max' || tier === 'unlimited') return 'Kivelle Max'; if (tier === 'kivelle_plus' || tier === 'together_plus') return 'Kivelle+'; return 'Kivelle Free'; }

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: 'rgba(5,4,8,.18)' },
  // Reserve the rail's full hover width so it can never cover Settings' own
  // section navigation or steal its pointer events while expanded.
  backdropDesktop: { ...(Platform.OS === 'web' ? ({ position: 'fixed', top: 0, right: 0, bottom: 0, left: DESKTOP_SIDEBAR_EXPANDED_WIDTH, zIndex: 1200, padding: 18, backgroundColor: 'rgba(4,3,7,.12)' } as never) : {}) },
  ambientOne: { position: 'absolute', width: 600, height: 600, borderRadius: 300, backgroundColor: 'rgba(126,83,151,.055)', top: -250, right: -120, ...(Platform.OS === 'web' ? ({ filter: 'blur(100px)' } as never) : {}) },
  ambientTwo: { position: 'absolute', width: 520, height: 520, borderRadius: 260, backgroundColor: 'rgba(167,85,121,.038)', bottom: -240, left: -140, ...(Platform.OS === 'web' ? ({ filter: 'blur(105px)' } as never) : {}) },
  modal: { width: '100%', backgroundColor: 'rgba(20,17,25,.54)', overflow: 'hidden', borderColor: 'rgba(255,255,255,.115)' },
  modalDesktop: { width: '96%', maxWidth: 1480, borderRadius: 24, borderWidth: 1, shadowColor: '#000', shadowOpacity: .48, shadowRadius: 44, shadowOffset: { width: 0, height: 22 } },
  modalMobile: { borderRadius: 0, backgroundColor: 'rgba(17,15,22,.96)' },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.085)', backgroundColor: 'rgba(18,16,22,.24)' },
  brandMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(151,116,171,.085)', borderWidth: 1, borderColor: 'rgba(204,176,221,.18)' },
  brandInitial: { color: '#CFB6DD', fontFamily: typography.display, fontSize: 18 },
  headerCopy: { flex: 1, minWidth: 0 }, title: { color: colors.text, fontFamily: typography.display, fontWeight: '600', fontSize: 25 },
  headerMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  close: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.018)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  pressed: { opacity: .72, transform: [{ scale: .98 }] },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 }, contentColumn: { flex: 1, minWidth: 0 },
  sidebar: { width: 280, paddingTop: 18, paddingBottom: spacing.lg, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,.075)', backgroundColor: 'rgba(11,10,14,.23)' },
  sidebarEyebrow: { color: colors.textSecondary, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10, paddingHorizontal: 24 },
  sidebarLinks: { gap: 2 }, sidebarLink: { minHeight: 56, paddingHorizontal: 24, borderLeftWidth: 3, borderLeftColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 13 },
  sidebarLinkActive: { backgroundColor: 'rgba(139,100,158,.13)', borderLeftColor: 'rgba(206,168,224,.72)' },
  sidebarLinkText: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' }, sidebarLinkTextActive: { color: '#F1E7F3' },
  logoutButton: { minHeight: 48, marginTop: 'auto', marginHorizontal: 18, paddingHorizontal: 14, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: 'rgba(255,113,129,.055)', borderWidth: 1, borderColor: 'rgba(255,113,129,.2)' },
  logoutButtonMobile: { width: '100%', maxWidth: 780, alignSelf: 'center', marginTop: 2, marginHorizontal: 0 }, logoutButtonDisabled: { opacity: .55 }, logoutButtonText: { color: colors.danger, fontSize: 13, fontWeight: '900' },
  mobileSectionHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: 'rgba(12,10,16,.36)' },
  mobileBack: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, mobileSectionTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '900' },
  main: { flex: 1 }, mainContent: { flexGrow: 1, padding: spacing.xl, paddingBottom: 70 }, mainContentDesktop: { paddingTop: 38, paddingHorizontal: 34, paddingBottom: 76 },
  panel: { width: '100%', maxWidth: 1060, alignSelf: 'flex-start', gap: 24 },
  panelHeading: { gap: 8, marginBottom: 4 }, panelTitle: { color: colors.text, fontFamily: typography.display, fontSize: 37, fontWeight: '600' }, panelBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, maxWidth: 760 },
  searchBox: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,.11)', backgroundColor: 'rgba(8,7,11,.35)' }, searchInput: { flex: 1, minHeight: 50, color: colors.text, fontSize: 15, outlineStyle: 'none' } as never,
  emptySearch: { minHeight: 210, alignItems: 'center', justifyContent: 'center', padding: 28, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,.018)' }, emptySearchTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 12 }, emptySearchBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  summaryCard: { minHeight: 110, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: 'rgba(104,82,116,.075)', borderWidth: 1, borderColor: 'rgba(217,192,228,.11)' }, summaryIcon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,126,172,.075)' }, summaryKicker: { color: '#CCB5D7', fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1 }, summaryTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 }, verified: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, verifiedText: { fontSize: 11, fontWeight: '800' },
  groupLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginBottom: -14, paddingLeft: 4 },
  group: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.085)', backgroundColor: 'rgba(255,255,255,.014)' },
  settingRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.065)' }, disabledRow: { opacity: .55 }, rowPressed: { backgroundColor: 'rgba(155,126,172,.055)' }, rowIcon: { width: 26, height: 36, alignItems: 'center', justifyContent: 'center' }, rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800' }, rowTitleDanger: { color: colors.danger }, rowBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 }, rowValue: { maxWidth: 132, color: '#CCB5D7', fontSize: 11.5, fontWeight: '800', textAlign: 'right' }, rowValueDanger: { color: colors.danger },
  lifeHero: { minHeight: 120, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: 'rgba(108,84,116,.075)', borderWidth: 1, borderColor: 'rgba(219,190,220,.11)' }, lifeAvatar: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18,16,22,.56)', borderWidth: 1, borderColor: 'rgba(211,174,214,.23)' }, lifeInitial: { color: '#C9ADCC', fontFamily: typography.display, fontSize: 30 }, lifeName: { color: colors.text, fontFamily: typography.display, fontSize: 26, marginTop: 2 }, lifeMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 }, activePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(125,92,145,.72)' }, activePillText: { color: '#fff', fontSize: 9.5, fontWeight: '900' },
  infoCard: { padding: 17, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: colors.border }, infoTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, infoBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  metricRow: { flexDirection: 'row', gap: 10 }, metric: { flex: 1, minHeight: 88, justifyContent: 'center', padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.028)', borderWidth: 1, borderColor: colors.border }, metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 29 }, metricLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', marginTop: 3 }, version: { color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 6 },
});
