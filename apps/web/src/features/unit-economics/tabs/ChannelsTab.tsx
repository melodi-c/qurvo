import { useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog, useConfirmDelete } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel } from '../hooks/use-channels';
import type { MarketingChannel, CreateMarketingChannel } from '@/api/generated/Api';
import translations from './ChannelsTab.translations';

interface FilterCondition {
  property: string;
  value: string;
}

export function ChannelsTab() {
  const { t } = useLocalTranslation(translations);
  const { data: channels, isLoading } = useChannels();
  const createMutation = useCreateChannel();
  const updateMutation = useUpdateChannel();
  const deleteMutation = useDeleteChannel();
  const confirm = useConfirmDelete();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<MarketingChannel | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#60a5fa');
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const openCreate = useCallback(() => {
    setEditingChannel(null);
    setName('');
    setColor('#60a5fa');
    setConditions([]);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((ch: MarketingChannel) => {
    setEditingChannel(ch);
    setName(ch.name);
    setColor(ch.color ?? '#60a5fa');
    setConditions((ch.filter_conditions as FilterCondition[] | null) ?? []);
    setDialogOpen(true);
  }, []);

  const addCondition = useCallback(() => {
    setConditions((prev) => [...prev, { property: '', value: '' }]);
  }, []);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateCondition = useCallback((index: number, field: 'property' | 'value', val: string) => {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: val } : c)));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) return;
    const validConditions = conditions.filter((c) => c.property.trim() && c.value.trim());
    const data: CreateMarketingChannel = {
      name,
      color,
      filter_conditions: validConditions.length > 0 ? validConditions : undefined,
    };
    if (editingChannel) {
      await updateMutation.mutateAsync({ channelId: editingChannel.id, data });
      toast.success(t('channelUpdated'));
    } else {
      await createMutation.mutateAsync(data);
      toast.success(t('channelCreated'));
    }
    setDialogOpen(false);
  }, [name, color, conditions, editingChannel, createMutation, updateMutation]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteMutation.mutateAsync(id);
    toast.success(t('channelDeleted'));
  }, [deleteMutation]);

  if (isLoading) return <ListSkeleton count={3} />;

  const content = !channels?.length ? (
    <EmptyState
      icon={Plus}
      title={t('noChannelsTitle')}
      description={t('noChannelsDescription')}
      action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />{t('addChannel')}</Button>}
    />
  ) : (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />{t('addChannel')}</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('headerName')}</TableHead>
            <TableHead>{t('headerType')}</TableHead>
            <TableHead>{t('headerFilters')}</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.map((ch) => (
            <TableRow key={ch.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {ch.color && (
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ch.color }} />
                  )}
                  {ch.name}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{ch.channel_type}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1 flex-wrap">
                  {(ch.filter_conditions as FilterCondition[] | null)?.length ? (
                    (ch.filter_conditions as FilterCondition[]).map((fc, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {fc.property}={fc.value}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-xs" onClick={() => openEdit(ch)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => confirm.requestDelete(ch.id, ch.name)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <>
      {content}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingChannel ? t('editChannel') : t('newChannel')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <div className="space-y-2">
                <Label htmlFor="ch-name">{t('name')}</Label>
                <Input
                  id="ch-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ch-color">{t('color')}</Label>
                <Input
                  id="ch-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 p-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('filterConditions')}</Label>
              <div className="space-y-2">
                {conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={c.property}
                      onChange={(e) => updateCondition(i, 'property', e.target.value)}
                      placeholder={t('property')}
                      className="flex-1"
                    />
                    <span className="text-muted-foreground">=</span>
                    <Input
                      value={c.value}
                      onChange={(e) => updateCondition(i, 'value', e.target.value)}
                      placeholder={t('value')}
                      className="flex-1"
                    />
                    <Button variant="ghost" size="icon-xs" onClick={() => removeCondition(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="h-3.5 w-3.5 mr-1" />{t('addCondition')}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {editingChannel ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirm.isOpen}
        onOpenChange={confirm.close}
        title={t('deleteTitle', { name: confirm.itemName ?? '' })}
        description={t('deleteDescription')}
        variant="destructive"
        onConfirm={() => handleDelete(confirm.itemId!)}
      />
    </>
  );
}
