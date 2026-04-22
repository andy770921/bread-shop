import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { uploadProductImage } from '@/queries/useProductImageUpload';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  value: string | null;
  onChange: (url: string) => void;
  productId?: number;
}

export function ImageUploader({ value, onChange, productId }: Props) {
  const { t } = useLocale();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadProductImage(file, productId);
      onChange(url);
    } catch (err) {
      console.error(err);
      toast.error(t('common.error'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={cn(
          'relative flex h-48 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-border-default bg-bg-elevated transition-colors hover:border-primary-400',
          uploading && 'opacity-60',
        )}
      >
        {value ? (
          <img src={value} alt="product" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-secondary">
            <Upload className="h-6 w-6" />
            <p className="text-sm">{uploading ? t('product.uploading') : t('product.dropImage')}</p>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
