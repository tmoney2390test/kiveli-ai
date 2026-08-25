import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve(process.argv[2] ?? 'dist');
const bundleDirectory = resolve(outputDirectory, '_expo/static/js/web');
const expectedSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

if (!expectedSupabaseUrl) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL is required to verify a production web export.');
}

const entries = (await readdir(bundleDirectory)).filter((name) => /^entry-[a-f0-9]+\.js$/.test(name));
if (entries.length !== 1) {
  throw new Error(`Expected one web entry bundle in ${bundleDirectory}; found ${entries.length}.`);
}

const bundle = await readFile(resolve(bundleDirectory, entries[0]), 'utf8');
const forbiddenValues = [
  'https://example.supabase.co',
  'replace-with-the-public-publishable-key',
];

for (const value of forbiddenValues) {
  if (bundle.includes(value)) {
    throw new Error('Production web export contains placeholder Supabase configuration. Rebuild with a cleared Metro cache and the EAS production environment.');
  }
}

if (!bundle.includes(expectedSupabaseUrl)) {
  throw new Error('Production web export does not contain the configured Supabase endpoint. Rebuild with a cleared Metro cache.');
}

console.log(`Verified production web auth configuration in ${entries[0]}.`);
