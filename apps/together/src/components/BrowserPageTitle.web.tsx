import { useGlobalSearchParams, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import { browserPageTitle } from '../lib/browserPageTitle';
import { useTogether } from '../store/useTogether';

export function BrowserPageTitle() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  // Select the title, rather than the whole snapshot, so streamed messages do
  // not rerender the document head when the page or companion has not changed.
  const title = useTogether((state) => browserPageTitle(pathname, params, state.snapshot));
  return <Head><title>{title}</title></Head>;
}
