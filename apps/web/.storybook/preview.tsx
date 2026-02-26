import React from 'react';
import type { Preview } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#09090b' },
      ],
    },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </MemoryRouter>
    ),
  ],
};

export default preview;
