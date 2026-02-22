import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Invites',
    noInvites: 'No pending invites',
    invitedBy: 'Invited by {{name}} as',
    accept: 'Accept',
    decline: 'Decline',
    accepted: 'Invite accepted',
    acceptFailed: 'Failed to accept invite',
    declined: 'Invite declined',
    declineFailed: 'Failed to decline invite',
  },
  ru: {
    title: 'Приглашения',
    noInvites: 'Нет ожидающих приглашений',
    invitedBy: 'Приглашён(а) {{name}} как',
    accept: 'Принять',
    decline: 'Отклонить',
    accepted: 'Приглашение принято',
    acceptFailed: 'Не удалось принять приглашение',
    declined: 'Приглашение отклонено',
    declineFailed: 'Не удалось отклонить приглашение',
  },
});
