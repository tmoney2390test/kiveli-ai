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
import { useRouter } from 'expo-router';
import {
  Bell,
  Brain,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  FileText,
  Heart,
  KeyRound,
  LogOut,
  MessageCircle,
  Shield,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { useAuth } from '../src/hooks/useAuth';
import { activeCompanion } from '../src/lib/companionLife';
import { manageAccount } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import { FrostedBackdrop, FrostedSurface, GradientButton, LoadingSkeleton } from '../src/components';

type SettingsSection = 'profile' | 'account' | 'identity' | 'experience' | 'relationships' | 'privacy';

const sections: Array<{ id: SettingsSection; label: string; icon: ReactElement<{ color?: string }> }> = [
  { id: 'profile', label: 'Your profile', icon: <UserRound size={18} /> },
  { id: 'account', label: 'Account', icon: <KeyRound size={18} /> },
  { id: 'identity', label: 'Personas & Lives', icon: <Sparkles size={18} /> },
  { id: 'experience', label: 'Experience', icon: <Heart size={18} /> },
  { id: 'relationships', label: 'Relationships', icon: <UsersRound size={18} /> },
  { id: 'privacy', label: 'Privacy & safety', icon: <Shield size={18} /> },
];

export default function Settings() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const desktop = width >= 860;
  const scroll = useRef<ScrollView | null>(null);
  const [section, setSection] = useState<SettingsSection>('profile');
  const { snapshot, refresh, clear } = useTogether();
  const { session, signOut, resendEmailVerification, signOutOthers } = useAuth();
  const profile = snapshot?.profile;
  const [name, setName] = useState(profile?.display_name ?? '');
  const [about, setAbout] = useState(profile?.about_me ?? '');
  const [interests, setInterests] = useState((profile?.interests ?? []).join(', '));
  const [goals, setGoals] = useState((profile?.experience_goals ?? []).join(', '));
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
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

  const close = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/home');
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .82 });
    if (result.canceled || !result.assets[0] || !session) return;
    setBusy(true);
    try {
      const asset = result.assets[0];
      const path = `${session.user.id}/avatar-${Date.now()}.jpg`;
      const blob = await (await fetch(asset.uri)).blob();
      const { error } = await supabase.storage.from('together-user-media').upload(path, blob, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
      if (error) throw error;
      await manageAccount({
        action: 'profile', displayName: name.trim() || profile?.display_name || 'You', aboutMe: about.trim(),
        interests: splitList(interests, 10), goals: splitList(goals, 4), avatarPath: path,
      });
      setAvatar(asset.uri);
      await refresh();
    } catch (error) {
      Alert.alert('Photo upload failed', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  };
  const logout = () => Alert.alert('Sign out?', 'Your relationships and memories will still be here when you return.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', onPress: () => void signOut().then(() => { clear(); router.replace('/auth'); }) },
  ]);

  const modalHeight = desktop ? Math.min(820, Math.max(620, height - 64)) : height;

  return <View style={styles.backdrop}>
    <FrostedBackdrop intensity={32} />
    <View pointerEvents="none" style={styles.ambientOne} />
    <View pointerEvents="none" style={styles.ambientTwo} />
    <Pressable accessibilityLabel="Close settings" onPress={close} style={StyleSheet.absoluteFill} />
    <FrostedSurface intensity={78} style={[styles.modal, desktop ? styles.modalDesktop : styles.modalMobile, { height: modalHeight }]}>
      <View style={styles.header}>
        <View style={styles.brandMark}><Text style={styles.brandInitial}>{(name || 'Y')[0]?.toUpperCase()}</Text></View>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>Profile & Settings</Text>
          <Text numberOfLines={1} style={styles.headerMeta}>{(snapshot?.activePersona?.display_name ?? name) || 'Your Kivelle account'} · {snapshot?.activeContinuity?.title ?? 'Main Life'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={close} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><X size={21} color={colors.textSecondary} /></Pressable>
      </View>

      {!desktop ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileTabs}>
        {sections.map((item) => <SectionTab key={item.id} item={item} active={section === item.id} compact onPress={() => selectSection(item.id)} />)}
      </ScrollView> : null}

      <View style={styles.body}>
        {desktop ? <View style={styles.sidebar}>
          <Text style={styles.sidebarEyebrow}>SETTINGS</Text>
          <View style={styles.sidebarLinks}>{sections.map((item) => <SectionTab key={item.id} item={item} active={section === item.id} onPress={() => selectSection(item.id)} />)}</View>
          <View style={styles.sidebarFooter}><Text style={styles.sidebarFooterTitle}>Private by design</Text><Text style={styles.sidebarFooterCopy}>Your email, chats, memories, and relationship history are never public profile content.</Text></View>
        </View> : null}

        <ScrollView ref={scroll} style={styles.main} contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!snapshot ? <LoadingSkeleton label="Loading your profile…" /> : <>
            {section === 'profile' ? <ProfilePanel avatar={avatar} name={name} setName={setName} about={about} setAbout={setAbout} interests={interests} setInterests={setInterests} goals={goals} setGoals={setGoals} busy={busy} email={session?.user.email} personaName={snapshot.activePersona?.display_name} lifeTitle={snapshot.activeContinuity?.title} onAvatar={() => void pickAvatar()} onSave={() => void saveProfile()} /> : null}
            {section === 'account' ? <AccountPanel email={session?.user.email} verified={Boolean(session?.user.email_confirmed_at)} tier={subscriptionLabel(snapshot.entitlements?.tier)} onRoute={(route) => router.push(route as never)} onResend={() => void resendEmailVerification().then(() => Alert.alert('Verification sent', 'Check your inbox.')).catch((error) => Alert.alert('Could not send email', error.message))} onSignOutOthers={() => Alert.alert('Sign out everywhere else?', 'This device will remain signed in.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out others', style: 'destructive', onPress: () => void signOutOthers().then(() => Alert.alert('Other sessions signed out.')).catch((error) => Alert.alert('Could not update sessions', error.message)) }])} /> : null}
            {section === 'identity' ? <IdentityPanel snapshot={snapshot} onRoute={(route) => router.push(route as never)} /> : null}
            {section === 'experience' ? <ExperiencePanel snapshot={snapshot} onRoute={(route) => router.push(route as never)} /> : null}
            {section === 'relationships' ? <RelationshipsPanel snapshot={snapshot} onRoute={(route) => router.push(route as never)} /> : null}
            {section === 'privacy' ? <PrivacyPanel onRoute={(route) => router.push(route as never)} onDisclosure={() => Alert.alert('About Kivelle characters', 'Kivelle companions are fictional AI characters. They can remember shared context and simulate a life, but they are not real people and do not have human consciousness.')} onLogout={logout} /> : null}
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
    <View style={styles.personaNotice}><View style={styles.noticeIcon}><Sparkles size={18} color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>Currently living as {(props.personaName ?? props.name) || 'You'}</Text><Text style={styles.noticeCopy}>{props.lifeTitle ?? 'Main Life'} controls the Persona, companions, memories, plans, and history in your current reality. Changing account details does not rewrite that history.</Text></View></View>
    <View style={styles.saveRow}><GradientButton label={props.busy ? 'Saving…' : 'Save profile'} disabled={props.busy || !props.name.trim()} onPress={props.onSave} /></View>
  </View>;
}

