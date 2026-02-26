export const DEFAULT_WIDGET_SIZE: Record<string, { w: number; h: number; minH: number }> = {
  trend:      { w: 6, h: 5, minH: 5 },
  funnel:     { w: 4, h: 4, minH: 5 },
  retention:  { w: 6, h: 7, minH: 7 },
  lifecycle:  { w: 6, h: 5, minH: 5 },
  stickiness: { w: 6, h: 5, minH: 5 },
  paths:      { w: 12, h: 7, minH: 8 },
  text:       { w: 3, h: 2, minH: 2 },
};

export const DEFAULT_FALLBACK_SIZE = { w: 6, h: 5 };
