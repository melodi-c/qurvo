import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiMessage } from './ai-message';
import type { AiMessageData } from '@/features/ai/hooks/use-ai-chat';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const meta: Meta = {
  title: 'AI/AiMessage',
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-2xl space-y-4">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

const userMessage: AiMessageData = {
  id: 'msg-user-1',
  role: 'user',
  content: 'Show me the trend for $pageview over the last 30 days',
  sequence: 1,
};

const assistantMessage: AiMessageData = {
  id: 'msg-assistant-1',
  role: 'assistant',
  content:
    "Here's the trend for `$pageview` over the last 30 days. I can see a steady increase with a peak on Feb 15.\n\nThe data shows:\n- **Total pageviews**: 84,200\n- **Avg per day**: 2,807\n- **Peak day**: Feb 15 (4,120 pageviews)\n\nWould you like me to break this down by device or country?",
  sequence: 2,
};

const streamingMessage: AiMessageData = {
  id: 'msg-streaming-1',
  role: 'assistant',
  content: 'Analyzing your pageview data',
  isStreaming: true,
};

const emptyStreamingMessage: AiMessageData = {
  id: 'msg-streaming-empty',
  role: 'assistant',
  content: null,
  isStreaming: true,
};

const longUserMessage: AiMessageData = {
  id: 'msg-user-long',
  role: 'user',
  content:
    'I want to understand the full funnel from landing page to signup completion. Can you show me step-by-step conversion rates and identify where users are dropping off the most? Please also compare mobile vs desktop users.',
  sequence: 3,
};

const markdownMessage: AiMessageData = {
  id: 'msg-markdown',
  role: 'assistant',
  content:
    "## Funnel Analysis\n\nHere are the key steps:\n\n| Step | Count | Conversion |\n|------|-------|------------|\n| Landing | 10,000 | 100% |\n| Signup Start | 3,200 | 32% |\n| Signup Complete | 1,800 | 18% |\n\n**Key finding**: The largest drop-off is between Landing and Signup Start (68%).\n\n> This suggests your CTA or value proposition needs improvement.",
  sequence: 4,
};

export const UserMessage: Story = {
  render: () => <AiMessage message={userMessage} />,
};

export const AssistantMessage: Story = {
  render: () => <AiMessage message={assistantMessage} />,
};

export const Streaming: Story = {
  name: 'Streaming — assistant typing',
  render: () => <AiMessage message={streamingMessage} isStreaming={true} />,
};

export const EmptyStreaming: Story = {
  name: 'EmptyStreaming — waiting for first token',
  render: () => <AiMessage message={emptyStreamingMessage} isStreaming={true} />,
};

export const WithFeedbackThumbs: Story = {
  name: 'WithFeedbackThumbs — completed assistant message',
  render: () => <AiMessage message={assistantMessage} isStreaming={false} />,
};

export const MarkdownContent: Story = {
  name: 'MarkdownContent — tables and headings',
  render: () => <AiMessage message={markdownMessage} />,
};

export const LongUserMessage: Story = {
  name: 'LongUserMessage — multiline',
  render: () => <AiMessage message={longUserMessage} />,
};

export const WithEditHandler: Story = {
  name: 'WithEditHandler — user message with edit',
  render: () => (
    <AiMessage
      message={userMessage}
      onEdit={(sequence, text) => console.log('edit', sequence, text)}
    />
  ),
};

export const Conversation: Story = {
  name: 'Conversation — full thread',
  render: () => (
    <div className="space-y-4">
      <AiMessage message={longUserMessage} onEdit={() => {}} />
      <AiMessage message={assistantMessage} />
      <AiMessage
        message={{ ...userMessage, id: 'u2', content: 'Can you break it down by device?', sequence: 5 }}
        onEdit={() => {}}
      />
      <AiMessage message={streamingMessage} isStreaming={true} />
    </div>
  ),
};
