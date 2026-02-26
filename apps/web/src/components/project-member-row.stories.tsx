import type { Meta, StoryObj } from '@storybook/react';
import { UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectMemberRow } from './project-member-row';

const meta: Meta<typeof ProjectMemberRow> = {
  title: 'Components/ProjectMemberRow',
  component: ProjectMemberRow,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof ProjectMemberRow>;

export const WithAvatar: Story = {
  render: () => (
    <div className="border border-border rounded-lg overflow-hidden w-full max-w-lg">
      <ProjectMemberRow
        avatar={
          <div className="h-8 w-8 rounded-full bg-violet-500 flex items-center justify-center text-white text-sm font-semibold">
            AJ
          </div>
        }
        name="Alice Johnson"
        subtitle="alice@example.com"
      />
    </div>
  ),
};

export const WithoutAvatar: Story = {
  render: () => (
    <div className="border border-border rounded-lg overflow-hidden w-full max-w-lg">
      <ProjectMemberRow
        name="Bob Smith"
        subtitle="Member · bob@example.com"
      />
    </div>
  ),
};

export const WithIconAvatar: Story = {
  render: () => (
    <div className="border border-border rounded-lg overflow-hidden w-full max-w-lg">
      <ProjectMemberRow
        avatar={<UserCircle2 className="h-8 w-8 text-muted-foreground" />}
        name="Carol Davis"
        subtitle="carol@example.com"
      />
    </div>
  ),
};

export const WithActions: Story = {
  render: () => (
    <div className="border border-border rounded-lg overflow-hidden w-full max-w-lg">
      <ProjectMemberRow
        avatar={
          <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold">
            DW
          </div>
        }
        name="Dave Wilson"
        subtitle="Member · dave@example.com"
        actions={
          <>
            <Button variant="outline" size="sm">
              Change role
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              Remove
            </Button>
          </>
        }
      />
    </div>
  ),
};

export const MemberList: Story = {
  render: () => (
    <div className="border border-border rounded-lg overflow-hidden w-full max-w-lg divide-y divide-border">
      <ProjectMemberRow
        avatar={
          <div className="h-8 w-8 rounded-full bg-violet-500 flex items-center justify-center text-white text-sm font-semibold">
            AJ
          </div>
        }
        name="Alice Johnson"
        subtitle="Owner · alice@example.com"
        actions={
          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled>
            Owner
          </Button>
        }
      />
      <ProjectMemberRow
        avatar={
          <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold">
            BS
          </div>
        }
        name="Bob Smith"
        subtitle="Member · bob@example.com"
        actions={
          <>
            <Button variant="outline" size="sm">
              Change role
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              Remove
            </Button>
          </>
        }
      />
      <ProjectMemberRow
        avatar={<UserCircle2 className="h-8 w-8 text-muted-foreground" />}
        name="Carol Davis"
        subtitle="Viewer · carol@example.com"
        actions={
          <>
            <Button variant="outline" size="sm">
              Change role
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              Remove
            </Button>
          </>
        }
      />
    </div>
  ),
};
