import { useState, useEffect } from 'react';

export function useTimeToConvertState(stepCount: number) {
  const [fromStep, setFromStep] = useState(0);
  const [toStep, setToStep] = useState(1);

  useEffect(() => {
    const maxIdx = stepCount - 1;
    if (maxIdx < 1) return;
    const clampedFrom = Math.min(fromStep, maxIdx - 1);
    const clampedTo = Math.max(Math.min(toStep, maxIdx), clampedFrom + 1);
    if (clampedFrom !== fromStep) setFromStep(clampedFrom);
    if (clampedTo !== toStep) setToStep(clampedTo);
  }, [stepCount, fromStep, toStep]);

  return { fromStep, setFromStep, toStep, setToStep };
}
