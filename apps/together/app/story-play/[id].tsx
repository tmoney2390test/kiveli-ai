import { router, useLocalSearchParams } from 'expo-router';
import { StoryPlayScreen } from '../../src/stories/StoryPlayScreen';

export default function StoryPlayRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <StoryPlayScreen
      campaignId={id ?? ''}
      onCampaignReplaced={(campaignId) => router.replace(`/story-play/${campaignId}` as never)}
      onExit={() => router.replace('/stories' as never)}
    />
  );
}
