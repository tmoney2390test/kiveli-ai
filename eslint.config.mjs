import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/dist-*/**', '**/.expo/**', '**/worker-configuration.d.ts', 'supabase/functions/**/*.ts', 'scripts/simulate-life-engine.ts', 'scripts/sync-kivelle-reference-media.ts', 'scripts/audit-kivelle-character-references.ts', 'scripts/audit-kivelle-voice-production.ts', 'scripts/audit-eos-meridian-production.ts', 'scripts/smoke-kivelle-voice-production.ts', 'scripts/prepare-kivelle-character-lora.ts', 'scripts/create-kivelle-media-benchmark.ts', 'apps/together/babel.config.js', 'apps/together/metro.config.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser }, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: { '@typescript-eslint/consistent-type-imports': 'error', '@typescript-eslint/no-floating-promises': 'error', '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['apps/together/**/*.{ts,tsx}'],
    rules: {
      // Expo Router's generated typed-route declarations exist after a local
      // export but not at the start of a clean CI checkout. Route assertions
      // are therefore required locally even when CI considers them redundant.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off', '@typescript-eslint/no-unsafe-assignment': 'off', '@typescript-eslint/no-unsafe-member-access': 'off', '@typescript-eslint/no-unsafe-argument': 'off', '@typescript-eslint/no-unsafe-call': 'off', '@typescript-eslint/no-unsafe-return': 'off', '@typescript-eslint/unbound-method': 'off', '@typescript-eslint/no-misused-promises': 'off', '@typescript-eslint/no-base-to-string': 'off', '@typescript-eslint/no-unsafe-enum-comparison': 'off', '@typescript-eslint/no-require-imports': 'off',
    },
  },
  { files: ['**/tests/**/*.ts'], rules: { '@typescript-eslint/require-await': 'off' } },
  { files: ['**/*.{js,mjs,cjs}'], ...tseslint.configs.disableTypeChecked }
);

