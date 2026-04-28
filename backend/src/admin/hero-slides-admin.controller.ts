import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { HeroSlidesAdminService } from './hero-slides-admin.service';
import { UpsertHeroSlideDto } from './dto/upsert-hero-slide.dto';
import { ReorderHeroSlidesDto } from './dto/reorder-hero-slides.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/hero-slides')
@UseGuards(AdminAuthGuard)
export class HeroSlidesAdminController {
  constructor(private service: HeroSlidesAdminService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: UpsertHeroSlideDto) {
    return this.service.create(dto);
  }

  @Patch('reorder')
  reorder(@Body() dto: ReorderHeroSlidesDto) {
    return this.service.reorder(dto.ids);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertHeroSlideDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.delete(id);
  }
}
