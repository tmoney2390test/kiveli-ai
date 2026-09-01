import { useEffect, useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { LoadingSkeleton } from '../src/components';
import { activePlanChatHref } from '../src/lib/planNavigation';
import { useTogether } from '../src/store/useTogether';

export default function PlanLiveRoute() {
  const params = useLocalSearchParams<{ planId?: string | string[] }>();
  const snapshot = useTogether((state) => state.snapshot);
  const planId = Array.isArray(params.planId) ? params.planId[0] : params.planId;
  const destination = useMemo(() => {
    if (!snapshot || !planId) return null;
    const plan = snapshot.sharedPlans.find((item) => item.id === planId);
    if (!plan) return null;
    const character = snapshot.characters.find((item) => item.id === plan.character_instance_id);
    if (!character) return null;
    const groupConversation = plan.source_conversation_id
      ? snapshot.conversations.find((item) => item.id === plan.source_conversation_id && item.kind === 'group')
      : null;
    return activePlanChatHref({
      planId,
      characterHandle: character.together_character_templates.public_handle ?? character.together_character_templates.slug,
      groupConversationId: groupConversation?.id,
    });
  }, [planId, snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    router.replace((destination ?? '/(tabs)/dates') as never);
  }, [destination, snapshot]);

  return <LoadingSkeleton label={destination ? 'Opening your conversation…' : 'Opening your plans…'} />;
}
