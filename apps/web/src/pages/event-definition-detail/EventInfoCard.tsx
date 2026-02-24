import { useState, useCallback, useMemo } from 'react';
import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useUpsertEventDefinition } from '@/hooks/use-event-definitions';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './translations';

interface EventInfoCardProps {
  eventName: string;
  eventDef: {
    last_seen_at?: string | null;
    description?: string | null;
    tags?: string[] | null;
    verified?: boolean | null;
  };
}

export function EventInfoCard({ eventName, eventDef }: EventInfoCardProps) {
  const { t } = useLocalTranslation(translations);
  const [description, setDescription] = useState(eventDef.description ?? '');
  const [tags, setTags] = useState((eventDef.tags ?? []).join(', '));
  const [verified, setVerified] = useState(eventDef.verified ?? false);
  const upsertMutation = useUpsertEventDefinition();

  const hasChanges = useMemo(() => {
    const origDesc = eventDef.description ?? '';
    const origTags = (eventDef.tags ?? []).join(', ');
    const origVerified = eventDef.verified ?? false;
    return description !== origDesc || tags !== origTags || verified !== origVerified;
  }, [description, tags, verified, eventDef]);

  const handleSave = useCallback(async () => {
    const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      await upsertMutation.mutateAsync({
        eventName,
        data: {
          description: description || undefined,
          tags: parsedTags,
          verified,
        },
      });
      toast.success(t('eventUpdated'));
    } catch {
      toast.error(t('eventUpdateFailed'));
    }
  }, [eventName, description, tags, verified, upsertMutation, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('eventInfo')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-description">{t('description')}</Label>
            <Input
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-tags">{t('tagsLabel')}</Label>
            <Input
              id="event-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('tagsPlaceholder')}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setVerified((v) => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className={`flex items-center justify-center w-5 h-5 rounded border transition-colors ${verified ? 'bg-primary border-primary' : 'border-border'}`}>
                {verified && <Check className="w-3 h-3 text-primary-foreground" />}
              </span>
              {t('verified')}
            </button>
            <span className="text-sm text-muted-foreground">
              {t('lastSeen')} <span className="tabular-nums font-medium text-foreground">{eventDef.last_seen_at ? new Date(eventDef.last_seen_at).toLocaleDateString() : '\u2014'}</span>
            </span>
          </div>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || upsertMutation.isPending}
          >
            {upsertMutation.isPending ? t('saving') : t('save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
