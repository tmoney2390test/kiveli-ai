import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateNativeReleaseEnvironment(env, platform) {
  const required = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_NATIVE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_KIVELLE_REVENUECAT_ENABLED', 'EXPO_PUBLIC_KIVELLE_GOOGLE_AUTH_ENABLED'];
  if (platform === 'ios') required.push('EXPO_PUBLIC_KIVELLE_APPLE_AUTH_ENABLED', 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
  else required.push('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY');
  const errors = required.filter((name) => !env[name]?.trim()).map((name) => `${name} is missing`);
  for (const name of required.filter((name) => name.endsWith('_ENABLED'))) {
    if (!/^(true|1|on|yes)$/i.test(env[name] ?? '')) errors.push(`${name} must be enabled for a release build`);
  }
  for (const name of required.filter((name) => name.endsWith('_URL'))) {
    try { const url = new URL(env[name]); if (url.protocol !== 'https:' || /localhost|127\.0\.0\.1|placeholder/.test(url.hostname)) errors.push(`${name} is not a release HTTPS endpoint`); }
    catch { errors.push(`${name} is not a valid URL`); }
  }
  for (const name of Object.keys(env)) if (name.startsWith('EXPO_PUBLIC_') && /SECRET|PRIVATE_KEY|SERVICE_ROLE/.test(name)) errors.push(`${name} must not be exposed in a client build`);
  return errors;
}

export function validateNativeBuildProfiles(config) {
  return Object.entries(config.build ?? {}).flatMap(([name, profile]) => profile.environment ? [] : [`${name} must explicitly select an EAS environment`]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(new URL('../apps/together/eas.json', import.meta.url), 'utf8'));
  const configOnly = process.argv.includes('--profiles-only') || process.env.EAS_BUILD_PROFILE==='development';
  const errors = [...validateNativeBuildProfiles(config), ...(configOnly ? [] : validateNativeReleaseEnvironment(process.env, (process.argv.includes('--platform')?process.argv[process.argv.indexOf('--platform')+1]:process.env.EAS_BUILD_PLATFORM) ?? 'ios'))];
  if (errors.length) { console.error(`Native release preflight failed:\n${errors.join('\n')}`); process.exitCode = 1; }
  else console.log(configOnly ? 'Native profile mapping verified.' : 'Native release environment verified (values redacted).');
}
