import {
  Api,
  type AdminPlan,
  type AdminProjectListItem,
  type AdminProjectDetail,
  type AdminUser,
  type AdminUserDetail,
  type AdminStats,
  type CreateAdminPlan,
  type PatchAdminPlan,
  type PatchAdminProject,
  type PatchUserStaff,
  type AdminPlansControllerPatchPlanParams,
  type AdminPlansControllerDeletePlanParams,
  type AdminProjectsControllerGetProjectParams,
  type AdminProjectsControllerPatchProjectParams,
  type AdminUsersControllerGetUserParams,
  type AdminUsersControllerPatchUserParams,
  type RequestParams,
} from './generated/Api';

// TypeScript 5.9.x has an inference limit for very large object literal class
// properties (~88 methods). The `api` object has 100 methods; the last 12
// (admin-related) fall outside the inference window. We declare explicit types
// here so the missing methods are visible to consumers.
type MissingAdminMethods = {
  healthControllerCheck: (params?: RequestParams) => Promise<{ status: string }>;
  adminStatsControllerGetStats: (params?: RequestParams) => Promise<AdminStats>;
  adminUsersControllerListUsers: (params?: RequestParams) => Promise<AdminUser[]>;
  adminUsersControllerGetUser: (args: AdminUsersControllerGetUserParams, params?: RequestParams) => Promise<AdminUserDetail>;
  adminUsersControllerPatchUser: (args: AdminUsersControllerPatchUserParams, data: PatchUserStaff, params?: RequestParams) => Promise<AdminUser>;
  adminProjectsControllerListProjects: (params?: RequestParams) => Promise<AdminProjectListItem[]>;
  adminProjectsControllerGetProject: (args: AdminProjectsControllerGetProjectParams, params?: RequestParams) => Promise<AdminProjectDetail>;
  adminProjectsControllerPatchProject: (args: AdminProjectsControllerPatchProjectParams, data: PatchAdminProject, params?: RequestParams) => Promise<AdminProjectDetail>;
  adminPlansControllerListPlans: (params?: RequestParams) => Promise<AdminPlan[]>;
  adminPlansControllerCreatePlan: (data: CreateAdminPlan, params?: RequestParams) => Promise<AdminPlan>;
  adminPlansControllerPatchPlan: (args: AdminPlansControllerPatchPlanParams, data: PatchAdminPlan, params?: RequestParams) => Promise<AdminPlan>;
  adminPlansControllerDeletePlan: (args: AdminPlansControllerDeletePlanParams, params?: RequestParams) => Promise<void>;
};

export const apiClient = new Api({
  securityWorker: () => {
    const token = localStorage.getItem('qurvo_token');
    if (token) {
      return { headers: { Authorization: `Bearer ${token}` } };
    }
  },
  paramsSerializer: (params) => {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (value === undefined || value === null) {continue;}
      if (typeof value === 'object') {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`);
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    return parts.join('&');
  },
});

export const api = apiClient.api as typeof apiClient.api & MissingAdminMethods;
