import { cloneElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
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
import { Image } from 'expo-image';
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
import { cleanupNormalizedImage, normalizeUserImage, type NormalizedUserImage } from '../src/lib/imageUploads';
import { colors, radius, spacing, typography } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { useAuth } from '../src/hooks/useAuth';
import { authProviderState } from '../src/lib/authProviders';
import { activeCompanion } from '../src/lib/companionLife';
import { manageAccount } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import { confirmAction } from '../src/lib/dialogs';
import { shouldRenderSettingsRoute, shouldUseDesktopSettingsLayout } from '../src/lib/settingsRoute';
import { startSignOutTransition } from '../src/lib/signOutTransition';
import {
  normalizeProfileDraft,
  profileDraftChanged,
  settingsCloseTarget,
  settingsSearchMatches,
  settingsSectionFromParam,
  type ProfileDraft,
  type SettingsSection,
} from '../src/lib/settingsExperience';
import { FrostedBackdrop, FrostedSurface, GradientButton, LoadingSkeleton } from '../src/components';

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
  { id: 'profile', label: 'Your profile', description: 'Your name, introduction, interests, and account photo.', searchTerms: 'avatar bio about goals', icon: <UserRound size={20} /> },
  { id: 'account', label: 'Account & billing', description: 'Sign-in, subscription, credits, and active devices.', searchTerms: 'email password security payment plan verification', icon: <KeyRound size={20} /> },
  { id: 'identity', label: 'Personas & Lives', description: 'Manage who companions know in each separate Life.', searchTerms: 'persona identity alternate main life', icon: <Sparkles size={20} /> },
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
  const [name, setName] = useState(profile?.display_name ?? '');
  const [about, setAbout] = useState(profile?.about_me ?? '');
  const [interests, setInterests] = useState((profile?.interests ?? []).join(', '));
  const [goals, setGoals] = useState((profile?.experience_goals ?? []).join(', '));
  const [savedDraft, setSavedDraft] = useState<ProfileDraft | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncMainPersona, setSyncMainPersona] = useState(true);
  const [saveNotice, setSaveNotice] = useState<SaveNotice>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const profileHydrated = useRef(false);
  const draft = useMemo(() => ({ name, about, interests, goals }), [about, goals, interests, name]);
  const dirty = profileDraftChanged(savedDraft, draft);

  useEffect(() => { setWebHydrated(true); }, []);

  useEffect(() => {
    const next = settingsSectionFromParam(params.section);
    if (next) setSection(next);
    else if (!desktop) setSection(null);
  }, [desktop, params.section]);

  useEffect(() => {
    if (!profile || profileHydrated.current) return;
    profileHydrated.current = true;
    const next = normalizeProfileDraft({
      name: profile.display_name ?? '',
      about: profile.about_me ?? '',
      interests: (profile.interests ?? []).join(', '),
      goals: (profile.experience_goals ?? []).join(', '),
    });
    setName(next.name);
    setAbout(next.about);
    setInterests(next.interests);
    setGoals(next.goals);
    setSavedDraft(next);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    const path = profile?.avatar_path;
    if (!path) { setAvatar(null); return; }
    void supabase.storage.from('together-user-media').createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setAvatar(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [profile?.avatar_path]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty || typeof window === 'undefined') return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  const afterDiscardCheck = (action: () => void) => {
    if (!dirty) { action(); return; }
    confirmAction({
      title: 'Discard profile changes?',
      message: 'Your unsaved profile edits will be lost.',
      confirmLabel: 'Discard changes',
      destructive: true,
      onConfirm: action,
    });
  };
  const close = () => afterDiscardCheck(() => settingsCloseTarget(router.canGoBack()) === 'back' ? router.back() : router.replace('/home' as never));
  const selectSection = (next: SettingsSection) => {
    if (next === activeSection) return;
    afterDiscardCheck(() => {
      setSection(next);
      router.setParams({ section: next });
      scroll.current?.scrollTo({ y: 0, animated: false });
    });
  };
  const showOverview = () => afterDiscardCheck(() => {
    setSection(null);
    router.setParams({ section: undefined });
    scroll.current?.scrollTo({ y: 0, animated: false });
  });
  const openRoute = (route: string) => afterDiscardCheck(() => router.push(route as never));

  const saveProfile = async () => {
    const next = normalizeProfileDraft(draft);
    if (!next.name || !dirty) return;
    setBusy(true);
    setSaveNotice(null);
    try {
      await manageAccount({
        action: 'profile',
        displayName: next.name,
        aboutMe: next.about,
        interests: splitList(next.interests, 10),
        goals: splitList(next.goals, 4),
        avatarPath: profile?.avatar_path ?? null,
        syncMainPersona,
      });
      setName(next.name);
      setAbout(next.about);
      setInterests(next.interests);
      setGoals(next.goals);
      setSavedDraft(next);
      setSaveNotice({ kind: 'success', message: 'Profile saved.' });
      await refresh();
    } catch (error) {
      setSaveNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Your profile could not be saved. Please try again.' });
    } finally { setBusy(false); }
  };

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to choose your account avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (result.canceled || !result.assets[0] || !session) return;
    setBusy(true);
    setSaveNotice(null);
    let normalized: NormalizedUserImage | null = null;
    let uploadedPath: string | null = null;
    try {
      const asset = result.assets[0];
      normalized = await normalizeUserImage({ uri: asset.uri, width: asset.width, height: asset.height, fileSize: asset.fileSize, fileName: asset.fileName }, .9);
      const path = `${session.user.id}/avatar-${Date.now()}.jpg`;
      const blob = await (await fetch(normalized.uri)).blob();
      const { error } = await supabase.storage.from('together-user-media').upload(path, blob, { contentType: normalized.mimeType, upsert: false, cacheControl: '31536000' });
      if (error) throw error;
      uploadedPath = path;
      // Avatar changes save immediately, but never smuggle unsaved form edits
      // into the account update.
      await manageAccount({
        action: 'profile',
        displayName: profile?.display_name || 'You',
        aboutMe: profile?.about_me?.trim() ?? '',
        interests: profile?.interests ?? [],
        goals: profile?.experience_goals ?? [],
        avatarPath: path,
        syncMainPersona,
      });
      const { data: signed } = await supabase.storage.from('together-user-media').createSignedUrl(path, 3600);
      setAvatar(signed?.signedUrl ?? avatar);
      setSaveNotice({ kind: 'success', message: dirty ? 'Avatar updated. Your other profile edits are still unsaved.' : 'Avatar updated.' });
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
      await manageAccount({ action: 'profile', displayName: profile.display_name || 'You', aboutMe: profile.about_me?.trim() ?? '', interests: profile.interests ?? [], goals: profile.experience_goals ?? [], avatarPath: null, syncMainPersona });
      setAvatar(null);
      setSaveNotice({ kind: 'success', message: dirty ? 'Avatar removed. Your other profile edits are still unsaved.' : 'Avatar removed.' });
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
  const logout = () => afterDiscardCheck(() => confirmAction({
    title: 'Sign out?',
    message: 'Your relationships and memories will still be here when you return.',
    confirmLabel: 'Sign out',
    destructive: true,
    onConfirm: performLogout,
  }));

  const modalHeight = desktop ? Math.max(520, height - 36) : height;
  const browserPath = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : null;
  if (!shouldRenderSettingsRoute({ platform: Platform.OS, routerPathname: pathname, browserPathname: browserPath })) return null;

  return <Modal visible transparent animationType="fade" onRequestClose={close}><View style={[styles.backdrop, desktop && styles.backdropDesktop]} accessibilityViewIsModal>
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
          <View style={styles.sidebarLinks}>{sections.map((item) => <SectionTab key={item.id} item={item} active={activeSection === item.id} onPress={() => selectSection(item.id)} />)}</View>
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
            contentContainerStyle={[styles.mainContent, desktop && styles.mainContentDesktop, !desktop && { paddingBottom: activeSection === 'profile' ? 120 : Math.max(54, insets.bottom + 34) }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {!snapshot ? <LoadingSkeleton label="Loading your settings…" /> : activeSection ? <>
              {activeSection === 'profile' ? <ProfilePanel avatar={avatar} name={name} setName={(value) => { setSaveNotice(null); setName(value); }} about={about} setAbout={(value) => { setSaveNotice(null); setAbout(value); }} interests={interests} setInterests={(value) => { setSaveNotice(null); setInterests(value); }} goals={goals} setGoals={(value) => { setSaveNotice(null); setGoals(value); }} syncMainPersona={syncMainPersona} setSyncMainPersona={setSyncMainPersona} busy={busy} dirty={dirty} notice={saveNotice} email={session?.user.email} onAvatar={() => void pickAvatar()} onRemoveAvatar={() => void removeAvatar()} onSave={() => void saveProfile()} showInlineSave={desktop} /> : null}
              {activeSection === 'account' ? <AccountPanel email={session?.user.email} providerLabel={providerState.label} verified={providerState.verifiedEmail} pendingEmail={providerState.pendingEmail} tier={subscriptionLabel(snapshot.entitlements?.tier)} onRoute={openRoute} onResend={() => void resendPendingEmailChange().then(() => Alert.alert('Confirmation sent', 'Check the new email address.')).catch((error) => Alert.alert('Could not send email', error.message))} onSignOutOthers={() => Alert.alert('Sign out everywhere else?', 'This device will remain signed in.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out others', style: 'destructive', onPress: () => void signOutOthers().then(() => Alert.alert('Other sessions signed out.')).catch((error) => Alert.alert('Could not update sessions', error.message)) }])} /> : null}
              {activeSection === 'identity' ? <IdentityPanel snapshot={snapshot} onRoute={openRoute} /> : null}
              {activeSection === 'experience' ? <ExperiencePanel snapshot={snapshot} onRoute={openRoute} /> : null}
              {activeSection === 'relationships' ? <RelationshipsPanel snapshot={snapshot} onRoute={openRoute} /> : null}
              {activeSection === 'privacy' ? <PrivacyPanel onRoute={openRoute} onDisclosure={() => Alert.alert('About Kivelle characters', 'Kivelle companions are fictional AI characters. They can remember shared context and simulate a life, but they are not real people and do not have human consciousness.')} /> : null}
              {activeSection === 'support' ? <SupportPanel onRoute={openRoute} /> : null}
            </> : <SettingsOverview snapshot={snapshot} name={name} verified={providerState.verifiedEmail} tier={subscriptionLabel(snapshot.entitlements?.tier)} query={searchQuery} onQuery={setSearchQuery} onSelect={selectSection} signingOut={signingOut} onLogout={logout} />}
          </ScrollView>

          {!desktop && activeSection === 'profile' && snapshot ? <View style={[styles.mobileSaveBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.mobileSaveCopy}><Text style={styles.mobileSaveTitle}>{dirty ? 'Unsaved changes' : 'Profile up to date'}</Text><Text numberOfLines={1} style={styles.mobileSaveMeta}>{saveNotice?.message ?? (dirty ? 'Save when you’re ready.' : 'Changes will appear across Kivelle.')}</Text></View>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !dirty || !name.trim() }} disabled={busy || !dirty || !name.trim()} onPress={() => void saveProfile()} style={({ pressed }) => [styles.mobileSaveButton, (busy || !dirty || !name.trim()) && styles.mobileSaveButtonDisabled, pressed && styles.pressed]}><Text style={styles.mobileSaveButtonText}>{busy ? 'Saving…' : 'Save'}</Text></Pressable>
          </View> : null}
        </View>
      </KeyboardAvoidingView>
    </FrostedSurface>
  </View></Modal>;
}

function SectionTab({ item, active, onPress }: { item: SectionDefinition; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.sidebarLink, active && styles.sidebarLinkActive, pressed && styles.pressed]}>
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

function ProfilePanel(props: {
  avatar: string | null; name: string; setName: (value: string) => void; about: string; setAbout: (value: string) => void;
  interests: string; setInterests: (value: string) => void; goals: string; setGoals: (value: string) => void;
  syncMainPersona: boolean; setSyncMainPersona: (value: boolean) => void; busy: boolean; dirty: boolean; notice: SaveNotice;
  email?: string; onAvatar: () => void; onRemoveAvatar: () => void; onSave: () => void; showInlineSave: boolean;
}) {
  return <View style={styles.panel}>
    <PanelHeading title="Your profile" body="This is you—not your active companion. Relationship memories and alternate-Life identities remain separate." />
    <View style={styles.profileHero}>
      <Pressable accessibilityRole="button" accessibilityLabel="Change account avatar" accessibilityHint="Your avatar saves immediately" onPress={props.onAvatar} style={styles.avatar}>
        {props.avatar ? <Image source={{ uri: props.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={styles.avatarInitial}>{(props.name || 'Y')[0]?.toUpperCase()}</Text>}
        <View style={styles.camera}><Camera size={14} color="#fff" /></View>
      </Pressable>
      <View style={styles.profileHeroCopy}><Text style={styles.profileName}>{props.name || 'You'}</Text><Text style={styles.profileEmail}>{props.email ?? 'Signed-in Kivelle account'}</Text><Text style={styles.avatarHelper}>Your account avatar saves immediately.</Text><View style={styles.avatarActions}><Pressable accessibilityRole="button" accessibilityLabel="Change account avatar" disabled={props.busy} onPress={props.onAvatar} style={styles.avatarAction}><Text style={styles.avatarActionText}>{props.avatar ? 'Replace photo' : 'Add photo'}</Text></Pressable>{props.avatar ? <Pressable accessibilityRole="button" accessibilityLabel="Remove account avatar" disabled={props.busy} onPress={props.onRemoveAvatar} style={styles.avatarAction}><Text style={styles.avatarRemoveText}>Remove</Text></Pressable> : null}</View></View>
    </View>
    {props.notice ? <View accessibilityRole="alert" style={[styles.saveNotice, props.notice.kind === 'error' && styles.saveNoticeError]}><Text style={[styles.saveNoticeText, props.notice.kind === 'error' && styles.saveNoticeErrorText]}>{props.notice.message}</Text></View> : null}
    <View style={styles.formCard}>
      <Field label="Display name" helper="What companions call you"><TextInput accessibilityLabel="Display name" value={props.name} onChangeText={props.setName} maxLength={50} placeholder="Your name" placeholderTextColor={colors.dimmed} style={styles.input} /></Field>
      <Field label="About you" helper="Up to 280 characters"><TextInput accessibilityLabel="About you" value={props.about} onChangeText={props.setAbout} maxLength={280} multiline textAlignVertical="top" placeholder="A little context about you…" placeholderTextColor={colors.dimmed} style={[styles.input, styles.multiline]} /><Text style={styles.counter}>{props.about.length}/280</Text></Field>
      <View style={styles.twoColumns}>
        <View style={styles.column}><Field label="Interests" helper="Separate with commas"><TextInput accessibilityLabel="Interests" value={props.interests} onChangeText={props.setInterests} placeholder="Music, travel, games" placeholderTextColor={colors.dimmed} style={styles.input} /></Field></View>
        <View style={styles.column}><Field label="What you're here for" helper="Separate with commas"><TextInput accessibilityLabel="What you're here for" value={props.goals} onChangeText={props.setGoals} placeholder="Dating, friendship, stories" placeholderTextColor={colors.dimmed} style={styles.input} /></Field></View>
      </View>
    </View>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: props.syncMainPersona }} onPress={() => props.setSyncMainPersona(!props.syncMainPersona)} style={styles.personaNotice}><View style={[styles.noticeIcon, props.syncMainPersona && styles.noticeIconSelected]}>{props.syncMainPersona ? <Check size={17} color="#fff" /> : <Sparkles size={18} color={colors.violet} />}</View><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>Also update my Main Persona</Text><Text style={styles.noticeCopy}>Syncs these saved profile fields to Main Life. Alternate Lives remain separate.</Text></View></Pressable>
    {props.showInlineSave ? <View style={styles.desktopSaveRow}><View><Text style={styles.desktopSaveTitle}>{props.dirty ? 'Unsaved changes' : 'Everything is up to date'}</Text><Text style={styles.desktopSaveMeta}>{props.dirty ? 'Review and save your profile edits.' : 'The save button activates after a change.'}</Text></View><View style={styles.desktopSaveButton}><GradientButton label={props.busy ? 'Saving…' : 'Save profile'} disabled={props.busy || !props.dirty || !props.name.trim()} onPress={props.onSave} /></View></View> : null}
  </View>;
}

function AccountPanel({ email, providerLabel, verified, pendingEmail, tier, onRoute, onResend, onSignOutOthers }: { email?: string; providerLabel: string; verified: boolean; pendingEmail: string | null; tier: string; onRoute: (route: string) => void; onResend: () => void; onSignOutOthers: () => void }) {
  return <View style={styles.panel}><PanelHeading title="Account & billing" body="Manage sign-in, subscription, credits, and account security." />
    <View style={styles.summaryCard}><View style={styles.summaryIcon}><KeyRound color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.summaryKicker}>{providerLabel.toUpperCase()}</Text><Text style={styles.summaryTitle}>{email ?? 'Your Kivelle account'}</Text><View style={styles.verified}><Check size={12} color={verified ? colors.success : colors.warm} /><Text style={[styles.verifiedText, { color: verified ? colors.success : colors.warm }]}>{verified ? 'Verified email' : 'Email verification pending'}</Text></View>{pendingEmail ? <Text style={styles.verifiedText}>Pending change: {pendingEmail}</Text> : null}</View></View>
    <SettingsGroup>
      <SettingsRow icon={<UserRound />} title="Sign-in & security" body="Change your email, password, or active sessions." onPress={() => onRoute('/account')} />
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

function SupportPanel({ onRoute }: { onRoute: (route: string) => void }) {
  return <View style={styles.panel}><PanelHeading title="Help & support" body="Find answers, contact the support team, or review an existing request." /><SettingsGroup><SettingsRow icon={<LifeBuoy />} title="Help center" body="Answers for accounts, conversations, media, billing, privacy, and safety." onPress={() => onRoute('/help')} /><SettingsRow icon={<MessageCircle />} title="Contact support" body="Send a private request and review its status." onPress={() => onRoute('/support')} /></SettingsGroup><InfoCard title="For a specific chat message">Use the message menu in chat to report a generated response. Support requests never attach unrelated conversation history.</InfoCard></View>;
}

function LogoutButton({ signingOut, onPress, mobile = false }: { signingOut: boolean; onPress: () => void; mobile?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Sign out" accessibilityState={{ disabled: signingOut }} disabled={signingOut} onPress={onPress} style={({ pressed }) => [styles.logoutButton, mobile && styles.logoutButtonMobile, signingOut && styles.logoutButtonDisabled, pressed && styles.pressed]}><LogOut size={18} color={colors.danger} /><Text style={styles.logoutButtonText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text></Pressable>;
}

function PanelHeading({ title, body }: { title: string; body: string }) { return <View style={styles.panelHeading}><Text accessibilityRole="header" style={styles.panelTitle}>{title}</Text><Text style={styles.panelBody}>{body}</Text></View>; }
function Field({ label, helper, children }: { label: string; helper?: string; children: ReactNode }) { return <View style={styles.field}><View style={styles.labelRow}><Text style={styles.label}>{label}</Text>{helper ? <Text style={styles.helper}>{helper}</Text> : null}</View>{children}</View>; }
function SettingsGroup({ children }: { children: ReactNode }) { return <View style={styles.group}>{children}</View>; }
function SettingsRow({ icon, title, body, value, onPress, danger = false, disabled = false }: { icon: ReactElement<{ color?: string; size?: number }>; title: string; body?: string; value?: string; onPress: () => void; danger?: boolean; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.settingRow, disabled && styles.disabledRow, pressed && styles.rowPressed]}><View style={styles.rowIcon}>{cloneElement(icon, { color: danger ? colors.danger : colors.muted, size: 20 })}</View><View style={styles.rowCopy}><Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>{body ? <Text style={styles.rowBody}>{body}</Text> : null}</View>{value ? <Text numberOfLines={1} style={[styles.rowValue, danger && styles.rowValueDanger]}>{value}</Text> : null}<ChevronRight size={18} color={danger ? colors.danger : colors.textSecondary} /></Pressable>; }
function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function InfoCard({ title, children }: { title: string; children: ReactNode }) { return <View style={styles.infoCard}><Text style={styles.infoTitle}>{title}</Text><Text style={styles.infoBody}>{children}</Text></View>; }

function splitList(value: string, limit: number) { return value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, limit); }
function subscriptionLabel(tier?: string | null) { if (tier === 'kivelle_max' || tier === 'unlimited') return 'Kivelle Max'; if (tier === 'kivelle_plus' || tier === 'together_plus') return 'Kivelle+'; return 'Kivelle Free'; }

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: 'rgba(5,4,8,.18)' },
  backdropDesktop: { ...(Platform.OS === 'web' ? ({ position: 'fixed', inset: 0, zIndex: 1200, padding: 18, backgroundColor: 'rgba(4,3,7,.12)' } as never) : {}) },
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
  profileHero: { minHeight: 130, flexDirection: 'row', alignItems: 'center', gap: 18, padding: 20, borderRadius: radius.lg, backgroundColor: 'rgba(104,82,116,.09)', borderWidth: 1, borderColor: 'rgba(217,192,228,.12)' },
  avatar: { width: 90, height: 90, borderRadius: 45, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,14,18,.74)', borderWidth: 1, borderColor: 'rgba(218,188,230,.26)' },
  avatarInitial: { color: '#C7A8D5', fontFamily: typography.display, fontSize: 38 }, camera: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(125,92,145,.88)' },
  profileHeroCopy: { flex: 1, alignItems: 'flex-start' }, profileName: { color: colors.text, fontFamily: typography.display, fontSize: 27 }, profileEmail: { color: colors.textSecondary, fontSize: 13, marginTop: 3 }, avatarHelper: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 8 }, avatarActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }, avatarAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 11, backgroundColor: 'rgba(151,116,171,.1)', borderWidth: 1, borderColor: 'rgba(204,176,221,.18)' }, avatarActionText: { color: colors.violet, fontSize: 12, fontWeight: '900' }, avatarRemoveText: { color: colors.danger, fontSize: 12, fontWeight: '900' },
  saveNotice: { paddingHorizontal: 15, paddingVertical: 12, borderRadius: radius.md, backgroundColor: 'rgba(85,194,150,.09)', borderWidth: 1, borderColor: 'rgba(85,194,150,.24)' }, saveNoticeError: { backgroundColor: 'rgba(255,113,129,.07)', borderColor: 'rgba(255,113,129,.24)' }, saveNoticeText: { color: colors.success, fontSize: 12, fontWeight: '800' }, saveNoticeErrorText: { color: colors.danger },
  formCard: { gap: 16, padding: 20, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.018)', borderWidth: 1, borderColor: 'rgba(255,255,255,.085)' },
  field: { gap: 8 }, labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }, label: { color: colors.text, fontSize: 14, fontWeight: '800' }, helper: { color: colors.textSecondary, fontSize: 11 },
  input: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, color: colors.text, fontSize: 15, backgroundColor: 'rgba(10,9,13,.32)', borderWidth: 1, borderColor: 'rgba(255,255,255,.095)' }, multiline: { minHeight: 104 }, counter: { alignSelf: 'flex-end', color: colors.textSecondary, fontSize: 11, marginTop: -2 },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, column: { flex: 1, minWidth: 230 },
  personaNotice: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.md, backgroundColor: 'rgba(106,88,119,.07)', borderWidth: 1, borderColor: 'rgba(204,181,217,.12)' }, noticeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,126,172,.085)' }, noticeIconSelected: { backgroundColor: 'rgba(125,92,145,.88)' }, noticeTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, noticeCopy: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  desktopSaveRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,.018)' }, desktopSaveTitle: { color: colors.text, fontSize: 14, fontWeight: '900' }, desktopSaveMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 4 }, desktopSaveButton: { width: 190 },
  mobileSaveBar: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.1)', backgroundColor: 'rgba(16,13,20,.97)' }, mobileSaveCopy: { flex: 1, minWidth: 0 }, mobileSaveTitle: { color: colors.text, fontSize: 13, fontWeight: '900' }, mobileSaveMeta: { color: colors.textSecondary, fontSize: 10.5, marginTop: 3 }, mobileSaveButton: { minWidth: 92, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.rose }, mobileSaveButtonDisabled: { opacity: .38 }, mobileSaveButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  summaryCard: { minHeight: 110, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: 'rgba(104,82,116,.075)', borderWidth: 1, borderColor: 'rgba(217,192,228,.11)' }, summaryIcon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,126,172,.075)' }, summaryKicker: { color: '#CCB5D7', fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1 }, summaryTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 }, verified: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, verifiedText: { fontSize: 11, fontWeight: '800' },
  groupLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginBottom: -14, paddingLeft: 4 },
  group: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.085)', backgroundColor: 'rgba(255,255,255,.014)' },
  settingRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.065)' }, disabledRow: { opacity: .55 }, rowPressed: { backgroundColor: 'rgba(155,126,172,.055)' }, rowIcon: { width: 26, height: 36, alignItems: 'center', justifyContent: 'center' }, rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800' }, rowTitleDanger: { color: colors.danger }, rowBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 }, rowValue: { maxWidth: 132, color: '#CCB5D7', fontSize: 11.5, fontWeight: '800', textAlign: 'right' }, rowValueDanger: { color: colors.danger },
  lifeHero: { minHeight: 120, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: 'rgba(108,84,116,.075)', borderWidth: 1, borderColor: 'rgba(219,190,220,.11)' }, lifeAvatar: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18,16,22,.56)', borderWidth: 1, borderColor: 'rgba(211,174,214,.23)' }, lifeInitial: { color: '#C9ADCC', fontFamily: typography.display, fontSize: 30 }, lifeName: { color: colors.text, fontFamily: typography.display, fontSize: 26, marginTop: 2 }, lifeMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 }, activePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(125,92,145,.72)' }, activePillText: { color: '#fff', fontSize: 9.5, fontWeight: '900' },
  infoCard: { padding: 17, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: colors.border }, infoTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, infoBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  metricRow: { flexDirection: 'row', gap: 10 }, metric: { flex: 1, minHeight: 88, justifyContent: 'center', padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.028)', borderWidth: 1, borderColor: colors.border }, metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 29 }, metricLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', marginTop: 3 }, version: { color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 6 },
});
