import type { ElementType } from 'react';
import type { FunnelWidgetConfig } from '@/api/generated/Api';
// FunnelWidgetConfig now has `type` from discriminator, ensure defaults include it

export function defaultFunnelConfig(): FunnelWidgetConfig {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return {
    type: 'funnel',
    steps: [
      { event_name: '', label: 'Step 1' },
      { event_name: '', label: 'Step 2' },
    ],
    conversion_window_days: 14,
    date_from: from,
    date_to: to,
  };
}

export const DATE_PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m', days: 180 },
  { label: '1y', days: 365 },
] as const;

export function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SectionHeader({ icon: Icon, label }: { icon: ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

export function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
