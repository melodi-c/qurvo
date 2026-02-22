import { useState, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog, useConfirmDelete } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useAdSpend, useCreateAdSpend, useDeleteAdSpend } from '../hooks/use-ad-spend';
import { useChannels } from '../hooks/use-channels';
import translations from './SpendTab.translations';

export function SpendTab() {
  const { t } = useLocalTranslation(translations);
  const { data: spendRecords, isLoading } = useAdSpend();
  const { data: channels } = useChannels();
  const createMutation = useCreateAdSpend();
  const deleteMutation = useDeleteAdSpend();
  const confirm = useConfirmDelete();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    channel_id: '',
    spend_date: new Date().toISOString().slice(0, 10),
    amount: '',
    note: '',
  });

  const openCreate = useCallback(() => {
    setForm({
      channel_id: channels?.[0]?.id ?? '',
      spend_date: new Date().toISOString().slice(0, 10),
      amount: '',
      note: '',
    });
    setDialogOpen(true);
  }, [channels]);

  const handleCreate = useCallback(async () => {
    if (!form.channel_id || !form.amount) return;
    await createMutation.mutateAsync({
      channel_id: form.channel_id,
      spend_date: form.spend_date,
      amount: form.amount,
      note: form.note || undefined,
    });
    toast.success(t('spendAdded'));
    setDialogOpen(false);
  }, [form, createMutation]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteMutation.mutateAsync(id);
    toast.success(t('spendDeleted'));
  }, [deleteMutation]);

  const channelName = useCallback(
    (channelId: string) => channels?.find((c) => c.id === channelId)?.name ?? '—',
    [channels],
  );

  if (isLoading) return <ListSkeleton count={5} />;

  if (!channels?.length) {
    return (
      <EmptyState
        icon={Plus}
        title={t('noChannelsTitle')}
        description={t('noChannelsDescription')}
      />
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />{t('addSpend')}</Button>
        </div>

        {!spendRecords?.length ? (
          <EmptyState
            icon={Plus}
            title={t('noSpendTitle')}
            description={t('noSpendDescription')}
            action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />{t('addSpend')}</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('headerDate')}</TableHead>
                <TableHead>{t('headerChannel')}</TableHead>
                <TableHead className="text-right">{t('headerAmount')}</TableHead>
                <TableHead>{t('headerCurrency')}</TableHead>
                <TableHead>{t('headerNote')}</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {spendRecords.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm tabular-nums">{s.spend_date}</TableCell>
                  <TableCell className="text-sm">{channelName(s.channel_id)}</TableCell>
                  <TableCell className="text-sm text-right tabular-nums font-medium">
                    {parseFloat(s.amount).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.currency}</TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {s.note ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => confirm.requestDelete(s.id, `${s.spend_date} — ${channelName(s.channel_id)}`)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('channel')}</Label>
              <Select value={form.channel_id} onValueChange={(v) => setForm((f) => ({ ...f, channel_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t('selectChannel')} /></SelectTrigger>
                <SelectContent>
                  {channels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('date')}</Label>
                <DatePicker
                  value={form.spend_date}
                  onChange={(v) => setForm((f) => ({ ...f, spend_date: v }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sp-amount">{t('amount')}</Label>
                <Input
                  id="sp-amount"
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-note">{t('note')}</Label>
              <Input
                id="sp-note"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder={t('optionalNote')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={!form.channel_id || !form.amount || createMutation.isPending}>
              {t('add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm.isOpen}
        onOpenChange={confirm.close}
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: confirm.itemName ?? '' })}
        variant="destructive"
        onConfirm={() => handleDelete(confirm.itemId!)}
      />
    </>
  );
}
