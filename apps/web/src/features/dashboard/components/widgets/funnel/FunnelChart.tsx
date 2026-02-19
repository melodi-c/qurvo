import { useState } from 'react';
import type { FunnelStepResult } from '@/api/generated/Api';

interface FunnelChartProps {
  steps: FunnelStepResult[];
}

function formatTime(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

const MAX_BAR_H = 200;

export function FunnelChart({ steps }: FunnelChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (steps.length === 0) return null;

  const first = steps[0].count;

  return (
    /* overflow-x позволяет скролл если steps слишком много */
    <div className="w-full">
      <div className="flex items-end w-full">
        {steps.map((step, i) => {
          const ratio = first > 0 ? step.count / first : 0;
          const barH = Math.max(Math.round(ratio * MAX_BAR_H), 4);
          const dropH = MAX_BAR_H - barH;
          const isFirst = i === 0;
          const isHov = hovered === i;

          const stepConv =
            i > 0 && steps[i - 1].count > 0
              ? Math.round((step.count / steps[i - 1].count) * 1000) / 10
              : null;

          const timeLabel = i > 0 ? formatTime(step.avg_time_to_convert_seconds) : null;

          return (
            <div key={i} className="contents">
              {/* ── Коннектор ── */}
              {i > 0 && (
                <div
                  className="shrink-0 flex flex-col items-center justify-end gap-1"
                  style={{ width: 40, paddingBottom: 44 }}
                >
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground whitespace-nowrap">
                    {stepConv}%
                  </span>
                  {timeLabel && (
                    <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">{timeLabel}</span>
                  )}
                  <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                    <path
                      d="M0 5H13M10 2l4 3-4 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-border"
                    />
                  </svg>
                </div>
              )}

              {/* ── Столбец — flex-1 чтобы занимать доступное пространство ── */}
              <div
                className="flex-1 min-w-[60px] flex flex-col items-center"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Числа над столбцом */}
                <div className="flex flex-col items-center mb-2 gap-0.5 min-h-[36px] justify-end">
                  <span
                    className={`text-[13px] font-bold tabular-nums leading-none transition-colors ${
                      isHov ? 'text-foreground' : 'text-foreground/80'
                    }`}
                  >
                    {step.count.toLocaleString()}
                  </span>
                  <span
                    className={`text-[11px] tabular-nums leading-none transition-colors ${
                      isHov ? 'text-muted-foreground' : 'text-muted-foreground/55'
                    }`}
                  >
                    {step.conversion_rate}%
                  </span>
                </div>

                {/* Столбец */}
                <div
                  className="relative w-full"
                  style={{
                    height: MAX_BAR_H,
                    borderRadius: '5px 5px 0 0',
                    overflow: 'hidden',
                  }}
                >
                  {/* Drop-off зона сверху */}
                  {dropH > 0 && (
                    <div
                      className="absolute inset-x-0 top-0"
                      style={{
                        height: dropH,
                        background: isHov
                          ? 'rgba(113,113,122,0.20)'
                          : 'rgba(113,113,122,0.11)',
                        borderBottom: '1px dashed rgba(113,113,122,0.22)',
                        transition: 'background 0.15s',
                      }}
                    >
                      {dropH >= 28 && i > 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                            −{step.drop_off.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Заполненная часть */}
                  <div
                    className="absolute inset-x-0 bottom-0"
                    style={{
                      height: barH,
                      background: isFirst
                        ? 'hsl(217 91% 60%)'
                        : 'hsl(217 91% 55%)',
                      opacity: isHov ? 1 : 0.82,
                      transition: 'opacity 0.15s',
                    }}
                  />
                </div>

                {/* Подпись */}
                <div className="mt-3 text-center w-full px-1" style={{ minHeight: 32 }}>
                  <span
                    className={`text-[11px] font-medium leading-snug block transition-colors break-words ${
                      isHov ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {step.label || step.event_name}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
