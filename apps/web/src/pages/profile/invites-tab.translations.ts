import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    noPending: 'No pending invites',
    invitedBy: 'Invited by {{name}} as',
    accept: 'Accept',
    decline: 'Decline',
    acceptSuccess: 'Invite accepted',
    acceptError: 'Failed to accept invite',
    declineSuccess: 'Invite declined',
    declineError: 'Failed to decline invite',
  },
  ru: {
    noPending: 'Нет ожидающих приглашений',
    invitedBy: 'Приглашение от {{name}} с ролью',
    accept: 'Принять',
    decline: 'Отклонить',
    acceptSuccess: 'Приглашение принято',
    acceptError: 'Не удалось принять приглашение',
    declineSuccess: 'Приглашение отклонено',
    declineError: 'Не удалось отклонить приглашение',
  },
});
