import { describe, it, expect, vi } from 'vitest';
import { createAnalyticsQueryProvider } from '../../analytics/analytics-query.factory';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

function buildService() {
  const ch = {} as any;
  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  } as any;
  const cohortsService = {
    resolveCohortFilters: vi.fn().mockResolvedValue([]),
    resolveCohortBreakdowns: vi.fn().mockResolvedValue([]),
  } as any;
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ timezone: 'UTC' }]),
        }),
      }),
    }),
  } as any;

  const queryFn = vi.fn().mockResolvedValue([]);

  const token = Symbol('TEST');
  const provider = createAnalyticsQueryProvider(token, 'test', queryFn);

  // Extract the factory function and call it with mocked deps
  const service = (provider as any).useFactory(ch, redis, cohortsService, db);
  return { service, cohortsService, queryFn, redis, db };
}

const baseParams = {
  project_id: 'proj-1',
  date_from: '2025-01-01',
  date_to: '2025-01-31',
};

describe('createAnalyticsQueryProvider — breakdown_type cohort validation', () => {
  it('throws AppBadRequestException when breakdown_type is cohort and breakdown_cohort_ids is empty array', async () => {
    const { service } = buildService();

    await expect(
      service.query({ ...baseParams, breakdown_type: 'cohort', breakdown_cohort_ids: [] }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it('throws with correct message when breakdown_cohort_ids is empty array', async () => {
    const { service } = buildService();

    await expect(
      service.query({ ...baseParams, breakdown_type: 'cohort', breakdown_cohort_ids: [] }),
    ).rejects.toThrow("breakdown_cohort_ids must have at least one cohort when breakdown_type is 'cohort'");
  });

  it('throws AppBadRequestException when breakdown_type is cohort and breakdown_cohort_ids is omitted', async () => {
    const { service } = buildService();

    await expect(
      service.query({ ...baseParams, breakdown_type: 'cohort' }),
    ).rejects.toThrow(AppBadRequestException);
  });

  it('throws with correct message when breakdown_cohort_ids is omitted', async () => {
    const { service } = buildService();

    await expect(
      service.query({ ...baseParams, breakdown_type: 'cohort' }),
    ).rejects.toThrow("breakdown_cohort_ids must have at least one cohort when breakdown_type is 'cohort'");
  });

  it('does NOT throw and resolves cohort breakdowns when breakdown_type is cohort with non-empty breakdown_cohort_ids', async () => {
    const { service, cohortsService } = buildService();

    await expect(
      service.query({ ...baseParams, breakdown_type: 'cohort', breakdown_cohort_ids: ['cohort-uuid-1'] }),
    ).resolves.not.toThrow();

    expect(cohortsService.resolveCohortBreakdowns).toHaveBeenCalledOnce();
    expect(cohortsService.resolveCohortBreakdowns).toHaveBeenCalledWith('proj-1', ['cohort-uuid-1']);
  });

  it('does NOT throw when breakdown_type is property (not cohort)', async () => {
    const { service } = buildService();

    await expect(
      service.query({ ...baseParams, breakdown_type: 'property' }),
    ).resolves.not.toThrow();
  });

  it('does NOT throw when no breakdown_type is provided', async () => {
    const { service } = buildService();

    await expect(service.query({ ...baseParams })).resolves.not.toThrow();
  });

  it('still throws the existing error when breakdown_cohort_ids is provided but breakdown_type is not cohort', async () => {
    const { service } = buildService();

    await expect(
      service.query({ ...baseParams, breakdown_type: 'property', breakdown_cohort_ids: ['cohort-uuid-1'] }),
    ).rejects.toThrow(AppBadRequestException);
  });
});

describe('createAnalyticsQueryProvider — relative date resolution', () => {
  it('resolves relative date_from to absolute date before calling queryFn', async () => {
    const { service, queryFn } = buildService();

    await service.query({ ...baseParams, date_from: '-7d', date_to: '2025-01-31' });

    const calledParams = queryFn.mock.calls[0][1];
    // date_from should be resolved to YYYY-MM-DD, not the original '-7d'
    expect(calledParams.date_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calledParams.date_from).not.toBe('-7d');
  });

  it('resolves relative date_to to absolute date before calling queryFn', async () => {
    const { service, queryFn } = buildService();

    await service.query({ ...baseParams, date_from: '2025-01-01', date_to: '-1d' });

    const calledParams = queryFn.mock.calls[0][1];
    expect(calledParams.date_to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calledParams.date_to).not.toBe('-1d');
  });

  it('resolves both relative date_from and date_to', async () => {
    const { service, queryFn } = buildService();

    await service.query({ ...baseParams, date_from: '-30d', date_to: '-1d' });

    const calledParams = queryFn.mock.calls[0][1];
    expect(calledParams.date_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calledParams.date_to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calledParams.date_from).not.toBe('-30d');
    expect(calledParams.date_to).not.toBe('-1d');
  });

  it('resolves mStart and yStart tokens', async () => {
    const { service, queryFn } = buildService();

    await service.query({ ...baseParams, date_from: 'yStart', date_to: 'mStart' });

    const calledParams = queryFn.mock.calls[0][1];
    expect(calledParams.date_from).toMatch(/^\d{4}-01-01$/);
    expect(calledParams.date_to).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('leaves absolute dates unchanged', async () => {
    const { service, queryFn } = buildService();

    await service.query({ ...baseParams });

    const calledParams = queryFn.mock.calls[0][1];
    expect(calledParams.date_from).toBe('2025-01-01');
    expect(calledParams.date_to).toBe('2025-01-31');
  });

  it('uses project timezone for resolution when available', async () => {
    const ch = {} as any;
    const redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any;
    const cohortsService = { resolveCohortFilters: vi.fn(), resolveCohortBreakdowns: vi.fn() } as any;
    const queryFn = vi.fn().mockResolvedValue([]);

    // Mock DB returning a non-UTC timezone
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ timezone: 'Pacific/Auckland' }]),
          }),
        }),
      }),
    } as any;

    const token = Symbol('TEST');
    const provider = createAnalyticsQueryProvider(token, 'test', queryFn);
    const service = (provider as any).useFactory(ch, redis, cohortsService, db);

    await service.query({ ...baseParams, date_from: '-7d' });

    const calledParams = queryFn.mock.calls[0][1];
    // Should be a valid date, resolved using Auckland timezone
    expect(calledParams.date_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calledParams.timezone).toBe('Pacific/Auckland');
  });
});
