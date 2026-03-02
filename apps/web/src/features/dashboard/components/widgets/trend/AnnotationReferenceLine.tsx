import { useMemo } from 'react';
import { ReferenceLine } from 'recharts';
import type { Annotation } from '@/api/generated/Api';
import { snapAnnotationDateToBucket } from './trend-utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './AnnotationReferenceLine.translations';

/** Grouped annotation bucket: one or more annotations that snap to the same x value. */
interface AnnotationGroup {
  bucket: string;
  color: string;
  annotations: Annotation[];
}

/** Group annotations by their snapped bucket value. */
function groupAnnotationsByBucket(
  annotations: Annotation[],
  granularity: string,
): AnnotationGroup[] {
  const groups = new Map<string, Annotation[]>();
  for (const ann of annotations) {
    const bucket = snapAnnotationDateToBucket(ann.date, granularity);
    const existing = groups.get(bucket);
    if (existing) {
      existing.push(ann);
    } else {
      groups.set(bucket, [ann]);
    }
  }
  return Array.from(groups.entries()).map(([bucket, anns]) => ({
    bucket,
    color: anns[0].color ?? 'hsl(var(--color-muted-foreground))',
    annotations: anns,
  }));
}

/** Custom SVG label for non-compact mode with stacking support. */
function AnnotationLabel({
  viewBox,
  group,
  moreLabel,
}: {
  viewBox?: { x?: number; y?: number };
  group: AnnotationGroup;
  moreLabel: string;
}) {
  const x = (viewBox?.x ?? 0) + 4;
  const y = (viewBox?.y ?? 0) + 14;
  const color = group.color;

  if (group.annotations.length === 1) {
    return (
      <text x={x} y={y} fontSize={11} fill={color} textAnchor="start">
        {group.annotations[0].label}
      </text>
    );
  }

  const firstLabel = group.annotations[0].label;
  return (
    <text x={x} y={y} fontSize={11} fill={color} textAnchor="start">
      <tspan>{firstLabel}</tspan>
      <tspan dx={4} fontSize={10} opacity={0.8}>
        {moreLabel}
      </tspan>
    </text>
  );
}

/** Custom SVG label for compact mode: small indicator with native tooltip on hover. */
function CompactAnnotationLabel({
  viewBox,
  group,
  tooltipText,
}: {
  viewBox?: { x?: number; y?: number };
  group: AnnotationGroup;
  tooltipText: string;
}) {
  const x = viewBox?.x ?? 0;
  const y = (viewBox?.y ?? 0) + 8;
  const color = group.color;
  const count = group.annotations.length;

  return (
    <g>
      <title>{tooltipText}</title>
      {count === 1 ? (
        <circle cx={x} cy={y} r={3.5} fill={color} opacity={0.85} />
      ) : (
        <>
          <circle cx={x} cy={y} r={5} fill={color} opacity={0.85} />
          <text
            x={x}
            y={y + 3.5}
            textAnchor="middle"
            fontSize={8}
            fontWeight="bold"
            fill="hsl(var(--color-background))"
          >
            {count}
          </text>
        </>
      )}
    </g>
  );
}

/** Build tooltip text for a group of annotations. */
function buildTooltipText(annotations: Annotation[]): string {
  return annotations.map((a) => `${a.label} (${a.date})`).join('\n');
}

/**
 * Renders grouped annotation reference lines for Recharts charts.
 * - Groups annotations that snap to the same bucket to prevent label overlap.
 * - In non-compact mode: shows combined label (first label + "+N more").
 * - In compact mode: shows small indicator dot with native tooltip on hover.
 */
export function useAnnotationReferenceLines(
  annotations: Annotation[] | undefined,
  granularity: string,
  compact?: boolean,
) {
  const { t } = useLocalTranslation(translations);

  return useMemo(() => {
    if (!annotations?.length) return null;

    const groups = groupAnnotationsByBucket(annotations, granularity);

    return groups.map((group) => {
      const moreCount = group.annotations.length - 1;
      const moreLabel = moreCount > 0 ? t('moreAnnotations', { count: String(moreCount) }) : '';
      const tooltipText = buildTooltipText(group.annotations);

      return (
        <ReferenceLine
          key={`ann-group-${group.bucket}`}
          x={group.bucket}
          stroke={group.color}
          strokeDasharray="4 2"
          label={
            compact
              ? (props: { viewBox?: { x?: number; y?: number } }) => (
                  <CompactAnnotationLabel
                    viewBox={props.viewBox}
                    group={group}
                    tooltipText={tooltipText}
                  />
                )
              : (props: { viewBox?: { x?: number; y?: number } }) => (
                  <AnnotationLabel
                    viewBox={props.viewBox}
                    group={group}
                    moreLabel={moreLabel}
                  />
                )
          }
        />
      );
    });
  }, [annotations, granularity, compact, t]);
}
