import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve workspace packages from source so that Storybook (Vite) can compile
// them without requiring a prior `pnpm build` step for those packages.
// The monorepo root is two levels up from apps/web/.storybook.
const repoRoot = path.resolve(__dirname, '../../..');

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(config) {
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    return mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '../src'),
          // Map workspace packages to their TypeScript sources so Vite can
          // compile them directly without needing pre-built dist/ folders.
          '@qurvo/ai-types': path.resolve(repoRoot, 'packages/@qurvo/ai-types/src/index.ts'),
          '@qurvo/sdk-core': path.resolve(repoRoot, 'packages/@qurvo/sdk-core/src/index.ts'),
          '@qurvo/sdk-browser': path.resolve(repoRoot, 'packages/@qurvo/sdk-browser/src/index.ts'),
        },
      },
    });
  },
};

export default config;
