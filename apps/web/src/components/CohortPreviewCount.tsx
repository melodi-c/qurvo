import type { UseQueryResult } from '@tanstack/react-query';
import { UsersRound, Loader2, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import type { CohortMemberCount } from '@/api/generated/Api';
import translations from './CohortPreviewCount.translations';

interface CohortPreviewCountProps {
  previewQuery: UseQueryResult<CohortMemberCount>;
  canPreview: boolean;
  hasValidConditions: boolean;
  /** Optional fallback count shown when preview data is unavailable (e.g. existing cohort memberCount).
   *  - `undefined` (not provided): no fallback — shows generic EmptyState placeholder
   *  - `null`: data loading — shows em dash '—' with "current members" label
   *  - `number`: loaded — shows the number with "current members" label
   */
  fallbackCount?: number | null;
}

/**
 * Displays cohort preview count with 5 possible states:
 * 1. Not configured (canPreview=false) — viewer-only message
 * 2. No valid conditions — prompt to add conditions
 * 3. Fetching — spinner
 * 4. Error — error message
 * 5. Data — count display
 *
 * When `fallbackCount` is provided (including null) and preview is not available,
 * shows the fallback count (or em dash while loading) with "current members" label.
 */
export function CohortPreviewCount({ previewQuery, canPreview, hasValidConditions, fallbackCount }: CohortPreviewCountProps) {
  const { t } = useLocalTranslation(translations);

  // fallbackCount was explicitly passed (even as null) — distinct from "not provided" (undefined)
  const hasFallback = fallbackCount !== undefined;

  if (!canPreview) {
    if (hasFallback) {
      return (
        <div className="text-center">
          <p className="text-4xl font-bold tabular-nums text-primary">
            {fallbackCount !== null ? fallbackCount.toLocaleString() : '\u2014'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{t('currentMembers')}</p>
        </div>
      );
    }

    return (
      <EmptyState
        icon={UsersRound}
        description={t('viewerNoPreview')}
      />
    );
  }

  if (!hasValidConditions) {
    if (hasFallback) {
      return (
        <div className="text-center">
          <p className="text-4xl font-bold tabular-nums text-primary">
            {fallbackCount !== null ? fallbackCount.toLocaleString() : '\u2014'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{t('currentMembers')}</p>
        </div>
      );
    }

    return (
      <div className="text-center space-y-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto">
          <UsersRound className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{t('addConditionsTitle')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('addConditionsDescription')}</p>
        </div>
      </div>
    );
  }

  if (previewQuery.isFetching) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t('calculating')}</span>
      </div>
    );
  }

  if (previewQuery.isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        description={t('previewError')}
      />
    );
  }

  if (previewQuery.data) {
    return (
      <div className="text-center">
        <p className="text-4xl font-bold tabular-nums text-primary">
          {previewQuery.data.count.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground mt-1">{t('personsMatch')}</p>
      </div>
    );
  }

  if (hasFallback) {
    return (
      <div className="text-center">
        <p className="text-4xl font-bold tabular-nums text-primary">
          {fallbackCount !== null ? fallbackCount.toLocaleString() : '\u2014'}
        </p>
        <p className="text-sm text-muted-foreground mt-1">{t('currentMembers')}</p>
      </div>
    );
  }

  return (
    <EmptyState
      icon={UsersRound}
      description={t('previewPlaceholder')}
    />
  );
}
