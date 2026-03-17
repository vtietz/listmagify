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
    files: ['lib/music-provider/spotifyProvider.ts'],
    rules: {
      'max-lines': 'off',
    },
  },
  {
    ignores: ['node_modules/**', '.next/**', 'coverage/**'],
  },
];

export default eslintConfig;
