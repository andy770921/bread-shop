'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import Autoplay from 'embla-carousel-autoplay';
import type { HeroSlide, HeroSlideTextSize } from '@repo/shared';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { useLocale } from '@/hooks/use-locale';
import { useHeroSlides } from '@/queries/use-hero-slides';
import { cn } from '@/lib/utils';

const HERO_HEIGHT = 'h-[400px]';

const TITLE_SIZE_CLASSES: Record<HeroSlideTextSize, string> = {
  xs: 'text-2xl sm:text-3xl lg:text-4xl',
  sm: 'text-3xl sm:text-4xl lg:text-5xl',
  md: 'text-4xl sm:text-5xl lg:text-6xl',
  lg: 'text-5xl sm:text-6xl lg:text-7xl',
  xl: 'text-6xl sm:text-7xl lg:text-8xl',
};

const SUBTITLE_SIZE_CLASSES: Record<HeroSlideTextSize, string> = {
  xs: 'text-sm sm:text-base',
  sm: 'text-base sm:text-lg',
  md: 'text-lg sm:text-xl',
  lg: 'text-xl sm:text-2xl',
  xl: 'text-2xl sm:text-3xl',
};

function pickTitle(slide: HeroSlide, locale: string): string {
  if (locale === 'en') return slide.title_en?.trim() ? slide.title_en : slide.title_zh;
  return slide.title_zh;
}
function pickSubtitle(slide: HeroSlide, locale: string): string {
  if (locale === 'en') return slide.subtitle_en?.trim() ? slide.subtitle_en : slide.subtitle_zh;
  return slide.subtitle_zh;
}
function titleSize(slide: HeroSlide): string {
  return TITLE_SIZE_CLASSES[slide.title_size] ?? TITLE_SIZE_CLASSES.md;
}
function subtitleSize(slide: HeroSlide): string {
  return SUBTITLE_SIZE_CLASSES[slide.subtitle_size] ?? SUBTITLE_SIZE_CLASSES.md;
}

function StaticSlide({ slide }: { slide: HeroSlide }) {
  const { locale } = useLocale();
  return (
    <section className={`relative flex ${HERO_HEIGHT} items-center justify-center overflow-hidden`}>
      <Image
        src={slide.image_url}
        alt={pickTitle(slide, locale)}
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0" style={{ backgroundColor: 'var(--bg-overlay)' }} />
      <div className="relative z-10 flex flex-col items-center gap-4 px-4 text-center">
        <h1 className={`font-heading font-bold text-white ${titleSize(slide)}`}>
          {pickTitle(slide, locale)}
        </h1>
        <p className={`max-w-lg text-white/90 ${subtitleSize(slide)}`}>
          {pickSubtitle(slide, locale)}
        </p>
      </div>
    </section>
  );
}

function CarouselSlides({ slides }: { slides: HeroSlide[] }) {
  const { locale, t } = useLocale();
  const autoplayRef = useRef(
    Autoplay({ delay: 4000, stopOnInteraction: false, stopOnMouseEnter: true }),
  );
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    const onPointerDown = () => autoplayRef.current.reset();
    api.on('select', onSelect);
    api.on('pointerDown', onPointerDown);
    onSelect();
    return () => {
      api.off('select', onSelect);
      api.off('pointerDown', onPointerDown);
    };
  }, [api]);

  function goTo(target: number) {
    api?.scrollTo(target);
    autoplayRef.current.reset();
  }

  return (
    <section className={`relative ${HERO_HEIGHT} overflow-hidden`}>
      <Carousel
        setApi={setApi}
        plugins={[autoplayRef.current]}
        opts={{ loop: true }}
        className="h-full"
      >
        <CarouselContent className="-ml-0 h-full">
          {slides.map((slide, i) => (
            <CarouselItem key={slide.id} className={`relative pl-0 ${HERO_HEIGHT} basis-full`}>
              <Image
                src={slide.image_url}
                alt={pickTitle(slide, locale)}
                fill
                priority={i === 0}
                sizes="100vw"
                className="object-cover"
              />
              <div className="absolute inset-0" style={{ backgroundColor: 'var(--bg-overlay)' }} />
              <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
                <h1 className={`font-heading font-bold text-white ${titleSize(slide)}`}>
                  {pickTitle(slide, locale)}
                </h1>
                <p className={`max-w-lg text-white/90 ${subtitleSize(slide)}`}>
                  {pickSubtitle(slide, locale)}
                </p>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious
          aria-label={t('home.carouselPrev')}
          className="left-4 z-10 border-none bg-black/30 text-white hover:bg-black/50 hover:text-white"
        />
        <CarouselNext
          aria-label={t('home.carouselNext')}
          className="right-4 z-10 border-none bg-black/30 text-white hover:bg-black/50 hover:text-white"
        />
      </Carousel>

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={t('home.carouselSlideOf', { n: i + 1, total: slides.length })}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => goTo(i)}
            className={cn(
              'pointer-events-auto h-2 w-2 rounded-full transition-colors',
              i === index ? 'bg-white' : 'bg-white/40 hover:bg-white/70',
            )}
          />
        ))}
      </div>

      <span className="sr-only" aria-live="polite">
        {t('home.carouselSlideOf', { n: index + 1, total: slides.length })}
      </span>
    </section>
  );
}

export function HeroCarousel() {
  const { data, isLoading } = useHeroSlides();
  const slides = (data?.items ?? []).filter((s) => s.is_published);

  if (isLoading && slides.length === 0) {
    return <section className={`${HERO_HEIGHT} bg-bg-elevated`} aria-hidden="true" />;
  }
  if (slides.length === 0) return null;
  if (slides.length === 1) return <StaticSlide slide={slides[0]} />;
  return <CarouselSlides slides={slides} />;
}
