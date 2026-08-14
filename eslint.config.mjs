import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/dist-*/**', '**/.expo/**', 'supabase/functions/**/*.ts', 'apps/together/babel.config.js', 'apps/together/metro.config.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser }, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: { '@typescript-eslint/consistent-type-imports': 'error', '@typescript-eslint/no-floating-promises': 'error', '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['apps/together/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off', '@typescript-eslint/no-unsafe-member-access': 'off', '@typescript-eslint/no-unsafe-argument': 'off', '@typescript-eslint/no-unsafe-call': 'off', '@typescript-eslint/no-unsafe-return': 'off', '@typescript-eslint/unbound-method': 'off', '@typescript-eslint/no-misused-promises': 'off', '@typescript-eslint/no-base-to-string': 'off', '@typescript-eslint/no-unsafe-enum-comparison': 'off', '@typescript-eslint/no-require-imports': 'off',
    },
  },
  { files: ['**/tests/**/*.ts'], rules: { '@typescript-eslint/require-await': 'off' } },
  { files: ['**/*.{js,mjs,cjs}'], ...tseslint.configs.disableTypeChecked }
);
