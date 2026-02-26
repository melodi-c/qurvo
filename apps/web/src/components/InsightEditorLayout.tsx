import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SlidersHorizontal, X, Download } from 'lucide-react';
import { EditorHeader } from '@/components/ui/editor-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './InsightEditorLayout.translations';

interface InsightEditorLayoutProps {
  /** EditorHeader props */
  backPath: string;
  backLabel: string;
  name: string;
  onNameChange: (name: string) => void;
  placeholder: string;
  description?: string;
  onDescriptionChange?: (description: string) => void;
  descriptionPlaceholder?: string;
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

  /** Optional CSV export callback. When provided, shows an Export CSV button. */
  onExportCsv?: () => void;
}

export function InsightEditorLayout({
  backPath,
  backLabel,
  name,
  onNameChange,
  placeholder,
  description,
  onDescriptionChange,
  descriptionPlaceholder,
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
  onExportCsv,
}: InsightEditorLayoutProps): ReactNode {
  const { t } = useLocalTranslation(translations);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden">
      <EditorHeader
        backPath={backPath}
        backLabel={backLabel}
        name={name}
        onNameChange={onNameChange}
        placeholder={placeholder}
        description={description}
        onDescriptionChange={onDescriptionChange}
        descriptionPlaceholder={descriptionPlaceholder}
        onSave={onSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      <div className="lg:hidden border-b border-border px-4 py-2 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1.5"
          onClick={() => setPanelOpen((prev) => !prev)}
        >
          {panelOpen ? (
            <>
              <X className="h-4 w-4" />
              {t('hideSettings')}
            </>
          ) : (
            <>
              <SlidersHorizontal className="h-4 w-4" />
              {t('settings')}
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
        <div className={cn(panelOpen ? 'block' : 'hidden', 'lg:contents')}>
          {queryPanel}
        </div>

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
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <div className="flex items-center gap-0 flex-1 min-w-0 flex-wrap">
                  {metricsBar}
                </div>
                {onExportCsv && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="sm:ml-4 shrink-0 gap-1.5 self-start sm:self-auto"
                    onClick={onExportCsv}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('exportCsv')}
                  </Button>
                )}
              </div>
              <div className={chartClassName}>
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
