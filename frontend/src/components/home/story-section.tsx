'use client';

import Image from 'next/image';
import { useLocale } from '@/hooks/use-locale';

const STORAGE_URL =
  'https://wqgaujuapacxuhvfatii.supabase.co/storage/v1/object/public/product-images/';

export function StorySection() {
  const { t } = useLocale();

  return (
    <section id="story" className="py-16 lg:py-24" style={{ backgroundColor: 'var(--primary-50)' }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Text Content */}
          <div className="flex flex-col gap-6">
            <h2
              className="font-heading text-2xl font-bold lg:text-3xl"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('story.title')}
            </h2>
            <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {t('story.p1')}
            </p>
            <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {t('story.p2')}
            </p>
          </div>

          {/* Image */}
          <div className="relative h-[360px] w-full overflow-hidden rounded-2xl lg:h-[460px]">
            <Image
              src={`${STORAGE_URL}story-bakery.jpg`}
              alt="Papa Bakery Story"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
