import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, ChevronRight, LifeBuoy, MessageCircleWarning, Shield, UserRound } from 'lucide-react-native';
import { Screen } from '../src/components';
import { SupportRecoveryLinks } from '../src/components/SupportRecoveryLinks';
import { LegalSection } from '../src/components/LegalPage';
import { colors, radius } from '../src/theme';

export default function Help() {
  return <Screen contentStyle={styles.page}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.back}><ArrowLeft size={20} color={colors.text} /></Pressable>
      <Text accessibilityRole="header" style={styles.heading}>Help Center</Text>
    </View>
    <HelpLink icon={<LifeBuoy color={colors.violet} />} title="Get support" body="Send a private request and track its status." route="/support/new" prominent />
    <SupportRecoveryLinks />
    <View style={styles.links}>
      <HelpLink icon={<Shield color={colors.rose} />} title="Privacy and data" body="Read how Kivelle handles personal data and your privacy controls." route="/privacy-policy" />
      <HelpLink icon={<Shield color={colors.rose} />} title="Delete your account" body="See the steps to remove your account and stored data." route="/delete-account" />
      <HelpLink icon={<MessageCircleWarning color={colors.warm} />} title="Safety guidelines" body="Age, content, real-person, and reporting rules." route="/community-guidelines" />
      <HelpLink icon={<UserRound color={colors.violet} />} title="Terms of Service" body="Account, billing, content, and acceptable-use terms." route="/terms" />
    </View>
    <View style={styles.answers}>
      <LegalSection title="Messages and connectivity">Drafts are saved on your device as you type. If your connection drops, Kivelle keeps the draft, marks an interrupted send, and lets you retry with the same request ID to prevent duplicate messages.</LegalSection>
      <LegalSection title="Photos, voice, and calls">Photo and voice generation can take longer than text. Accepted requests remain visible while processing and refresh when complete. Credits are only handled by server-authoritative purchase and usage flows.</LegalSection>
      <LegalSection title="Billing">Manage subscriptions through the store or billing provider used to purchase them. For billing help, contact support@kivelli.app and include a receipt date—not a full payment-card number.</LegalSection>
      <LegalSection title="Safety or urgent concerns">Use the in-chat report action for a specific generated message. Kivelle is not an emergency service; contact local emergency services for immediate real-world danger.</LegalSection>
    </View>
  </Screen>;
}

function HelpLink({ icon, title, body, route, prominent = false }: { icon: React.ReactNode; title: string; body: string; route: string; prominent?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => router.push(route as never)} style={({ pressed }) => [styles.row, prominent && styles.prominent, pressed && styles.pressed]}>
    {icon}<View style={styles.rowCopy}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text></View><ChevronRight size={18} color={colors.dimmed} />
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 940, alignSelf: 'center', gap: 22, paddingTop: 12, paddingBottom: 48 },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { color: colors.text, fontSize: 23, fontWeight: '800' },
  links: { gap: 10 },
  answers: { gap: 22, padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: 'rgba(22,16,31,.76)' },
  row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)' },
  prominent: { borderColor: 'rgba(203,166,239,.38)', backgroundColor: 'rgba(154,104,255,.1)' },
  pressed: { opacity: .75 },
  rowCopy: { flex: 1 },
  title: { color: colors.text, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
