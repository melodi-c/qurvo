import { SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';

interface BreakdownSectionProps {
  value: string;
  onChange: (value: string) => void;
}

export function BreakdownSection({ value, onChange }: BreakdownSectionProps) {
  return (
    <section className="space-y-3">
      <SectionHeader icon={SlidersHorizontal} label="Breakdown" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. country, plan, properties.utm_source"
        className="h-8 text-sm"
      />
      <p className="text-xs text-muted-foreground">
        Split results by a user or event property
      </p>
    </section>
  );
}
