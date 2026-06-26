import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Las primitivas de UI (estilo shadcn) y el store exportan, además de
    // componentes, variantes y hooks/utilidades junto a ellos. Es el patrón
    // canónico de shadcn/ui; relajamos la regla de Fast Refresh para esos archivos.
    files: [
      'src/components/ui/**/*.tsx',
      'src/components/treasury/display.tsx',
      'src/data/store.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
