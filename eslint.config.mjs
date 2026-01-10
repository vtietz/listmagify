import nextConfig from 'eslint-config-next';
import tseslint from '@typescript-eslint/eslint-plugin';

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
      
      // Cyclomatic complexity guardrail - warn at 50 (React JSX conditionals count as decision points)
      complexity: ['warn', { max: 50 }],
    },
  },
  {
    ignores: ['node_modules/**', '.next/**', 'coverage/**'],
  },
];

export default eslintConfig;