function AccountPanel({ email, verified, tier, onRoute, onResend, onSignOutOthers }: { email?: string; verified: boolean; tier: string; onRoute: (route: string) => void; onResend: () => void; onSignOutOthers: () => void }) {
  return <View style={styles.panel}><PanelHeading title="Account" body="Manage sign-in, billing, and security without changing who you are inside a Kivelle Life." />
    <View style={styles.summaryCard}><View style={styles.summaryIcon}><KeyRound color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.summaryKicker}>SIGNED IN AS</Text><Text style={styles.summaryTitle}>{email ?? 'Your Kivelle account'}</Text><View style={styles.verified}><Check size={12} color={verified ? colors.success : colors.warm} /><Text style={[styles.verifiedText, { color: verified ? colors.success : colors.warm }]}>{verified ? 'Email verified' : 'Verification pending'}</Text></View></View></View>
    <SettingsGroup>
      <SettingsRow icon={<UserRound />} title="Account details & password" body="Change email, password, and your account avatar." onPress={() => onRoute('/account')} />
      {!verified ? <SettingsRow icon={<Check />} title="Resend verification email" body="Send another verification link to your inbox." onPress={onResend} /> : null}
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
    <SettingsRow icon={<CreditCard />} title="Plan & usage limits" body={subscriptionLabel(snapshot.entitlements?.tier)} onPress={() => onRoute('/subscription')} />
  </SettingsGroup><InfoCard title="Your controls are canonical">These settings constrain what Kivelle may generate. They do not force a character to ignore their own boundaries or relationship state.</InfoCard></View>;
}

