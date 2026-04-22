import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SiteContentService } from './site-content.service';

@ApiTags('SiteContent')
@Controller('api/site-content')
export class SiteContentController {
  constructor(private service: SiteContentService) {}

  @Get()
  getAll() {
    return this.service.getAll();
  }
}
