import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { ChevronDown } from 'lucide-react-native';
import { GradientButton } from '../../components/ui';
import { ThemedSettingPicker } from '../../components/settings/ThemedSettingPicker';
import { useSupportDraft } from '../../lib/supportDraft';
import { useSupportRequest } from '../../lib/useSupportRequest';
import {
  createSupportTicket,
  replyToSupportTicket,
  type SupportCategory,
} from '../../lib/operations';
import { supportFormErrors } from '../../lib/supportTicket';
import { useAuth } from '../../hooks/useAuth';
import { recoveryTopics } from '../../lib/supportRecovery';
import { supportRequestReferences } from '../../lib/mediaSupportReference';
import { colors } from '../../theme';
import { finishSupportScreenshots, parseScreenshots } from './attachments';
import { SupportScreenshots } from './SupportScreenshots';
import { supportStyles as s } from './styles';
const categories = [
  {
    value: 'bug',
    label: "Something isn't working",
    description: 'A broken feature or unexpected error.',
  },
  {
    value: 'billing',
    label: 'Billing or credits',
    description: 'Purchases, subscriptions, or credit balances.',
  },
  { value: 'safety', label: 'Safety concern', description: 'A safety or content concern.' },
  {
    value: 'account',
    label: 'Account access',
    description: 'Sign-in, profile, or account recovery.',
  },
  { value: 'feedback', label: 'Feedback or idea', description: 'Something you would like to see.' },
  { value: 'other', label: 'Something else', description: 'Anything else you need help with.' },
] as const;
export type SupportParams = {
  ticket?: string;
  mode?: string;
  topic?: string;
  mediaId?: string;
  conversationId?: string;
  messageId?: string;
  correlationId?: string;
  errorCode?: string;
  purchaseReference?: string;
};
export function SupportComposer(
  { ticketId, params = {}, onSent }: {
    ticketId?: string;
    params?: SupportParams;
    onSent: (ticketId: string) => void;
  },
) {
  const { session } = useAuth();
  const owner = session?.user.id ?? '', activeOwner = useRef(owner);
  activeOwner.current = owner;
  const saved = useSupportDraft(ticketId ? 'reply:' + ticketId : 'new', {
    category: 'bug' as SupportCategory,
    subject: '',
    message: '',
    topic: '',
    references: '{}',
    screenshots: '[]',
  });
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState(''),
    [picker, setPicker] = useState(false);
  const applied = useRef(false), alive = useRef(true), sending = useRef(false);
  const subjectInput = useRef<TextInput>(null), messageInput = useRef<TextInput>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const send = useSupportRequest();
  const [diagnostics] = useState(() => ({
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    buildId: Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Platform.OS === 'android'
      ? String(Constants.expoConfig?.android?.versionCode ?? 'unknown')
      : typeof document !== 'undefined'
      ? Array.from(document.scripts).map((script) => script.src.split('/').pop()).find((name) =>
        name?.startsWith('__common-')
      ) ?? 'web'
      : 'web',
  }));
  useEffect(() => {
    if (!saved.ready || applied.current || ticketId) return;
    applied.current = true;
    const topic = recoveryTopics.find((topic) => topic.id === params.topic),
      references = supportRequestReferences(params);
    if (!saved.draft.subject && !saved.draft.message && topic) {
      saved.update({
        category: params.conversationId ? 'bug' : topic.category,
        topic: topic.id,
        subject: params.conversationId ? 'Chat reply problem' : topic.title,
        references: JSON.stringify(references),
        message: references.errorCode
          ? `Error shown: ${references.errorCode}\n\nWhat happened: `
          : '',
      });
    }
  }, [saved.ready, params.topic, ticketId]);
  const draft = saved.draft,
    category = categories.find((item) => item.value === draft.category) ?? categories[0];
  let references: ReturnType<typeof supportRequestReferences> = {};
  try {
    references = supportRequestReferences(JSON.parse(draft.references));
  } catch { /* Corrupt saved context is ignored. */ }
  const hasReferences = Object.keys(references).length > 0,
    shots = parseScreenshots(draft.screenshots),
    pending = shots.some((row) => !row.ready);
  const disabled = busy || !saved.ready;
  const fieldErrors = supportFormErrors(draft.subject, draft.message, !!ticketId);
  const submit = async () => {
    if (disabled || uploading || sending.current) return;
    setAttempted(true);
    if (fieldErrors.subject || fieldErrors.message) {
      setError('Please check the highlighted fields.');
      (fieldErrors.subject ? subjectInput : messageInput).current?.focus();
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const readyShots = await finishSupportScreenshots(shots, owner);
      if (!alive.current || activeOwner.current !== owner) return;
      if (pending) saved.update({ screenshots: JSON.stringify(readyShots) });
      const attachmentIds = readyShots.map((row) => row.id).sort();
      let id = ticketId;
      if (ticketId) {
        await send({
          ticketId,
          message: draft.message.trim(),
          attachmentIds,
        }, replyToSupportTicket);
      } else {
        const result = await send({
          category: category.value,
          subject: draft.subject.trim(),
          message: draft.message.trim(),
          ...references,
          attachmentIds,
          diagnostics: { ...diagnostics, ...(draft.topic ? { topic: draft.topic } : {}) },
        }, createSupportTicket);
        id = result.ticket.id;
      }
      if (!alive.current) return;
      await saved.clear();
      if (alive.current) onSent(id!);
    } catch (caught) {
      if (alive.current) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Could not send. Your draft is saved; try again.',
        );
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <View style={s.card}>
      {ticketId ? <Text style={s.subtitle}>Add a reply</Text> : (
        <>
          <Text style={s.label}>What is this about?</Text>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={`Issue type: ${category.label}`}
            disabled={disabled}
            onPress={() => setPicker(true)}
            style={s.picker}
          >
            <Text style={[s.text, { flex: 1 }]}>{category.label}</Text>
            <ChevronDown color={colors.muted} size={18} />
          </Pressable>
          <ThemedSettingPicker
            visible={picker}
            title='What is this about?'
            choices={[...categories]}
            selected={category.value}
            disabled={disabled}
            onSelect={(value) => saved.update({ category: value })}
            onClose={() => setPicker(false)}
            testIDPrefix='support-category'
          />
          <View style={s.spread}>
            <Text style={s.label}>Subject</Text>
            <Text style={s.meta}>{draft.subject.length}/160</Text>
          </View>
          <TextInput
            ref={subjectInput}
            accessibilityLabel='Support request subject'
            value={draft.subject}
            onChangeText={(subject) => {
              saved.update({ subject });
              setError('');
            }}
            editable={!disabled}
            maxLength={160}
            placeholder='A short summary'
            placeholderTextColor={colors.dimmed}
            style={[s.input, attempted && fieldErrors.subject ? { borderColor: colors.danger } : null]}
          />
          {attempted && fieldErrors.subject ? <Text accessibilityRole='alert' style={s.error}>{fieldErrors.subject}</Text> : null}
        </>
      )}
      <View style={s.spread}>
        <Text style={s.label}>{ticketId ? 'Your message' : 'What happened?'}</Text>
        <Text style={s.meta}>{draft.message.length}/5000</Text>
      </View>
      <TextInput
        ref={messageInput}
        accessibilityLabel={ticketId ? 'Support reply' : 'Support request message'}
        value={draft.message}
        onChangeText={(message) => {
          saved.update({ message });
          setError('');
        }}
        editable={!disabled}
        maxLength={5000}
        multiline
        textAlignVertical='top'
        placeholder={ticketId
          ? 'Add details or ask a question'
          : 'What did you expect, and what happened instead?'}
        placeholderTextColor={colors.dimmed}
        style={[s.input, s.message, attempted && fieldErrors.message ? { borderColor: colors.danger } : null]}
      />
      {attempted && fieldErrors.message ? <Text accessibilityRole='alert' style={s.error}>{fieldErrors.message}</Text> : null}
      <SupportScreenshots
        value={draft.screenshots}
        onChange={(screenshots) => saved.update({ screenshots })}
        disabled={disabled}
        onBusy={setUploading}
      />
      {!ticketId && hasReferences
        ? (
          <View style={s.row}>
            <Text style={[s.meta, { flex: 1 }]}>
              Linked to the original {references.mediaId
                ? 'media request'
                : references.conversationId
                ? 'conversation'
                : 'error'}. Chat history is not attached.
            </Text>
            <Pressable
              accessibilityRole='button'
              disabled={disabled}
              style={s.action}
              onPress={() => saved.update({ references: '{}' })}
            >
              <Text style={s.link}>Remove link</Text>
            </Pressable>
          </View>
        )
        : null}
      {!ticketId
        ? (
          <Text style={s.meta}>
            App version and device platform are included to help us troubleshoot.
          </Text>
        )
        : null}
      {saved.persistenceError
        ? <Text style={s.meta}>Keep this page open: your device could not save the draft.</Text>
        : draft.message || draft.subject || shots.length
        ? <Text accessibilityLiveRegion='polite' style={s.meta}>Draft saved on this device</Text>
        : null}
      {pending && !uploading
        ? <Text style={s.meta}>We'll retry unfinished screenshots when you send. You can also remove them.</Text>
        : null}
      <GradientButton
        label={busy
          ? pending ? 'Finishing screenshots…' : 'Sending…'
          : uploading
          ? 'Uploading screenshot…'
          : ticketId
          ? 'Send reply'
          : 'Send request'}
        disabled={disabled || uploading}
        onPress={() => void submit()}
      />
      {error ? <Text accessibilityRole='alert' style={s.error}>{error}</Text> : null}
    </View>
  );
}
