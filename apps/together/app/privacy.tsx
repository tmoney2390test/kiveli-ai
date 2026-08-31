import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CheckCircle2, Download, ExternalLink, RefreshCw, ShieldAlert, Trash2, X } from 'lucide-react-native';
import { FrostedSurface, PageTitle, Screen, SectionHeader } from '../src/components';
import { colors, radius, spacing } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { manageAccount } from '../src/lib/api';
import { useAuth } from '../src/hooks/useAuth';
import { authProviderState } from '../src/lib/authProviders';
import { exportStatusCopy } from '../src/lib/accountSecurity';
import type { SocialAuthProvider } from '../src/lib/socialAuth';

type ExportState = { id: string; status: 'queued' | 'processing' | 'ready' | 'failed' | 'expired'; fileName: string; expiresAt: string; signedUrl?: string; sizeBytes?: number | null };
type DeletionPreview = { canDelete: boolean; billingAction: 'none' | 'cancel_stripe' | 'external_action'; providerLabel: string | null; message: string; requiresRecentAuthentication: boolean };

export default function Privacy() {
  const params = useLocalSearchParams<{ delete?: string; verified?: string }>();
  const { snapshot, refresh, clear } = useTogether();
  const { session, signOut, reauthenticate, signInWithSocial } = useAuth();
  const provider = authProviderState(session?.user), settings = snapshot?.profile?.privacy_settings ?? { personalization: true, analytics: true };
  const [deleteOpen, setDeleteOpen] = useState(false), [confirmation, setConfirmation] = useState(''), [currentPassword, setCurrentPassword] = useState(''), [deleting, setDeleting] = useState(false);
  const [deletePreview, setDeletePreview] = useState<DeletionPreview | null>(null), [deleteError, setDeleteError] = useState(''), [previewLoading, setPreviewLoading] = useState(false), [socialVerified, setSocialVerified] = useState(params.verified === '1');
  const [exportState, setExportState] = useState<ExportState | null>(null), [exportBusy, setExportBusy] = useState(false), [exportError, setExportError] = useState('');

  const toggle = async (key: string, value: boolean) => { try { await manageAccount({ action: 'privacy', settings: { ...settings, [key]: value } }); await refresh(); } catch (error) { Alert.alert('Could not update privacy', error instanceof Error ? error.message : 'Please try again.'); } };

  const loadDeletePreview = async () => {
    setPreviewLoading(true); setDeleteError('');
    try { setDeletePreview(await manageAccount<DeletionPreview>({ action: 'delete_preview' })); }
    catch (error) { setDeleteError(error instanceof Error ? error.message : 'Account deletion details could not be loaded.'); }
    finally { setPreviewLoading(false); }
  };
  const openDelete = () => { setConfirmation(''); setCurrentPassword(''); setDeletePreview(null); setDeleteError(''); setSocialVerified(params.verified === '1'); setDeleteOpen(true); void loadDeletePreview(); };

  useEffect(() => { if (params.delete === '1') openDelete(); }, [params.delete, params.verified]);

  const requestExport = async () => {
    if (exportBusy) return;
    setExportBusy(true); setExportError('');
    try {
      const queued = await manageAccount<ExportState>({ action: 'export_request' });
      setExportState(queued);
      for (let attempt = 0; attempt < 40; attempt++) {
        await delay(750);
        const next = await manageAccount<ExportState>({ action: 'export_status', exportId: queued.id });
        setExportState(next);
        if (['ready', 'failed', 'expired'].includes(next.status)) break;
      }
    } catch (error) { setExportError(error instanceof Error ? error.message : 'Your data export could not be prepared.'); }
    finally { setExportBusy(false); }
  };

  const downloadExport = async () => {
    if (!exportState?.id) return;
    setExportBusy(true); setExportError('');
    try {
      const next = await manageAccount<ExportState>({ action: 'export_status', exportId: exportState.id });
      setExportState(next);
      if (!next.signedUrl) throw new Error(next.status === 'expired' ? 'That private link expired. Create a new export.' : 'The private download link is not ready yet.');
      await Linking.openURL(next.signedUrl);
    } catch (error) { setExportError(error instanceof Error ? error.message : 'The download could not be opened.'); }
    finally { setExportBusy(false); }
  };

  const verifySocial = async () => {
    const socialProvider = provider.providers.find((item): item is SocialAuthProvider => item === 'google' || item === 'apple');
    if (!socialProvider) { setDeleteError('Add a password from Sign-in & security, then use it to confirm deletion.'); return; }
    setDeleting(true); setDeleteError('');
    try { await signInWithSocial(socialProvider, '/privacy?delete=1&verified=1'); setSocialVerified(true); }
    catch (error) { setDeleteError(error instanceof Error ? error.message : 'Your sign-in could not be verified.'); }
    finally { setDeleting(false); }
  };

  const remove = async () => {
    if (confirmation !== 'DELETE' || !deletePreview?.canDelete || deleting) return;
    setDeleting(true); setDeleteError('');
    try {
      if (provider.hasPassword) await reauthenticate(currentPassword);
      else if (!socialVerified) { setDeleteError('Verify your connected sign-in before deleting the account.'); return; }
      await manageAccount({ action: 'delete', confirmation: 'DELETE' });
      await signOut().catch(() => undefined);
      clear(); setDeleteOpen(false); router.replace('/auth');
    } catch (error) { setDeleteError(error instanceof Error ? error.message : 'Your account could not be deleted. Nothing else was changed.'); }
    finally { setDeleting(false); }
  };

  const deleteReady = confirmation === 'DELETE' && Boolean(deletePreview?.canDelete) && (provider.hasPassword ? currentPassword.length > 0 : socialVerified);
  return <Screen>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={() => router.canGoBack() ? router.back() : router.replace('/settings?section=privacy')}><ArrowLeft color={colors.text} /></Pressable><PageTitle>Privacy</PageTitle></View>
    <Text style={styles.lead}>You control what Kivelle keeps and how the experience is personalized.</Text>
    <SectionHeader title="Experience controls" />
    <Toggle title="Personalized experience" body="Use your profile and memories to tailor your experience. Turning this off removes personal memory and reflection context from new replies." value={settings.personalization !== false} onChange={(value) => void toggle('personalization', value)} />
    <Toggle title="Product analytics" body="Help us understand what works without exposing your conversations. Turning this off is enforced before analytics are stored." value={settings.analytics !== false} onChange={(value) => void toggle('analytics', value)} />
    <Pressable accessibilityRole="button" accessibilityLabel="Manage remembered information" onPress={() => router.push('/memories?privacy=1')} style={styles.row}><ShieldAlert color={colors.violet} /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>Manage remembered information</Text><Text style={styles.rowBody}>Review, forget, or disable remembered information on any plan.</Text></View></Pressable>
    <SectionHeader title="Your data" />
    <Pressable accessibilityRole="button" accessibilityLabel={exportState?.status === 'ready' ? 'Download private Kivelle data export' : 'Create private Kivelle data export'} accessibilityState={{ disabled: exportBusy }} disabled={exportBusy} onPress={() => exportState?.status === 'ready' ? void downloadExport() : void requestExport()} style={styles.row}>{exportBusy ? <ActivityIndicator color={colors.rose} /> : exportState?.status === 'ready' ? <CheckCircle2 color={colors.success} /> : exportState?.status === 'failed' || exportState?.status === 'expired' ? <RefreshCw color={colors.rose} /> : <Download color={colors.rose} />}<View style={{ flex: 1 }}><Text style={styles.rowTitle}>{exportState?.status === 'ready' ? 'Download your private ZIP' : exportBusy ? 'Preparing your export…' : exportState?.status === 'failed' || exportState?.status === 'expired' ? 'Create a new export' : 'Export your Kivelle data'}</Text><Text style={styles.rowBody}>{exportState ? exportStatusCopy(exportState.status) : 'Prepare a private ZIP of your profile, relationships, conversations, and history. The link expires after 24 hours.'}</Text>{exportState?.sizeBytes ? <Text style={styles.rowMeta}>{formatBytes(exportState.sizeBytes)} · {exportState.fileName}</Text> : null}</View>{exportState?.status === 'ready' ? <ExternalLink size={18} color={colors.muted} /> : null}</Pressable>
    {exportError ? <Text accessibilityRole="alert" style={styles.error}>{exportError}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Delete Kivelle account" onPress={openDelete} style={[styles.row, styles.dangerRow]}><Trash2 color={colors.danger} /><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.danger }]}>Delete Kivelle account</Text><Text style={styles.rowBody}>Review billing, verify your identity, and permanently remove account data and private media.</Text></View></Pressable>
    <Text style={styles.note}>Kivelle companions are fictional AI characters. Kivelle never uses guilt or dependency to pressure you to return.</Text>

    <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteOpen(false)} accessibilityViewIsModal>
      <View style={styles.modalBackdrop}><Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => !deleting && setDeleteOpen(false)} /><FrostedSurface intensity={85} style={styles.modalCard}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.modalHeader}><Text accessibilityRole="header" style={styles.modalTitle}>Delete your account?</Text><Pressable accessibilityRole="button" accessibilityLabel="Close account deletion" hitSlop={10} disabled={deleting} onPress={() => setDeleteOpen(false)}><X color={colors.muted} /></Pressable></View>
        <Text style={styles.modalBody}>This permanently removes your Kivelle account, conversations, memories, relationships, exports, and stored media. This cannot be undone.</Text>
        <View style={styles.billingReview}>{previewLoading ? <View style={styles.loadingRow}><ActivityIndicator color={colors.violet} /><Text style={styles.billingText}>Checking subscription status…</Text></View> : deletePreview ? <><Text style={styles.billingTitle}>{deletePreview.canDelete ? 'Billing reviewed' : 'Subscription action needed'}</Text><Text style={styles.billingText}>{deletePreview.message}</Text>{!deletePreview.canDelete ? <Pressable accessibilityRole="button" onPress={() => { setDeleteOpen(false); router.push('/subscription'); }} style={styles.billingButton}><Text style={styles.billingButtonText}>Open subscription settings</Text></Pressable> : null}</> : <Pressable accessibilityRole="button" onPress={() => void loadDeletePreview()} style={styles.billingButton}><Text style={styles.billingButtonText}>Retry billing check</Text></Pressable>}</View>
        {provider.hasPassword ? <><Text style={styles.confirmLabel}>Current password</Text><TextInput accessibilityLabel="Current password to delete account" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" placeholder="Confirm your password" placeholderTextColor={colors.dimmed} style={styles.confirmInput} /></> : <View style={styles.socialVerify}><Text style={styles.confirmLabel}>Verify your sign-in</Text><Text style={styles.billingText}>{socialVerified ? 'Your connected sign-in was verified.' : 'Reauthenticate with your connected provider before account deletion.'}</Text>{!socialVerified ? <Pressable accessibilityRole="button" disabled={deleting} onPress={() => void verifySocial()} style={styles.billingButton}><Text style={styles.billingButtonText}>Verify with {provider.providers.includes('google') ? 'Google' : 'Apple'}</Text></Pressable> : <View style={styles.verifiedRow}><CheckCircle2 size={17} color={colors.success} /><Text style={styles.verifiedText}>Identity verified</Text></View>}</View>}
        <Text style={styles.confirmLabel}>Type DELETE to confirm</Text><TextInput accessibilityLabel="Type DELETE to confirm account deletion" autoCapitalize="characters" autoCorrect={false} value={confirmation} onChangeText={setConfirmation} placeholder="DELETE" placeholderTextColor={colors.dimmed} style={styles.confirmInput} />
        {deleteError ? <Text accessibilityRole="alert" style={styles.error}>{deleteError}</Text> : null}
        <View style={styles.modalActions}><Pressable accessibilityRole="button" disabled={deleting} onPress={() => setDeleteOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Not now</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Delete account permanently" accessibilityState={{ disabled: deleting || !deleteReady }} disabled={deleting || !deleteReady} onPress={() => void remove()} style={[styles.deleteButton, (deleting || !deleteReady) && styles.disabled]}><Text style={styles.deleteText}>{deleting ? 'Deleting…' : 'Delete permanently'}</Text></Pressable></View>
      </ScrollView></FrostedSurface></View>
    </Modal>
  </Screen>;
}

function Toggle({ title, body, value, onChange }: { title: string; body: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowBody}>{body}</Text></View><Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ false: colors.elevated, true: colors.rose }} /></View>; }
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const formatBytes = (bytes: number) => bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 }, lead: { color: colors.muted, lineHeight: 20 }, row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, rowTitle: { color: colors.text, fontWeight: '800' }, rowBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, rowMeta: { color: colors.violet, fontSize: 10.5, fontWeight: '800', marginTop: 5 }, dangerRow: { borderColor: 'rgba(255,107,121,.35)' }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(154,104,255,.07)' }, error: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(4,5,12,.82)', alignItems: 'center', justifyContent: 'center', padding: 20 }, modalCard: { width: '100%', maxWidth: 560, maxHeight: '94%', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', backgroundColor: 'rgba(26,20,40,.98)', overflow: 'hidden' }, modalContent: { padding: 22 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, modalTitle: { fontSize: 24, fontWeight: '900', color: colors.text }, modalBody: { color: colors.muted, lineHeight: 21, marginTop: 12 }, billingReview: { marginTop: 16, padding: 14, gap: 7, borderRadius: radius.md, backgroundColor: 'rgba(154,104,255,.08)', borderWidth: 1, borderColor: 'rgba(154,104,255,.2)' }, loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, billingTitle: { color: colors.text, fontWeight: '900' }, billingText: { color: colors.muted, fontSize: 12, lineHeight: 18 }, billingButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 14, marginTop: 4, borderRadius: radius.md, backgroundColor: 'rgba(154,104,255,.14)' }, billingButtonText: { color: colors.violet, fontWeight: '900', fontSize: 12 }, socialVerify: { marginTop: 4 }, verifiedRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7 }, verifiedText: { color: colors.success, fontSize: 12, fontWeight: '800' }, confirmLabel: { color: colors.text, fontWeight: '800', fontSize: 13, marginTop: 16, marginBottom: 8 }, confirmInput: { color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(255,255,255,.05)', fontWeight: '800' }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }, cancelButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 18 }, cancelText: { color: colors.text, fontWeight: '800' }, deleteButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.danger }, deleteText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: .35 },
});
