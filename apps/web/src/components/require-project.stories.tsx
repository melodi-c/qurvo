import type { Meta, StoryObj } from '@storybook/react';
import { BarChart2, GitMerge } from 'lucide-react';
import { RequireProject } from './require-project';

/**
 * RequireProject uses `useProjectId()` which reads `:projectId` from the URL.
 * - No projectId in URL  → EmptyState is shown.
 * - With projectId in URL → children are rendered.
 *
 * The `memoryRouter.initialEntries` + `memoryRouter.path` parameters configure
 * the global MemoryRouter in preview.tsx to simulate different URL states.
 */
const meta: Meta<typeof RequireProject> = {
  title: 'Components/RequireProject',
  component: RequireProject,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    // Default: no projectId in URL → empty state
    memoryRouter: {
      initialEntries: ['/'],
      path: '/',
    },
  },
};

export default meta;
type Story = StoryObj<typeof RequireProject>;

/** No project selected — shows the default EmptyState. */
export const NoProject: Story = {
  parameters: {
    memoryRouter: {
      initialEntries: ['/'],
      path: '/',
    },
  },
  render: () => (
    <RequireProject icon={BarChart2}>
      <p>This content will not be shown.</p>
    </RequireProject>
  ),
};

/** With a custom description. */
export const NoProjectCustomDescription: Story = {
  parameters: {
    memoryRouter: {
      initialEntries: ['/'],
      path: '/',
    },
  },
  render: () => (
    <RequireProject icon={GitMerge} description="Select a project to view funnels.">
      <p>This content will not be shown.</p>
    </RequireProject>
  ),
};

/** With project selected — renders children. */
export const WithProject: Story = {
  parameters: {
    memoryRouter: {
      initialEntries: ['/projects/proj-123/trends'],
      path: '/projects/:projectId/trends',
    },
  },
  render: () => (
    <RequireProject icon={BarChart2}>
      <div className="border border-border rounded-lg p-6 text-sm text-foreground">
        Content rendered when a project is selected.
      </div>
    </RequireProject>
  ),
};
