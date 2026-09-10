import Head from 'expo-router/head';

// Preserve native metadata; page and character titles apply to browser tabs only.
export function BrowserPageTitle() {
  return <Head><title>Kivelle.AI</title></Head>;
}
