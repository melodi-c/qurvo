import { SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { PropertyNameCombobox } from '@/features/dashboard/components/widgets/funnel/PropertyNameCombobox';

interface BreakdownSectionProps {
  value: string;
  onChange: (value: string) => void;
  propertyNames?: string[];
  propertyDescriptions?: Record<string, string>;
}

export function BreakdownSection({ value, onChange, propertyNames, propertyDescriptions }: BreakdownSectionProps) {
  return (
    <section className="space-y-3">
      <SectionHeader icon={SlidersHorizontal} label="Breakdown" />
      {propertyNames !== undefined ? (
        <PropertyNameCombobox
          value={value}
          onChange={onChange}
          propertyNames={propertyNames}
          descriptions={propertyDescriptions}
          className="h-8"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. country, plan, properties.utm_source"
          className="h-8 text-sm"
        />
      )}
      <p className="text-xs text-muted-foreground">
        Split results by a user or event property
      </p>
    </section>
  );
}
