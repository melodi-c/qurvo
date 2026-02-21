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
  cohort_ids?: string[];
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

export interface FunnelStepResult {
  breakdown_value?: string;
  step: number;
  label: string;
  event_name: string;
  count: number;
  conversion_rate: number;
  drop_off: number;
  drop_off_rate: number;
  avg_time_to_convert_seconds: number | null;
}

export interface FunnelResult {
  breakdown_property?: string;
  aggregate_steps?: FunnelStepResult[];
  breakdown: boolean;
  steps: FunnelStepResult[];
}

export interface FunnelResponse {
  data: FunnelResult;
  cached_at: string;
  from_cache: boolean;
}

export interface EventRow {
  event_id: string;
  event_name: string;
  event_type: string;
  distinct_id: string;
  person_id: string;
  session_id: string;
  timestamp: string;
  url: string;
  referrer: string;
  page_title: string;
  page_path: string;
  device_type: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  screen_width: number;
  screen_height: number;
  country: string;
  region: string;
  city: string;
  language: string;
  timezone: string;
  sdk_name: string;
  sdk_version: string;
  properties: string;
  user_properties: string;
}

export interface EventNamesResponse {
  event_names: string[];
}

export interface TrendSeries {
  event_name: string;
  label: string;
  filters?: StepFilter[];
}

export interface TrendQuery {
  cohort_ids?: string[];
  /** @format uuid */
  project_id: string;
  /**
   * @maxItems 5
   * @minItems 1
   */
  series: TrendSeries[];
  metric: TrendQueryDtoMetricEnum;
  granularity: TrendQueryDtoGranularityEnum;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  compare?: boolean;
  /** @format uuid */
  widget_id?: string;
  force?: boolean;
}

export interface TrendDataPoint {
  bucket: string;
  value: number;
}

export interface TrendSeriesResult {
  breakdown_value?: string;
  series_idx: number;
  label: string;
  event_name: string;
  data: TrendDataPoint[];
}

export interface TrendResult {
  breakdown_property?: string;
  series_previous?: TrendSeriesResult[];
  compare: boolean;
  breakdown: boolean;
  series: TrendSeriesResult[];
}

export interface TrendResponse {
  data: TrendResult;
  cached_at: string;
  from_cache: boolean;
}

export interface RetentionQuery {
  cohort_ids?: string[];
  /** @format uuid */
  project_id: string;
  target_event: string;
  retention_type: RetentionQueryDtoRetentionTypeEnum;
  granularity: RetentionQueryDtoGranularityEnum;
  /**
   * @min 1
   * @max 30
   * @default 11
   */
  periods: number;
  date_from: string;
  date_to: string;
  /** @format uuid */
  widget_id?: string;
  force?: boolean;
}

export interface RetentionCohort {
  cohort_date: string;
  cohort_size: number;
  periods: number[];
}

export interface RetentionResult {
  retention_type: string;
  granularity: string;
  cohorts: RetentionCohort[];
  average_retention: number[];
}

export interface RetentionResponse {
  data: RetentionResult;
  cached_at: string;
  from_cache: boolean;
}

export interface LifecycleQuery {
  cohort_ids?: string[];
  /** @format uuid */
  project_id: string;
  target_event: string;
  granularity: LifecycleQueryDtoGranularityEnum;
  date_from: string;
  date_to: string;
  /** @format uuid */
  widget_id?: string;
  force?: boolean;
}

export interface LifecycleDataPoint {
  bucket: string;
  new: number;
  returning: number;
  resurrecting: number;
  dormant: number;
}

export interface LifecycleTotals {
  new: number;
  returning: number;
  resurrecting: number;
  dormant: number;
}

export interface LifecycleResult {
  granularity: string;
  data: LifecycleDataPoint[];
  totals: LifecycleTotals;
}

export interface LifecycleResponse {
  data: LifecycleResult;
  cached_at: string;
  from_cache: boolean;
}

export interface StickinessQuery {
  cohort_ids?: string[];
  /** @format uuid */
  project_id: string;
  target_event: string;
  granularity: StickinessQueryDtoGranularityEnum;
  date_from: string;
  date_to: string;
  /** @format uuid */
  widget_id?: string;
  force?: boolean;
}

export interface StickinessDataPoint {
  period_count: number;
  user_count: number;
}

export interface StickinessResult {
  granularity: string;
  total_periods: number;
  data: StickinessDataPoint[];
}

