import { router } from 'expo-router';
import { CreateMenu } from '../../src/components/CreateMenu';

// Keep direct links to the Create tab useful as well as the bottom-bar action.
export default function Create() {
  return <CreateMenu visible onClose={() => router.replace('/home')} onCreateCharacter={() => router.replace('/create/companion')} />;
}
