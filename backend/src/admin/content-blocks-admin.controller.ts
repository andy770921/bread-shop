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
import { ContentBlocksAdminService } from './content-blocks-admin.service';
import { UpsertContentBlockDto } from './dto/upsert-content-block.dto';
import { ReorderContentBlocksDto } from './dto/reorder-content-blocks.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/content-blocks')
@UseGuards(AdminAuthGuard)
export class ContentBlocksAdminController {
  constructor(private service: ContentBlocksAdminService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: UpsertContentBlockDto) {
    return this.service.create(dto);
  }

  @Patch('reorder')
  reorder(@Body() dto: ReorderContentBlocksDto) {
    return this.service.reorder(dto.ids);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertContentBlockDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.delete(id);
  }
}
