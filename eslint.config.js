import js from '@eslint/js'
import globals from 'globals'
import prettierConfig from 'eslint-config-prettier'

export default [
  // 1. Configuración base recomendada por ESLint
  js.configs.recommended,

  // 2. Configuración global de variables y archivos
  {
    languageOptions: {
      globals: {
        ...globals.browser, // Descomenta si es para navegador
        ...globals.node, // Descomenta si es para Node.js
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
  },

  // 3. Reglas personalizadas de calidad de código
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // 4. Integración con Prettier (DEBE IR AL FINAL)
  // Esto desactiva las reglas de formato de ESLint para dejar que Prettier las maneje
  prettierConfig,
]
