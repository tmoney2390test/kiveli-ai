import { cloneElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  Alert,
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
import { cleanupNormalizedImage, normalizeUserImage, type NormalizedUserImage } from '../src/lib/imageUploads';
import { usePathname, useRouter } from 'expo-router';
import {
  Archive,
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
  Scale,
  Shield,
  Sparkles,
  UserRound,
  UsersRound,
  Volume2,
  X,
} from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { useAuth } from '../src/hooks/useAuth';
import { authProviderState } from '../src/lib/authProviders';
import { activeCompanion } from '../src/lib/companionLife';
import { manageAccount } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import { confirmAction } from '../src/lib/dialogs';
import { shouldRenderSettingsRoute } from '../src/lib/settingsRoute';
import { FrostedBackdrop, FrostedSurface, GradientButton, LoadingSkeleton } from '../src/components';

type SettingsSection = 'profile' | 'account' | 'identity' | 'experience' | 'relationships' | 'legal' | 'support';

const sections: Array<{ id: SettingsSection; label: string; icon: ReactElement<{ color?: string }> }> = [
  { id: 'profile', label: 'Your profile', icon: <UserRound size={20} /> },
  { id: 'account', label: 'Account', icon: <KeyRound size={20} /> },
  { id: 'identity', label: 'Personas & Lives', icon: <Sparkles size={20} /> },
  { id: 'experience', label: 'Experience', icon: <Heart size={20} /> },
  { id: 'relationships', label: 'Relationships', icon: <UsersRound size={20} /> },
  { id: 'legal', label: 'Legal', icon: <Scale size={20} /> },
  { id: 'support', label: 'Support', icon: <LifeBuoy size={20} /> },
];

export default function Settings() {
  const router = useRouter();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const desktop = width >= 860;
  const scroll = useRef<ScrollView | null>(null);
  const [section, setSection] = useState<SettingsSection>('profile');
  const { snapshot, refresh, clear } = useTogether();
  const { session, signOut, resendPendingEmailChange, signOutOthers } = useAuth();
  const providerState = authProviderState(session?.user);
  const profile = snapshot?.profile;
  const [name, setName] = useState(profile?.display_name ?? '');
  const [about, setAbout] = useState(profile?.about_me ?? '');
  const [interests, setInterests] = useState((profile?.interests ?? []).join(', '));
  const [goals, setGoals] = useState((profile?.experience_goals ?? []).join(', '));
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncMainPersona, setSyncMainPersona] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const profileHydrated = useRef(false);

  useEffect(() => {
    if (!profile || profileHydrated.current) return;
    profileHydrated.current = true;
    setName(profile.display_name ?? '');
    setAbout(profile.about_me ?? '');
    setInterests((profile.interests ?? []).join(', '));
    setGoals((profile.experience_goals ?? []).join(', '));
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

  // Web Settings looks like a modal, but is intentionally a normal route.
  // Replacing it prevents stale modal entries from resurfacing after navigating
  // elsewhere or restoring a browser tab.
  const close = () => router.replace('/home' as never);
  const selectSection = (next: SettingsSection) => {
    setSection(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const saveProfile = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await manageAccount({
        action: 'profile',
        displayName: name.trim(),
        aboutMe: about.trim(),
        interests: splitList(interests, 10),
        goals: splitList(goals, 4),
        avatarPath: profile?.avatar_path ?? null,
        syncMainPersona,
      });
      await refresh();
      Alert.alert('Profile saved', 'Your account profile is up to date.');
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
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
    let normalized: NormalizedUserImage | null = null;
    try {
      const asset = result.assets[0];
      normalized = await normalizeUserImage({ uri: asset.uri, width: asset.width, height: asset.height, fileSize: asset.fileSize, fileName: asset.fileName }, .9);
      const path = `${session.user.id}/avatar-${Date.now()}.jpg`;
      const blob = await (await fetch(normalized.uri)).blob();
      const { error } = await supabase.storage.from('together-user-media').upload(path, blob, { contentType: normalized.mimeType, upsert: false, cacheControl: '31536000' });
      if (error) throw error;
      await manageAccount({
        action: 'profile', displayName: name.trim() || profile?.display_name || 'You', aboutMe: about.trim(),
        interests: splitList(interests, 10), goals: splitList(goals, 4), avatarPath: path, syncMainPersona,
      });
      const { data: signed } = await supabase.storage.from('together-user-media').createSignedUrl(path, 3600);
      setAvatar(signed?.signedUrl ?? avatar);
      await refresh();
    } catch (error) {
      Alert.alert('Photo upload failed', error instanceof Error ? error.message : 'Please try again.');
    } finally { cleanupNormalizedImage(normalized?.uri); setBusy(false); }
  };
  const performLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      clear();
      router.replace('/auth');
    } catch (error) {
      Alert.alert('Could not log out', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSigningOut(false);
    }
  };
  const logout = () => confirmAction({
    title: 'Logout?',
    message: 'Your relationships and memories will still be here when you return.',
    confirmLabel: 'Logout',
    destructive: true,
    onConfirm: performLogout,
  });

  const modalHeight = desktop ? Math.max(520, height - 36) : height;

  // React Navigation may retain inactive stack screens briefly. Never allow a
  // retained Settings screen to draw over Home, Stories, or any other route.
  const browserPath = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : null;
  if (!shouldRenderSettingsRoute({ platform: Platform.OS, routerPathname: pathname, browserPathname: browserPath })) return null;

  return <View style={[styles.backdrop, desktop && styles.backdropDesktop]}>
    <FrostedBackdrop intensity={desktop ? 72 : 22} />
    <View pointerEvents="none" style={styles.ambientOne} />
    <View pointerEvents="none" style={styles.ambientTwo} />
    <Pressable accessibilityLabel="Close settings" onPress={close} style={StyleSheet.absoluteFill} />
    <FrostedSurface intensity={68} style={[styles.modal, desktop ? styles.modalDesktop : styles.modalMobile, { height: modalHeight }]}>
      <View style={styles.header}>
        <View style={styles.brandMark}><Text style={styles.brandInitial}>{(name || 'Y')[0]?.toUpperCase()}</Text></View>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>Profile & Settings</Text>
          <Text numberOfLines={1} style={styles.headerMeta}>{(snapshot?.activePersona?.display_name ?? name) || 'Your Kivelle account'} · {snapshot?.activeContinuity?.title ?? 'Main Life'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={close} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><X size={21} color={colors.textSecondary} /></Pressable>
      </View>

      {!desktop ? <ScrollView horizontal style={styles.mobileTabsViewport} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileTabs}>
        {sections.map((item) => <SectionTab key={item.id} item={item} active={section === item.id} compact onPress={() => selectSection(item.id)} />)}
      </ScrollView> : null}

      <View style={styles.body}>
        {desktop ? <View style={styles.sidebar}>
          <Text style={styles.sidebarEyebrow}>SETTINGS</Text>
          <View style={styles.sidebarLinks}>{sections.map((item) => <SectionTab key={item.id} item={item} active={section === item.id} onPress={() => selectSection(item.id)} />)}</View>
          <LogoutButton signingOut={signingOut} onPress={logout} />
        </View> : null}

        <ScrollView ref={scroll} style={styles.main} contentContainerStyle={[styles.mainContent, desktop && styles.mainContentDesktop]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!snapshot ? <LoadingSkeleton label="Loading your profile…" /> : <>
            {section === 'profile' ? <ProfilePanel avatar={avatar} name={name} setName={setName} about={about} setAbout={setAbout} interests={interests} setInterests={setInterests} goals={goals} setGoals={setGoals} syncMainPersona={syncMainPersona} setSyncMainPersona={setSyncMainPersona} busy={busy} email={session?.user.email} personaName={snapshot.activePersona?.display_name} lifeTitle={snapshot.activeContinuity?.title} onAvatar={() => void pickAvatar()} onSave={() => void saveProfile()} /> : null}
            {section === 'account' ? <AccountPanel email={session?.user.email} providerLabel={providerState.label} verified={providerState.verifiedEmail} pendingEmail={providerState.pendingEmail} tier={subscriptionLabel(snapshot.entitlements?.tier)} onRoute={(route) => router.push(route as never)} onResend={() => void resendPendingEmailChange().then(() => Alert.alert('Confirmation sent', 'Check the new email address.')).catch((error) => Alert.alert('Could not send email', error.message))} onSignOutOthers={() => Alert.alert('Sign out everywhere else?', 'This device will remain signed in.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out others', style: 'destructive', onPress: () => void signOutOthers().then(() => Alert.alert('Other sessions signed out.')).catch((error) => Alert.alert('Could not update sessions', error.message)) }])} /> : null}
            {section === 'identity' ? <IdentityPanel snapshot={snapshot} onRoute={(route) => router.push(route as never)} /> : null}
            {section === 'experience' ? <ExperiencePanel snapshot={snapshot} onRoute={(route) => router.push(route as never)} /> : null}
            {section === 'relationships' ? <RelationshipsPanel snapshot={snapshot} onRoute={(route) => router.push(route as never)} /> : null}
            {section === 'legal' ? <LegalPanel onRoute={(route) => router.push(route as never)} onDisclosure={() => Alert.alert('About Kivelle characters', 'Kivelle companions are fictional AI characters. They can remember shared context and simulate a life, but they are not real people and do not have human consciousness.')} /> : null}
            {section === 'support' ? <SupportPanel onRoute={(route) => router.push(route as never)} /> : null}
            {!desktop ? <LogoutButton signingOut={signingOut} onPress={logout} mobile /> : null}
          </>}
        </ScrollView>
      </View>
    </FrostedSurface>
  </View>;
}

