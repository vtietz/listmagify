import nextConfig from 'eslint-config-next';

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // Console usage - allow warn, error, and debug
      'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }],
      
      // Unused imports and variables - ERROR to prevent builds
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_'
      }],
      
      // File size guardrail - warn at 500 lines (excluding blanks and comments)
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      
      // Cyclomatic complexity guardrail - warn at 20
      complexity: ['warn', { max: 20 }],
    },
  },
  {
    ignores: ['node_modules/**', '.next/**', 'coverage/**'],
  },
];

export default eslintConfig;
