import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ContentBlock } from '@repo/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ContentBlockImageUploader } from '@/components/content-blocks/ContentBlockImageUploader';
import { useLocale } from '@/hooks/use-locale';

const schema = z.object({
  title_zh: z.string().trim().min(1).max(200),
  title_en: z.string().max(200).optional().or(z.literal('')),
  description_zh: z.string().trim().min(1).max(5000),
  description_en: z.string().max(5000).optional().or(z.literal('')),
  image_url: z.string().url().nullable(),
  is_published: z.boolean(),
});

export type ContentBlockFormValues = z.infer<typeof schema>;

interface Props {
  initial?: ContentBlock;
  onSubmit: (values: ContentBlockFormValues) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}

export function ContentBlockForm({ initial, onSubmit, onCancel, submitting }: Props) {
  const { t } = useLocale();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ContentBlockFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title_zh: '',
      title_en: '',
      description_zh: '',
      description_en: '',
      image_url: null,
      is_published: true,
    },
  });

  useEffect(() => {
    if (initial) {
      reset({
        title_zh: initial.title_zh,
        title_en: initial.title_en ?? '',
        description_zh: initial.description_zh,
        description_en: initial.description_en ?? '',
        image_url: initial.image_url ?? null,
        is_published: initial.is_published,
      });
    }
  }, [initial, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('contentBlocks.titleZh')} error={errors.title_zh?.message}>
          <Input {...register('title_zh')} />
        </Field>
        <Field label={t('contentBlocks.titleEn')} error={errors.title_en?.message}>
          <Input {...register('title_en')} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('contentBlocks.descriptionZh')} error={errors.description_zh?.message}>
          <Textarea rows={6} {...register('description_zh')} />
        </Field>
        <Field label={t('contentBlocks.descriptionEn')} error={errors.description_en?.message}>
          <Textarea rows={6} {...register('description_en')} />
        </Field>
      </div>

      <div>
        <Label className="mb-2 block">{t('contentBlocks.image')}</Label>
        <Controller
          name="image_url"
          control={control}
          render={({ field }) => (
            <ContentBlockImageUploader value={field.value} onChange={field.onChange} />
          )}
        />
      </div>

      <div className="flex items-center gap-3">
        <Controller
          name="is_published"
          control={control}
          render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
        />
        <Label>{t('contentBlocks.isPublished')}</Label>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('contentBlocks.cancel')}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? t('contentBlocks.saving') : t('contentBlocks.save')}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