function RelationshipsPanel({ snapshot, onRoute }: { snapshot: NonNullable<ReturnType<typeof useTogether.getState>['snapshot']>; onRoute: (route: string) => void }) {
  const companion = activeCompanion(snapshot);
  const memoryCount = companion ? snapshot.memories.filter((item) => item.character_instance_id === companion.id).length : 0;
  return <View style={styles.panel}><PanelHeading title="Relationships" body="Manage people and shared history. This area never substitutes a companion portrait for your own profile." />
    <View style={styles.metricRow}><Metric value={snapshot.characters.length} label="Companions" /><Metric value={snapshot.moments.length} label="Moments" /><Metric value={snapshot.sharedPlans.filter((plan) => ['scheduled', 'active'].includes(plan.status)).length} label="Upcoming" /></View>
    <SettingsGroup><SettingsRow icon={<UsersRound />} title="Your companions" body="Switch the active relationship or meet someone new." onPress={() => onRoute('/companions')} /><SettingsRow icon={<MessageCircle />} title="Conversations & resets" body="Conversation history, fresh threads, and complete character reset." onPress={() => onRoute('/conversation-controls')} /><SettingsRow icon={<Brain />} title="Memory Center" body={companion ? `${memoryCount} memories with ${companion.together_character_templates.name}` : 'Review and control relationship memories'} onPress={() => onRoute('/memories')} /></SettingsGroup>
  </View>;
}

function PrivacyPanel({ onRoute, onDisclosure, onLogout }: { onRoute: (route: string) => void; onDisclosure: () => void; onLogout: () => void }) {
  return <View style={styles.panel}><PanelHeading title="Privacy & safety" body="Control your data, understand Kivelle's AI characters, and manage account access." /><SettingsGroup><SettingsRow icon={<Shield />} title="Privacy and data controls" body="Personalization, analytics, export, and account deletion." onPress={() => onRoute('/privacy')} /><SettingsRow icon={<FileText />} title="AI disclosure" body="How fictional Kivelle characters and simulation work." onPress={onDisclosure} /><SettingsRow icon={<LogOut color={colors.danger} />} title="Sign out" body="Your relationships and history stay safely stored." onPress={onLogout} danger /></SettingsGroup><InfoCard title="A healthier relationship design">Your memories are visible and editable. Kivelle does not use guilt, loneliness, or dependency language to pressure you to return.</InfoCard><Text style={styles.version}>Kivelle.AI · 1.0.0</Text></View>;
}

function PanelHeading({ title, body }: { title: string; body: string }) { return <View style={styles.panelHeading}><Text style={styles.panelTitle}>{title}</Text><Text style={styles.panelBody}>{body}</Text></View>; }
function Field({ label, helper, children }: { label: string; helper?: string; children: ReactNode }) { return <View style={styles.field}><View style={styles.labelRow}><Text style={styles.label}>{label}</Text>{helper ? <Text style={styles.helper}>{helper}</Text> : null}</View>{children}</View>; }
function SettingsGroup({ children }: { children: ReactNode }) { return <View style={styles.group}>{children}</View>; }
function SettingsRow({ icon, title, body, onPress, danger = false }: { icon: ReactElement; title: string; body: string; onPress: () => void; danger?: boolean }) { return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.settingRow, pressed && styles.rowPressed]}><View style={[styles.rowIcon, danger && styles.rowIconDanger]}>{icon}</View><View style={{ flex: 1 }}><Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text><Text style={styles.rowBody}>{body}</Text></View><ChevronRight size={18} color={colors.dimmed} /></Pressable>; }
function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function InfoCard({ title, children }: { title: string; children: ReactNode }) { return <View style={styles.infoCard}><Text style={styles.infoTitle}>{title}</Text><Text style={styles.infoBody}>{children}</Text></View>; }

