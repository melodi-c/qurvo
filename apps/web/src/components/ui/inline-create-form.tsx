import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface InlineCreateFormProps {
  placeholder: string;
  isPending: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  value: string;
  onChange: (value: string) => void;
  submitLabel?: string;
  pendingLabel?: string;
  autoFocus?: boolean;
}

export function InlineCreateForm({
  placeholder,
  isPending,
  onSubmit,
  onCancel,
  value,
  onChange,
  submitLabel = 'Create',
  pendingLabel,
  autoFocus,
}: InlineCreateFormProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(value);
          }}
          className="flex gap-3"
        >
          <Input
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
            autoFocus={autoFocus}
            className="flex-1"
          />
          <Button type="submit" disabled={isPending}>
            {isPending ? (pendingLabel ?? submitLabel) : submitLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
