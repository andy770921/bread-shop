'use client';

import Image from 'next/image';
import type { ContentBlock } from '@repo/shared';
import { useLocale } from '@/hooks/use-locale';
import { useContentBlocks } from '@/queries/use-content-blocks';

export function HomeContentBlocks() {
  const { data } = useContentBlocks();
  const { locale } = useLocale();
  const items = data?.items ?? [];
  if (!items.length) return null;

  return (
    <>
      {items.map((block, index) => (
        <ContentBlockRow
          key={block.id}
          block={block}
          locale={locale}
          imageSide={index % 2 === 0 ? 'right' : 'left'}
        />
      ))}
    </>
  );
}

function ContentBlockRow({
  block,
  locale,
  imageSide,
}: {
  block: ContentBlock;
  locale: 'zh' | 'en';
  imageSide: 'left' | 'right';
}) {
  const title = locale === 'en' && block.title_en ? block.title_en : block.title_zh;
  const description =
    locale === 'en' && block.description_en ? block.description_en : block.description_zh;
  const hasImage = !!block.image_url;

  return (
    <section
      className="py-16 lg:py-24"
      style={{ backgroundColor: 'var(--primary-50)' }}
      aria-labelledby={`content-block-${block.id}`}
      data-testid={`content-block-${block.id}`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={
            hasImage
              ? 'grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16'
              : 'mx-auto max-w-3xl text-center'
          }
        >
          <div
            className={
              hasImage
                ? `flex flex-col gap-6 ${imageSide === 'right' ? 'order-1' : 'order-2'}`
                : 'flex flex-col gap-6'
            }
          >
            <h2
              id={`content-block-${block.id}`}
              className="font-heading text-2xl font-bold lg:text-3xl"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
            <p
              className="whitespace-pre-line text-base leading-relaxed lg:text-lg"
              style={{ color: 'var(--text-secondary)' }}
            >
              {description}
            </p>
          </div>
          {hasImage && (
            <div
              className={`relative h-[360px] w-full overflow-hidden rounded-2xl lg:h-[460px] ${
                imageSide === 'right' ? 'order-2' : 'order-1'
              }`}
            >
              <Image
                src={block.image_url!}
                alt={title}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
