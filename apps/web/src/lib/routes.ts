import type { InsightType } from '@/api/generated/Api';

function withProject(path: string, projectId: string): string {
  return `${path}?project=${projectId}`;
}

const INSIGHT_TYPE_SLUGS: Record<InsightType, string> = {
  trend: 'trends',
  funnel: 'funnels',
  retention: 'retentions',
  lifecycle: 'lifecycles',
  stickiness: 'stickiness',
  paths: 'paths',
};

export const routes = {
  // Auth (no project)
  login: () => '/login',
  register: () => '/register',
  verifyEmail: () => '/verify-email',

  // App
  home: (projectId: string) => withProject('/', projectId),
  projects: () => '/projects',
  keys: (projectId: string) => withProject('/keys', projectId),
  settings: (projectId: string) => withProject('/settings', projectId),
  profile: (params?: { tab?: string }) => {
    if (params?.tab) return `/profile?tab=${params.tab}`;
    return '/profile';
  },

  dashboards: {
    list: (projectId: string) => withProject('/dashboards', projectId),
    detail: (id: string, projectId: string) => withProject(`/dashboards/${id}`, projectId),
    widget: (dashboardId: string, widgetId: string, projectId: string) =>
      withProject(`/dashboards/${dashboardId}/widgets/${widgetId}`, projectId),
  },

  insights: {
    list: (projectId: string) => withProject('/insights', projectId),
    trends: {
      new: (projectId: string) => withProject('/insights/trends/new', projectId),
      detail: (insightId: string, projectId: string) =>
        withProject(`/insights/trends/${insightId}`, projectId),
    },
    funnels: {
      new: (projectId: string) => withProject('/insights/funnels/new', projectId),
      detail: (insightId: string, projectId: string) =>
        withProject(`/insights/funnels/${insightId}`, projectId),
    },
    retentions: {
      new: (projectId: string) => withProject('/insights/retentions/new', projectId),
      detail: (insightId: string, projectId: string) =>
        withProject(`/insights/retentions/${insightId}`, projectId),
    },
    lifecycles: {
      new: (projectId: string) => withProject('/insights/lifecycles/new', projectId),
      detail: (insightId: string, projectId: string) =>
        withProject(`/insights/lifecycles/${insightId}`, projectId),
    },
    stickiness: {
      new: (projectId: string) => withProject('/insights/stickiness/new', projectId),
      detail: (insightId: string, projectId: string) =>
        withProject(`/insights/stickiness/${insightId}`, projectId),
    },
    paths: {
      new: (projectId: string) => withProject('/insights/paths/new', projectId),
      detail: (insightId: string, projectId: string) =>
        withProject(`/insights/paths/${insightId}`, projectId),
    },

    newByType: (type: InsightType, projectId: string) =>
      withProject(`/insights/${INSIGHT_TYPE_SLUGS[type]}/new`, projectId),
    detailByType: (type: InsightType, insightId: string, projectId: string) =>
      withProject(`/insights/${INSIGHT_TYPE_SLUGS[type]}/${insightId}`, projectId),
  },

  cohorts: {
    list: (projectId: string) => withProject('/cohorts', projectId),
    new: (projectId: string) => withProject('/cohorts/new', projectId),
    detail: (cohortId: string, projectId: string) =>
      withProject(`/cohorts/${cohortId}`, projectId),
  },

  unitEconomics: (projectId: string) => withProject('/unit-economics', projectId),
  events: (projectId: string) => withProject('/events', projectId),

  persons: {
    list: (projectId: string) => withProject('/persons', projectId),
    detail: (personId: string, projectId: string) =>
      withProject(`/persons/${personId}`, projectId),
  },

  ai: (projectId: string) => withProject('/ai', projectId),
  dataManagement: (projectId: string) => withProject('/data-management', projectId),
};

/** Route patterns for React Router <Route path="..."> definitions */
export const routePatterns = {
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',

  home: '/',
  projects: '/projects',
  keys: '/keys',
  settings: '/settings',
  profile: '/profile',
  invites: '/invites',

  dashboards: {
    list: '/dashboards',
    detail: '/dashboards/:id',
  },

  insights: {
    list: '/insights',
    trends: { new: '/insights/trends/new', detail: '/insights/trends/:insightId' },
    funnels: { new: '/insights/funnels/new', detail: '/insights/funnels/:insightId' },
    retentions: { new: '/insights/retentions/new', detail: '/insights/retentions/:insightId' },
    lifecycles: { new: '/insights/lifecycles/new', detail: '/insights/lifecycles/:insightId' },
    stickiness: { new: '/insights/stickiness/new', detail: '/insights/stickiness/:insightId' },
    paths: { new: '/insights/paths/new', detail: '/insights/paths/:insightId' },
  },

  cohorts: {
    list: '/cohorts',
    new: '/cohorts/new',
    detail: '/cohorts/:cohortId',
  },

  unitEconomics: '/unit-economics',
  events: '/events',

  persons: {
    list: '/persons',
    detail: '/persons/:personId',
  },

  ai: '/ai',
  dataManagement: '/data-management',

  legacy: {
    trends: '/trends',
    funnels: '/funnels',
    retentions: '/retentions',
  },
};
