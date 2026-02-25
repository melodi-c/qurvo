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

export type InsightType =
  | "trend"
  | "funnel"
  | "retention"
  | "lifecycle"
  | "stickiness"
  | "paths";

export type ChartType = "line" | "bar";

export type Granularity = "day" | "week" | "month";

export type RetentionType = "first_time" | "recurring";

export type TrendGranularity = "hour" | "day" | "week" | "month";

export type TrendMetric =
  | "total_events"
  | "unique_users"
  | "events_per_user"
  | "property_sum"
  | "property_avg"
  | "property_min"
  | "property_max";

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
  language: string;
  email_verified: boolean;
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

export interface SessionUser {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  language: string;
  email_verified: boolean;
}

export interface MeResponse {
  user: SessionUser;
}

export interface VerifyEmailByCode {
  /** @pattern /^\d{6}$/ */
  code: string;
}

export interface VerifyEmailByToken {
  /**
   * @minLength 64
   * @maxLength 64
   */
  token: string;
}

export interface ResendVerificationResponse {
  cooldown_seconds: number;
}

export interface UpdateProfile {
  /**
   * @minLength 1
   * @maxLength 100
   */
  display_name?: string;
  language?: UpdateProfileDtoLanguageEnum;
}

export interface ProfileResponse {
  user: User;
}

export interface ChangePassword {
  /**
   * @minLength 8
   * @maxLength 128
   */
  current_password: string;
  /**
   * @minLength 8
   * @maxLength 128
   */
  new_password: string;
}

export interface ProjectWithRole {
  role: string;
  id: string;
  name: string;
  slug: string;
  plan: string | null;
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
  plan: string | null;
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

export interface FunnelExclusion {
  event_name: string;
  /** @min 0 */
  funnel_from_step: number;
  /** @min 1 */
  funnel_to_step: number;
}

export interface StepFilter {
  property: string;
  operator: StepFilterDtoOperatorEnum;
  value?: string;
}

export interface FunnelStep {
  /** Additional event names for OR-logic within step */
  event_names?: string[];
  event_name: string;
  label: string;
  filters?: StepFilter[];
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
  /** Sampling factor used (if < 1.0, results are sampled) */
  sampling_factor?: number;
  aggregate_steps?: FunnelStepResult[];
  breakdown: boolean;
  steps: FunnelStepResult[];
}

export interface FunnelResponse {
  data: FunnelResult;
  cached_at: string;
  from_cache: boolean;
}

export interface TimeToConvertBin {
  from_seconds: number;
  to_seconds: number;
  count: number;
}

export interface TimeToConvertResult {
  from_step: number;
  to_step: number;
  average_seconds: number | null;
  median_seconds: number | null;
  sample_size: number;
  bins: TimeToConvertBin[];
}

export interface TimeToConvertResponse {
  data: TimeToConvertResult;
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
}

export interface EventDetail {
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

export interface EventPropertyNamesResponse {
  property_names: string[];
}

export interface TrendSeries {
  event_name: string;
  label: string;
  filters?: StepFilter[];
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

export interface PathCleaningRule {
  regex: string;
  alias: string;
}

export interface WildcardGroup {
  pattern: string;
  alias: string;
}

export interface PathTransition {
  step: number;
  source: string;
  target: string;
  person_count: number;
}

export interface TopPath {
  path: string[];
  person_count: number;
}

export interface PathsResult {
  transitions: PathTransition[];
  top_paths: TopPath[];
}

export interface PathsResponse {
  data: PathsResult;
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
  conversion_window_value?: number;
  conversion_window_unit?: FunnelWidgetConfigDtoConversionWindowUnitEnum;
  breakdown_property?: string;
  breakdown_type?: FunnelWidgetConfigDtoBreakdownTypeEnum;
  breakdown_cohort_ids?: string[];
  cohort_ids?: string[];
  funnel_order_type?: FunnelWidgetConfigDtoFunnelOrderTypeEnum;
  funnel_viz_type?: string;
  conversion_rate_display?: FunnelWidgetConfigDtoConversionRateDisplayEnum;
  exclusions?: FunnelExclusion[];
  /** Sampling factor 0.0-1.0 (1.0 = no sampling) */
  sampling_factor?: number;
  conversion_window_days: number;
  date_from: string;
  date_to: string;
}

export interface TrendFormula {
  id: string;
  label: string;
  expression: string;
}

export interface TrendWidgetConfig {
  type: TrendWidgetConfigDtoTypeEnum;
  series: TrendSeries[];
  metric: TrendMetric;
  metric_property?: string;
  granularity: TrendGranularity;
  chart_type: ChartType;
  breakdown_property?: string;
  cohort_ids?: string[];
  formulas?: TrendFormula[];
  date_from: string;
  date_to: string;
  compare: boolean;
}

export interface RetentionWidgetConfig {
  type: RetentionWidgetConfigDtoTypeEnum;
  retention_type: RetentionType;
  granularity: Granularity;
  cohort_ids?: string[];
  target_event: string;
  periods: number;
  date_from: string;
  date_to: string;
}

export interface LifecycleWidgetConfig {
  type: LifecycleWidgetConfigDtoTypeEnum;
  granularity: Granularity;
  cohort_ids?: string[];
  target_event: string;
  date_from: string;
  date_to: string;
}

export interface StickinessWidgetConfig {
  type: StickinessWidgetConfigDtoTypeEnum;
  granularity: Granularity;
  cohort_ids?: string[];
  target_event: string;
  date_from: string;
  date_to: string;
}

export interface PathCleaningRuleConfig {
  regex: string;
  alias: string;
}

export interface WildcardGroupConfig {
  pattern: string;
  alias: string;
}

export interface PathsWidgetConfig {
  type: PathsWidgetConfigDtoTypeEnum;
  start_event?: string;
  end_event?: string;
  exclusions?: string[];
  min_persons?: number;
  path_cleaning_rules?: PathCleaningRuleConfig[];
  wildcard_groups?: WildcardGroupConfig[];
  cohort_ids?: string[];
  date_from: string;
  date_to: string;
  step_limit: number;
}

export interface Insight {
  type: InsightType;
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
      } & StickinessWidgetConfig)
    | ({
        type: "paths";
      } & PathsWidgetConfig);
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
  /** @min 0 */
  x: number;
  /** @min 0 */
  y: number;
  /** @min 1 */
  w: number;
  /** @min 1 */
  h: number;
}

export interface Widget {
  insight_id?: string | null;
  content?: string | null;
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
  /** @maxLength 10000 */
  content?: string;
  /** @format uuid */
  insight_id?: string;
  layout: WidgetLayout;
}

export interface UpdateWidget {
  /** @maxLength 10000 */
  content?: string;
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

export interface PersonPropertyNamesResponse {
  property_names: string[];
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

export interface CohortConditionGroup {
  type: CohortConditionGroupDtoTypeEnum;
  /** @minItems 1 */
  values: object[];
}

export interface Cohort {
  description?: string | null;
  definition?: CohortConditionGroup | null;
  last_error_at?: string | null;
  last_error_message?: string | null;
  id: string;
  project_id: string;
  created_by: string;
  name: string;
  is_static: boolean;
  errors_calculating: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCohort {
  name: string;
  description?: string;
  definition?: CohortConditionGroup;
  is_static?: boolean;
}

export interface UpdateCohort {
  name?: string;
  description?: string;
  definition?: CohortConditionGroup;
}

export interface CohortHistoryPoint {
  date: string;
  count: number;
}

export interface CohortMemberCount {
  count: number;
}

export interface CohortPreview {
  definition?: CohortConditionGroup;
}

export interface CreateStaticCohort {
  name: string;
  description?: string;
  person_ids?: string[];
}

export interface UploadCsv {
  /** @maxLength 5000000 */
  csv_content: string;
}

export interface StaticCohortMembers {
  person_ids: string[];
}

export interface CreateInsight {
  type: InsightType;
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
      } & StickinessWidgetConfig)
    | ({
        type: "paths";
      } & PathsWidgetConfig);
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
      } & StickinessWidgetConfig)
    | ({
        type: "paths";
      } & PathsWidgetConfig);
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

export interface AiChat {
  /** @format uuid */
  conversation_id?: string;
  /** @format uuid */
  project_id: string;
  /** @maxLength 10000 */
  message: string;
}

export interface AiConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  content?: string | null;
  tool_calls?: object;
  tool_call_id?: string | null;
  tool_name?: string | null;
  tool_result?: object;
  visualization_type?: string | null;
  id: string;
  role: string;
  sequence: number;
  created_at: string;
}

