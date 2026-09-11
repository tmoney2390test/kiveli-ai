import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { manageConversation } from '../lib/api';
import { freshChatConfirmed, freshChatRequest } from '../lib/freshChat';
import { useAuth } from '../hooks/useAuth';
import { colors, radius } from '../theme';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';

export function FreshChatConfirmation({ userId, characterInstanceId, conversationId, name, onClose, onComplete }: {
  userId: string; characterInstanceId: string; conversationId: string; name: string;
  onClose: () => void; onComplete: () => void;
}) {
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => randomUUID());
  const { session } = useAuth();
  const owner = useRef(session?.user.id);
  owner.current = session?.user.id;
  const pending = useRef(false);
  const mounted = useRef(true);
  const insets = useSafeAreaInsets();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const confirm = async () => {
    if (pending.current || !freshChatConfirmed(phrase) || owner.current !== userId) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await manageConversation(freshChatRequest({ characterInstanceId, conversationId, requestId, typedConfirmation: phrase }));
      if (mounted.current && owner.current === userId) onComplete();
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : 'The fresh chat could not be confirmed. Please retry.');
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const close = () => { if (!pending.current) onClose(); };
  return <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
      <FrostedBackdrop intensity={38} />
      <Pressable accessibilityLabel="Cancel fresh chat" style={StyleSheet.absoluteFill} onPress={close} />
      <View pointerEvents="box-none" style={[styles.backdrop, { paddingTop: Math.max(20, insets.top), paddingBottom: Math.max(20, insets.bottom) }]}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
        <FrostedSurface intensity={88} style={styles.card}>
          <View accessibilityViewIsModal>
            <Text accessibilityRole="header" style={styles.title}>Start a fresh chat with {name}?</Text>
            <Text style={styles.copy}>Your current transcript will move to History. Memories, photos, plans, and your relationship will stay.</Text>
            <Text style={styles.label}>Type NEW CHAT to confirm</Text>
            <TextInput accessibilityLabel="Type NEW CHAT to confirm" value={phrase} onChangeText={setPhrase} editable={!busy} autoCapitalize="characters" autoCorrect={false} maxLength={24} placeholder="NEW CHAT" placeholderTextColor={colors.muted} style={styles.input} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy || !freshChatConfirmed(phrase)} accessibilityState={{ disabled: busy || !freshChatConfirmed(phrase), busy }} onPress={() => void confirm()} style={[styles.confirm, (busy || !freshChatConfirmed(phrase)) && styles.disabled]}>
              <Text style={styles.buttonText}>{busy ? 'Starting…' : 'Start fresh chat'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.cancel}><Text style={styles.buttonText}>Keep current chat</Text></Pressable>
          </View>
        </FrostedSurface>
      </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  scroll: { width: '100%', maxWidth: 440, maxHeight: '100%', flexGrow: 0 },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 24, borderRadius: radius.xl },
  title: { fontFamily: 'Georgia', fontSize: 26, lineHeight: 32, color: colors.text },
  copy: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginVertical: 16 },
  label: { color: colors.text, fontSize: 13, marginBottom: 10 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, color: colors.text, fontSize: 16 },
  error: { color: colors.danger, marginTop: 12, fontSize: 13 },
  confirm: { minHeight: 48, marginTop: 20, borderWidth: 1, borderColor: colors.violet, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  cancel: { minHeight: 48, marginTop: 8, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: '700' }, disabled: { opacity: 0.45 },
});