export interface StickinessResponse {
  data: StickinessResult;
  cached_at: string;
  from_cache: boolean;
}

export interface Dashboard {
  id: string;
  project_id: string;
  name: string;
  /** @format date-time */
  created_at: string;
  /** @format date-time */
  updated_at: string;
}

export interface CreateDashboard {
  /**
   * @minLength 1
   * @maxLength 100
   */
  name: string;
}

export interface FunnelWidgetConfig {
  type: FunnelWidgetConfigDtoTypeEnum;
  steps: FunnelStep[];
  breakdown_property?: string;
  cohort_ids?: string[];
  conversion_window_days: number;
  date_from: string;
  date_to: string;
}

export interface TrendWidgetConfig {
  type: TrendWidgetConfigDtoTypeEnum;
  series: TrendSeries[];
  metric: TrendWidgetConfigDtoMetricEnum;
  granularity: TrendWidgetConfigDtoGranularityEnum;
  chart_type: TrendWidgetConfigDtoChartTypeEnum;
  breakdown_property?: string;
  cohort_ids?: string[];
  date_from: string;
  date_to: string;
  compare: boolean;
}

export interface RetentionWidgetConfig {
  type: RetentionWidgetConfigDtoTypeEnum;
  retention_type: RetentionWidgetConfigDtoRetentionTypeEnum;
  granularity: RetentionWidgetConfigDtoGranularityEnum;
  cohort_ids?: string[];
  target_event: string;
  periods: number;
  date_from: string;
  date_to: string;
}

export interface LifecycleWidgetConfig {
  type: LifecycleWidgetConfigDtoTypeEnum;
  granularity: LifecycleWidgetConfigDtoGranularityEnum;
  cohort_ids?: string[];
  target_event: string;
  date_from: string;
  date_to: string;
}

export interface StickinessWidgetConfig {
  type: StickinessWidgetConfigDtoTypeEnum;
  granularity: StickinessWidgetConfigDtoGranularityEnum;
  cohort_ids?: string[];
  target_event: string;
  date_from: string;
  date_to: string;
}

export interface Insight {
  type: InsightDtoTypeEnum;
  description?: string | null;
  config:
    | ({
        type: "funnel";
      } & FunnelWidgetConfig)
    | ({
        type: "trend";
      } & TrendWidgetConfig)
    | ({
        type: "retention";
      } & RetentionWidgetConfig)
    | ({
        type: "lifecycle";
      } & LifecycleWidgetConfig)
    | ({
        type: "stickiness";
      } & StickinessWidgetConfig);
  id: string;
  project_id: string;
  created_by: string;
  name: string;
  is_favorite: boolean;
  /** @format date-time */
  created_at: string;
  /** @format date-time */
  updated_at: string;
}

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Widget {
  insight_id?: string | null;
  insight?: Insight | null;
  id: string;
  dashboard_id: string;
  layout: WidgetLayout;
  /** @format date-time */
  created_at: string;
  /** @format date-time */
  updated_at: string;
}

export interface DashboardWithWidgets {
  id: string;
  project_id: string;
  name: string;
  /** @format date-time */
  created_at: string;
  /** @format date-time */
  updated_at: string;
  widgets: Widget[];
}

export interface UpdateDashboard {
  /**
   * @minLength 1
   * @maxLength 100
   */
  name?: string;
}

export interface CreateWidget {
  /** @format uuid */
  insight_id: string;
  layout: WidgetLayout;
}

export interface UpdateWidget {
  /** @format uuid */
  insight_id?: string;
  layout?: WidgetLayout;
}

export interface Person {
  properties: Record<string, any>;
  distinct_ids: string[];
  id: string;
  project_id: string;
  created_at: string;
  updated_at: string;
}

export interface PersonsListResponse {
  persons: Person[];
  total: number;
}

export interface PersonEventRow {
  event_id: string;
  event_name: string;
  event_type: string;
  distinct_id: string;
  person_id: string;
  session_id: string;
  timestamp: string;
  url: string;
  referrer: string;
  page_title: string;
  page_path: string;
  device_type: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  screen_width: number;
  screen_height: number;
  country: string;
  region: string;
  city: string;
  language: string;
  timezone: string;
  sdk_name: string;
  sdk_version: string;
  properties: string;
  user_properties: string;
}

