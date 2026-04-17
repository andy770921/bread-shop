'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductImageProps {
  alt: string;
  src?: string | null;
  sizes: string;
  priority?: boolean;
  imageClassName?: string;
  fallbackClassName?: string;
  unoptimized?: boolean;
}

export function ProductImage({
  alt,
  src,
  sizes,
  priority,
  imageClassName,
  fallbackClassName,
  unoptimized,
}: ProductImageProps) {
  const normalizedSrc = src?.trim() || null;
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [normalizedSrc]);

  const canRenderImage = !!normalizedSrc && !hasError;
  const showLoadingState = canRenderImage && !isLoaded;
  const showFallback = !normalizedSrc || hasError;

  return (
    <>
      {showLoadingState ? (
        <div
          data-testid="product-image-loading"
          aria-hidden="true"
          className={cn(
            'absolute inset-0 animate-pulse rounded-[inherit] bg-muted',
            fallbackClassName,
          )}
        />
      ) : null}

      {showFallback ? (
        <div
          data-testid="product-image-fallback"
          aria-hidden="true"
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-[inherit] bg-[var(--bg-elevated)] text-[var(--text-tertiary)]',
            fallbackClassName,
          )}
        >
          <ImageOff className="h-5 w-5" />
        </div>
      ) : null}

      {canRenderImage ? (
        <Image
          src={normalizedSrc}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={unoptimized}
          className={cn(
            'object-cover transition-opacity duration-200',
            isLoaded ? 'opacity-100' : 'opacity-0',
            imageClassName,
          )}
          onLoad={() => {
            setIsLoaded(true);
          }}
          onError={() => {
            setHasError(true);
            setIsLoaded(false);
          }}
        />
      ) : null}
    </>
  );
}
