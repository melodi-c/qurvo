import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    selectProject: 'Select a project to use AI Assistant',
    title: 'AI Assistant',
    newChat: 'New Chat',
    noConversations: 'No conversations yet',
    noConversationsDescription: 'Start a new chat to ask questions about your analytics data',
    deleteTitle: 'Delete "{{name}}"?',
    deleteDescription: 'This conversation will be permanently deleted.',
    chat: 'Chat',
    newChatLabel: 'New Chat',
  },
  ru: {
    selectProject: 'Выберите проект для использования AI-ассистента',
    title: 'AI-ассистент',
    newChat: 'Новый чат',
    noConversations: 'Чатов пока нет',
    noConversationsDescription: 'Начните новый чат, чтобы задать вопросы о ваших данных аналитики',
    deleteTitle: 'Удалить "{{name}}"?',
    deleteDescription: 'Этот чат будет удалён безвозвратно.',
    chat: 'Чат',
    newChatLabel: 'Новый чат',
  },
});
