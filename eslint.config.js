import { builtinModules } from 'node:module';

import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const platformOnly = 'mdvlt-core runs on every platform: pass platform APIs in via an adapter.';

export default defineConfig(
  globalIgnores(['**/dist/', '**/coverage/']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['packages/mdvlt-core/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: builtinModules.map((name) => ({ name, message: platformOnly })),
          patterns: [
            {
              group: ['node:*', 'electron', '@capacitor/*', 'react', 'react-dom'],
              message: platformOnly,
            },
          ],
        },
      ],
    },
  },
  prettier,
);