export interface CohortDefinition {
  match: CohortDefinitionDtoMatchEnum;
  /** @minItems 1 */
  conditions: object[];
}

export interface Cohort {
  description?: string | null;
  id: string;
  project_id: string;
  created_by: string;
  name: string;
  definition: CohortDefinition;
  created_at: string;
  updated_at: string;
}

export interface CreateCohort {
  name: string;
  description?: string;
  definition: CohortDefinition;
}

export interface UpdateCohort {
  name?: string;
  description?: string;
  definition?: CohortDefinition;
}

export interface CohortMemberCount {
  count: number;
}

export interface CohortPreview {
  definition: CohortDefinition;
}

export interface CreateInsight {
  config:
    | ({
        type: "funnel";
      } & FunnelWidgetConfig)
    | ({
        type: "trend";
      } & TrendWidgetConfig)
    | ({
        type: "retention";
      } & RetentionWidgetConfig)
    | ({
        type: "lifecycle";
      } & LifecycleWidgetConfig)
    | ({
        type: "stickiness";
      } & StickinessWidgetConfig);
  type: CreateInsightDtoTypeEnum;
  /** @maxLength 200 */
  name: string;
  /** @maxLength 1000 */
  description?: string;
}

export interface UpdateInsight {
  config?:
    | ({
        type: "funnel";
      } & FunnelWidgetConfig)
    | ({
        type: "trend";
      } & TrendWidgetConfig)
    | ({
        type: "retention";
      } & RetentionWidgetConfig)
    | ({
        type: "lifecycle";
      } & LifecycleWidgetConfig)
    | ({
        type: "stickiness";
      } & StickinessWidgetConfig);
  is_favorite?: boolean;
  /** @maxLength 200 */
  name?: string;
  /** @maxLength 1000 */
  description?: string;
}

export interface MemberUser {
  id: string;
  email: string;
  display_name: string;
}

export interface Member {
  id: string;
  project_id: string;
  user: MemberUser;
  role: string;
  /** @format date-time */
  created_at: string;
}

export interface UpdateMemberRole {
  role: UpdateMemberRoleDtoRoleEnum;
}

export interface Inviter {
  id: string;
  email: string;
  display_name: string;
}

export interface Invite {
  id: string;
  project_id: string;
  invited_by: Inviter;
  email: string;
  role: string;
  status: string;
  /** @format date-time */
  created_at: string;
  /** @format date-time */
  responded_at: string | null;
}

export interface CreateInvite {
  role: CreateInviteDtoRoleEnum;
  /**
   * @format email
   * @maxLength 255
   */
  email: string;
}

export interface MyInvite {
  id: string;
  project: {
    id: string;
    name: string;
    slug: string;
  };
  invited_by: Inviter;
  role: string;
  status: string;
  /** @format date-time */
  created_at: string;
}

export type StepFilterDtoOperatorEnum =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "is_set"
  | "is_not_set";

export type TrendQueryDtoMetricEnum =
  | "total_events"
  | "unique_users"
  | "events_per_user";

export type TrendQueryDtoGranularityEnum = "hour" | "day" | "week" | "month";

export type RetentionQueryDtoRetentionTypeEnum = "first_time" | "recurring";

export type RetentionQueryDtoGranularityEnum = "day" | "week" | "month";

export type LifecycleQueryDtoGranularityEnum = "day" | "week" | "month";

export type StickinessQueryDtoGranularityEnum = "day" | "week" | "month";

export type FunnelWidgetConfigDtoTypeEnum = "funnel";

export type TrendWidgetConfigDtoTypeEnum = "trend";

export type TrendWidgetConfigDtoMetricEnum =
  | "total_events"
  | "unique_users"
  | "events_per_user";

export type TrendWidgetConfigDtoGranularityEnum =
  | "hour"
  | "day"
  | "week"
  | "month";

export type TrendWidgetConfigDtoChartTypeEnum = "line" | "bar";

export type RetentionWidgetConfigDtoTypeEnum = "retention";

export type RetentionWidgetConfigDtoRetentionTypeEnum =
  | "first_time"
  | "recurring";

export type RetentionWidgetConfigDtoGranularityEnum = "day" | "week" | "month";

export type LifecycleWidgetConfigDtoTypeEnum = "lifecycle";

export type LifecycleWidgetConfigDtoGranularityEnum = "day" | "week" | "month";