function SectionTab({ item, active, compact = false, onPress }: { item: typeof sections[number]; active: boolean; compact?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [compact ? styles.mobileTab : styles.sidebarLink, active && (compact ? styles.mobileTabActive : styles.sidebarLinkActive), pressed && styles.pressed]}>
    <View>{cloneElement(item.icon, { color: active ? '#D59AFF' : colors.muted })}</View><Text style={[compact ? styles.mobileTabText : styles.sidebarLinkText, active && styles.sidebarLinkTextActive]}>{item.label}</Text>
  </Pressable>;
}

function ProfilePanel(props: {
  avatar: string | null; name: string; setName: (value: string) => void; about: string; setAbout: (value: string) => void;
  interests: string; setInterests: (value: string) => void; goals: string; setGoals: (value: string) => void;
  syncMainPersona:boolean;setSyncMainPersona:(value:boolean)=>void;
  busy: boolean; email?: string; personaName?: string; lifeTitle?: string; onAvatar: () => void; onSave: () => void;
}) {
  return <View style={styles.panel}>
    <PanelHeading title="Your profile" body="This is you—not your active companion. Account details stay separate from every character relationship." />
    <View style={styles.profileHero}>
      <Pressable accessibilityRole="button" accessibilityLabel="Change account avatar" onPress={props.onAvatar} style={styles.avatar}>
        {props.avatar ? <Image source={{ uri: props.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={styles.avatarInitial}>{(props.name || 'Y')[0]?.toUpperCase()}</Text>}
        <View style={styles.camera}><Camera size={14} color="#fff" /></View>
      </Pressable>
      <View style={styles.profileHeroCopy}><Text style={styles.profileName}>{props.name || 'You'}</Text><Text style={styles.profileEmail}>{props.email ?? 'Signed-in Kivelle account'}</Text><Pressable onPress={props.onAvatar} style={styles.avatarButton}><Camera size={14} color={colors.text} /><Text style={styles.avatarButtonText}>Change avatar</Text></Pressable></View>
    </View>
    <View style={styles.formCard}>
      <Field label="Display name" helper="Used for your account and as the fallback name companions call you."><TextInput value={props.name} onChangeText={props.setName} maxLength={50} placeholder="Your name" placeholderTextColor={colors.dimmed} style={styles.input} /></Field>
      <Field label="About you" helper="A short account-level introduction. Relationship memories remain separate."><TextInput value={props.about} onChangeText={props.setAbout} maxLength={280} multiline textAlignVertical="top" placeholder="A little context about you…" placeholderTextColor={colors.dimmed} style={[styles.input, styles.multiline]} /><Text style={styles.counter}>{props.about.length}/280</Text></Field>
      <View style={styles.twoColumns}>
        <View style={styles.column}><Field label="Interests" helper="Separate with commas"><TextInput value={props.interests} onChangeText={props.setInterests} placeholder="Music, travel, games" placeholderTextColor={colors.dimmed} style={styles.input} /></Field></View>
        <View style={styles.column}><Field label="What you're here for" helper="Dating, friendship, stories"><TextInput value={props.goals} onChangeText={props.setGoals} placeholder="Dating, Friendship" placeholderTextColor={colors.dimmed} style={styles.input} /></Field></View>
      </View>
    </View>
    <Pressable accessibilityRole="checkbox" accessibilityState={{checked:props.syncMainPersona}} onPress={()=>props.setSyncMainPersona(!props.syncMainPersona)} style={styles.personaNotice}><View style={[styles.noticeIcon,props.syncMainPersona&&styles.noticeIconSelected]}>{props.syncMainPersona?<Check size={17} color="#fff"/>:<Sparkles size={18} color={colors.violet}/>}</View><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>Also update my Main Persona</Text><Text style={styles.noticeCopy}>Syncs name, bio, interests, goals, and avatar to Main Life. Alternate Lives remain separate.</Text></View></Pressable>
    <View style={styles.saveRow}><GradientButton label={props.busy ? 'Saving…' : 'Save profile'} disabled={props.busy || !props.name.trim()} onPress={props.onSave} /></View>
  </View>;
}

function AccountPanel({ email, providerLabel, verified, pendingEmail, tier, onRoute, onResend, onSignOutOthers }: { email?: string; providerLabel:string; verified: boolean; pendingEmail:string|null; tier: string; onRoute: (route: string) => void; onResend: () => void; onSignOutOthers: () => void }) {
  return <View style={styles.panel}><PanelHeading title="Account" body="Manage sign-in, billing, and security without changing who you are inside a Kivelle Life." />
    <View style={styles.summaryCard}><View style={styles.summaryIcon}><KeyRound color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.summaryKicker}>{providerLabel.toUpperCase()}</Text><Text style={styles.summaryTitle}>{email ?? 'Your Kivelle account'}</Text><View style={styles.verified}><Check size={12} color={verified ? colors.success : colors.warm} /><Text style={[styles.verifiedText, { color: verified ? colors.success : colors.warm }]}>{verified ? 'Verified email' : 'Email verification pending'}</Text></View>{pendingEmail?<Text style={styles.verifiedText}>Pending change: {pendingEmail}</Text>:null}</View></View>
    <SettingsGroup>
      <SettingsRow icon={<UserRound />} title="Account details & password" body="Change email, password, and your account avatar." onPress={() => onRoute('/account')} />
      {pendingEmail ? <SettingsRow icon={<Check />} title="Resend email-change confirmation" body="Send another confirmation link to your new address." onPress={onResend} /> : null}
      <SettingsRow icon={<CreditCard />} title="Subscription & credits" body={tier} onPress={() => onRoute('/subscription')} />
      <SettingsRow icon={<Shield />} title="Active devices" body="Sign out other browser and mobile sessions." onPress={onSignOutOthers} />
    </SettingsGroup>
  </View>;
}

function IdentityPanel({ snapshot, onRoute }: { snapshot: NonNullable<ReturnType<typeof useTogether.getState>['snapshot']>; onRoute: (route: string) => void }) {
  const persona = snapshot.activePersona;
  const life = snapshot.activeContinuity;
  return <View style={styles.panel}><PanelHeading title="Personas & Lives" body="A Persona defines who you are. A Life keeps that identity's relationships and history isolated." />
    <View style={styles.lifeHero}><View style={styles.lifeAvatar}><Text style={styles.lifeInitial}>{(persona?.display_name ?? snapshot.profile?.display_name ?? 'Y')[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.summaryKicker}>{life?.kind === 'alternate' ? 'ACTIVE ALTERNATE LIFE' : 'ACTIVE MAIN LIFE'}</Text><Text style={styles.lifeName}>{persona?.display_name ?? snapshot.profile?.display_name ?? 'You'}</Text><Text style={styles.lifeMeta}>{[persona?.occupation, persona?.age].filter(Boolean).join(' · ') || life?.title || 'Main Life'}</Text></View><View style={styles.activePill}><Check size={12} color="#fff" /><Text style={styles.activePillText}>ACTIVE</Text></View></View>
    <SettingsGroup><SettingsRow icon={<Sparkles />} title="Manage Personas & Lives" body={`${snapshot.continuities?.length ?? 1} ${snapshot.continuities?.length === 1 ? 'Life' : 'Lives'} · histories remain separate`} onPress={() => onRoute('/personas')} /><SettingsRow icon={<UserRound />} title="Edit active Persona" body="Name, pronouns, occupation, interests, and in-world identity." onPress={() => onRoute(`/persona-editor?persona=${persona?.id ?? ''}`)} /></SettingsGroup>
    <InfoCard title="Why this is separate">Your account is how you sign in. Your Persona is who companions know inside this Life. Switching Personas starts or enters a separate Life—it never relabels an existing relationship.</InfoCard>
  </View>;
}

function ExperiencePanel({ snapshot, onRoute }: { snapshot: NonNullable<ReturnType<typeof useTogether.getState>['snapshot']>; onRoute: (route: string) => void }) {
  return <View style={styles.panel}><PanelHeading title="Experience" body="Choose how Kivelle communicates and which relationship experiences appear." /><SettingsGroup>
    <SettingsRow icon={<Heart />} title="Content preferences" body={snapshot.profile?.content_preferences?.romanceEnabled === false ? 'Friendship-focused' : 'Romance allowed'} onPress={() => onRoute('/content-settings')} />
    <SettingsRow icon={<Bell />} title="Notifications" body={snapshot.notificationPreferences?.push_enabled ? 'Push notifications on' : 'Push notifications off'} onPress={() => onRoute('/notifications')} />
    <SettingsRow icon={<Camera />} title="Companion photos" body={snapshot.profile?.photo_preferences?.companionPhotos === false ? 'Photo generation off' : 'Photo generation on'} onPress={() => onRoute('/photo-settings')} />
    <SettingsRow icon={<Volume2 />} title="Media & voice" body="Photo sharing, voice notes, and live calls" onPress={() => onRoute('/media-preferences')} />
    <SettingsRow icon={<CreditCard />} title="Plan & usage limits" body={subscriptionLabel(snapshot.entitlements?.tier)} onPress={() => onRoute('/subscription')} />
  </SettingsGroup><InfoCard title="Your controls are canonical">These settings constrain what Kivelle may generate. They do not force a character to ignore their own boundaries or relationship state.</InfoCard></View>;
}

function RelationshipsPanel({ snapshot, onRoute }: { snapshot: NonNullable<ReturnType<typeof useTogether.getState>['snapshot']>; onRoute: (route: string) => void }) {
  const companion = activeCompanion(snapshot);
  const memoryCount = companion ? snapshot.memoryCounts?.[companion.id]??snapshot.memories.filter((item) => item.character_instance_id === companion.id).length : 0;
  return <View style={styles.panel}><PanelHeading title="Relationships" body="Manage people and shared history. This area never substitutes a companion portrait for your own profile." />
    <View style={styles.metricRow}><Metric value={snapshot.characters.length} label="Companions" /><Metric value={snapshot.moments.length} label="Moments" /><Metric value={snapshot.sharedPlans.filter((plan) => ['scheduled', 'active'].includes(plan.status)).length} label="Upcoming" /></View>
    <SettingsGroup><SettingsRow icon={<UsersRound />} title="Your companions" body="Switch the active relationship or meet someone new." onPress={() => onRoute('/companions')} /><SettingsRow icon={<MessageCircle />} title="Conversations & resets" body="Conversation history, fresh threads, and complete character reset." onPress={() => onRoute('/conversation-controls')} /><SettingsRow icon={<Archive />} title="Archived Chats" body="Restore deleted chats for up to 30 days." onPress={() => onRoute('/archived-chats')} /><SettingsRow icon={<Brain />} title="Memory Center" body={companion ? `${memoryCount} memories with ${companion.together_character_templates.name}` : 'Review and control relationship memories'} onPress={() => onRoute('/memories')} /></SettingsGroup>
  </View>;
}

function LegalPanel({ onRoute, onDisclosure }: { onRoute: (route: string) => void; onDisclosure: () => void }) {
  return <View style={styles.panel}><PanelHeading title="Legal" body="Policies, data controls, disclosures, and safety standards in one place." /><SettingsGroup><SettingsRow icon={<Shield />} title="Privacy and data controls" body="Personalization, analytics, export, and account deletion." onPress={() => onRoute('/privacy')} /><SettingsRow icon={<FileText />} title="Privacy Policy" body="How Kivelle processes, protects, and retains your information." onPress={() => onRoute('/privacy-policy')} /><SettingsRow icon={<FileText />} title="Terms of Service" body="Account, billing, content, and acceptable use." onPress={() => onRoute('/terms')} /><SettingsRow icon={<FileText />} title="Refund & Cancellation Policy" body="Subscription cancellation, credit packs, failed generations, and refunds." onPress={() => onRoute('/refund-policy')} /><SettingsRow icon={<Shield />} title="Community & Safety Guidelines" body="Age, content, real people, and reports." onPress={() => onRoute('/community-guidelines')} /><SettingsRow icon={<FileText />} title="AI character disclosure" body="How fictional Kivelle characters and simulation work." onPress={onDisclosure} /></SettingsGroup><Text style={styles.version}>Kivelle.AI · 1.0.0</Text></View>;
}

function SupportPanel({ onRoute }: { onRoute: (route: string) => void }) {
  return <View style={styles.panel}><PanelHeading title="Support" body="Find answers, contact the support team, or review an existing request." /><SettingsGroup><SettingsRow icon={<LifeBuoy />} title="Help center" body="Answers for accounts, conversations, media, billing, privacy, and safety." onPress={() => onRoute('/help')} /><SettingsRow icon={<MessageCircle />} title="Contact support" body="Send a private request and review its status." onPress={() => onRoute('/support')} /></SettingsGroup><InfoCard title="For a specific chat message">Use the message menu in chat to report a generated response. Support requests never attach unrelated conversation history.</InfoCard></View>;
}

function LogoutButton({ signingOut, onPress, mobile = false }: { signingOut: boolean; onPress: () => void; mobile?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Logout" accessibilityState={{ disabled: signingOut }} disabled={signingOut} onPress={onPress} style={({ pressed }) => [styles.logoutButton, mobile && styles.logoutButtonMobile, signingOut && styles.logoutButtonDisabled, pressed && styles.pressed]}><LogOut size={18} color={colors.danger} /><Text style={styles.logoutButtonText}>{signingOut ? 'Logging out…' : 'Logout'}</Text></Pressable>;
}

function PanelHeading({ title, body }: { title: string; body: string }) { return <View style={styles.panelHeading}><Text style={styles.panelTitle}>{title}</Text><Text style={styles.panelBody}>{body}</Text></View>; }
function Field({ label, helper, children }: { label: string; helper?: string; children: ReactNode }) { return <View style={styles.field}><View style={styles.labelRow}><Text style={styles.label}>{label}</Text>{helper ? <Text style={styles.helper}>{helper}</Text> : null}</View>{children}</View>; }
function SettingsGroup({ children }: { children: ReactNode }) { return <View style={styles.group}>{children}</View>; }
function SettingsRow({ icon, title, body, onPress, danger = false, disabled = false, actionLabel = 'Open' }: { icon: ReactElement<{ color?: string; size?: number }>; title: string; body: string; onPress: () => void; danger?: boolean; disabled?: boolean; actionLabel?: string }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.settingRow, disabled && { opacity: .55 }, pressed && styles.rowPressed]}><View style={styles.rowIcon}>{cloneElement(icon,{color:danger?colors.danger:colors.muted,size:20})}</View><View style={styles.rowCopy}><Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text><Text style={styles.rowBody}>{body}</Text></View><View style={[styles.rowAction,danger&&styles.rowActionDanger]}><Text style={[styles.rowActionText,danger&&styles.rowActionTextDanger]}>{actionLabel}</Text><ChevronRight size={15} color={danger?colors.danger:colors.textSecondary} /></View></Pressable>; }
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
  modalMobile: { borderRadius: 0, backgroundColor: 'rgba(17,15,22,.9)' },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.085)', backgroundColor: 'rgba(18,16,22,.24)' },
  brandMark: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(151,116,171,.085)', borderWidth: 1, borderColor: 'rgba(204,176,221,.18)' },
  brandInitial: { color: '#CFB6DD', fontFamily: typography.display, fontSize: 18 },
  headerCopy: { flex: 1 }, title: { color: colors.text, fontFamily: typography.display, fontWeight: '600', fontSize: 25 },
  headerMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.018)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  pressed: { opacity: .72, transform: [{ scale: .98 }] },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  sidebar: { width: 280, paddingTop: 18, paddingBottom: spacing.lg, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,.075)', backgroundColor: 'rgba(11,10,14,.23)' },
  sidebarEyebrow: { color: colors.textSecondary, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10, paddingHorizontal: 24 },
  sidebarLinks: { gap: 2 },
  sidebarLink: { minHeight: 56, paddingHorizontal: 24, borderLeftWidth: 3, borderLeftColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 13 },
  sidebarLinkActive: { backgroundColor: 'rgba(139,100,158,.13)', borderLeftColor: 'rgba(206,168,224,.72)' },
  sidebarLinkText: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' }, sidebarLinkTextActive: { color: '#F1E7F3' },
  logoutButton: { minHeight: 48, marginTop: 'auto', marginHorizontal: 18, paddingHorizontal: 14, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: 'rgba(255,113,129,.055)', borderWidth: 1, borderColor: 'rgba(255,113,129,.2)' },
  logoutButtonMobile: { width: '100%', maxWidth: 780, alignSelf: 'center', marginTop: 2, marginHorizontal: 0 }, logoutButtonDisabled: { opacity: .55 }, logoutButtonText: { color: colors.danger, fontSize: 13, fontWeight: '900' },
  mobileTabsViewport: { flexGrow: 0, flexShrink: 0, height: 58, maxHeight: 58, borderBottomWidth: 1, borderBottomColor: colors.border },
  mobileTabs: { flexGrow: 0, alignItems: 'center', gap: 7, paddingHorizontal: spacing.md, paddingVertical: 9 },
  mobileTab: { flexGrow: 0, flexShrink: 0, alignSelf: 'center', height: 38, maxHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: colors.border },
  mobileTabActive: { backgroundColor: 'rgba(139,100,158,.18)', borderColor: 'rgba(206,168,224,.28)' }, mobileTabText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  main: { flex: 1 }, mainContent: { flexGrow: 1, padding: spacing.xl, paddingBottom: 70 }, mainContentDesktop: { paddingTop: 38, paddingHorizontal: 34, paddingBottom: 76 },
  panel: { width: '100%', maxWidth: 1060, alignSelf: 'flex-start', gap: 24 },
  panelHeading: { gap: 8, marginBottom: 4 }, panelTitle: { color: colors.text, fontFamily: typography.display, fontSize: 37, fontWeight: '600' }, panelBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, maxWidth: 760 },
  profileHero: { minHeight: 130, flexDirection: 'row', alignItems: 'center', gap: 18, padding: 20, borderRadius: radius.lg, backgroundColor: 'rgba(104,82,116,.09)', borderWidth: 1, borderColor: 'rgba(217,192,228,.12)' },
  avatar: { width: 90, height: 90, borderRadius: 45, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,14,18,.74)', borderWidth: 1, borderColor: 'rgba(218,188,230,.26)' },
  avatarInitial: { color: '#C7A8D5', fontFamily: typography.display, fontSize: 38 }, camera: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(125,92,145,.88)' },
  profileHeroCopy: { flex: 1, alignItems: 'flex-start' }, profileName: { color: colors.text, fontFamily: typography.display, fontSize: 27 }, profileEmail: { color: colors.textSecondary, fontSize: 13, marginTop: 3 },
  avatarButton: { minHeight: 38, marginTop: 12, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' }, avatarButtonText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  formCard: { gap: 16, padding: 20, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.018)', borderWidth: 1, borderColor: 'rgba(255,255,255,.085)' },
  field: { gap: 8 }, labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }, label: { color: colors.text, fontSize: 14, fontWeight: '800' }, helper: { color: colors.textSecondary, fontSize: 11 },
  input: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, color: colors.text, fontSize: 15, backgroundColor: 'rgba(10,9,13,.32)', borderWidth: 1, borderColor: 'rgba(255,255,255,.095)' }, multiline: { minHeight: 104 }, counter: { alignSelf: 'flex-end', color: colors.textSecondary, fontSize: 11, marginTop: -2 },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, column: { flex: 1, minWidth: 230 },
  personaNotice: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: radius.md, backgroundColor: 'rgba(106,88,119,.07)', borderWidth: 1, borderColor: 'rgba(204,181,217,.12)' }, noticeIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,126,172,.085)' }, noticeIconSelected:{backgroundColor:'rgba(125,92,145,.88)'}, noticeTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, noticeCopy: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 }, saveRow: { alignSelf: 'stretch' },
  summaryCard: { minHeight: 110, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: 'rgba(104,82,116,.075)', borderWidth: 1, borderColor: 'rgba(217,192,228,.11)' }, summaryIcon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,126,172,.075)' }, summaryKicker: { color: '#CCB5D7', fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1 }, summaryTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 }, verified: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, verifiedText: { fontSize: 11, fontWeight: '800' },
  group: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.085)', backgroundColor: 'rgba(255,255,255,.014)' },
  settingRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.065)' }, rowPressed: { backgroundColor: 'rgba(155,126,172,.055)' }, rowIcon: { width: 26, height: 34, alignItems: 'center', justifyContent: 'center' }, rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800' }, rowBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 }, rowAction: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,.055)' }, rowActionDanger: { backgroundColor: 'rgba(255,113,129,.04)', borderColor: 'rgba(255,113,129,.12)' }, rowActionText: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' }, rowActionTextDanger: { color: colors.danger },
  lifeHero: { minHeight: 120, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: 'rgba(108,84,116,.075)', borderWidth: 1, borderColor: 'rgba(219,190,220,.11)' }, lifeAvatar: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18,16,22,.56)', borderWidth: 1, borderColor: 'rgba(211,174,214,.23)' }, lifeInitial: { color: '#C9ADCC', fontFamily: typography.display, fontSize: 30 }, lifeName: { color: colors.text, fontFamily: typography.display, fontSize: 26, marginTop: 2 }, lifeMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 }, activePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(125,92,145,.72)' }, activePillText: { color: '#fff', fontSize: 9.5, fontWeight: '900' },
  infoCard: { padding: 17, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: colors.border }, infoTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, infoBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  metricRow: { flexDirection: 'row', gap: 10 }, metric: { flex: 1, minHeight: 88, justifyContent: 'center', padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.028)', borderWidth: 1, borderColor: colors.border }, metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 29 }, metricLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', marginTop: 3 }, version: { color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 6 },
});
