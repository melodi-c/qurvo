/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface Register {
  /**
   * @format email
   * @maxLength 255
   */
  email: string;
  /**
   * @minLength 8
   * @maxLength 128
   */
  password: string;
  /**
   * @minLength 1
   * @maxLength 100
   */
  display_name: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Login {
  /** @format email */
  email: string;
  /**
   * @minLength 8
   * @maxLength 128
   */
  password: string;
}

export interface OkResponse {
  ok: boolean;
}

export interface SessionUser {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
}

export interface MeResponse {
  user: SessionUser;
}

export interface ProjectWithRole {
  role: string;
  id: string;
  name: string;
  slug: string;
  /** @format date-time */
  created_at: string;
  /** @format date-time */
  updated_at: string;
}

export interface CreateProject {
  /**
   * @minLength 1
   * @maxLength 100
   */
  name: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  /** @format date-time */
  created_at: string;
  /** @format date-time */
  updated_at: string;
}

export interface UpdateProject {
  /**
   * @minLength 1
   * @maxLength 100
   */
  name?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  /** @format date-time */
  last_used_at: string | null;
  /** @format date-time */
  expires_at: string | null;
  /** @format date-time */
  revoked_at: string | null;
  /** @format date-time */
  created_at: string;
}

export interface CreateApiKey {
  /**
   * @minLength 1
   * @maxLength 100
   */
  name: string;
  scopes?: string[];
  expires_at?: string;
}

export interface ApiKeyCreated {
  id: string;
  name: string;
  key: string;
  key_prefix: string;
  /** @format date-time */
  created_at: string;
}

export interface StepFilter {
  property: string;
  operator: StepFilterDtoOperatorEnum;
  value?: string;
}

export interface FunnelStep {
  event_name: string;
  label: string;
  filters?: StepFilter[];
}

export interface FunnelQuery {
  /** @format uuid */
  project_id: string;
  /**
   * @maxItems 10
   * @minItems 2
   */
  steps: FunnelStep[];
  /**
   * @min 1
   * @max 90
   * @default 14
   */
  conversion_window_days: number;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  /** @format uuid */
  widget_id?: string;
  force?: boolean;
}

export interface FunnelResult {
  breakdown: boolean;
  breakdown_property?: string;
  steps: object;
}

export interface FunnelResponse {
  data: FunnelResult;
  cached_at: string;
  from_cache: boolean;
}

export interface EventRow {
  event_id: string;
  event_name: string;
  distinct_id: string;
  timestamp: string;
  url: string;
  properties: string;
}

export interface EventNamesResponse {
  event_names: string[];
}

export interface CreateDashboard {
  /**
   * @minLength 1
   * @maxLength 100
   */
  name: string;
}

export interface UpdateDashboard {
  /**
   * @minLength 1
   * @maxLength 100
   */
  name?: string;
}

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CreateWidget {
  type: CreateWidgetDtoTypeEnum;
  /**
   * @minLength 1
   * @maxLength 100
   */
  name: string;
  config: object;
  layout: WidgetLayout;
}

export interface UpdateWidget {
  /**
   * @minLength 1
   * @maxLength 100
   */
  name?: string;
  config?: object;
  layout?: WidgetLayout;
}

export enum StepFilterDtoOperatorEnum {
  Eq = "eq",
  Neq = "neq",
  Contains = "contains",
  NotContains = "not_contains",
  IsSet = "is_set",
  IsNotSet = "is_not_set",
}

export enum CreateWidgetDtoTypeEnum {
  Funnel = "funnel",
}

export interface ProjectsControllerGetByIdParams {
  id: string;
}

export interface ProjectsControllerUpdateParams {
  id: string;
}

export interface ProjectsControllerRemoveParams {
  id: string;
}

export interface ApiKeysControllerListParams {
  projectId: string;
}

export interface ApiKeysControllerCreateParams {
  projectId: string;
}

export interface ApiKeysControllerRevokeParams {
  projectId: string;
  keyId: string;
}

export interface AnalyticsControllerGetEventsParams {
  event_name?: string;
  distinct_id?: string;
  date_from?: string;
  date_to?: string;
  /**
   * @min 1
   * @max 100
   * @default 50
   */
  limit?: number;
  /**
   * @min 0
   * @default 0
   */
  offset?: number;
  /** @format uuid */
  project_id: string;
}

export interface AnalyticsControllerGetEventNamesParams {
  /** @format uuid */
  project_id: string;
}

export interface DashboardsControllerListParams {
  projectId: string;
}

export interface DashboardsControllerCreateParams {
  projectId: string;
}

export interface DashboardsControllerGetByIdParams {
  projectId: string;
  dashboardId: string;
}

export interface DashboardsControllerUpdateParams {
  projectId: string;
  dashboardId: string;
}

export interface DashboardsControllerRemoveParams {
  projectId: string;
  dashboardId: string;
}

export interface DashboardsControllerAddWidgetParams {
  projectId: string;
  dashboardId: string;
}

export interface DashboardsControllerUpdateWidgetParams {
  projectId: string;
  dashboardId: string;
  widgetId: string;
}

export interface DashboardsControllerRemoveWidgetParams {
  projectId: string;
  dashboardId: string;
  widgetId: string;
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown>
  extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) =>
    fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter(
      (key) => "undefined" !== typeof query[key],
    );
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key),
      )
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.JsonApi]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.Text]: (input: any) =>
      input !== null && typeof input !== "string"
        ? JSON.stringify(input)
        : input,
    [ContentType.FormData]: (input: any) => {
      if (input instanceof FormData) {
        return input;
      }

      return Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData());
    },
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (
    cancelToken: CancelToken,
  ): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<T> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== ContentType.FormData
            ? { "Content-Type": type }
            : {}),
        },
        signal:
          (cancelToken
            ? this.createAbortSignal(cancelToken)
            : requestParams.signal) || null,
        body:
          typeof body === "undefined" || body === null
            ? null
            : payloadFormatter(body),
      },
    ).then(async (response) => {
      const r = response as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const responseToParse = responseFormat ? response.clone() : response;
      const data = !responseFormat
        ? r
        : await responseToParse[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data.data;
    });
  };
}

