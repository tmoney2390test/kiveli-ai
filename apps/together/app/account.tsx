import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { ArrowLeft, Camera, Check, Mail, ShieldCheck } from 'lucide-react-native';
import { GradientButton, PageTitle } from '../src/components';
import { colors, radius, spacing } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { useAuth } from '../src/hooks/useAuth';
import { manageAccount } from '../src/lib/api';
import { authProviderState } from '../src/lib/authProviders';
import { supabase } from '../src/lib/supabase';
import { cleanupNormalizedImage, normalizeUserImage, type NormalizedUserImage } from '../src/lib/imageUploads';

export default function Account() {
  const { snapshot, refresh } = useTogether();
  const { session, updateEmail, updatePassword, resendPendingEmailChange, signOutOthers } = useAuth();
  const profile = snapshot?.profile;
  const provider = authProviderState(session?.user);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [about, setAbout] = useState(profile?.about_me ?? '');
  const [interests, setInterests] = useState((profile?.interests ?? []).join(', '));
  const [goals, setGoals] = useState((profile?.experience_goals ?? []).join(', '));
  const [avatar, setAvatar] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!profile || hydrated.current) return;
    hydrated.current = true;
    setName(profile.display_name ?? '');
    setAbout(profile.about_me ?? '');
    setInterests((profile.interests ?? []).join(', '));
    setGoals((profile.experience_goals ?? []).join(', '));
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    if (!profile?.avatar_path) {
      setAvatar(null);
      return () => { cancelled = true; };
    }
    void supabase.storage.from('together-user-media').createSignedUrl(profile.avatar_path, 3600).then(({ data }) => {
      if (!cancelled) setAvatar(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [profile?.avatar_path]);

  const save = async () => {
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
      Alert.alert('Profile saved', 'Your Kivelle preferences are up to date.');
    } catch (caught) {
      Alert.alert('Could not save', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to choose an account photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (result.canceled || !result.assets[0] || !session) return;
    const asset = result.assets[0];
    setBusy(true);
    let normalized: NormalizedUserImage | null = null;
    try {
      normalized = await normalizeUserImage({ uri: asset.uri, width: asset.width, height: asset.height, fileSize: asset.fileSize, fileName: asset.fileName }, .9);
      const path = `${session.user.id}/avatar-${Date.now()}.jpg`;
      const blob = await (await fetch(normalized.uri)).blob();
      const { error } = await supabase.storage.from('together-user-media').upload(path, blob, { contentType: normalized.mimeType, upsert: false, cacheControl: '31536000' });
      if (error) throw error;
      await manageAccount({
        action: 'profile', displayName: name.trim() || profile?.display_name || 'You', aboutMe: about.trim(),
        interests: splitList(interests, 10), goals: splitList(goals, 4), avatarPath: path,
      });
      const { data: signed } = await supabase.storage.from('together-user-media').createSignedUrl(path, 3600);
      setAvatar(signed?.signedUrl ?? avatar);
      await refresh();
    } catch (caught) {
      Alert.alert('Photo upload failed', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      cleanupNormalizedImage(normalized?.uri);
      setBusy(false);
    }
  };

  const changeEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email.includes('@')) return;
    void updateEmail(email).then(() => {
      setNewEmail('');
      Alert.alert('Check both inboxes', 'Confirm the email change to finish updating your account.');
    }).catch((caught) => Alert.alert('Could not update email', caught instanceof Error ? caught.message : 'Please try again.'));
  };

  const setPassword = () => {
    if (newPassword.length < 8) return;
    void updatePassword(newPassword).then(() => {
      setNewPassword('');
      Alert.alert(provider.hasPassword ? 'Password updated' : 'Password added');
    }).catch((caught) => Alert.alert('Could not update password', caught instanceof Error ? caught.message : 'Please try again.'));
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}><ArrowLeft color={colors.text} /></Pressable><PageTitle>Profile</PageTitle></View>
    <View style={styles.hero}>
      <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={() => void pick()} style={styles.avatar}>
        {avatar ? <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={styles.initial}>{(name || 'Y')[0]?.toUpperCase()}</Text>}
        <View style={styles.camera}><Camera size={14} color="#fff" /></View>
      </Pressable>
      <Text style={styles.email}>{session?.user.email}</Text>
      <Text style={styles.provider}>{provider.label}</Text>
      <View style={styles.verified}><Check size={13} color={provider.verifiedEmail ? colors.success : colors.warm} /><Text style={{ color: provider.verifiedEmail ? colors.success : colors.warm }}>{provider.verifiedEmail ? 'Verified email' : 'Email verification pending'}</Text></View>
      {provider.pendingEmail ? <Text style={styles.pending}>Pending change: {provider.pendingEmail}</Text> : null}
    </View>

    <Label text="Display name" />
    <TextInput accessibilityLabel="Display name" value={name} onChangeText={setName} style={styles.input} placeholder="Your name" placeholderTextColor={colors.muted} />
    <Label text="About you" />
    <TextInput accessibilityLabel="About you" value={about} onChangeText={setAbout} style={[styles.input, styles.about]} multiline maxLength={280} placeholder="A little context your companions can know about you." placeholderTextColor={colors.muted} />
    <Label text="Interests" />
    <TextInput accessibilityLabel="Interests" value={interests} onChangeText={setInterests} style={styles.input} placeholder="Movies, travel, music" placeholderTextColor={colors.muted} />
    <Label text="What you are here for" />
    <TextInput accessibilityLabel="What you are here for" value={goals} onChangeText={setGoals} style={styles.input} placeholder="Dating, Friendship, Stories" placeholderTextColor={colors.muted} />
    <GradientButton label={busy ? 'Saving…' : 'Save profile'} disabled={busy || !name.trim()} onPress={() => void save()} />

    <Section title="Sign-in & security" />
    <TextInput accessibilityLabel="New email address" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholder="New email address" placeholderTextColor={colors.muted} />
    <Pressable accessibilityRole="button" disabled={!newEmail.trim()} onPress={changeEmail} style={styles.row}><Mail color={colors.rose} /><Text style={styles.rowText}>Change email</Text></Pressable>
    <TextInput accessibilityLabel={provider.hasPassword ? 'New password' : 'Add a password'} value={newPassword} onChangeText={setNewPassword} secureTextEntry style={styles.input} placeholder={provider.hasPassword ? 'New password (8+ characters)' : 'Add a password (8+ characters)'} placeholderTextColor={colors.muted} />
    <Pressable accessibilityRole="button" disabled={newPassword.length < 8} onPress={setPassword} style={styles.row}><ShieldCheck color={colors.violet} /><Text style={styles.rowText}>{provider.hasPassword ? 'Update password' : 'Add a password'}</Text></Pressable>
    {provider.pendingEmail ? <Pressable accessibilityRole="button" onPress={() => void resendPendingEmailChange().then(() => Alert.alert('Confirmation sent', 'Check your new email address.')).catch((caught) => Alert.alert('Could not send email', caught instanceof Error ? caught.message : 'Please try again.'))} style={styles.link}><Text style={styles.linkText}>Resend email-change confirmation</Text></Pressable> : null}
    <Pressable accessibilityRole="button" onPress={() => Alert.alert('Sign out everywhere else?', 'This keeps this device signed in.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out others', style: 'destructive', onPress: () => void signOutOthers().then(() => Alert.alert('Other sessions signed out.')).catch((caught) => Alert.alert('Could not update sessions', caught instanceof Error ? caught.message : 'Please try again.')) }])} style={styles.link}><Text style={styles.linkText}>Sign out other sessions</Text></Pressable>
  </ScrollView>;
}

