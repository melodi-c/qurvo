import type { InsightType } from '@/api/generated/Api';

const INSIGHT_TYPE_SLUGS: Record<InsightType, string> = {
  trend: 'trends',
  funnel: 'funnels',
  retention: 'retentions',
  lifecycle: 'lifecycles',
  stickiness: 'stickiness',
  paths: 'paths',
};

/** Pure path builders — no projectId, no navigation. */
export const routes = {
  login: () => '/login',
  register: () => '/register',
  verifyEmail: () => '/verify-email',

  home: () => '/',
  projects: () => '/projects',
  keys: () => '/keys',
  settings: () => '/settings',
  profile: (params?: { tab?: string }) => {
    if (params?.tab) return `/profile?tab=${params.tab}`;
    return '/profile';
  },

  dashboards: {
    list: () => '/dashboards',
    detail: (id: string) => `/dashboards/${id}`,
    widget: (dashboardId: string, widgetId: string) =>
      `/dashboards/${dashboardId}/widgets/${widgetId}`,
  },

  insights: {
    list: () => '/insights',
    trends: {
      new: () => '/insights/trends/new',
      detail: (insightId: string) => `/insights/trends/${insightId}`,
    },
    funnels: {
      new: () => '/insights/funnels/new',
      detail: (insightId: string) => `/insights/funnels/${insightId}`,
    },
    retentions: {
      new: () => '/insights/retentions/new',
      detail: (insightId: string) => `/insights/retentions/${insightId}`,
    },
    lifecycles: {
      new: () => '/insights/lifecycles/new',
      detail: (insightId: string) => `/insights/lifecycles/${insightId}`,
    },
    stickiness: {
      new: () => '/insights/stickiness/new',
      detail: (insightId: string) => `/insights/stickiness/${insightId}`,
    },
    paths: {
      new: () => '/insights/paths/new',
      detail: (insightId: string) => `/insights/paths/${insightId}`,
    },

    newByType: (type: InsightType) => `/insights/${INSIGHT_TYPE_SLUGS[type]}/new`,
    detailByType: (type: InsightType, insightId: string) =>
      `/insights/${INSIGHT_TYPE_SLUGS[type]}/${insightId}`,
  },

  cohorts: {
    list: () => '/cohorts',
    new: () => '/cohorts/new',
    detail: (cohortId: string) => `/cohorts/${cohortId}`,
  },

  unitEconomics: () => '/unit-economics',
  events: () => '/events',

  persons: {
    list: () => '/persons',
    detail: (personId: string) => `/persons/${personId}`,
  },

  ai: () => '/ai',
  dataManagement: {
    list: () => '/data-management',
    detail: (eventName: string) => `/data-management/${encodeURIComponent(eventName)}`,
  },
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
  dataManagement: {
    list: '/data-management',
    detail: '/data-management/:eventName',
  },

  legacy: {
    trends: '/trends',
    funnels: '/funnels',
    retentions: '/retentions',
  },
};

/** Recursively wraps route functions so each call goes through `transform`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WrapRoutes<T, R> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => R
    : T[K] extends Record<string, unknown>
      ? WrapRoutes<T[K], R>
      : never;
};

export function wrapRoutes<R>(
  obj: typeof routes,
  transform: (path: string) => R,
): WrapRoutes<typeof routes, R> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'function') {
      result[key] = (...args: unknown[]) =>
        transform((value as (...a: unknown[]) => string)(...args));
    } else if (typeof value === 'object' && value !== null) {
      result[key] = wrapRoutes(value as typeof routes, transform);
    }
  }
  return result as WrapRoutes<typeof routes, R>;
}