/**
 * @title Shot Analytics API
 * @version 1.0
 * @contact
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  api = {
    /**
     * No description
     *
     * @tags Auth
     * @name AuthControllerRegister
     * @request POST:/api/auth/register
     */
    authControllerRegister: (data: Register, params: RequestParams = {}) =>
      this.request<AuthResponse, any>({
        path: `/api/auth/register`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name AuthControllerLogin
     * @request POST:/api/auth/login
     */
    authControllerLogin: (data: Login, params: RequestParams = {}) =>
      this.request<AuthResponse, any>({
        path: `/api/auth/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name AuthControllerLogout
     * @request POST:/api/auth/logout
     * @secure
     */
    authControllerLogout: (params: RequestParams = {}) =>
      this.request<OkResponse, any>({
        path: `/api/auth/logout`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name AuthControllerMe
     * @request GET:/api/auth/me
     * @secure
     */
    authControllerMe: (params: RequestParams = {}) =>
      this.request<MeResponse, any>({
        path: `/api/auth/me`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name ProjectsControllerList
     * @request GET:/api/projects
     * @secure
     */
    projectsControllerList: (params: RequestParams = {}) =>
      this.request<ProjectWithRole[], any>({
        path: `/api/projects`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name ProjectsControllerCreate
     * @request POST:/api/projects
     * @secure
     */
    projectsControllerCreate: (
      data: CreateProject,
      params: RequestParams = {},
    ) =>
      this.request<Project, any>({
        path: `/api/projects`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name ProjectsControllerGetById
     * @request GET:/api/projects/{id}
     * @secure
     */
    projectsControllerGetById: (
      { id, ...query }: ProjectsControllerGetByIdParams,
      params: RequestParams = {},
    ) =>
      this.request<ProjectWithRole, any>({
        path: `/api/projects/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name ProjectsControllerUpdate
     * @request PUT:/api/projects/{id}
     * @secure
     */
    projectsControllerUpdate: (
      { id, ...query }: ProjectsControllerUpdateParams,
      data: UpdateProject,
      params: RequestParams = {},
    ) =>
      this.request<Project, any>({
        path: `/api/projects/${id}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Projects
     * @name ProjectsControllerRemove
     * @request DELETE:/api/projects/{id}
     * @secure
     */
    projectsControllerRemove: (
      { id, ...query }: ProjectsControllerRemoveParams,
      params: RequestParams = {},
    ) =>
      this.request<OkResponse, any>({
        path: `/api/projects/${id}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags API Keys
     * @name ApiKeysControllerList
     * @request GET:/api/projects/{projectId}/keys
     * @secure
     */
    apiKeysControllerList: (
      { projectId, ...query }: ApiKeysControllerListParams,
      params: RequestParams = {},
    ) =>
      this.request<ApiKey[], any>({
        path: `/api/projects/${projectId}/keys`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags API Keys
     * @name ApiKeysControllerCreate
     * @request POST:/api/projects/{projectId}/keys
     * @secure
     */
    apiKeysControllerCreate: (
      { projectId, ...query }: ApiKeysControllerCreateParams,
      data: CreateApiKey,
      params: RequestParams = {},
    ) =>
      this.request<ApiKeyCreated, any>({
        path: `/api/projects/${projectId}/keys`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags API Keys
     * @name ApiKeysControllerRevoke
     * @request DELETE:/api/projects/{projectId}/keys/{keyId}
     * @secure
     */
    apiKeysControllerRevoke: (
      { projectId, keyId, ...query }: ApiKeysControllerRevokeParams,
      params: RequestParams = {},
    ) =>
      this.request<OkResponse, any>({
        path: `/api/projects/${projectId}/keys/${keyId}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Analytics
     * @name AnalyticsControllerGetFunnel
     * @request POST:/api/analytics/funnel
     * @secure
     */
    analyticsControllerGetFunnel: (
      data: FunnelQuery,
      params: RequestParams = {},
    ) =>
      this.request<FunnelResponse, any>({
        path: `/api/analytics/funnel`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Analytics
     * @name AnalyticsControllerGetEvents
     * @request GET:/api/analytics/events
     * @secure
     */
    analyticsControllerGetEvents: (
      query: AnalyticsControllerGetEventsParams,
      params: RequestParams = {},
    ) =>
      this.request<EventRow[], any>({
        path: `/api/analytics/events`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Analytics
     * @name AnalyticsControllerGetEventNames
     * @request GET:/api/analytics/event-names
     * @secure
     */
    analyticsControllerGetEventNames: (
      query: AnalyticsControllerGetEventNamesParams,
      params: RequestParams = {},
    ) =>
      this.request<EventNamesResponse, any>({
        path: `/api/analytics/event-names`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Dashboards
     * @name DashboardsControllerList
     * @request GET:/api/projects/{projectId}/dashboards
     * @secure
     */
    dashboardsControllerList: (
      { projectId, ...query }: DashboardsControllerListParams,
      params: RequestParams = {},
    ) =>
      this.request<object[], any>({
        path: `/api/projects/${projectId}/dashboards`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Dashboards
     * @name DashboardsControllerCreate
     * @request POST:/api/projects/{projectId}/dashboards
     * @secure
     */
    dashboardsControllerCreate: (
      { projectId, ...query }: DashboardsControllerCreateParams,
      data: CreateDashboard,
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/api/projects/${projectId}/dashboards`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Dashboards
     * @name DashboardsControllerGetById
     * @request GET:/api/projects/{projectId}/dashboards/{dashboardId}
     * @secure
     */
    dashboardsControllerGetById: (
      { projectId, dashboardId, ...query }: DashboardsControllerGetByIdParams,
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/api/projects/${projectId}/dashboards/${dashboardId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Dashboards
     * @name DashboardsControllerUpdate
     * @request PUT:/api/projects/{projectId}/dashboards/{dashboardId}
     * @secure
     */
    dashboardsControllerUpdate: (
      { projectId, dashboardId, ...query }: DashboardsControllerUpdateParams,
      data: UpdateDashboard,
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/api/projects/${projectId}/dashboards/${dashboardId}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Dashboards
     * @name DashboardsControllerRemove
     * @request DELETE:/api/projects/{projectId}/dashboards/{dashboardId}
     * @secure
     */
    dashboardsControllerRemove: (
      { projectId, dashboardId, ...query }: DashboardsControllerRemoveParams,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/projects/${projectId}/dashboards/${dashboardId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Dashboards
     * @name DashboardsControllerAddWidget
     * @request POST:/api/projects/{projectId}/dashboards/{dashboardId}/widgets
     * @secure
     */
    dashboardsControllerAddWidget: (
      { projectId, dashboardId, ...query }: DashboardsControllerAddWidgetParams,
      data: CreateWidget,
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/api/projects/${projectId}/dashboards/${dashboardId}/widgets`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Dashboards
     * @name DashboardsControllerUpdateWidget
     * @request PUT:/api/projects/{projectId}/dashboards/{dashboardId}/widgets/{widgetId}
     * @secure
     */
    dashboardsControllerUpdateWidget: (
      {
        projectId,
        dashboardId,
        widgetId,
        ...query
      }: DashboardsControllerUpdateWidgetParams,
      data: UpdateWidget,
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/api/projects/${projectId}/dashboards/${dashboardId}/widgets/${widgetId}`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Dashboards
     * @name DashboardsControllerRemoveWidget
     * @request DELETE:/api/projects/{projectId}/dashboards/{dashboardId}/widgets/{widgetId}
     * @secure
     */
    dashboardsControllerRemoveWidget: (
      {
        projectId,
        dashboardId,
        widgetId,
        ...query
      }: DashboardsControllerRemoveWidgetParams,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/projects/${projectId}/dashboards/${dashboardId}/widgets/${widgetId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),
  };
}