export interface AiConversationDetail {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: AiMessage[];
  has_more: boolean;
}

export interface EventDefinition {
  event_name: string;
  id: string;
  description?: string | null;
  tags: string[];
  verified: boolean;
  last_seen_at: string;
  updated_at: string;
}

export interface EventDefinitionsListResponse {
  items: EventDefinition[];
  total: number;
}

export interface UpsertEventDefinition {
  description?: string;
  tags?: string[];
  verified?: boolean;
}

export interface UpsertEventDefinitionResponse {
  description?: string | null;
  tags: string[];
  id: string;
  project_id: string;
  event_name: string;
  verified: boolean;
  /** @format date-time */
  last_seen_at: string;
  /** @format date-time */
  created_at: string;
  /** @format date-time */
  updated_at: string;
}

export interface PropertyDefinition {
  property_name: string;
  property_type: PropertyDefinitionDtoPropertyTypeEnum;
  value_type?: string | null;
  is_numerical: boolean;
  id: string;
  description?: string | null;
  tags: string[];
  verified: boolean;
  last_seen_at: string;
  updated_at: string;
}

export interface PropertyDefinitionsListResponse {
  items: PropertyDefinition[];
  total: number;
}

export interface UpsertPropertyDefinition {
  description?: string;
  tags?: string[];
  verified?: boolean;
  value_type?: string;
  is_numerical?: boolean;
}

