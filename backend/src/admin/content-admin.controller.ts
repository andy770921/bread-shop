import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { ContentAdminService } from './content-admin.service';
import { UpsertSiteContentDto } from './dto/upsert-site-content.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/site-content')
@UseGuards(AdminAuthGuard)
export class ContentAdminController {
  constructor(private service: ContentAdminService) {}

  @Get()
  getAll() {
    return this.service.getAll();
  }

  @Put(':key')
  upsert(
    @Param('key') key: string,
    @Body() dto: UpsertSiteContentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.upsert(key, dto, user.id);
  }

  @Delete(':key')
  remove(@Param('key') key: string) {
    return this.service.remove(key);
  }
}
