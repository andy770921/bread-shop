import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContentBlocksService } from './content-blocks.service';

@ApiTags('ContentBlocks')
@Controller('api/content-blocks')
export class ContentBlocksController {
  constructor(private service: ContentBlocksService) {}

  @Get()
  list() {
    return this.service.listPublished();
  }
}
