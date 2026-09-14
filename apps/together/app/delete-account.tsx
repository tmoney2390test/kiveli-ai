import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LegalPage, LegalSection } from '../src/components/LegalPage';
import { colors, radius } from '../src/theme';

export default function DeleteAccount() {
  return <LegalPage eyebrow="ACCOUNT" title="Delete your Kivelli account" intro="You can request deletion in Kivelli or by contacting us if you cannot sign in." footerLabel="Updated September 14, 2026 · Kivelli">
    <LegalSection title="Delete in Kivelli">
      Sign in, open Settings → Privacy & safety → Delete Kivelle account, review any active subscription, verify your identity, then type DELETE to confirm. You can also open the deletion flow directly below.
    </LegalSection>
    <Pressable accessibilityRole="link" accessibilityLabel="Open Kivelli account deletion" onPress={() => router.push('/privacy?delete=1' as never)} style={styles.action}>
      <Text style={styles.actionText}>Open account deletion</Text>
    </Pressable>
    <LegalSection title="If you cannot sign in">
      Email support@kivelli.app from the email address on your account with the subject “Account deletion request.” We may need to verify that you own the account before processing the request. Do not send your password or a sign-in code.
    </LegalSection>
    <Pressable accessibilityRole="link" accessibilityLabel="Email Kivelli support to request account deletion" onPress={() => void Linking.openURL('mailto:support@kivelli.app?subject=Account%20deletion%20request')} style={styles.secondaryAction}>
      <Text style={styles.secondaryText}>Email a deletion request</Text>
    </Pressable>
    <LegalSection title="What deletion covers">
      Deletion removes the active account, profile, personas, conversations, memories, relationships, exports, and stored private media. Store subscriptions may need to be canceled separately through Google Play or Apple. Limited billing, security, and legal records may be retained where required; encrypted backups expire on their normal rotation. See the Privacy Policy or contact support for details about retained records.
    </LegalSection>
    <View style={styles.note}><Text style={styles.noteText}>Account deletion is permanent and cannot be undone.</Text></View>
  </LegalPage>;
}

const styles = StyleSheet.create({
  action: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.rose },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  secondaryAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderBright },
  secondaryText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  note: { padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,107,121,.09)', borderWidth: 1, borderColor: 'rgba(255,107,121,.22)' },
  noteText: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
