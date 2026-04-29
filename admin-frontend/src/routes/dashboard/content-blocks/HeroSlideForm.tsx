import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { HeroSlide } from '@repo/shared';
import { HERO_SLIDE_TEXT_SIZES } from '@repo/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HeroSlideImageUploader } from '@/components/hero-slides/HeroSlideImageUploader';
import { useLocale } from '@/hooks/use-locale';

const sizeEnum = z.enum(['xs', 'sm', 'md', 'lg', 'xl'] as const);

const schema = z.object({
  title_zh: z.string().trim().min(1).max(200),
  title_en: z.string().max(200).optional().or(z.literal('')),
  subtitle_zh: z
    .string()
    .min(1)
    .max(500)
    .refine((v) => v.trim().length > 0),
  subtitle_en: z.string().max(500).optional().or(z.literal('')),
  image_url: z.string().min(1).url(),
  is_published: z.boolean(),
  title_size: sizeEnum,
  subtitle_size: sizeEnum,
});

export type HeroSlideFormValues = z.infer<typeof schema>;

interface Props {
  initial?: HeroSlide;
  onSubmit: (values: HeroSlideFormValues) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}

export function HeroSlideForm({ initial, onSubmit, onCancel, submitting }: Props) {
  const { t } = useLocale();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<HeroSlideFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title_zh: '',
      title_en: '',
      subtitle_zh: '',
      subtitle_en: '',
      image_url: '',
      is_published: true,
      title_size: 'md',
      subtitle_size: 'md',
    },
  });

  useEffect(() => {
    if (initial) {
      reset({
        title_zh: initial.title_zh,
        title_en: initial.title_en ?? '',
        subtitle_zh: initial.subtitle_zh,
        subtitle_en: initial.subtitle_en ?? '',
        image_url: initial.image_url,
        is_published: initial.is_published,
        title_size: initial.title_size ?? 'md',
        subtitle_size: initial.subtitle_size ?? 'md',
      });
    }
  }, [initial, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('heroSlides.titleZh')} error={errors.title_zh?.message}>
          <Input {...register('title_zh')} />
        </Field>
        <Field label={t('heroSlides.titleEn')} error={errors.title_en?.message}>
          <Input {...register('title_en')} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label={t('heroSlides.subtitleZh')}
          error={errors.subtitle_zh?.message}
          hint={t('heroSlides.subtitleHint')}
        >
          <Textarea rows={3} {...register('subtitle_zh')} />
        </Field>
        <Field
          label={t('heroSlides.subtitleEn')}
          error={errors.subtitle_en?.message}
          hint={t('heroSlides.subtitleHint')}
        >
          <Textarea rows={3} {...register('subtitle_en')} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('heroSlides.titleSize')}>
          <Controller
            name="title_size"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HERO_SLIDE_TEXT_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`heroSlides.size.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label={t('heroSlides.subtitleSize')}>
          <Controller
            name="subtitle_size"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HERO_SLIDE_TEXT_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`heroSlides.size.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <div>
        <Label className="mb-2 block">{t('heroSlides.image')}</Label>
        <Controller
          name="image_url"
          control={control}
          render={({ field }) => (
            <HeroSlideImageUploader value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.image_url && (
          <p className="mt-1 text-xs text-error">{t('heroSlides.imageRequired')}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Controller
          name="is_published"
          control={control}
          render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
        />
        <Label>{t('heroSlides.isPublished')}</Label>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('heroSlides.cancel')}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? t('heroSlides.saving') : t('heroSlides.save')}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-text-secondary">{hint}</p>}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