function splitList(value: string, limit: number) { return value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, limit); }
function subscriptionLabel(tier?: string | null) { if (tier === 'kivelle_max' || tier === 'unlimited') return 'Kivelle Max'; if (tier === 'kivelle_plus' || tier === 'together_plus') return 'Kivelle+'; return 'Kivelle Free'; }

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ambientOne: { position: 'absolute', width: 520, height: 520, borderRadius: 260, backgroundColor: 'rgba(142,73,190,.16)', top: -170, right: -90, ...(Platform.OS === 'web' ? ({ filter: 'blur(70px)' } as never) : {}) },
  ambientTwo: { position: 'absolute', width: 440, height: 440, borderRadius: 220, backgroundColor: 'rgba(221,82,132,.12)', bottom: -180, left: -80, ...(Platform.OS === 'web' ? ({ filter: 'blur(80px)' } as never) : {}) },
  modal: { width: '100%', backgroundColor: 'rgba(17,15,23,.72)', overflow: 'hidden', borderColor: 'rgba(255,255,255,.16)' },
  modalDesktop: { maxWidth: 1180, borderRadius: 30, borderWidth: 1, shadowColor: '#000', shadowOpacity: .6, shadowRadius: 45, shadowOffset: { width: 0, height: 24 } },
  modalMobile: { borderRadius: 0 },
  header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: 'rgba(255,255,255,.018)' },
  brandMark: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,99,215,.14)', borderWidth: 1, borderColor: 'rgba(155,99,215,.4)' },
  brandInitial: { color: '#D6ACFF', fontFamily: typography.display, fontSize: 20 },
  headerCopy: { flex: 1 }, title: { color: colors.text, fontFamily: typography.display, fontWeight: '600', fontSize: 25 },
  headerMeta: { color: colors.muted, fontSize: 10, marginTop: 2 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: .72, transform: [{ scale: .98 }] },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  sidebar: { width: 246, padding: spacing.lg, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: 'rgba(7,7,11,.55)', justifyContent: 'space-between' },
  sidebarEyebrow: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginBottom: 12 },
  sidebarLinks: { gap: 7 },
  sidebarLink: { minHeight: 48, paddingHorizontal: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sidebarLinkActive: { backgroundColor: 'rgba(139,58,181,.24)', borderWidth: 1, borderColor: 'rgba(183,93,231,.36)' },
  sidebarLinkText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' }, sidebarLinkTextActive: { color: '#F1D7FF' },
  sidebarFooter: { padding: 13, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: colors.border },
  sidebarFooterTitle: { color: colors.text, fontSize: 11, fontWeight: '800' }, sidebarFooterCopy: { color: colors.dimmed, fontSize: 9, lineHeight: 14, marginTop: 5 },
  mobileTabs: { gap: 7, paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  mobileTab: { minHeight: 37, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: colors.border },
  mobileTabActive: { backgroundColor: 'rgba(139,58,181,.25)', borderColor: 'rgba(183,93,231,.4)' }, mobileTabText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  main: { flex: 1 }, mainContent: { flexGrow: 1, padding: spacing.xl, paddingBottom: 70 },
  panel: { width: '100%', maxWidth: 780, alignSelf: 'center', gap: 18 },
  panelHeading: { gap: 5, marginBottom: 2 }, panelTitle: { color: colors.text, fontFamily: typography.display, fontSize: 30, fontWeight: '600' }, panelBody: { color: colors.muted, fontSize: 12, lineHeight: 18, maxWidth: 650 },
  profileHero: { minHeight: 130, flexDirection: 'row', alignItems: 'center', gap: 18, padding: 20, borderRadius: radius.lg, backgroundColor: 'rgba(85,59,105,.18)', borderWidth: 1, borderColor: 'rgba(194,137,225,.2)' },
  avatar: { width: 90, height: 90, borderRadius: 45, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#131219', borderWidth: 2, borderColor: 'rgba(199,104,234,.48)' },
  avatarInitial: { color: '#D36CFF', fontFamily: typography.display, fontSize: 38 }, camera: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet },
  profileHeroCopy: { flex: 1, alignItems: 'flex-start' }, profileName: { color: colors.text, fontFamily: typography.display, fontSize: 25 }, profileEmail: { color: colors.muted, fontSize: 11, marginTop: 2 },
  avatarButton: { minHeight: 35, marginTop: 12, paddingHorizontal: 13, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: colors.border }, avatarButtonText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  formCard: { gap: 16, padding: 20, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.028)', borderWidth: 1, borderColor: colors.borderBright },
  field: { gap: 7 }, labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }, label: { color: colors.text, fontSize: 12, fontWeight: '800' }, helper: { color: colors.dimmed, fontSize: 9 },
  input: { minHeight: 48, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 12, color: colors.text, backgroundColor: 'rgba(7,6,11,.48)', borderWidth: 1, borderColor: 'rgba(255,255,255,.13)' }, multiline: { minHeight: 100 }, counter: { alignSelf: 'flex-end', color: colors.dimmed, fontSize: 9, marginTop: -2 },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, column: { flex: 1, minWidth: 230 },
  personaNotice: { flexDirection: 'row', gap: 12, padding: 15, borderRadius: radius.md, backgroundColor: 'rgba(92,67,125,.11)', borderWidth: 1, borderColor: 'rgba(155,99,215,.22)' }, noticeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,99,215,.12)' }, noticeTitle: { color: colors.text, fontSize: 12, fontWeight: '800' }, noticeCopy: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 3 }, saveRow: { alignSelf: 'stretch' },
  summaryCard: { minHeight: 105, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: 'rgba(99,62,126,.14)', borderWidth: 1, borderColor: 'rgba(155,99,215,.2)' }, summaryIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,99,215,.12)' }, summaryKicker: { color: colors.violet, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, summaryTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 3 }, verified: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }, verifiedText: { fontSize: 9, fontWeight: '800' },
  group: { overflow: 'hidden', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: 'rgba(255,255,255,.024)' },
  settingRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, rowPressed: { backgroundColor: 'rgba(255,255,255,.045)' }, rowIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,99,215,.1)', color: colors.violet }, rowIconDanger: { backgroundColor: 'rgba(255,113,129,.08)' }, rowTitle: { color: colors.text, fontSize: 12, fontWeight: '800' }, rowBody: { color: colors.muted, fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  lifeHero: { minHeight: 116, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: 'rgba(109,58,121,.15)', borderWidth: 1, borderColor: 'rgba(232,82,137,.2)' }, lifeAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(232,82,137,.4)' }, lifeInitial: { color: colors.rose, fontFamily: typography.display, fontSize: 29 }, lifeName: { color: colors.text, fontFamily: typography.display, fontSize: 24, marginTop: 2 }, lifeMeta: { color: colors.muted, fontSize: 10, marginTop: 2 }, activePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.rose }, activePillText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  infoCard: { padding: 16, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: colors.border }, infoTitle: { color: colors.text, fontSize: 11, fontWeight: '800' }, infoBody: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 5 },
  metricRow: { flexDirection: 'row', gap: 10 }, metric: { flex: 1, minHeight: 84, justifyContent: 'center', padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.028)', borderWidth: 1, borderColor: colors.border }, metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 27 }, metricLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', marginTop: 3 }, version: { color: colors.dimmed, fontSize: 9, textAlign: 'center', marginTop: 6 },
});
