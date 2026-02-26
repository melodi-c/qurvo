import React from 'react';
import type { Preview } from '@storybook/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
    (Story, context) => {
      const initialEntries: string[] = context.parameters.memoryRouter?.initialEntries ?? ['/'];
      const path: string = context.parameters.memoryRouter?.path ?? '*';
      return (
        <MemoryRouter initialEntries={initialEntries}>
          <TooltipProvider>
            <Routes>
              <Route path={path} element={<Story />} />
            </Routes>
          </TooltipProvider>
        </MemoryRouter>
      );
    },
  ],
};

export default preview;
