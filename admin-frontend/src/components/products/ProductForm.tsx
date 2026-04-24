import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ProductWithCategory } from '@repo/shared';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageUploader } from './ImageUploader';
import { useCategories } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';
import { useContentT } from '@/hooks/use-content-t';

const schema = z.object({
  name_zh: z.string().min(1),
  name_en: z.string().min(1),
  description_zh: z.string().optional(),
  description_en: z.string().optional(),
  price: z.coerce.number().int().min(0),
  // category_id must reference an existing row in categories; 0 (the form
  // default before the Select is touched) would hit the foreign key
  // constraint at the database, so reject it here instead.
  category_id: z.coerce.number().int().min(1),
  image_url: z.string().url().optional().or(z.literal('')),
  badge_type: z.enum(['hot', 'new', 'seasonal', '']).optional(),
  sort_order: z.coerce.number().int(),
  is_active: z.boolean(),
});

export type ProductFormValues = z.infer<typeof schema>;

interface Props {
  initial?: ProductWithCategory;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  submitting?: boolean;
  productId?: number;
}

export function ProductForm({ initial, onSubmit, submitting, productId }: Props) {
  const { t } = useLocale();
  const contentT = useContentT();
  const navigate = useNavigate();
  const { data: categories } = useCategories();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name_zh: '',
      name_en: '',
      description_zh: '',
      description_en: '',
      price: 0,
      category_id: 0,
      image_url: '',
      badge_type: '',
      sort_order: 0,
      is_active: true,
    },
  });

  useEffect(() => {
    if (initial) {
      reset({
        name_zh: initial.name_zh,
        name_en: initial.name_en,
        description_zh: initial.description_zh ?? '',
        description_en: initial.description_en ?? '',
        price: initial.price,
        category_id: initial.category_id,
        image_url: initial.image_url ?? '',
        badge_type: initial.badge_type ?? '',
        sort_order: initial.sort_order,
        is_active: initial.is_active,
      });
    }
  }, [initial, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <Controller
              name="image_url"
              control={control}
              render={({ field }) => (
                <ImageUploader
                  value={field.value || null}
                  onChange={field.onChange}
                  productId={productId}
                />
              )}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('product.nameZh')} error={errors.name_zh?.message}>
                <Input {...register('name_zh')} />
              </Field>
              <Field label={t('product.nameEn')} error={errors.name_en?.message}>
                <Input {...register('name_en')} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('product.descriptionZh')}>
                <Textarea rows={3} {...register('description_zh')} />
              </Field>
              <Field label={t('product.descriptionEn')}>
                <Textarea rows={3} {...register('description_en')} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('product.price')} error={errors.price?.message}>
                <Input type="number" {...register('price')} />
              </Field>
              <Field
                label={t('product.category')}
                error={errors.category_id ? t('product.categoryRequired') : undefined}
              >
                <Controller
                  name="category_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : undefined}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.categories.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {contentT(`category.${c.slug}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('product.badge')}>
                <Controller
                  name="badge_type"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('product.badgeNone')}</SelectItem>
                        <SelectItem value="hot">{t('product.badgeHot')}</SelectItem>
                        <SelectItem value="new">{t('product.badgeNew')}</SelectItem>
                        <SelectItem value="seasonal">{t('product.badgeSeasonal')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label={t('product.sortOrder')}>
                <Input type="number" {...register('sort_order')} />
              </Field>
            </div>

            <div className="flex items-center gap-3">
              <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <Label>{t('product.isActive')}</Label>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate('/dashboard/products')}>
          {t('product.cancel')}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? t('product.saving') : t('product.save')}
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
