import { router, useLocalSearchParams } from 'expo-router';
import { StoryCaseScreen } from '../../src/stories/StoryCaseScreen';

export default function StoryCaseRoute() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  return <StoryCaseScreen slug={slug ?? ''} onBack={() => router.push('/stories' as never)} />;
}
