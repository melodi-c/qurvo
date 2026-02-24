import type { ElementType, ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';

interface EditableListSectionProps<T> {
  icon: ElementType;
  label: string;
  items: T[];
  addLabel: string;
  emptyItem: T;
  renderItem: (item: T, index: number, onChange: (value: T) => void) => ReactNode;
  onChange: (items: T[]) => void;
}

export function EditableListSection<T>({
  icon,
  label,
  items,
  addLabel,
  emptyItem,
  renderItem,
  onChange,
}: EditableListSectionProps<T>): ReactNode {
  function handleItemChange(index: number, value: T): void {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }

  function handleRemove(index: number): void {
    onChange(items.filter((_, i) => i !== index));
  }

  function handleAdd(): void {
    onChange([...items, emptyItem]);
  }

  return (
    <section className="space-y-3">
      <SectionHeader icon={icon} label={label} />
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1">
            {renderItem(item, idx, (value) => handleItemChange(idx, value))}
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => handleRemove(idx)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start text-xs"
          onClick={handleAdd}
        >
          <Plus className="h-3 w-3 mr-1" /> {addLabel}
        </Button>
      </div>
    </section>
  );
}