export type StickinessWidgetConfigDtoTypeEnum = "stickiness";

export type StickinessWidgetConfigDtoGranularityEnum = "day" | "week" | "month";

export type InsightDtoTypeEnum =
  | "trend"
  | "funnel"
  | "retention"
  | "lifecycle"
  | "stickiness";

export type CohortDefinitionDtoMatchEnum = "all" | "any";

export type CreateInsightDtoTypeEnum =
  | "trend"
  | "funnel"
  | "retention"
  | "lifecycle"
  | "stickiness";

export type UpdateMemberRoleDtoRoleEnum = "editor" | "viewer";

export type CreateInviteDtoRoleEnum = "editor" | "viewer";

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
  date_from?: string;
  date_to?: string;
  filters?: StepFilter[];
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

export interface PersonsControllerGetPersonsParams {
  search?: string;
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

export interface PersonsControllerGetPersonByIdParams {
  project_id: string;
  personId: string;
}

export interface PersonsControllerGetPersonEventsParams {
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
  personId: string;
}

export interface CohortsControllerListParams {
  projectId: string;
}

export interface CohortsControllerCreateParams {
  projectId: string;
}

export interface CohortsControllerGetByIdParams {
  projectId: string;
  cohortId: string;
}

export interface CohortsControllerUpdateParams {
  projectId: string;
  cohortId: string;
}

export interface CohortsControllerRemoveParams {
  projectId: string;
  cohortId: string;
}

export interface CohortsControllerGetMemberCountParams {
  projectId: string;
  cohortId: string;
}

export interface CohortsControllerPreviewCountParams {
  projectId: string;
}

export interface InsightsControllerListParams {
  type?: TypeEnum;
  projectId: string;
}

export type TypeEnum =
  | "trend"
  | "funnel"
  | "retention"
  | "lifecycle"
  | "stickiness";

export type InsightsControllerListParams1TypeEnum =
  | "trend"
  | "funnel"
  | "retention"
  | "lifecycle"
  | "stickiness";

export interface InsightsControllerCreateParams {
  projectId: string;
}

export interface InsightsControllerGetByIdParams {
  projectId: string;
  insightId: string;
}

export interface InsightsControllerUpdateParams {
  projectId: string;
  insightId: string;
}

export interface InsightsControllerRemoveParams {
  projectId: string;
  insightId: string;
}

export interface MembersControllerListMembersParams {
  projectId: string;
}

export interface MembersControllerUpdateRoleParams {
  projectId: string;
  memberId: string;
}

export interface MembersControllerRemoveMemberParams {
  projectId: string;
  memberId: string;
}

export interface InvitesControllerListInvitesParams {
  projectId: string;
}

export interface InvitesControllerCreateInviteParams {
  projectId: string;
}

export interface InvitesControllerCancelInviteParams {
  projectId: string;
  inviteId: string;
}

export interface MyInvitesControllerAcceptInviteParams {
  inviteId: string;
}

export interface MyInvitesControllerDeclineInviteParams {
  inviteId: string;
}

import type {
  AxiosInstance,
  AxiosRequestConfig,
  HeadersDefaults,
  ResponseType,
} from "axios";
import axios from "axios";

export type QueryParamsType = Record<string | number, any>;

export interface FullRequestParams
  extends Omit<AxiosRequestConfig, "data" | "params" | "url" | "responseType"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseType;
  /** request body */
  body?: unknown;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown>
  extends Omit<AxiosRequestConfig, "data" | "cancelToken"> {
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<AxiosRequestConfig | void> | AxiosRequestConfig | void;
  secure?: boolean;
  format?: ResponseType;
}

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public instance: AxiosInstance;
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private secure?: boolean;
  private format?: ResponseType;

