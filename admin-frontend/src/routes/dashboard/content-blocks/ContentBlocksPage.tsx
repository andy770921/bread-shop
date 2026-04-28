import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/hooks/use-locale';
import { HeroSlidesPanel } from './HeroSlidesPanel';
import { BottomBlocksPanel } from './BottomBlocksPanel';

export default function ContentBlocksPage() {
  const { t } = useLocale();
  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="font-serif text-lg font-bold text-text-primary md:text-2xl">
        {t('nav.contentBlocks')}
      </h1>
      <Tabs defaultValue="hero" className="space-y-4 md:space-y-6">
        <TabsList>
          <TabsTrigger value="hero">{t('contentBlocksPage.tabHeroSlides')}</TabsTrigger>
          <TabsTrigger value="bottom">{t('contentBlocksPage.tabBottomBlocks')}</TabsTrigger>
        </TabsList>
        <TabsContent value="hero">
          <HeroSlidesPanel />
        </TabsContent>
        <TabsContent value="bottom">
          <BottomBlocksPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
