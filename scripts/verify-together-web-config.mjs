import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve(process.argv[2] ?? 'dist');
const bundleDirectory = resolve(outputDirectory, '_expo/static/js/web');
const expectedSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

if (!expectedSupabaseUrl) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL is required to verify a production web export.');
}

const bundleNames = (await readdir(bundleDirectory)).filter((name) => name.endsWith('.js'));
const entries = bundleNames.filter((name) => /^entry-[a-f0-9]+\.js$/.test(name));
if (entries.length !== 1) {
  throw new Error(`Expected one web entry bundle in ${bundleDirectory}; found ${entries.length}.`);
}

const bundles = await Promise.all(bundleNames.map(async (name) => ({
  name,
  source: await readFile(resolve(bundleDirectory, name), 'utf8'),
})));
const forbiddenValues = [
  'https://example.supabase.co',
  'replace-with-the-public-publishable-key',
];

for (const value of forbiddenValues) {
  if (bundles.some((bundle) => bundle.source.includes(value))) {
    throw new Error('Production web export contains placeholder Supabase configuration. Rebuild with a cleared Metro cache and the EAS production environment.');
  }
}

const configuredBundles = bundles.filter((bundle) => bundle.source.includes(expectedSupabaseUrl));
if (configuredBundles.length === 0) {
  throw new Error('Production web export does not contain the configured Supabase endpoint. Rebuild with a cleared Metro cache.');
}

console.log(`Verified production web auth configuration in ${configuredBundles.map((bundle) => bundle.name).join(', ')}.`);
