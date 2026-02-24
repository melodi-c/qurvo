/** Y-axis percentage labels (100 → 0). */
export function YAxis({ h }: { h: number }) {
  const labels = h > 150 ? ['100%', '80%', '60%', '40%', '20%', ''] : ['100%', '50%', ''];
  return (
    <div
      className="flex flex-col justify-between pr-3 shrink-0 select-none"
      style={{ height: h }}
    >
      {labels.map((l, i) => (
        <span key={i} className="text-[10px] font-medium text-muted-foreground/40 leading-none">
          {l}
        </span>
      ))}
    </div>
  );
}

/** Dashed horizontal grid lines. */
export function GridLines({ h }: { h: number }) {
  const ticks = h > 150 ? [20, 40, 60, 80] : [50];
  return (
    <>
      {ticks.map((pct) => (
        <div
          key={pct}
          className="absolute inset-x-0 border-t border-dashed border-border/20 pointer-events-none"
          style={{ bottom: `${pct}%` }}
        />
      ))}
    </>
  );
}

/**
 * A single PostHog-style bar: striped semi-transparent backdrop (full height,
 * represents drop-off space) + solid fill anchored to the bottom (conversion).
 */
export function Bar({
  color,
  conversionRate,
  width,
  height,
  hovered,
}: {
  color: string;
  conversionRate: number;
  width: number;
  height: number;
  hovered: boolean;
}) {
  return (
    <div className="relative shrink-0 rounded-sm" style={{ width, height }}>
      {/* Backdrop — striped, full height, drop-off space */}
      <div
        className="absolute inset-0 rounded-sm transition-opacity duration-200"
        style={{
          background: `repeating-linear-gradient(
            -22.5deg,
            transparent, transparent 4px,
            rgba(255,255,255,0.28) 4px, rgba(255,255,255,0.28) 8px
          ), ${color}`,
          opacity: hovered ? 0.22 : 0.12,
        }}
      />
      {/* Fill — solid color, height = conversion rate */}
      <div
        className="absolute bottom-0 inset-x-0 rounded-sm transition-all duration-200"
        style={{
          height: `${Math.max(conversionRate, 0)}%`,
          background: color,
          filter: hovered ? 'brightness(0.85)' : 'none',
        }}
      />
    </div>
  );
}
