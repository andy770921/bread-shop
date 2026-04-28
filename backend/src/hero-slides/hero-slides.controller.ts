import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HeroSlidesService } from './hero-slides.service';

@ApiTags('HeroSlides')
@Controller('api/hero-slides')
export class HeroSlidesController {
  constructor(private service: HeroSlidesService) {}

  @Get()
  list() {
    return this.service.listPublished();
  }
}
