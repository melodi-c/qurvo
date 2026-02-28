import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import formTranslations from './inline-create-form.translations';

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
  submitLabel,
  pendingLabel,
  autoFocus,
}: InlineCreateFormProps) {
  const { t } = useLocalTranslation(formTranslations);
  const resolvedSubmitLabel = submitLabel ?? t('create');
  return (
    <Card>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!value.trim()) {return;}
            onSubmit(value.trim());
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
          <Button type="submit" disabled={isPending || !value.trim()}>
            {isPending ? (pendingLabel ?? resolvedSubmitLabel) : resolvedSubmitLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
