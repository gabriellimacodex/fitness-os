import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: 'react-jsx',
  },
  test: {
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
