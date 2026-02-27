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

  const queryFn = vi.fn().mockResolvedValue([]);

  const token = Symbol('TEST');
  const provider = createAnalyticsQueryProvider(token, 'test', queryFn);

  // Extract the factory function and call it with mocked deps
  const service = (provider as any).useFactory(ch, redis, cohortsService);
  return { service, cohortsService, queryFn, redis };
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
