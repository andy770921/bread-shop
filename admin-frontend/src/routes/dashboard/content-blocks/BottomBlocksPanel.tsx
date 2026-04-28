import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ImageOff, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ContentBlock } from '@repo/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/extract-error-message';
import {
  useAdminContentBlocks,
  useCreateContentBlock,
  useDeleteContentBlock,
  useReorderContentBlocks,
  useUpdateContentBlock,
} from '@/queries/useContentBlocks';
import { ContentBlockForm, type ContentBlockFormValues } from './ContentBlockForm';

type EditorState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; block: ContentBlock };

export function BottomBlocksPanel() {
  const { t } = useLocale();
  const { data, isLoading } = useAdminContentBlocks();
  const createMut = useCreateContentBlock();
  const updateMut = useUpdateContentBlock();
  const deleteMut = useDeleteContentBlock();
  const reorderMut = useReorderContentBlocks();

  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [deleteTarget, setDeleteTarget] = useState<ContentBlock | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);

  async function handleSubmit(values: ContentBlockFormValues) {
    const body = {
      title_zh: values.title_zh,
      title_en: values.title_en?.trim() ? values.title_en.trim() : null,
      description_zh: values.description_zh,
      description_en: values.description_en?.trim() ? values.description_en.trim() : null,
      image_url: values.image_url,
      is_published: values.is_published,
    };
    try {
      if (editor.mode === 'create') {
        await createMut.mutateAsync(body);
        toast.success(t('contentBlocks.created'));
      } else if (editor.mode === 'edit') {
        await updateMut.mutateAsync({ id: editor.block.id, body });
        toast.success(t('contentBlocks.updated'));
      }
      setEditor({ mode: 'closed' });
    } catch (err) {
      toast.error(
        `${t('contentBlocks.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`,
      );
    }
  }

  async function handleTogglePublish(block: ContentBlock) {
    try {
      await updateMut.mutateAsync({
        id: block.id,
        body: { is_published: !block.is_published },
      });
    } catch (err) {
      toast.error(
        `${t('contentBlocks.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`,
      );
    }
  }

  async function handleMove(id: string, direction: -1 | 1) {
    const idx = items.findIndex((b) => b.id === id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= items.length) return;
    const ids = items.map((b) => b.id);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    try {
      await reorderMut.mutateAsync(ids);
    } catch (err) {
      toast.error(
        `${t('contentBlocks.reorderFailed')}: ${extractErrorMessage(err, t('common.error'))}`,
      );
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success(t('contentBlocks.deleted'));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(
        `${t('contentBlocks.deleteFailed')}: ${extractErrorMessage(err, t('common.error'))}`,
      );
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => setEditor({ mode: 'create' })} data-testid="btn-add-content-block">
          <Plus className="mr-1 h-4 w-4" />
          {t('contentBlocks.addNew')}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-text-secondary">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-text-secondary">
            {t('contentBlocks.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((block, idx) => (
            <Card
              key={block.id}
              data-testid={`content-block-row-${block.id}`}
              className={cn(!block.is_published && 'opacity-60')}
            >
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-4">
                <div className="flex min-w-0 items-center gap-3 md:flex-1 md:gap-4">
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={idx === 0 || reorderMut.isPending}
                      onClick={() => handleMove(block.id, -1)}
                      aria-label={t('contentBlocks.moveUp')}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={idx === items.length - 1 || reorderMut.isPending}
                      onClick={() => handleMove(block.id, 1)}
                      aria-label={t('contentBlocks.moveDown')}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-elevated">
                    {block.image_url ? (
                      <img
                        src={block.image_url}
                        alt={block.title_zh}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff className="h-5 w-5 text-text-secondary" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium text-text-primary">{block.title_zh}</h3>
                      {!block.is_published && (
                        <Badge variant="outline" className="shrink-0">
                          {t('contentBlocks.draft')}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-text-secondary">
                      {block.description_zh}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Switch
                    checked={block.is_published}
                    onCheckedChange={() => handleTogglePublish(block)}
                    aria-label={t('contentBlocks.isPublished')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditor({ mode: 'edit', block })}
                    aria-label={t('contentBlocks.edit')}
                  >
                    <Pencil className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">{t('contentBlocks.edit')}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteTarget(block)}
                    aria-label={t('contentBlocks.delete')}
                  >
                    <Trash2 className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">{t('contentBlocks.delete')}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={editor.mode !== 'closed'}
        onOpenChange={(open) => {
          if (!open) setEditor({ mode: 'closed' });
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editor.mode === 'edit' ? t('contentBlocks.edit') : t('contentBlocks.addNew')}
            </DialogTitle>
          </DialogHeader>
          {editor.mode !== 'closed' && (
            <ContentBlockForm
              initial={editor.mode === 'edit' ? editor.block : undefined}
              onSubmit={handleSubmit}
              onCancel={() => setEditor({ mode: 'closed' })}
              submitting={createMut.isPending || updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('contentBlocks.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('contentBlocks.deleteConfirmDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('contentBlocks.cancel')}
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={deleteMut.isPending}
              data-testid="btn-confirm-delete"
            >
              {t('contentBlocks.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
