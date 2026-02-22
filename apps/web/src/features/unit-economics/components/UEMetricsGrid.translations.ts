import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    formulaUA: 'New unique users in period',
    formulaC1: 'C1 = paying_users / total_users',
    formulaC2: 'C2 = repeat_users / paying_users',
    formulaAPC: 'APC = 1 / (1 - C2)',
    formulaAVP: 'AVP = revenue / purchases',
    formulaARPPU: 'ARPPU = AVP × APC',
    formulaARPU: 'ARPU = ARPPU × C1',
    formulaChurn: 'Churn = churned / prev_active',
    formulaLifetime: 'Lifetime = 1 / Churn',
    formulaLTV: 'LTV = ARPU × Lifetime',
    formulaCAC: 'CAC = ad_spend / UA',
    formulaROI: 'ROI = (LTV - CAC) / CAC × 100%',
    periodSuffix: 'per.',
  },
  ru: {
    formulaUA: 'Новые уникальные пользователи за период',
    formulaC1: 'C1 = платящие / всего пользователей',
    formulaC2: 'C2 = повторные / платящие',
    formulaAPC: 'APC = 1 / (1 - C2)',
    formulaAVP: 'AVP = выручка / покупки',
    formulaARPPU: 'ARPPU = AVP × APC',
    formulaARPU: 'ARPU = ARPPU × C1',
    formulaChurn: 'Churn = ушедшие / активные в пред. периоде',
    formulaLifetime: 'Lifetime = 1 / Churn',
    formulaLTV: 'LTV = ARPU × Lifetime',
    formulaCAC: 'CAC = рекл. расходы / UA',
    formulaROI: 'ROI = (LTV - CAC) / CAC × 100%',
    periodSuffix: 'пер.',
  },
});
