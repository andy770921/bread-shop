import { Module } from '@nestjs/common';
import { SiteContentController } from './site-content.controller';
import { SiteContentService } from './site-content.service';
import { SiteContentSyncService } from './site-content-sync.service';

@Module({
  controllers: [SiteContentController],
  providers: [SiteContentService, SiteContentSyncService],
})
export class SiteContentModule {}
