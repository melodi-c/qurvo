import type { ElementType, MouseEvent, ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

interface ClickableListRowProps {
  icon: ElementType;
  title: string;
  subtitle: ReactNode;
  onClick: () => void;
  onRename?: (e: MouseEvent) => void;
  onDelete?: (e: MouseEvent) => void;
}

export function ClickableListRow({ icon: Icon, title, subtitle, onClick, onRename, onDelete }: ClickableListRowProps) {
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer transition-colors hover:bg-accent/50"
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {onRename && (
        <button
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0 p-1"
          onClick={(e) => {
            e.stopPropagation();
            onRename(e);
          }}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 p-1"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(e);
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
