import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'supabase/.branches',
      'supabase/.temp',
      // Deno edge functions — not part of the Vite/TS frontend, run under a
      // different runtime (Deno) and intentionally use `any` in their IO
      // glue. They have their own typing story and shouldn't trip the
      // project's frontend lint rules.
      'supabase/functions/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: { react: { version: '18.3' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-no-target-blank': ['error', { enforceDynamicLinks: 'always' }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Catch stray console.log left from debugging. console.error / warn are
      // intentional (ErrorBoundary, AuthContext failure path).
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // App code must go through the DAL. Type-only imports of Session/User
      // etc. are allowed since they have no runtime footprint.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message:
                'Import Supabase only inside src/data/*. Components and hooks should use the @/data helpers.',
              allowTypeImports: true,
            },
          ],
        },
      ],
      // DAL contract: only files inside src/data/ may call supabase.from().
      // Everything else goes through a typed helper.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='supabase'][callee.property.name='from']",
          message:
            'Direct supabase.from() outside src/data/ is forbidden. Use a DAL helper.',
        },
      ],
    },
  },
  {
    // Exception for the data access layer.
    files: ['src/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },
  {
    // Tooling configs run in Node, not the browser.
    files: ['vite.config.ts', 'tailwind.config.js', 'postcss.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  }
);
