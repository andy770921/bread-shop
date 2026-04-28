import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ImageOff, Pencil, Plus, Trash2 } from 'lucide-react';
import type { HeroSlide } from '@repo/shared';
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
  useAdminHeroSlides,
  useCreateHeroSlide,
  useDeleteHeroSlide,
  useReorderHeroSlides,
  useUpdateHeroSlide,
} from '@/queries/useHeroSlides';
import { HeroSlideForm, type HeroSlideFormValues } from './HeroSlideForm';

type EditorState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; slide: HeroSlide };

export function HeroSlidesPanel() {
  const { t } = useLocale();
  const { data, isLoading } = useAdminHeroSlides();
  const createMut = useCreateHeroSlide();
  const updateMut = useUpdateHeroSlide();
  const deleteMut = useDeleteHeroSlide();
  const reorderMut = useReorderHeroSlides();

  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [deleteTarget, setDeleteTarget] = useState<HeroSlide | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);

  async function handleSubmit(values: HeroSlideFormValues) {
    const body = {
      title_zh: values.title_zh,
      title_en: values.title_en?.trim() ? values.title_en.trim() : null,
      subtitle_zh: values.subtitle_zh,
      subtitle_en: values.subtitle_en?.trim() ? values.subtitle_en.trim() : null,
      image_url: values.image_url,
      is_published: values.is_published,
      title_size: values.title_size,
      subtitle_size: values.subtitle_size,
    };
    try {
      if (editor.mode === 'create') {
        await createMut.mutateAsync(body);
        toast.success(t('heroSlides.created'));
      } else if (editor.mode === 'edit') {
        await updateMut.mutateAsync({ id: editor.slide.id, body });
        toast.success(t('heroSlides.updated'));
      }
      setEditor({ mode: 'closed' });
    } catch (err) {
      toast.error(`${t('heroSlides.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`);
    }
  }

  async function handleTogglePublish(slide: HeroSlide) {
    try {
      await updateMut.mutateAsync({
        id: slide.id,
        body: { is_published: !slide.is_published },
      });
    } catch (err) {
      toast.error(`${t('heroSlides.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`);
    }
  }

  async function handleMove(id: string, direction: -1 | 1) {
    const idx = items.findIndex((s) => s.id === id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= items.length) return;
    const ids = items.map((s) => s.id);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    try {
      await reorderMut.mutateAsync(ids);
    } catch (err) {
      toast.error(
        `${t('heroSlides.reorderFailed')}: ${extractErrorMessage(err, t('common.error'))}`,
      );
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success(t('heroSlides.deleted'));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(
        `${t('heroSlides.deleteFailed')}: ${extractErrorMessage(err, t('common.error'))}`,
      );
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => setEditor({ mode: 'create' })} data-testid="btn-add-hero-slide">
          <Plus className="mr-1 h-4 w-4" />
          {t('heroSlides.addNew')}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-text-secondary">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-text-secondary">
            {t('heroSlides.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((slide, idx) => (
            <Card
              key={slide.id}
              data-testid={`hero-slide-row-${slide.id}`}
              className={cn(!slide.is_published && 'opacity-60')}
            >
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-4">
                <div className="flex min-w-0 items-center gap-3 md:flex-1 md:gap-4">
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={idx === 0 || reorderMut.isPending}
                      onClick={() => handleMove(slide.id, -1)}
                      aria-label={t('heroSlides.moveUp')}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={idx === items.length - 1 || reorderMut.isPending}
                      onClick={() => handleMove(slide.id, 1)}
                      aria-label={t('heroSlides.moveDown')}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-elevated">
                    {slide.image_url ? (
                      <img
                        src={slide.image_url}
                        alt={slide.title_zh}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff className="h-5 w-5 text-text-secondary" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium text-text-primary">{slide.title_zh}</h3>
                      {!slide.is_published && (
                        <Badge variant="outline" className="shrink-0">
                          {t('heroSlides.draft')}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-text-secondary">
                      {slide.subtitle_zh}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Switch
                    checked={slide.is_published}
                    onCheckedChange={() => handleTogglePublish(slide)}
                    aria-label={t('heroSlides.isPublished')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditor({ mode: 'edit', slide })}
                    aria-label={t('heroSlides.edit')}
                  >
                    <Pencil className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">{t('heroSlides.edit')}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteTarget(slide)}
                    aria-label={t('heroSlides.delete')}
                  >
                    <Trash2 className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">{t('heroSlides.delete')}</span>
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
              {editor.mode === 'edit' ? t('heroSlides.edit') : t('heroSlides.addNew')}
            </DialogTitle>
          </DialogHeader>
          {editor.mode !== 'closed' && (
            <HeroSlideForm
              initial={editor.mode === 'edit' ? editor.slide : undefined}
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
            <DialogTitle>{t('heroSlides.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('heroSlides.deleteConfirmDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('heroSlides.cancel')}
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={deleteMut.isPending}
              data-testid="btn-confirm-delete-hero"
            >
              {t('heroSlides.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
