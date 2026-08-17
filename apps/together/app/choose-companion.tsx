import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, MessageCircle, Sparkles } from 'lucide-react-native';
import { GradientButton, LoadingSkeleton, Screen } from '../src/components';
import { characterAssets } from '../src/assets';
import { bootstrap } from '../src/lib/api';
import { quickStartProfile } from '../src/lib/quickStart';
import { useTogether } from '../src/store/useTogether';
import { colors, radius, spacing, typography } from '../src/theme';

export default function ChooseCompanion() {
  const params = useLocalSearchParams<{ adultConfirmed?: string }>();
  const { snapshot, setSnapshot, refresh, loading } = useTogether();
  const [selectedSlug, setSelectedSlug] = useState('');
  const [adult, setAdult] = useState(params.adultConfirmed === '1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!snapshot && !loading) void refresh();
  }, [loading, refresh, snapshot]);

  const choices = useMemo(
    () => (snapshot?.discoverableCharacters ?? []).filter((item) => item.can_be_selected !== false),
    [snapshot],
  );

  if (!snapshot) return <LoadingSkeleton label="Opening Kivelle…" />;

  const continueWithChoice = async () => {
    const selected = choices.find((item) => item.slug === selectedSlug);
    if (!selected) {
      setError('Choose someone you want to meet.');
      return;
    }
    if (!adult) {
      setError('Confirm that you are 18 or older to continue.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await bootstrap(quickStartProfile(selected.id));
      setSnapshot(next);
      router.replace(`/chat?character=${selected.slug}` as never);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your first conversation could not be prepared.');
    } finally {
      setBusy(false);
    }
  };

  const selected = choices.find((item) => item.slug === selectedSlug);

  return <Screen contentStyle={styles.screen}>
    <View style={styles.header}>
      <Text style={styles.brand}>Kivelle.AI</Text>
      <View style={styles.kicker}><Sparkles size={13} color={colors.rose} /><Text style={styles.kickerText}>YOUR STORY STARTS HERE</Text></View>
      <Text style={styles.title}>Who catches your attention?</Text>
      <Text style={styles.subtitle}>Choose who you want to message first. Each person has their own life, places, and way of meeting you.</Text>
    </View>

    <View style={styles.people}>
      {choices.map((person) => {
        const chosen = selectedSlug === person.slug;
        return <Pressable
          key={person.id}
          accessibilityRole="radio"
          accessibilityState={{ checked: chosen }}
          accessibilityLabel={`Choose ${person.name}`}
          onPress={() => { setSelectedSlug(person.slug); setError(''); }}
          style={({ pressed }) => [styles.person, chosen && styles.personSelected, pressed && styles.personPressed]}
        >
          <Image source={characterAssets[person.slug]} style={styles.portrait} contentFit="cover" contentPosition="top" />
          <View style={styles.personCopy}>
            <View style={styles.personTop}>
              <Text style={styles.name}>{person.name}</Text>
              {chosen ? <View style={styles.selected}><Check size={13} color="#fff" /><Text style={styles.selectedText}>CHOSEN</Text></View> : null}
            </View>
            <Text style={styles.occupation}>{person.occupation}</Text>
            <Text style={styles.hook}>{person.together_character_versions.interests.slice(0,3).join(' · ')}</Text>
            <Text style={styles.bio} numberOfLines={2}>{person.biography}</Text>
          </View>
        </Pressable>;
      })}
    </View>

    {!params.adultConfirmed ? <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: adult }}
      onPress={() => { setAdult(!adult); setError(''); }}
      style={[styles.age, adult && styles.ageActive]}
    >
      <View style={[styles.check, adult && styles.checkActive]}>{adult ? <Check size={14} color="#fff" /> : null}</View>
      <Text style={styles.ageText}>I confirm I’m 18 or older.</Text>
    </Pressable> : <View style={styles.confirmed}><Check size={14} color={colors.success} /><Text style={styles.confirmedText}>18+ confirmed</Text></View>}

    {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}
    <GradientButton
      icon={<MessageCircle size={18} color="#fff" />}
      label={busy ? 'Opening your story…' : selected ? `Meet ${selected.name}` : 'Choose someone'}
      disabled={busy}
      onPress={() => void continueWithChoice()}
    />
    <Text style={styles.disclosure}>Fictional AI characters · Your choice sets the first relationship in focus</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { minHeight: '100%', maxWidth: 620, justifyContent: 'center', paddingHorizontal: 14, paddingTop: 22, paddingBottom: 30, gap: spacing.md },
  header: { gap: 6, marginBottom: 3 },
  brand: { fontFamily: typography.display, color: colors.rose, fontSize: 20, fontWeight: '700' },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  kickerText: { color: '#F5BDD0', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  title: { fontFamily: typography.display, color: colors.text, fontSize: 31, lineHeight: 37, fontWeight: '600' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  people: { gap: 9 },
  person: { minHeight: 112, flexDirection: 'row', overflow: 'hidden', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  personSelected: { borderColor: colors.rose, backgroundColor: 'rgba(232,93,140,.08)' },
  personPressed: { transform: [{ scale: .992 }], opacity: .94 },
  portrait: { width: 102, alignSelf: 'stretch', backgroundColor: colors.elevated },
  personCopy: { flex: 1, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 10 },
  personTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontFamily: typography.display, color: colors.text, fontSize: 23, fontWeight: '600' },
  occupation: { color: colors.warm, fontSize: 10, fontWeight: '800', marginTop: 1 },
  hook: { color: '#EAC3D2', fontSize: 10, fontWeight: '700', marginTop: 5 },
  bio: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.rose },
  selectedText: { color: '#fff', fontSize: 7, fontWeight: '900', letterSpacing: .7 },
  age: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  ageActive: { borderColor: 'rgba(232,93,140,.5)', backgroundColor: 'rgba(232,93,140,.08)' },
  check: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderBright },
  checkActive: { backgroundColor: colors.rose, borderColor: colors.rose },
  ageText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  confirmed: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedText: { color: colors.success, fontSize: 11, fontWeight: '800' },
  errorBox: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.sm, backgroundColor: 'rgba(255,113,129,.1)', borderWidth: 1, borderColor: 'rgba(255,113,129,.28)' },
  error: { color: '#FF9BA7', fontSize: 12, textAlign: 'center' },
  disclosure: { color: colors.dimmed, fontSize: 9, textAlign: 'center' },
});
