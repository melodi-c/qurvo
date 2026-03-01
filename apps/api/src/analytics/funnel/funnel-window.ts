import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

// ── Conversion window ────────────────────────────────────────────────────────

const UNIT_TO_SECONDS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000, // 30 days
};

export function resolveWindowSeconds(params: {
  conversion_window_days: number;
  conversion_window_value?: number;
  conversion_window_unit?: string;
}): number {
  const hasValue = params.conversion_window_value !== null && params.conversion_window_value !== undefined;
  const hasUnit = !!params.conversion_window_unit;

  if (hasValue && !hasUnit) {
    throw new AppBadRequestException(
      'conversion_window_value requires conversion_window_unit to be specified',
    );
  }
  if (hasUnit && !hasValue) {
    throw new AppBadRequestException(
      'conversion_window_unit requires conversion_window_value to be specified',
    );
  }

  const MAX_WINDOW_SECONDS = 90 * 86400; // 90 days, same limit as conversion_window_days

  if (hasValue && hasUnit) {
    const unit = params.conversion_window_unit ?? '';
    const multiplier = UNIT_TO_SECONDS[unit] ?? 86400;
    const resolved = (params.conversion_window_value ?? 0) * multiplier;
    if (resolved > MAX_WINDOW_SECONDS) {
      throw new AppBadRequestException(
        `conversion_window_value * conversion_window_unit exceeds the maximum allowed window of 90 days (${MAX_WINDOW_SECONDS} seconds). Got ${resolved} seconds.`,
      );
    }
    return resolved;
  }
  return params.conversion_window_days * 86400;
}
