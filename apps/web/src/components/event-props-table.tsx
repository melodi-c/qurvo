import type React from 'react';

export type PropValue = string | number | undefined | null;

export interface PropEntry {
  key: string;
  value: PropValue;
  render?: (value: string) => React.ReactNode;
}

function isNonEmpty(v: PropValue): boolean {
  return v !== '' && v !== 0 && v != null;
}

export function PropsTable({ rows }: { rows: PropEntry[] }) {
  const visible = rows.filter((r) => isNonEmpty(r.value));
  if (visible.length === 0) return null;
  return (
    <table className="w-full text-xs">
      <tbody>
        {visible.map(({ key, value, render }) => (
          <tr key={key} className="border-b border-border/50 last:border-0">
            <td className="py-1.5 pr-4 w-40 shrink-0 text-muted-foreground align-top">{key}</td>
            <td className="py-1.5 text-foreground">
              {render ? render(String(value)) : <span className="font-mono break-all">{String(value)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PropsTableGrouped({ groups }: { groups: { label: string; rows: PropEntry[] }[] }) {
  const nonEmpty = groups.filter((g) => g.rows.some((r) => isNonEmpty(r.value)));
  if (nonEmpty.length === 0) return null;
  return (
    <table className="w-full text-xs">
      <tbody>
        {nonEmpty.map((group) => {
          const visible = group.rows.filter((r) => isNonEmpty(r.value));
          if (visible.length === 0) return null;
          return (
            <tr key={`section-${group.label}`}>
              <td colSpan={2} className="p-0">
                <table className="w-full">
                  <tbody>
                    <tr>
                      <td colSpan={2} className="pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                        {group.label}
                      </td>
                    </tr>
                    {visible.map(({ key, value, render }) => (
                      <tr key={key} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-4 w-40 shrink-0 text-muted-foreground align-top">{key}</td>
                        <td className="py-1.5 text-foreground">
                          {render ? render(String(value)) : <span className="font-mono break-all">{String(value)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
