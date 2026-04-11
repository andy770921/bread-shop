'use client';

import { Wheat, ChefHat, Clock, Flame } from 'lucide-react';
import { useLocale } from '@/hooks/use-locale';

const steps = [
  { icon: Wheat, titleKey: 'process.step1Title', descKey: 'process.step1Desc' },
  { icon: ChefHat, titleKey: 'process.step2Title', descKey: 'process.step2Desc' },
  { icon: Clock, titleKey: 'process.step3Title', descKey: 'process.step3Desc' },
  { icon: Flame, titleKey: 'process.step4Title', descKey: 'process.step4Desc' },
];

export function ProcessSection() {
  const { t } = useLocale();

  return (
    <section
      id="process"
      className="py-16 lg:py-24"
      style={{ background: 'var(--process-bg)' }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2
          className="font-heading mb-12 text-center text-2xl font-bold lg:text-3xl"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('process.title')}
        </h2>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="flex flex-col items-center text-center">
                <div
                  className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--primary-100)' }}
                >
                  <Icon className="h-8 w-8" style={{ color: 'var(--primary-500)' }} />
                </div>
                <h3
                  className="font-heading mb-2 text-lg font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t(step.titleKey)}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {t(step.descKey)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
