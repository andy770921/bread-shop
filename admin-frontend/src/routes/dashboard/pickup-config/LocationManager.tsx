import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import type { PickupLocation } from '@repo/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useCreatePickupLocation,
  useDeletePickupLocation,
  useUpdatePickupLocation,
} from '@/queries/usePickupConfig';

interface Props {
  locations: PickupLocation[];
}

function NewLocationDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [labelZh, setLabelZh] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const createMutation = useCreatePickupLocation();

  const submit = async () => {
    if (!labelZh.trim() || !labelEn.trim()) {
      toast.error('中文與英文名稱皆為必填');
      return;
    }
    try {
      await createMutation.mutateAsync({ label_zh: labelZh.trim(), label_en: labelEn.trim() });
      toast.success('已新增地點');
      setLabelZh('');
      setLabelEn('');
      setOpen(false);
      onCreated();
    } catch (err) {
      toast.error((err as Error).message || '新增失敗');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> 新增地點
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新增取貨地點</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm">中文名稱</label>
            <Input
              value={labelZh}
              onChange={(e) => setLabelZh(e.target.value)}
              placeholder="新竹 - XXX"
            />
          </div>
          <div>
            <label className="text-sm">英文名稱</label>
            <Input
              value={labelEn}
              onChange={(e) => setLabelEn(e.target.value)}
              placeholder="Hsinchu - XXX"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={createMutation.isPending}>
            新增
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationRow({ loc }: { loc: PickupLocation }) {
  const updateMutation = useUpdatePickupLocation();
  const deleteMutation = useDeletePickupLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [draftZh, setDraftZh] = useState(loc.label_zh);
  const [draftEn, setDraftEn] = useState(loc.label_en);

  const startEdit = () => {
    setDraftZh(loc.label_zh);
    setDraftEn(loc.label_en);
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!draftZh.trim() || !draftEn.trim()) {
      toast.error('名稱不可為空');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: loc.id,
        body: { label_zh: draftZh.trim(), label_en: draftEn.trim() },
      });
      toast.success('已更新');
      setIsEditing(false);
    } catch (err) {
      toast.error((err as Error).message || '更新失敗');
    }
  };

  const toggleActive = async (v: boolean) => {
    try {
      await updateMutation.mutateAsync({ id: loc.id, body: { is_active: v } });
    } catch (err) {
      toast.error((err as Error).message || '更新失敗');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`確定刪除 ${loc.label_zh}？`)) return;
    try {
      await deleteMutation.mutateAsync(loc.id);
      toast.success('已刪除');
    } catch (err) {
      toast.error((err as Error).message || '刪除失敗');
    }
  };

  return (
    <TableRow>
      <TableCell>
        {isEditing ? (
          <Input value={draftZh} onChange={(e) => setDraftZh(e.target.value)} />
        ) : (
          loc.label_zh
        )}
      </TableCell>
      <TableCell>
        {isEditing ? (
          <Input value={draftEn} onChange={(e) => setDraftEn(e.target.value)} />
        ) : (
          loc.label_en
        )}
      </TableCell>
      <TableCell>
        <Switch checked={!!loc.is_active} onCheckedChange={toggleActive} />
      </TableCell>
      <TableCell className="space-x-2 text-right">
        {isEditing ? (
          <>
            <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}>
              儲存
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
              取消
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={startEdit}>
              編輯
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-destructive"
              aria-label="delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </TableCell>
    </TableRow>
  );
}

export function LocationManager({ locations }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>地點管理</CardTitle>
        <NewLocationDialog onCreated={() => {}} />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>中文名稱</TableHead>
              <TableHead>英文名稱</TableHead>
              <TableHead className="w-24">啟用中</TableHead>
              <TableHead className="w-48 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-text-tertiary">
                  尚無地點，請新增
                </TableCell>
              </TableRow>
            )}
            {locations.map((loc) => (
              <LocationRow key={loc.id} loc={loc} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
