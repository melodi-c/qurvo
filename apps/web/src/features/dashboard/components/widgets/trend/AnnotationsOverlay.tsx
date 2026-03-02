import { useState, useCallback } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Annotation, TrendGranularity } from '@/api/generated/Api';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { formatDateWithGranularity } from '@/lib/formatting';
import translations from './AnnotationsOverlay.translations';

interface AnnotationsOverlayProps {
  tickPositions: Map<string, number>;
  annotationsByBucket: Map<string, Annotation[]>;
  granularity: TrendGranularity;
  timezone?: string;
  onEdit: (annotation: Annotation) => void;
  onDelete: (id: string) => Promise<void>;
  onCreate: (date: string) => void;
}

export function AnnotationsOverlay({
  tickPositions,
  annotationsByBucket,
  granularity,
  timezone,
  onEdit,
  onDelete,
  onCreate,
}: AnnotationsOverlayProps) {
  const { t } = useLocalTranslation(translations);
  const [deleteTarget, setDeleteTarget] = useState<Annotation | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) {return;}
    await onDelete(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, onDelete]);

  // Only render buckets that have both annotations and a known pixel position
  const buckets = Array.from(annotationsByBucket.entries()).filter(
    ([bucket]) => tickPositions.has(bucket),
  );

  if (buckets.length === 0) {return null;}

  return (
    <>
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
        {buckets.map(([bucket, anns]) => {
          const x = tickPositions.get(bucket)!;
          const dateLabel = formatDateWithGranularity(bucket, granularity, timezone);

          return (
            <div
              key={bucket}
              className="absolute pointer-events-auto"
              style={{
                left: `${x}px`,
                bottom: 0,
                transform: 'translateX(-50%)',
              }}
            >
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-none hover:scale-110 transition-transform shadow-sm"
                    aria-label={t('annotationsForDate', { date: dateLabel })}
                  >
                    {anns.length}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="center"
                  sideOffset={8}
                  className="w-72 p-0"
                >
                  {/* Header */}
                  <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">
                    {t('annotationsForDate', { date: dateLabel })}
                  </div>

                  {/* Annotation list */}
                  <div className="max-h-48 overflow-y-auto">
                    {anns.map((ann) => (
                      <div
                        key={ann.id}
                        className="group flex items-start gap-2 px-3 py-2 hover:bg-accent/50 transition-colors"
                      >
                        {/* Color dot */}
                        <span
                          className="mt-1 size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: ann.color ?? 'hsl(var(--color-muted-foreground))' }}
                        />
                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{ann.label}</p>
                          {ann.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {ann.description}
                            </p>
                          )}
                        </div>
                        {/* Actions — visible on group hover */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                            aria-label={t('edit')}
                            onClick={() => onEdit(ann)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                            aria-label={t('delete')}
                            onClick={() => setDeleteTarget(ann)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Footer — add annotation */}
                  <div className="border-t px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => {
                        // Extract date from bucket (YYYY-MM-DD portion)
                        const dateStr = bucket.slice(0, 10);
                        onCreate(dateStr);
                      }}
                    >
                      {t('addAnnotation')}
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) {setDeleteTarget(null);} }}
        title={t('deleteTitle')}
        description={deleteTarget ? t('deleteDescription', { label: deleteTarget.label }) : ''}
        onConfirm={handleDelete}
      />
    </>
  );
}