export interface UpsertPropertyDefinitionResponse {
  property_type: UpsertPropertyDefinitionResponseDtoPropertyTypeEnum;
  value_type?: string | null;
  is_numerical: boolean;
  description?: string | null;
  tags: string[];
  id: string;
  project_id: string;
  property_name: string;
  verified: boolean;
  /** @format date-time */
  last_seen_at: string;
  /** @format date-time */
  created_at: string;
  /** @format date-time */
  updated_at: string;
}

export interface WebAnalyticsKPIs {
  unique_visitors: number;
  pageviews: number;
  sessions: number;
  avg_duration_seconds: number;
  bounce_rate: number;
}

export interface WebAnalyticsTimeseriesPoint {
  bucket: string;
  unique_visitors: number;
  pageviews: number;
  sessions: number;
}

export interface WebAnalyticsOverviewData {
  current: WebAnalyticsKPIs;
  previous: WebAnalyticsKPIs;
  timeseries: WebAnalyticsTimeseriesPoint[];
  granularity: string;
}

export interface WebAnalyticsOverviewResponse {
  data: WebAnalyticsOverviewData;
  cached_at: string;
  from_cache: boolean;
}

export interface WebAnalyticsDimensionRow {
  name: string;
  visitors: number;
  pageviews: number;
}

export interface WebAnalyticsPathsData {
  top_pages: WebAnalyticsDimensionRow[];
  entry_pages: WebAnalyticsDimensionRow[];
  exit_pages: WebAnalyticsDimensionRow[];
}

export interface WebAnalyticsPathsResponse {
  data: WebAnalyticsPathsData;
  cached_at: string;
  from_cache: boolean;
}

export interface WebAnalyticsSourcesData {
  referrers: WebAnalyticsDimensionRow[];
  utm_sources: WebAnalyticsDimensionRow[];
  utm_mediums: WebAnalyticsDimensionRow[];
  utm_campaigns: WebAnalyticsDimensionRow[];
}

export interface WebAnalyticsSourcesResponse {
  data: WebAnalyticsSourcesData;
  cached_at: string;
  from_cache: boolean;
}

export interface WebAnalyticsDevicesData {
  device_types: WebAnalyticsDimensionRow[];
  browsers: WebAnalyticsDimensionRow[];
  oses: WebAnalyticsDimensionRow[];
}

export interface WebAnalyticsDevicesResponse {
  data: WebAnalyticsDevicesData;
  cached_at: string;
  from_cache: boolean;
}

export interface WebAnalyticsGeographyData {
  countries: WebAnalyticsDimensionRow[];
  regions: WebAnalyticsDimensionRow[];
  cities: WebAnalyticsDimensionRow[];
}

export interface WebAnalyticsGeographyResponse {
  data: WebAnalyticsGeographyData;
  cached_at: string;
  from_cache: boolean;
}

export interface BillingStatus {
  /** @example "free" */
  plan: string;
  /** @example "Free" */
  plan_name: string;
  /** @example 42130 */
  events_this_month: number;
  /** @example null */
  events_limit?: number | null;
  /** @example null */
  data_retention_days?: number | null;
  /** @example null */
  max_projects?: number | null;
  features: object;
  /** @example "2026-02-01T00:00:00.000Z" */
  period_start: string;
  /** @example "2026-03-01T00:00:00.000Z" */
  period_end: string;
}

export type UpdateProfileDtoLanguageEnum = "ru" | "en";

export type StepFilterDtoOperatorEnum =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "is_set"
  | "is_not_set";

export type FunnelWidgetConfigDtoTypeEnum = "funnel";

export type FunnelWidgetConfigDtoConversionWindowUnitEnum =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

export type FunnelWidgetConfigDtoBreakdownTypeEnum = "property" | "cohort";

export type FunnelWidgetConfigDtoFunnelOrderTypeEnum =
  | "ordered"
  | "strict"
  | "unordered";

export type FunnelWidgetConfigDtoConversionRateDisplayEnum =
  | "total"
  | "relative";

export type TrendWidgetConfigDtoTypeEnum = "trend";

export type RetentionWidgetConfigDtoTypeEnum = "retention";

export type LifecycleWidgetConfigDtoTypeEnum = "lifecycle";

export type StickinessWidgetConfigDtoTypeEnum = "stickiness";

export type PathsWidgetConfigDtoTypeEnum = "paths";

export type CohortConditionGroupDtoTypeEnum = "AND" | "OR";

export type UpdateMemberRoleDtoRoleEnum = "editor" | "viewer";

export type CreateInviteDtoRoleEnum = "editor" | "viewer";

export type PropertyDefinitionDtoPropertyTypeEnum = "event" | "person";

export type UpsertPropertyDefinitionResponseDtoPropertyTypeEnum =
  | "event"
  | "person";

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

