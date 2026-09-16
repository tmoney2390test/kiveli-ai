import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Brain, ChevronRight, CreditCard, Heart, LifeBuoy, Plus, Settings, Shield, Sparkles, UsersRound, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTogether } from '../store/useTogether';
import { useProfileAvatarUrl } from '../hooks/useProfileAvatarUrl';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import { privateStoredImageSource } from '../lib/mediaImageSource';
import { subscriptionHref } from '../lib/subscriptionPresentation';
import { colors } from '../theme';

const accent = '#CBA6EF';

export function AccountMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const snapshot = useTogether(state => state.snapshot);
  const { data: subscription, isError, refetch } = useSubscriptionStatus(visible && Boolean(snapshot));
  const avatarPath = snapshot?.profile?.avatar_path;
  const avatarUrl = useProfileAvatarUrl(avatarPath);
  const avatar = privateStoredImageSource(avatarUrl, avatarPath);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const desktop = width >= 768;
  const name = snapshot?.profile?.display_name?.trim() || 'Your account';
  useEffect(() => setAvatarFailed(false), [avatarUrl]);
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [visible, onClose]);
  const open = (href: string) => { onClose(); router.push(href as never); };
  const row = (label: string, icon: ReactNode, href: string, detail?: string) => <Pressable key={label} accessibilityRole="button" onPress={() => open(href)} style={({ pressed }) => [s.row, pressed && s.pressed]}>{icon}<View style={s.copy}><Text style={s.label}>{label}</Text>{detail ? <Text style={s.muted}>{detail}</Text> : null}</View><ChevronRight size={18} color={accent}/></Pressable>;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[s.backdrop, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 12) }, desktop && s.desktop]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close account menu" style={StyleSheet.absoluteFill} onPress={onClose}/>
      <View accessibilityViewIsModal style={[s.sheet, { maxHeight: height - insets.top - Math.max(insets.bottom, 12) - 24 }]}>
        <View style={s.header}><Text accessibilityRole="header" style={s.title}>Your account</Text><Pressable accessibilityRole="button" accessibilityLabel="Close account menu" onPress={onClose} style={s.close}><X color={colors.text} size={24}/></Pressable></View>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" accessibilityLabel="View your profile and gallery" onPress={() => open('/settings?section=profile')} style={({ pressed }) => [s.hero, pressed && s.pressed]}>
            <View pointerEvents="none" style={s.glow}/><View style={s.avatar}>{avatar && !avatarFailed ? <Image source={avatar} style={StyleSheet.absoluteFill} contentFit="cover" onError={() => setAvatarFailed(true)}/> : <Text style={s.initial}>{name.charAt(0).toUpperCase()}</Text>}</View>
            <View style={s.copy}><Text style={s.name}>{name}</Text><Text style={s.heroHint}>View profile & gallery</Text></View><ChevronRight size={20} color={accent}/>
          </Pressable>
          <View style={[s.shortcuts, width < 360 && { flexDirection: 'column' }]}>
            <Pressable accessibilityRole="button" onPress={() => open('/create/companion')} style={({ pressed }) => [s.shortcut, pressed && s.pressed]}><Plus size={22} color={accent}/><Text style={s.shortcutLabel}>Create companion</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => open('/subscription')} style={({ pressed }) => [s.shortcut, pressed && s.pressed]}><CreditCard size={22} color={accent}/><Text style={s.shortcutLabel}>Plans & credits</Text></Pressable>
          </View>
          <View style={s.group}>
            {row(subscription?.capabilities.displayName ?? 'Your membership', <Sparkles size={21} color={accent}/>, '/subscription', 'View plan & manage subscription')}
            {row(subscription ? `${subscription.creditBalance.total.toLocaleString()} credits` : 'Your credits', <CreditCard size={21} color={accent}/>, subscriptionHref({ intent: 'credits' }), subscription ? 'Balance & credit options' : isError ? 'Balance unavailable — open to review' : 'Loading balance…')}
            {isError ? <Pressable accessibilityRole="button" onPress={() => void refetch()} style={s.retry}><Text style={s.heroHint}>Refresh account details</Text></Pressable> : null}
          </View>
          <View style={s.group}>
            {row('Personas & Lives', <UsersRound size={21} color={accent}/>, '/personas')}
            {row('Memory Center', <Brain size={21} color={accent}/>, '/memories')}
            {row('Relationships', <Heart size={21} color={accent}/>, '/settings?section=relationships')}
            {row('Privacy & safety', <Shield size={21} color={accent}/>, '/settings?section=privacy')}
            {row('Help & support', <LifeBuoy size={21} color={accent}/>, '/settings?section=support')}
            {row('All settings', <Settings size={21} color={accent}/>, '/settings')}
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.65)', justifyContent: 'flex-end', paddingHorizontal: 12 },
  desktop: { justifyContent: 'center', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 460, alignSelf: 'center', flexShrink: 1, backgroundColor: '#17121E', borderRadius: 24, borderWidth: 1, borderColor: '#40334F', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingVertical: 10, gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 23, fontWeight: '700' },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingTop: 0, gap: 14 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: '#352247', borderColor: '#725294', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(169,100,241,.16)', top: -100, left: -45 },
  avatar: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: '#8050BA', justifyContent: 'center', alignItems: 'center' },
  initial: { color: '#fff', fontSize: 30, fontWeight: '700' },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  name: { color: colors.text, fontSize: 20, fontWeight: '700', flexShrink: 1 },
  heroHint: { color: '#DCC7F1', fontSize: 13, lineHeight: 19 },
  shortcuts: { flexDirection: 'row', gap: 10 },
  shortcut: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 58, padding: 12, borderWidth: 1, borderColor: '#9F7CC3', borderRadius: 12 },
  shortcutLabel: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  group: { borderWidth: 1, borderColor: '#3B3047', borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 15, minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3B3047' },
  label: { color: colors.text, fontSize: 16, flexShrink: 1 },
  muted: { color: '#BDB0CA', fontSize: 12, lineHeight: 18 },
  retry: { padding: 14, minHeight: 44 },
  pressed: { opacity: .72 },
});
