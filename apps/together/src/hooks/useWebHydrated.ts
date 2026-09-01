import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Static web output cannot know the browser viewport or restored session.
 * Keep the server and the browser's first render identical, then enhance the
 * page once React owns the document.
 */
export function useWebHydrated() {
  const [hydrated, setHydrated] = useState(Platform.OS !== 'web');
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
