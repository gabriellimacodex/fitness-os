import eslint from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

const webConfig = nextVitals.map((config) => ({
  ...config,
  files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
  settings: {
    ...config.settings,
    react: { version: '19.2' },
  },
}));

const restrictedImport = (name, message) => ({ name, message });
const restrictedPattern = (group, message) => ({
  group: [`${group}/*`],
  message,
});

export default tseslint.config(
  {
    ignores: [
      '**/.next/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      'next-env.d.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...webConfig,
  {
    files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            restrictedImport(
              '@fitness-os/database',
              'Web clients must access persistence through the Fastify API.',
            ),
            restrictedImport(
              '@fitness-os/domain',
              'Web clients must consume API contracts rather than domain internals.',
            ),
          ],
          patterns: [
            restrictedPattern(
              '@fitness-os/database',
              'Web clients must access persistence through the Fastify API.',
            ),
            restrictedPattern(
              '@fitness-os/domain',
              'Web clients must consume API contracts rather than domain internals.',
            ),
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            restrictedImport(
              '@fitness-os/ui',
              'The Fastify API must not depend on presentation components.',
            ),
            restrictedImport(
              'next',
              'The Fastify API is independent from the Next.js runtime.',
            ),
          ],
          patterns: [
            restrictedPattern(
              '@fitness-os/ui',
              'The Fastify API must not depend on presentation components.',
            ),
            restrictedPattern(
              'next',
              'The Fastify API is independent from the Next.js runtime.',
            ),
          ],
        },
      ],
    },
  },
  {
    files: ['packages/domain/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...[
              'fastify',
              'next',
              'react',
              'drizzle-orm',
              'drizzle-kit',
              '@fitness-os/database',
            ].map((name) =>
              restrictedImport(
                name,
                'The domain package must remain framework and persistence independent.',
              ),
            ),
          ],
          patterns: [
            ...[
              'fastify',
              'next',
              'react',
              'drizzle-orm',
              'drizzle-kit',
              '@fitness-os/database',
            ].map((name) =>
              restrictedPattern(
                name,
                'The domain package must remain framework and persistence independent.',
              ),
            ),
          ],
        },
      ],
    },
  },
);
