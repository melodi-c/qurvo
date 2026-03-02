import { useState, useCallback, useRef, useMemo } from 'react';
import type { Annotation, TrendGranularity } from '@/api/generated/Api';
import { snapAnnotationDateToBucket } from './trend-utils';

interface AnnotationPositions {
  /** Map from bucket string to pixel x-coordinate */
  tickPositions: Map<string, number>;
  /** Map from bucket string to annotations in that bucket */
  annotationsByBucket: Map<string, Annotation[]>;
  /** Callback for XAxis custom tick to report its pixel position */
  onTickRender: (bucket: string, x: number) => void;
}

/**
 * Hook that tracks XAxis tick pixel positions and groups annotations by bucket.
 *
 * - `onTickRender` is called by a custom XAxis tick component each time it renders.
 *   Calls are batched via requestAnimationFrame so a single setState covers all ticks.
 * - `annotationsByBucket` groups the provided annotations by their snapped bucket value.
 */
export function useAnnotationPositions(
  annotations: Annotation[] | undefined,
  granularity: TrendGranularity | undefined,
): AnnotationPositions {
  const [tickPositions, setTickPositions] = useState<Map<string, number>>(() => new Map());

  // Accumulator for batching tick position updates within one animation frame
  const pendingRef = useRef<Map<string, number>>(new Map());
  const rafIdRef = useRef<number | null>(null);

  const onTickRender = useCallback((bucket: string, x: number) => {
    pendingRef.current.set(bucket, x);

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        const batch = new Map(pendingRef.current);
        pendingRef.current.clear();
        rafIdRef.current = null;

        setTickPositions((prev) => {
          // Only update if something actually changed
          let changed = false;
          for (const [k, v] of batch) {
            if (prev.get(k) !== v) { changed = true; break; }
          }
          if (!changed && prev.size === batch.size) {return prev;}
          // Merge: keep existing positions, overwrite with new batch
          const next = new Map(prev);
          for (const [k, v] of batch) {next.set(k, v);}
          return next;
        });
      });
    }
  }, []);

  const annotationsByBucket = useMemo(() => {
    const map = new Map<string, Annotation[]>();
    if (!annotations?.length || !granularity) {return map;}

    for (const ann of annotations) {
      const bucket = snapAnnotationDateToBucket(ann.date, granularity);
      const list = map.get(bucket);
      if (list) {list.push(ann);}
      else {map.set(bucket, [ann]);}
    }
    return map;
  }, [annotations, granularity]);

  return { tickPositions, annotationsByBucket, onTickRender };
}