const splitList = (value: string, limit: number) => value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, limit);
const Label = ({ text }: { text: string }) => <Text style={styles.label}>{text}</Text>;
const Section = ({ title }: { title: string }) => <Text style={styles.section}>{title}</Text>;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: 80, gap: 10 }, header: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 8 },
  hero: { alignItems: 'center', gap: 6, marginBottom: 12 }, avatar: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated, borderWidth: 2, borderColor: colors.rose },
  initial: { fontFamily: 'Georgia', fontSize: 42, color: colors.text }, camera: { position: 'absolute', right: 0, bottom: 1, width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose },
  email: { color: colors.text, fontWeight: '700' }, provider: { color: colors.muted, fontSize: 11, fontWeight: '800' }, verified: { flexDirection: 'row', alignItems: 'center', gap: 4, fontSize: 12 }, pending: { color: colors.warm, fontSize: 11 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 5 }, input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 12 },
  about: { height: 92, textAlignVertical: 'top' }, section: { fontFamily: 'Georgia', fontSize: 22, color: colors.text, marginTop: 16 }, row: { minHeight: 52, flexDirection: 'row', gap: 11, alignItems: 'center', paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface },
  rowText: { color: colors.text, fontWeight: '700' }, link: { paddingVertical: 8 }, linkText: { color: colors.rose, fontWeight: '700', fontSize: 13 },
});
