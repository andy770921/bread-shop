import { Module } from '@nestjs/common';
import { ContentBlocksController } from './content-blocks.controller';
import { ContentBlocksService } from './content-blocks.service';

@Module({
  controllers: [ContentBlocksController],
  providers: [ContentBlocksService],
})
export class ContentBlocksModule {}
