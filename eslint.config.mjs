import nextConfig from 'eslint-config-next';
import tseslint from '@typescript-eslint/eslint-plugin';

const COMPLEXITY_WARN_LEVEL = 12;
const COMPLEXITY_BREAK_LEVEL = 35;

const eslintConfig = [
  ...nextConfig,
  {
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Console usage - allow warn, error, and debug
      'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }],
      
      // React hooks - allow setState in effects for external state sync (e.g., localStorage)
      'react-hooks/set-state-in-effect': 'off',
      
      // Unused imports and variables - ERROR to prevent builds
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_'
      }],
      
      // File size guardrail - warn at 500 lines (excluding blanks and comments)
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      
      // Cyclomatic complexity break guardrail. Warning-level reporting is handled in quality checks.
      complexity: ['error', { max: COMPLEXITY_BREAK_LEVEL }],
    },
  },
  {
    files: ['app/api/**/*.ts'],
    rules: {
      complexity: ['error', { max: COMPLEXITY_WARN_LEVEL }],
      'max-depth': ['error', 3],
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '.next-e2e/**',
      '.cache/**',
      'playwright-report/**',
      'test-results/**',
      '.playwright-artifacts-*/**',
      'coverage/**',
    ],
  },

  // ── Feature-sliced architecture boundary enforcement ──────────────────
  // Uses file-scoped no-restricted-imports blocks so each layer's
  // constraints are isolated and don't conflict with each other.

  // shared/ cannot import from features/ or widgets/
  {
    files: ['shared/**/*.ts', 'shared/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/features/*', '../features/*', '*/features/*'], message: 'shared/ cannot import from features/' },
          { group: ['@/widgets/*', '../widgets/*', '*/widgets/*'], message: 'shared/ cannot import from widgets/' },
        ],
      }],
    },
  },

  // features/ should not import from widgets/
  {
    files: ['features/**/*.ts', 'features/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['warn', {
        patterns: [
          { group: ['@/widgets/*', '../widgets/*', '*/widgets/*'], message: 'features/ should not import from widgets/' },
        ],
      }],
    },
  },

  // Discourage importing from the legacy hooks/ root — prefer feature-sliced paths
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-imports': ['warn', {
        patterns: [
          { group: ['@/hooks/*'], message: 'Use @/features/*, @/shared/*, or @/widgets/* instead of @/hooks/*' },
        ],
      }],
    },
  },
];

export default eslintConfig;
