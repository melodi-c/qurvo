import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={cn('flex items-center gap-1.5 min-w-0', className)}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={idx} className="flex items-center gap-1.5 min-w-0">
            {idx > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
            )}
            {item.path && !isLast ? (
              <Link
                to={item.path}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground flex-shrink-0"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  'text-sm truncate',
                  isLast ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