  constructor({
    securityWorker,
    secure,
    format,
    ...axiosConfig
  }: ApiConfig<SecurityDataType> = {}) {
    this.instance = axios.create({
      ...axiosConfig,
      baseURL: axiosConfig.baseURL || "",
    });
    this.secure = secure;
    this.format = format;
    this.securityWorker = securityWorker;
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected mergeRequestParams(
    params1: AxiosRequestConfig,
    params2?: AxiosRequestConfig,
  ): AxiosRequestConfig {
    const method = params1.method || (params2 && params2.method);

    return {
      ...this.instance.defaults,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...((method &&
          this.instance.defaults.headers[
            method.toLowerCase() as keyof HeadersDefaults
          ]) ||
          {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected stringifyFormItem(formItem: unknown) {
    if (typeof formItem === "object" && formItem !== null) {
      return JSON.stringify(formItem);
    } else {
      return `${formItem}`;
    }
  }

  protected createFormData(input: Record<string, unknown>): FormData {
    if (input instanceof FormData) {
      return input;
    }
    return Object.keys(input || {}).reduce((formData, key) => {
      const property = input[key];
      const propertyContent: any[] =
        property instanceof Array ? property : [property];

      for (const formItem of propertyContent) {
        const isFileType = formItem instanceof Blob || formItem instanceof File;
        formData.append(
          key,
          isFileType ? formItem : this.stringifyFormItem(formItem),
        );
      }

      return formData;
    }, new FormData());
  }

  public request = async <T = any, _E = any>({
    secure,
    path,
    type,
    query,
    format,
    body,
    ...params
  }: FullRequestParams): Promise<T> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const responseFormat = format || this.format || undefined;

    if (
      type === ContentType.FormData &&
      body &&
      body !== null &&
      typeof body === "object"
    ) {
      body = this.createFormData(body as Record<string, unknown>);
    }

    if (
      type === ContentType.Text &&
      body &&
      body !== null &&
      typeof body !== "string"
    ) {
      body = JSON.stringify(body);
    }

    return this.instance
      .request({
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type ? { "Content-Type": type } : {}),
        },
        params: query,
        responseType: responseFormat,
        data: body,
        url: path,
      })
      .then((response) => response.data);
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
     * @tags Analytics
     * @name AnalyticsControllerGetTrend
     * @request POST:/api/analytics/trend
     * @secure
     */
    analyticsControllerGetTrend: (
      data: TrendQuery,
      params: RequestParams = {},
    ) =>
      this.request<TrendResponse, any>({
        path: `/api/analytics/trend`,
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
     * @name AnalyticsControllerGetRetention
     * @request POST:/api/analytics/retention
     * @secure
     */
    analyticsControllerGetRetention: (
      data: RetentionQuery,
      params: RequestParams = {},
    ) =>
      this.request<RetentionResponse, any>({
        path: `/api/analytics/retention`,
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
     * @name AnalyticsControllerGetLifecycle
     * @request POST:/api/analytics/lifecycle
     * @secure
     */
    analyticsControllerGetLifecycle: (
      data: LifecycleQuery,
      params: RequestParams = {},
    ) =>
      this.request<LifecycleResponse, any>({
        path: `/api/analytics/lifecycle`,
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
     * @name AnalyticsControllerGetStickiness
     * @request POST:/api/analytics/stickiness
     * @secure
     */
    analyticsControllerGetStickiness: (
      data: StickinessQuery,
      params: RequestParams = {},
    ) =>
      this.request<StickinessResponse, any>({
        path: `/api/analytics/stickiness`,
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
     * @name DashboardsControllerList
     * @request GET:/api/projects/{projectId}/dashboards
     * @secure
     */
    dashboardsControllerList: (
      { projectId, ...query }: DashboardsControllerListParams,
      params: RequestParams = {},
    ) =>
      this.request<Dashboard[], any>({
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
      this.request<Dashboard, any>({
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
      this.request<DashboardWithWidgets, any>({
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
      this.request<Dashboard, any>({
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
      this.request<Widget, any>({
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
      this.request<Widget, any>({
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

    /**
     * No description
     *
     * @tags Persons
     * @name PersonsControllerGetPersons
     * @request GET:/api/persons
     * @secure
     */
    personsControllerGetPersons: (
      query: PersonsControllerGetPersonsParams,
      params: RequestParams = {},
    ) =>
      this.request<PersonsListResponse, any>({
        path: `/api/persons`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Persons
     * @name PersonsControllerGetPersonById
     * @request GET:/api/persons/{personId}
     * @secure
     */
    personsControllerGetPersonById: (
      { personId, ...query }: PersonsControllerGetPersonByIdParams,
      params: RequestParams = {},
    ) =>
      this.request<Person, any>({
        path: `/api/persons/${personId}`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Persons
     * @name PersonsControllerGetPersonEvents
     * @request GET:/api/persons/{personId}/events
     * @secure
     */
    personsControllerGetPersonEvents: (
      { personId, ...query }: PersonsControllerGetPersonEventsParams,
      params: RequestParams = {},
    ) =>
      this.request<PersonEventRow[], any>({
        path: `/api/persons/${personId}/events`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Cohorts
     * @name CohortsControllerList
     * @request GET:/api/projects/{projectId}/cohorts
     * @secure
     */
    cohortsControllerList: (
      { projectId, ...query }: CohortsControllerListParams,
      params: RequestParams = {},
    ) =>
      this.request<Cohort[], any>({
        path: `/api/projects/${projectId}/cohorts`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Cohorts
     * @name CohortsControllerCreate
     * @request POST:/api/projects/{projectId}/cohorts
     * @secure
     */
    cohortsControllerCreate: (
      { projectId, ...query }: CohortsControllerCreateParams,
      data: CreateCohort,
      params: RequestParams = {},
    ) =>
      this.request<Cohort, any>({
        path: `/api/projects/${projectId}/cohorts`,
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
     * @tags Cohorts
     * @name CohortsControllerGetById
     * @request GET:/api/projects/{projectId}/cohorts/{cohortId}
     * @secure
     */
    cohortsControllerGetById: (
      { projectId, cohortId, ...query }: CohortsControllerGetByIdParams,
      params: RequestParams = {},
    ) =>
      this.request<Cohort, any>({
        path: `/api/projects/${projectId}/cohorts/${cohortId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Cohorts
     * @name CohortsControllerUpdate
     * @request PUT:/api/projects/{projectId}/cohorts/{cohortId}
     * @secure
     */
    cohortsControllerUpdate: (
      { projectId, cohortId, ...query }: CohortsControllerUpdateParams,
      data: UpdateCohort,
      params: RequestParams = {},
    ) =>
      this.request<Cohort, any>({
        path: `/api/projects/${projectId}/cohorts/${cohortId}`,
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
     * @tags Cohorts
     * @name CohortsControllerRemove
     * @request DELETE:/api/projects/{projectId}/cohorts/{cohortId}
     * @secure
     */
    cohortsControllerRemove: (
      { projectId, cohortId, ...query }: CohortsControllerRemoveParams,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/projects/${projectId}/cohorts/${cohortId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Cohorts
     * @name CohortsControllerGetMemberCount
     * @request GET:/api/projects/{projectId}/cohorts/{cohortId}/count
     * @secure
     */
    cohortsControllerGetMemberCount: (
      { projectId, cohortId, ...query }: CohortsControllerGetMemberCountParams,
      params: RequestParams = {},
    ) =>
      this.request<CohortMemberCount, any>({
        path: `/api/projects/${projectId}/cohorts/${cohortId}/count`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Cohorts
     * @name CohortsControllerPreviewCount
     * @request POST:/api/projects/{projectId}/cohorts/preview-count
     * @secure
     */
    cohortsControllerPreviewCount: (
      { projectId, ...query }: CohortsControllerPreviewCountParams,
      data: CohortPreview,
      params: RequestParams = {},
    ) =>
      this.request<CohortMemberCount, any>({
        path: `/api/projects/${projectId}/cohorts/preview-count`,
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
     * @tags Insights
     * @name InsightsControllerList
     * @request GET:/api/projects/{projectId}/insights
     * @secure
     */
    insightsControllerList: (
      { projectId, ...query }: InsightsControllerListParams,
      params: RequestParams = {},
    ) =>
      this.request<Insight[], any>({
        path: `/api/projects/${projectId}/insights`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Insights
     * @name InsightsControllerCreate
     * @request POST:/api/projects/{projectId}/insights
     * @secure
     */
    insightsControllerCreate: (
      { projectId, ...query }: InsightsControllerCreateParams,
      data: CreateInsight,
      params: RequestParams = {},
    ) =>
      this.request<Insight, any>({
        path: `/api/projects/${projectId}/insights`,
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
     * @tags Insights
     * @name InsightsControllerGetById
     * @request GET:/api/projects/{projectId}/insights/{insightId}
     * @secure
     */
    insightsControllerGetById: (
      { projectId, insightId, ...query }: InsightsControllerGetByIdParams,
      params: RequestParams = {},
    ) =>
      this.request<Insight, any>({
        path: `/api/projects/${projectId}/insights/${insightId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Insights
     * @name InsightsControllerUpdate
     * @request PUT:/api/projects/{projectId}/insights/{insightId}
     * @secure
     */
    insightsControllerUpdate: (
      { projectId, insightId, ...query }: InsightsControllerUpdateParams,
      data: UpdateInsight,
      params: RequestParams = {},
    ) =>
      this.request<Insight, any>({
        path: `/api/projects/${projectId}/insights/${insightId}`,
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
     * @tags Insights
     * @name InsightsControllerRemove
     * @request DELETE:/api/projects/{projectId}/insights/{insightId}
     * @secure
     */
    insightsControllerRemove: (
      { projectId, insightId, ...query }: InsightsControllerRemoveParams,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/projects/${projectId}/insights/${insightId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Members
     * @name MembersControllerListMembers
     * @request GET:/api/projects/{projectId}/members
     * @secure
     */
    membersControllerListMembers: (
      { projectId, ...query }: MembersControllerListMembersParams,
      params: RequestParams = {},
    ) =>
      this.request<Member[], any>({
        path: `/api/projects/${projectId}/members`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Members
     * @name MembersControllerUpdateRole
     * @request PUT:/api/projects/{projectId}/members/{memberId}/role
     * @secure
     */
    membersControllerUpdateRole: (
      { projectId, memberId, ...query }: MembersControllerUpdateRoleParams,
      data: UpdateMemberRole,
      params: RequestParams = {},
    ) =>
      this.request<Member, any>({
        path: `/api/projects/${projectId}/members/${memberId}/role`,
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
     * @tags Members
     * @name MembersControllerRemoveMember
     * @request DELETE:/api/projects/{projectId}/members/{memberId}
     * @secure
     */
    membersControllerRemoveMember: (
      { projectId, memberId, ...query }: MembersControllerRemoveMemberParams,
      params: RequestParams = {},
    ) =>
      this.request<OkResponse, any>({
        path: `/api/projects/${projectId}/members/${memberId}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Invites
     * @name InvitesControllerListInvites
     * @request GET:/api/projects/{projectId}/invites
     * @secure
     */
    invitesControllerListInvites: (
      { projectId, ...query }: InvitesControllerListInvitesParams,
      params: RequestParams = {},
    ) =>
      this.request<Invite[], any>({
        path: `/api/projects/${projectId}/invites`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Invites
     * @name InvitesControllerCreateInvite
     * @request POST:/api/projects/{projectId}/invites
     * @secure
     */
    invitesControllerCreateInvite: (
      { projectId, ...query }: InvitesControllerCreateInviteParams,
      data: CreateInvite,
      params: RequestParams = {},
    ) =>
      this.request<Invite, any>({
        path: `/api/projects/${projectId}/invites`,
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
     * @tags Invites
     * @name InvitesControllerCancelInvite
     * @request DELETE:/api/projects/{projectId}/invites/{inviteId}
     * @secure
     */
    invitesControllerCancelInvite: (
      { projectId, inviteId, ...query }: InvitesControllerCancelInviteParams,
      params: RequestParams = {},
    ) =>
      this.request<OkResponse, any>({
        path: `/api/projects/${projectId}/invites/${inviteId}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Invites
     * @name MyInvitesControllerGetMyInvites
     * @request GET:/api/invites
     * @secure
     */
    myInvitesControllerGetMyInvites: (params: RequestParams = {}) =>
      this.request<MyInvite[], any>({
        path: `/api/invites`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Invites
     * @name MyInvitesControllerAcceptInvite
     * @request POST:/api/invites/{inviteId}/accept
     * @secure
     */
    myInvitesControllerAcceptInvite: (
      { inviteId, ...query }: MyInvitesControllerAcceptInviteParams,
      params: RequestParams = {},
    ) =>
      this.request<OkResponse, any>({
        path: `/api/invites/${inviteId}/accept`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Invites
     * @name MyInvitesControllerDeclineInvite
     * @request POST:/api/invites/{inviteId}/decline
     * @secure
     */
    myInvitesControllerDeclineInvite: (
      { inviteId, ...query }: MyInvitesControllerDeclineInviteParams,
      params: RequestParams = {},
    ) =>
      this.request<OkResponse, any>({
        path: `/api/invites/${inviteId}/decline`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  health = {
    /**
     * No description
     *
     * @tags Health
     * @name HealthControllerCheck
     * @request GET:/health
     */
    healthControllerCheck: (params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/health`,
        method: "GET",
        ...params,
      }),
  };
}
