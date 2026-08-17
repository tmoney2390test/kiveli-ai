import { useLocalSearchParams } from 'expo-router';
import { PlanLiveScreen } from '../src/components/PlanLiveScreen';

export default function PlanLiveRoute() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  return <PlanLiveScreen planId={planId} />;
}
