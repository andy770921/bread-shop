import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { FeatureFlagsAdminService } from './feature-flags-admin.service';
import { UpdateHomeVisibleCategoriesDto } from './dto/update-home-visible-categories.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/feature-flags')
@UseGuards(AdminAuthGuard)
export class FeatureFlagsAdminController {
  constructor(private service: FeatureFlagsAdminService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Put('home-visible-categories')
  updateHomeVisibleCategories(@Body() dto: UpdateHomeVisibleCategoriesDto) {
    return this.service.replaceHomeVisibleCategories(dto.category_ids);
  }
}
