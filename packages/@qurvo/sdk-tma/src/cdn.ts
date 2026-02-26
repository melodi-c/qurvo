/**
 * IIFE bundle entry point for CDN usage.
 * Exposes `window.QurvoTma` with `init`, `track`, `identify`, `set`, `setOnce`, `reset`.
 */
import { qurvo } from './index';

(globalThis as unknown as Record<string, unknown>)['QurvoTma'] = {
  init: qurvo.init.bind(qurvo),
  track: qurvo.track.bind(qurvo),
  identify: qurvo.identify.bind(qurvo),
  set: qurvo.set.bind(qurvo),
  setOnce: qurvo.setOnce.bind(qurvo),
  reset: qurvo.reset.bind(qurvo),
};
