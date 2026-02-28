export const DEFAULT_WIDGET_SIZE: Record<string, { w: number; h: number; minH: number }> = {
  trend:      { w: 12, h: 5, minH: 5 },
  funnel:     { w: 8, h: 4, minH: 5 },
  retention:  { w: 12, h: 7, minH: 7 },
  lifecycle:  { w: 12, h: 5, minH: 5 },
  stickiness: { w: 12, h: 5, minH: 5 },
  paths:      { w: 24, h: 7, minH: 8 },
  text:       { w: 6, h: 2, minH: 2 },
};

export const DEFAULT_FALLBACK_SIZE = { w: 12, h: 5 };