export interface FunnelControllerGetFunnelParams {
  cohort_ids?: string[];
  /** @min 1 */
  conversion_window_value?: number;
  conversion_window_unit?: ConversionWindowUnitEnum;
  /**
   * Sampling factor 0.0-1.0 (1.0 = no sampling)
   * @min 0.01
   * @max 1
   */
  sampling_factor?: number;
  breakdown_type?: BreakdownTypeEnum;
  breakdown_cohort_ids?: string[];
  funnel_order_type?: FunnelOrderTypeEnum;
  exclusions?: FunnelExclusion[];
  breakdown_property?: string;
  steps: FunnelStep[];
  /**
   * @min 1
   * @max 90
   * @default 14
   */
  conversion_window_days: number;
  /** @format uuid */
  widget_id?: string;
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export type ConversionWindowUnitEnum =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

export type BreakdownTypeEnum = "property" | "cohort";

export type FunnelOrderTypeEnum = "ordered" | "strict" | "unordered";

export type FunnelControllerGetFunnelParams1ConversionWindowUnitEnum =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

export type FunnelControllerGetFunnelParams1BreakdownTypeEnum =
  | "property"
  | "cohort";

export type FunnelControllerGetFunnelParams1FunnelOrderTypeEnum =
  | "ordered"
  | "strict"
  | "unordered";

export interface FunnelControllerGetFunnelTimeToConvertParams {
  cohort_ids?: string[];
  /** @min 1 */
  conversion_window_value?: number;
  conversion_window_unit?: ConversionWindowUnitEnum1;
  /**
   * Sampling factor 0.0-1.0 (1.0 = no sampling)
   * @min 0.01
   * @max 1
   */
  sampling_factor?: number;
  /** @min 0 */
  from_step: number;
  /** @min 1 */
  to_step: number;
  steps: FunnelStep[];
  /**
   * @min 1
   * @max 90
   * @default 14
   */
  conversion_window_days: number;
  /** @format uuid */
  widget_id?: string;
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export type ConversionWindowUnitEnum1 =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

export type FunnelControllerGetFunnelTimeToConvertParams1ConversionWindowUnitEnum =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

export interface EventsControllerGetEventsParams {
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

export interface EventsControllerGetEventDetailParams {
  /** @format uuid */
  project_id: string;
  eventId: string;
}

export interface EventsControllerGetEventNamesParams {
  /** @format uuid */
  project_id: string;
}

export interface EventsControllerGetEventPropertyNamesParams {
  event_name?: string;
  /** @format uuid */
  project_id: string;
}

export interface TrendControllerGetTrendParams {
  cohort_ids?: string[];
  metric: TrendMetric;
  granularity: TrendGranularity;
  breakdown_type?: BreakdownTypeEnum1;
  breakdown_cohort_ids?: string[];
  series: TrendSeries[];
  metric_property?: string;
  breakdown_property?: string;
  compare?: boolean;
  /** @format uuid */
  widget_id?: string;
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export type BreakdownTypeEnum1 = "property" | "cohort";

export type TrendControllerGetTrendParams1BreakdownTypeEnum =
  | "property"
  | "cohort";

export interface RetentionControllerGetRetentionParams {
  cohort_ids?: string[];
  retention_type: RetentionType;
  granularity: Granularity;
  target_event: string;
  /**
   * @min 1
   * @max 30
   * @default 11
   */
  periods: number;
  /** @format uuid */
  widget_id?: string;
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export interface LifecycleControllerGetLifecycleParams {
  cohort_ids?: string[];
  granularity: Granularity;
  target_event: string;
  /** @format uuid */
  widget_id?: string;
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export interface StickinessControllerGetStickinessParams {
  cohort_ids?: string[];
  granularity: Granularity;
  target_event: string;
  /** @format uuid */
  widget_id?: string;
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export interface PathsControllerGetPathsParams {
  cohort_ids?: string[];
  exclusions?: string[];
  path_cleaning_rules?: PathCleaningRule[];
  wildcard_groups?: WildcardGroup[];
  /**
   * @min 3
   * @max 10
   * @default 5
   */
  step_limit?: number;
  start_event?: string;
  end_event?: string;
  /** @min 1 */
  min_persons?: number;
  /** @format uuid */
  widget_id?: string;
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
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

export interface PersonsControllerGetPersonPropertyNamesParams {
  /** @format uuid */
  project_id: string;
}

export interface PersonsControllerGetPersonByIdParams {
  /** @format uuid */
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

export interface CohortsControllerGetSizeHistoryParams {
  /**
   * Number of days of history (default 30)
   * @min 1
   * @max 365
   * @default 30
   */
  days?: number;
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

export interface StaticCohortsControllerCreateStaticCohortParams {
  projectId: string;
}

export interface StaticCohortsControllerDuplicateAsStaticParams {
  projectId: string;
  cohortId: string;
}

export interface StaticCohortsControllerUploadCsvParams {
  projectId: string;
  cohortId: string;
}

export interface StaticCohortsControllerAddMembersParams {
  projectId: string;
  cohortId: string;
}

export interface StaticCohortsControllerRemoveMembersParams {
  projectId: string;
  cohortId: string;
}

export interface SavedInsightsControllerListParams {
  type?: TypeEnum;
  projectId: string;
}

export type TypeEnum =
  | "trend"
  | "funnel"
  | "retention"
  | "lifecycle"
  | "stickiness"
  | "paths";

export type SavedInsightsControllerListParams1TypeEnum =
  | "trend"
  | "funnel"
  | "retention"
  | "lifecycle"
  | "stickiness"
  | "paths";

export interface SavedInsightsControllerCreateParams {
  projectId: string;
}

export interface SavedInsightsControllerGetByIdParams {
  projectId: string;
  insightId: string;
}

export interface SavedInsightsControllerUpdateParams {
  projectId: string;
  insightId: string;
}

export interface SavedInsightsControllerRemoveParams {
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

export interface AiControllerListConversationsParams {
  /** @format uuid */
  project_id: string;
}

export interface AiControllerGetConversationParams {
  /**
   * @min 1
   * @max 100
   * @default 30
   */
  limit?: number;
  /** @min 0 */
  before_sequence?: number;
  id: string;
}

export interface AiControllerDeleteConversationParams {
  id: string;
}

export interface EventDefinitionsControllerListParams {
  search?: string;
  /**
   * @min 1
   * @max 500
   * @default 100
   */
  limit?: number;
  /**
   * @min 0
   * @default 0
   */
  offset?: number;
  /** @default "desc" */
  order?: OrderEnum;
  /** @default "last_seen_at" */
  order_by?: OrderByEnum;
  projectId: string;
}

/** @default "desc" */
export type OrderEnum = "asc" | "desc";

/** @default "last_seen_at" */
export type OrderByEnum =
  | "last_seen_at"
  | "event_name"
  | "created_at"
  | "updated_at";

/** @default "desc" */
export type EventDefinitionsControllerListParams1OrderEnum = "asc" | "desc";

/** @default "last_seen_at" */
export type EventDefinitionsControllerListParams1OrderByEnum =
  | "last_seen_at"
  | "event_name"
  | "created_at"
  | "updated_at";

export interface EventDefinitionsControllerUpsertParams {
  projectId: string;
  eventName: string;
}

export interface EventDefinitionsControllerRemoveParams {
  projectId: string;
  eventName: string;
}

export interface PropertyDefinitionsControllerListParams {
  search?: string;
  /**
   * @min 1
   * @max 500
   * @default 100
   */
  limit?: number;
  /**
   * @min 0
   * @default 0
   */
  offset?: number;
  /** @default "desc" */
  order?: OrderEnum1;
  type?: TypeEnum1;
  event_name?: string;
  is_numerical?: boolean;
  /** @default "last_seen_at" */
  order_by?: OrderByEnum1;
  projectId: string;
}

/** @default "desc" */
export type OrderEnum1 = "asc" | "desc";

export type TypeEnum1 = "event" | "person";

/** @default "last_seen_at" */
export type OrderByEnum1 =
  | "last_seen_at"
  | "property_name"
  | "created_at"
  | "updated_at";

/** @default "desc" */
export type PropertyDefinitionsControllerListParams1OrderEnum = "asc" | "desc";

export type PropertyDefinitionsControllerListParams1TypeEnum =
  | "event"
  | "person";

/** @default "last_seen_at" */
export type PropertyDefinitionsControllerListParams1OrderByEnum =
  | "last_seen_at"
  | "property_name"
  | "created_at"
  | "updated_at";

export interface PropertyDefinitionsControllerUpsertParams {
  projectId: string;
  propertyType: string;
  propertyName: string;
}

export interface PropertyDefinitionsControllerRemoveParams {
  projectId: string;
  propertyType: string;
  propertyName: string;
}

export interface WebAnalyticsControllerGetOverviewParams {
  filters?: StepFilter[];
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export interface WebAnalyticsControllerGetPathsParams {
  filters?: StepFilter[];
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export interface WebAnalyticsControllerGetSourcesParams {
  filters?: StepFilter[];
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export interface WebAnalyticsControllerGetDevicesParams {
  filters?: StepFilter[];
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export interface WebAnalyticsControllerGetGeographyParams {
  filters?: StepFilter[];
  /** @format uuid */
  project_id: string;
  date_from: string;
  date_to: string;
  force?: boolean;
}

export interface BillingControllerGetStatusParams {
  projectId: string;
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
      this.request<void, any>({
        path: `/api/auth/logout`,
        method: "POST",
        secure: true,
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
     * @tags Auth
     * @name AuthControllerVerifyByCode
     * @request POST:/api/auth/verify-email/code
     * @secure
     */
    authControllerVerifyByCode: (
      data: VerifyEmailByCode,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/auth/verify-email/code`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name AuthControllerVerifyByToken
     * @request POST:/api/auth/verify-email/token
     */
    authControllerVerifyByToken: (
      data: VerifyEmailByToken,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/auth/verify-email/token`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name AuthControllerResendVerification
     * @request POST:/api/auth/resend-verification
     * @secure
     */
    authControllerResendVerification: (params: RequestParams = {}) =>
      this.request<ResendVerificationResponse, any>({
        path: `/api/auth/resend-verification`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name AuthControllerUpdateProfile
     * @request PATCH:/api/auth/profile
     * @secure
     */
    authControllerUpdateProfile: (
      data: UpdateProfile,
      params: RequestParams = {},
    ) =>
      this.request<ProfileResponse, any>({
        path: `/api/auth/profile`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name AuthControllerChangePassword
     * @request POST:/api/auth/change-password
     * @secure
     */
    authControllerChangePassword: (
      data: ChangePassword,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/auth/change-password`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
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
      this.request<void, any>({
        path: `/api/projects/${id}`,
        method: "DELETE",
        secure: true,
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
      this.request<void, any>({
        path: `/api/projects/${projectId}/keys/${keyId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Analytics
     * @name FunnelControllerGetFunnel
     * @request GET:/api/analytics/funnel
     * @secure
     */
    funnelControllerGetFunnel: (
      query: FunnelControllerGetFunnelParams,
      params: RequestParams = {},
    ) =>
      this.request<FunnelResponse, any>({
        path: `/api/analytics/funnel`,
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
     * @name FunnelControllerGetFunnelTimeToConvert
     * @request GET:/api/analytics/funnel/time-to-convert
     * @secure
     */
    funnelControllerGetFunnelTimeToConvert: (
      query: FunnelControllerGetFunnelTimeToConvertParams,
      params: RequestParams = {},
    ) =>
      this.request<TimeToConvertResponse, any>({
        path: `/api/analytics/funnel/time-to-convert`,
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
     * @name EventsControllerGetEvents
     * @request GET:/api/analytics/events
     * @secure
     */
    eventsControllerGetEvents: (
      query: EventsControllerGetEventsParams,
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
     * @name EventsControllerGetEventDetail
     * @request GET:/api/analytics/events/{eventId}
     * @secure
     */
    eventsControllerGetEventDetail: (
      { eventId, ...query }: EventsControllerGetEventDetailParams,
      params: RequestParams = {},
    ) =>
      this.request<EventDetail, any>({
        path: `/api/analytics/events/${eventId}`,
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
     * @name EventsControllerGetEventNames
     * @request GET:/api/analytics/event-names
     * @secure
     */
    eventsControllerGetEventNames: (
      query: EventsControllerGetEventNamesParams,
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
     * @name EventsControllerGetEventPropertyNames
     * @request GET:/api/analytics/event-property-names
     * @secure
     */
    eventsControllerGetEventPropertyNames: (
      query: EventsControllerGetEventPropertyNamesParams,
      params: RequestParams = {},
    ) =>
      this.request<EventPropertyNamesResponse, any>({
        path: `/api/analytics/event-property-names`,
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
     * @name TrendControllerGetTrend
     * @request GET:/api/analytics/trend
     * @secure
     */
    trendControllerGetTrend: (
      query: TrendControllerGetTrendParams,
      params: RequestParams = {},
    ) =>
      this.request<TrendResponse, any>({
        path: `/api/analytics/trend`,
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
     * @name RetentionControllerGetRetention
     * @request GET:/api/analytics/retention
     * @secure
     */
    retentionControllerGetRetention: (
      query: RetentionControllerGetRetentionParams,
      params: RequestParams = {},
    ) =>
      this.request<RetentionResponse, any>({
        path: `/api/analytics/retention`,
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
     * @name LifecycleControllerGetLifecycle
     * @request GET:/api/analytics/lifecycle
     * @secure
     */
    lifecycleControllerGetLifecycle: (
      query: LifecycleControllerGetLifecycleParams,
      params: RequestParams = {},
    ) =>
      this.request<LifecycleResponse, any>({
        path: `/api/analytics/lifecycle`,
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
     * @name StickinessControllerGetStickiness
     * @request GET:/api/analytics/stickiness
     * @secure
     */
    stickinessControllerGetStickiness: (
      query: StickinessControllerGetStickinessParams,
      params: RequestParams = {},
    ) =>
      this.request<StickinessResponse, any>({
        path: `/api/analytics/stickiness`,
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
     * @name PathsControllerGetPaths
     * @request GET:/api/analytics/paths
     * @secure
     */
    pathsControllerGetPaths: (
      query: PathsControllerGetPathsParams,
      params: RequestParams = {},
    ) =>
      this.request<PathsResponse, any>({
        path: `/api/analytics/paths`,
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
     * @name PersonsControllerGetPersonPropertyNames
     * @request GET:/api/persons/property-names
     * @secure
     */
    personsControllerGetPersonPropertyNames: (
      query: PersonsControllerGetPersonPropertyNamesParams,
      params: RequestParams = {},
    ) =>
      this.request<PersonPropertyNamesResponse, any>({
        path: `/api/persons/property-names`,
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
     * @name CohortsControllerGetSizeHistory
     * @request GET:/api/projects/{projectId}/cohorts/{cohortId}/history
     * @secure
     */
    cohortsControllerGetSizeHistory: (
      { projectId, cohortId, ...query }: CohortsControllerGetSizeHistoryParams,
      params: RequestParams = {},
    ) =>
      this.request<CohortHistoryPoint[], any>({
        path: `/api/projects/${projectId}/cohorts/${cohortId}/history`,
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
     * @tags Cohorts
     * @name StaticCohortsControllerCreateStaticCohort
     * @request POST:/api/projects/{projectId}/cohorts/static
     * @secure
     */
    staticCohortsControllerCreateStaticCohort: (
      { projectId, ...query }: StaticCohortsControllerCreateStaticCohortParams,
      data: CreateStaticCohort,
      params: RequestParams = {},
    ) =>
      this.request<Cohort, any>({
        path: `/api/projects/${projectId}/cohorts/static`,
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
     * @name StaticCohortsControllerDuplicateAsStatic
     * @request POST:/api/projects/{projectId}/cohorts/{cohortId}/duplicate-static
     * @secure
     */
    staticCohortsControllerDuplicateAsStatic: (
      {
        projectId,
        cohortId,
        ...query
      }: StaticCohortsControllerDuplicateAsStaticParams,
      params: RequestParams = {},
    ) =>
      this.request<Cohort, any>({
        path: `/api/projects/${projectId}/cohorts/${cohortId}/duplicate-static`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Cohorts
     * @name StaticCohortsControllerUploadCsv
     * @request POST:/api/projects/{projectId}/cohorts/{cohortId}/upload-csv
     * @secure
     */
    staticCohortsControllerUploadCsv: (
      { projectId, cohortId, ...query }: StaticCohortsControllerUploadCsvParams,
      data: UploadCsv,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/projects/${projectId}/cohorts/${cohortId}/upload-csv`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Cohorts
     * @name StaticCohortsControllerAddMembers
     * @request POST:/api/projects/{projectId}/cohorts/{cohortId}/members
     * @secure
     */
    staticCohortsControllerAddMembers: (
      {
        projectId,
        cohortId,
        ...query
      }: StaticCohortsControllerAddMembersParams,
      data: StaticCohortMembers,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/projects/${projectId}/cohorts/${cohortId}/members`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Cohorts
     * @name StaticCohortsControllerRemoveMembers
     * @request DELETE:/api/projects/{projectId}/cohorts/{cohortId}/members
     * @secure
     */
    staticCohortsControllerRemoveMembers: (
      {
        projectId,
        cohortId,
        ...query
      }: StaticCohortsControllerRemoveMembersParams,
      data: StaticCohortMembers,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/projects/${projectId}/cohorts/${cohortId}/members`,
        method: "DELETE",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Insights
     * @name SavedInsightsControllerList
     * @request GET:/api/projects/{projectId}/insights
     * @secure
     */
    savedInsightsControllerList: (
      { projectId, ...query }: SavedInsightsControllerListParams,
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
     * @name SavedInsightsControllerCreate
     * @request POST:/api/projects/{projectId}/insights
     * @secure
     */
    savedInsightsControllerCreate: (
      { projectId, ...query }: SavedInsightsControllerCreateParams,
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
     * @name SavedInsightsControllerGetById
     * @request GET:/api/projects/{projectId}/insights/{insightId}
     * @secure
     */
    savedInsightsControllerGetById: (
      { projectId, insightId, ...query }: SavedInsightsControllerGetByIdParams,
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
     * @name SavedInsightsControllerUpdate
     * @request PUT:/api/projects/{projectId}/insights/{insightId}
     * @secure
     */
    savedInsightsControllerUpdate: (
      { projectId, insightId, ...query }: SavedInsightsControllerUpdateParams,
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
     * @name SavedInsightsControllerRemove
     * @request DELETE:/api/projects/{projectId}/insights/{insightId}
     * @secure
     */
    savedInsightsControllerRemove: (
      { projectId, insightId, ...query }: SavedInsightsControllerRemoveParams,
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
      this.request<void, any>({
        path: `/api/projects/${projectId}/members/${memberId}`,
        method: "DELETE",
        secure: true,
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
      this.request<void, any>({
        path: `/api/projects/${projectId}/invites/${inviteId}`,
        method: "DELETE",
        secure: true,
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
      this.request<void, any>({
        path: `/api/invites/${inviteId}/accept`,
        method: "POST",
        secure: true,
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
      this.request<void, any>({
        path: `/api/invites/${inviteId}/decline`,
        method: "POST",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags AI
     * @name AiControllerChat
     * @request POST:/api/ai/chat
     * @secure
     */
    aiControllerChat: (data: AiChat, params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/api/ai/chat`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags AI
     * @name AiControllerListConversations
     * @request GET:/api/ai/conversations
     * @secure
     */
    aiControllerListConversations: (
      query: AiControllerListConversationsParams,
      params: RequestParams = {},
    ) =>
      this.request<AiConversation[], any>({
        path: `/api/ai/conversations`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags AI
     * @name AiControllerGetConversation
     * @request GET:/api/ai/conversations/{id}
     * @secure
     */
    aiControllerGetConversation: (
      { id, ...query }: AiControllerGetConversationParams,
      params: RequestParams = {},
    ) =>
      this.request<AiConversationDetail, any>({
        path: `/api/ai/conversations/${id}`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags AI
     * @name AiControllerDeleteConversation
     * @request DELETE:/api/ai/conversations/{id}
     * @secure
     */
    aiControllerDeleteConversation: (
      { id, ...query }: AiControllerDeleteConversationParams,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/ai/conversations/${id}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Event Definitions
     * @name EventDefinitionsControllerList
     * @request GET:/api/projects/{projectId}/event-definitions
     * @secure
     */
    eventDefinitionsControllerList: (
      { projectId, ...query }: EventDefinitionsControllerListParams,
      params: RequestParams = {},
    ) =>
      this.request<EventDefinitionsListResponse, any>({
        path: `/api/projects/${projectId}/event-definitions`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Event Definitions
     * @name EventDefinitionsControllerUpsert
     * @request PATCH:/api/projects/{projectId}/event-definitions/{eventName}
     * @secure
     */
    eventDefinitionsControllerUpsert: (
      {
        projectId,
        eventName,
        ...query
      }: EventDefinitionsControllerUpsertParams,
      data: UpsertEventDefinition,
      params: RequestParams = {},
    ) =>
      this.request<UpsertEventDefinitionResponse, any>({
        path: `/api/projects/${projectId}/event-definitions/${eventName}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Event Definitions
     * @name EventDefinitionsControllerRemove
     * @request DELETE:/api/projects/{projectId}/event-definitions/{eventName}
     * @secure
     */
    eventDefinitionsControllerRemove: (
      {
        projectId,
        eventName,
        ...query
      }: EventDefinitionsControllerRemoveParams,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/projects/${projectId}/event-definitions/${eventName}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Property Definitions
     * @name PropertyDefinitionsControllerList
     * @request GET:/api/projects/{projectId}/property-definitions
     * @secure
     */
    propertyDefinitionsControllerList: (
      { projectId, ...query }: PropertyDefinitionsControllerListParams,
      params: RequestParams = {},
    ) =>
      this.request<PropertyDefinitionsListResponse, any>({
        path: `/api/projects/${projectId}/property-definitions`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Property Definitions
     * @name PropertyDefinitionsControllerUpsert
     * @request PATCH:/api/projects/{projectId}/property-definitions/{propertyType}/{propertyName}
     * @secure
     */
    propertyDefinitionsControllerUpsert: (
      {
        projectId,
        propertyType,
        propertyName,
        ...query
      }: PropertyDefinitionsControllerUpsertParams,
      data: UpsertPropertyDefinition,
      params: RequestParams = {},
    ) =>
      this.request<UpsertPropertyDefinitionResponse, any>({
        path: `/api/projects/${projectId}/property-definitions/${propertyType}/${propertyName}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Property Definitions
     * @name PropertyDefinitionsControllerRemove
     * @request DELETE:/api/projects/{projectId}/property-definitions/{propertyType}/{propertyName}
     * @secure
     */
    propertyDefinitionsControllerRemove: (
      {
        projectId,
        propertyType,
        propertyName,
        ...query
      }: PropertyDefinitionsControllerRemoveParams,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/api/projects/${projectId}/property-definitions/${propertyType}/${propertyName}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Web Analytics
     * @name WebAnalyticsControllerGetOverview
     * @request GET:/api/web-analytics/overview
     * @secure
     */
    webAnalyticsControllerGetOverview: (
      query: WebAnalyticsControllerGetOverviewParams,
      params: RequestParams = {},
    ) =>
      this.request<WebAnalyticsOverviewResponse, any>({
        path: `/api/web-analytics/overview`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Web Analytics
     * @name WebAnalyticsControllerGetPaths
     * @request GET:/api/web-analytics/paths
     * @secure
     */
    webAnalyticsControllerGetPaths: (
      query: WebAnalyticsControllerGetPathsParams,
      params: RequestParams = {},
    ) =>
      this.request<WebAnalyticsPathsResponse, any>({
        path: `/api/web-analytics/paths`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Web Analytics
     * @name WebAnalyticsControllerGetSources
     * @request GET:/api/web-analytics/sources
     * @secure
     */
    webAnalyticsControllerGetSources: (
      query: WebAnalyticsControllerGetSourcesParams,
      params: RequestParams = {},
    ) =>
      this.request<WebAnalyticsSourcesResponse, any>({
        path: `/api/web-analytics/sources`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Web Analytics
     * @name WebAnalyticsControllerGetDevices
     * @request GET:/api/web-analytics/devices
     * @secure
     */
    webAnalyticsControllerGetDevices: (
      query: WebAnalyticsControllerGetDevicesParams,
      params: RequestParams = {},
    ) =>
      this.request<WebAnalyticsDevicesResponse, any>({
        path: `/api/web-analytics/devices`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Web Analytics
     * @name WebAnalyticsControllerGetGeography
     * @request GET:/api/web-analytics/geography
     * @secure
     */
    webAnalyticsControllerGetGeography: (
      query: WebAnalyticsControllerGetGeographyParams,
      params: RequestParams = {},
    ) =>
      this.request<WebAnalyticsGeographyResponse, any>({
        path: `/api/web-analytics/geography`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Billing
     * @name BillingControllerGetStatus
     * @request GET:/api/projects/{projectId}/billing
     * @secure
     */
    billingControllerGetStatus: (
      { projectId, ...query }: BillingControllerGetStatusParams,
      params: RequestParams = {},
    ) =>
      this.request<BillingStatus, any>({
        path: `/api/projects/${projectId}/billing`,
        method: "GET",
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
