import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { EditorHeader } from '@/components/ui/editor-header';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

interface InsightEditorLayoutProps {
  /** EditorHeader props */
  backPath: string;
  backLabel: string;
  name: string;
  onNameChange: (name: string) => void;
  placeholder: string;
  onSave: () => void;
  isSaving: boolean;
  isValid: boolean;
  saveError?: string | null;

  /** Query panel rendered on the left side */
  queryPanel: ReactNode;

  /** State flags */
  isConfigValid: boolean;
  showSkeleton: boolean;
  isEmpty: boolean;
  isFetching: boolean;

  /** Empty state config (configure fields optional when isConfigValid is always true) */
  configureIcon?: LucideIcon;
  configureTitle?: string;
  configureDescription?: string;
  noResultsIcon: LucideIcon;
  noResultsTitle: string;
  noResultsDescription: string;

  /** Loading skeleton content */
  skeleton: ReactNode;

  /** Metrics bar content (rendered inside the metrics row) */
  metricsBar: ReactNode;

  /** Chart/results content */
  children: ReactNode;

  /** Optional class for the chart wrapper div */
  chartClassName?: string;
}

export function InsightEditorLayout({
  backPath,
  backLabel,
  name,
  onNameChange,
  placeholder,
  onSave,
  isSaving,
  isValid,
  saveError,
  queryPanel,
  isConfigValid,
  showSkeleton,
  isEmpty,
  isFetching,
  configureIcon,
  configureTitle,
  configureDescription,
  noResultsIcon,
  noResultsTitle,
  noResultsDescription,
  skeleton,
  metricsBar,
  children,
  chartClassName = 'flex-1 overflow-auto p-6',
}: InsightEditorLayoutProps): ReactNode {
  return (
    <div className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden">
      <EditorHeader
        backPath={backPath}
        backLabel={backLabel}
        name={name}
        onNameChange={onNameChange}
        placeholder={placeholder}
        onSave={onSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
        {queryPanel}

        <main className="flex-1 overflow-auto flex flex-col">
          {!isConfigValid && configureIcon && (
            <EmptyState
              icon={configureIcon}
              title={configureTitle ?? ''}
              description={configureDescription ?? ''}
              className="flex-1"
            />
          )}

          {isConfigValid && showSkeleton && (
            <div className="flex-1 flex flex-col gap-6 p-8">
              {skeleton}
            </div>
          )}

          {isConfigValid && !showSkeleton && isEmpty && (
            <EmptyState
              icon={noResultsIcon}
              title={noResultsTitle}
              description={noResultsDescription}
              className="flex-1"
            />
          )}

          {isConfigValid && !showSkeleton && !isEmpty && (
            <div className={cn('flex flex-col h-full transition-opacity', isFetching && 'opacity-60')}>
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                {metricsBar}
              </div>
              <div className={chartClassName}>
                {children}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
