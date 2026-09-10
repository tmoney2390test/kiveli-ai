import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RotateCcw, Sparkles } from 'lucide-react-native';
import { colors } from '../theme';
import { VIDEO_ACCENT, VIDEO_ACCENT_FILL, type VideoPromptIdea } from '../lib/videoCreator';

type Props = { value: string; onChange: (value: string) => void; onEnhance: (prompt: string) => Promise<string>; placeholder: string; helper?: string; suggestions: VideoPromptIdea[]; testID: string; disabled?: boolean };

export function VideoPromptField({ value, onChange, onEnhance, placeholder, helper, suggestions, testID, disabled = false }: Props) {
  const [polishing, setPolishing] = useState(false), [preview, setPreview] = useState<{ original: string; polished: string } | null>(null), [undo, setUndo] = useState<{ original: string; polished: string } | null>(null), [error, setError] = useState<string | null>(null);
  const latest = useRef(value), mounted = useRef(true), revision = useRef(0);
  latest.current = value;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++; }; }, []);
  useEffect(() => { if (preview && value !== preview.original) setPreview(null); if (undo && value !== undo.polished) setUndo(null); }, [value, preview, undo]);
  const update = (next: string) => { revision.current++; onChange(next); setPreview(null); setUndo(null); setError(null); };
  const polish = async () => {
    if (disabled || polishing || value.trim().length < 2) return;
    const before = value, ticket = ++revision.current;
    setPolishing(true); setError(null); setPreview(null);
    try {
      const next = (await onEnhance(before.trim())).trim();
      if (!mounted.current || ticket !== revision.current || latest.current !== before) return;
      if (next.length < 2 || next.length > 400) throw new Error('The polished prompt could not be used. Your original is unchanged.');
      setPreview({ original: before, polished: next });
    } catch (cause) { if (mounted.current && ticket === revision.current) setError(cause instanceof Error ? cause.message : 'Could not polish the prompt. Your original is unchanged.'); }
    finally { if (mounted.current) setPolishing(false); }
  };
  const apply = () => { if (!preview || latest.current !== preview.original) return; onChange(preview.polished); setUndo(preview); setPreview(null); };
  return <View style={s.root}>
    <View style={s.editor}>
      <TextInput testID={testID} accessibilityLabel="Describe the video you want" value={value} onChangeText={update} editable={!disabled} placeholder={placeholder} placeholderTextColor={colors.muted} maxLength={400} multiline style={s.input}/>
      <View style={s.meta}><Text style={s.count}>{value.length} / 400</Text>
        <Pressable testID={`${testID}-enhance`} accessibilityRole="button" accessibilityLabel={undo ? 'Undo prompt polish' : 'Polish prompt'} disabled={disabled || polishing || value.trim().length < 2} onPress={() => { if (undo) { onChange(undo.original); setUndo(null); } else void polish(); }} style={[s.polish, (disabled || value.trim().length < 2) && s.disabled]}>
          {polishing ? <ActivityIndicator size="small" color={VIDEO_ACCENT}/> : undo ? <RotateCcw size={15} color={VIDEO_ACCENT}/> : <Sparkles size={15} color={VIDEO_ACCENT}/>}<Text style={s.polishText}>{polishing ? 'Polishing…' : undo ? 'Undo polish' : 'Polish prompt'}</Text>
        </Pressable>
      </View>
    </View>
    {helper ? <Text style={s.helper}>{helper}</Text> : null}
    {preview ? <View testID={`${testID}-review`} style={s.review}>
      <Text accessibilityRole="header" style={s.reviewTitle}>Review polished prompt</Text><Text style={s.preview}>{preview.polished}</Text>
      <View style={s.actions}><Pressable accessibilityRole="button" disabled={disabled} onPress={apply} style={s.apply}><Text style={s.polishText}>Use polished prompt</Text></Pressable><Pressable accessibilityRole="button" disabled={disabled} onPress={() => setPreview(null)} style={s.polish}><Text style={s.helper}>Keep original</Text></Pressable></View>
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <View style={s.ideas}><Text style={s.helper}>Try an idea</Text>{suggestions.map(idea => <Pressable key={idea.label} accessibilityRole="button" disabled={disabled} onPress={() => update(idea.prompt)} style={[s.idea, disabled && s.disabled]}><Text style={s.ideaText}>{idea.label}</Text></Pressable>)}</View>
  </View>;
}
const s = StyleSheet.create({
  root: { width: '100%', gap: 9 }, editor: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(5,4,10,.36)', overflow: 'hidden' },
  input: { width: '100%', minHeight: 90, maxHeight: 150, padding: 14, color: colors.text, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' },
  meta: { paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, count: { color: colors.muted, fontSize: 11 },
  polish: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }, polishText: { color: VIDEO_ACCENT, fontSize: 12, fontWeight: '600' }, disabled: { opacity: .42 },
  helper: { color: colors.textSecondary, fontSize: 11, lineHeight: 17 }, ideas: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, idea: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,.035)' }, ideaText: { color: colors.textSecondary, fontSize: 12 },
  review: { padding: 12, gap: 8, borderWidth: 1, borderColor: VIDEO_ACCENT, borderRadius: 12, backgroundColor: VIDEO_ACCENT_FILL }, reviewTitle: { color: colors.text, fontSize: 13, fontWeight: '600' }, preview: { color: colors.text, fontSize: 13, lineHeight: 20 }, actions: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' }, apply: { paddingHorizontal: 10, minHeight: 38, justifyContent: 'center', backgroundColor: VIDEO_ACCENT_FILL, borderRadius: 8 }, error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
});
