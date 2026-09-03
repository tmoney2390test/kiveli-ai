import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Heart } from 'lucide-react-native';
import { Body, PageTitle, Screen } from '../src/components';
import { colors, radius } from '../src/theme';

/** Legacy route retained so old links fail safely without exposing retired controls. */
export default function MediaContentSettings() {
  return <Screen>
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}><ArrowLeft color={colors.text} /></Pressable>
      <PageTitle>Photo boundaries</PageTitle>
    </View>
    <View style={styles.notice}>
      <Heart color={colors.violet} />
      <View style={styles.copy}>
        <Text style={styles.title}>Romantic photos</Text>
        <Body muted>Kivelle supports everyday and romantic companion photos. All generated media follows Kivelle safety rules.</Body>
      </View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  notice: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  copy: { flex: 1, gap: 6 },
  title: { color: colors.text, fontWeight: '900' },
});
