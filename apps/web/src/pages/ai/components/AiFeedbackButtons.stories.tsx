import type { Meta, StoryObj } from '@storybook/react';
import { AiFeedbackButtons } from './AiFeedbackButtons';

const meta: Meta<typeof AiFeedbackButtons> = {
  title: 'AI/AiFeedbackButtons',
  component: AiFeedbackButtons,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof AiFeedbackButtons>;

export const Default: Story = {
  args: {
    messageId: 'msg-001',
  },
};
