import { useState, useCallback, useRef, useEffect } from 'react';

export function useCopyToClipboard(timeout = 2000, onError?: () => void) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {clearTimeout(timerRef.current);}
    };
  }, []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        if (timerRef.current) {clearTimeout(timerRef.current);}
        setCopied(true);
        timerRef.current = setTimeout(() => setCopied(false), timeout);
      } catch {
        onError?.();
      }
    },
    [timeout, onError],
  );

  return { copied, copy };
}
