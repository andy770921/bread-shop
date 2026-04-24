import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { uploadContentImage } from '@/queries/useContentImageUpload';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/extract-error-message';
import { Button } from '@/components/ui/button';

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
}

export function ContentBlockImageUploader({ value, onChange }: Props) {
  const { t } = useLocale();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadContentImage(file);
      onChange(url);
    } catch (err) {
      console.error('Content image upload failed', err);
      toast.error(
        `${t('contentBlocks.uploadFailed')}: ${extractErrorMessage(err, t('common.error'))}`,
      );
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
          <img src={value} alt="content block" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-secondary">
            <Upload className="h-6 w-6" />
            <p className="text-sm">
              {uploading ? t('contentBlocks.uploading') : t('contentBlocks.dropImage')}
            </p>
          </div>
        )}
      </div>
      {value && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(null)}
          disabled={uploading}
        >
          <X className="mr-1 h-3 w-3" />
          {t('contentBlocks.removeImage')}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
    </div>
  );
}
