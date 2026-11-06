import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { WorldPulseEventModal } from '../../src/components/WorldPulseEventModal';

/** Deep links and paywall returns use the same event popup as Home and Explore. */
export default function WorldPulseDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <Stack.Screen options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
    <WorldPulseEventModal eventId={id ?? null} onClose={() => router.back()} onNavigate={(href) => router.replace(href as never)} />
  </View>;
}
