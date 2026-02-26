import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ChannelConfigSection } from './channel-config-section';
import type { ChannelConfigFields, ChannelConfigErrors } from './channel-config-section';

const meta: Meta<typeof ChannelConfigSection> = {
  title: 'UI/ChannelConfigSection',
  component: ChannelConfigSection,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ChannelConfigSection>;

function ChannelConfigWrapper({
  initial,
  errors,
}: {
  initial: ChannelConfigFields;
  errors?: ChannelConfigErrors;
}) {
  const [values, setValues] = useState<ChannelConfigFields>(initial);
  return (
    <div className="w-80 space-y-4 p-4 border rounded-lg">
      <ChannelConfigSection
        values={values}
        errors={errors}
        onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
      />
    </div>
  );
}

export const SlackDefault: Story = {
  render: () => (
    <ChannelConfigWrapper
      initial={{
        channel_type: 'slack',
        channel_config_value: '',
        channel_config_extra: '',
      }}
    />
  ),
};

export const SlackWithValue: Story = {
  render: () => (
    <ChannelConfigWrapper
      initial={{
        channel_type: 'slack',
        channel_config_value: 'https://hooks.slack.com/services/T00000000/B00000000/XXXX',
        channel_config_extra: '',
      }}
    />
  ),
};

export const SlackValidationError: Story = {
  render: () => (
    <ChannelConfigWrapper
      initial={{
        channel_type: 'slack',
        channel_config_value: 'not-a-url',
        channel_config_extra: '',
      }}
      errors={{ channel_config_value: 'Enter a valid URL' }}
    />
  ),
};

export const EmailDefault: Story = {
  render: () => (
    <ChannelConfigWrapper
      initial={{
        channel_type: 'email',
        channel_config_value: '',
        channel_config_extra: '',
      }}
    />
  ),
};

export const EmailWithValue: Story = {
  render: () => (
    <ChannelConfigWrapper
      initial={{
        channel_type: 'email',
        channel_config_value: 'alerts@example.com',
        channel_config_extra: '',
      }}
    />
  ),
};

export const EmailValidationError: Story = {
  render: () => (
    <ChannelConfigWrapper
      initial={{
        channel_type: 'email',
        channel_config_value: 'not-an-email',
        channel_config_extra: '',
      }}
      errors={{ channel_config_value: 'Enter a valid email address' }}
    />
  ),
};

export const TelegramDefault: Story = {
  render: () => (
    <ChannelConfigWrapper
      initial={{
        channel_type: 'telegram',
        channel_config_value: '',
        channel_config_extra: '',
      }}
    />
  ),
};

export const TelegramWithValues: Story = {
  render: () => (
    <ChannelConfigWrapper
      initial={{
        channel_type: 'telegram',
        channel_config_value: '-1001234567890',
        channel_config_extra: '123456789:ABCdefGhIjKlMnOpQrStUvWxYz',
      }}
    />
  ),
};

export const TelegramBothFieldErrors: Story = {
  render: () => (
    <ChannelConfigWrapper
      initial={{
        channel_type: 'telegram',
        channel_config_value: '',
        channel_config_extra: '',
      }}
      errors={{
        channel_config_value: 'This field is required',
        channel_config_extra: 'This field is required',
      }}
    />
  ),
};
