import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { DashboardAdminService } from './dashboard-admin.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin')
@UseGuards(AdminAuthGuard)
export class DashboardAdminController {
  constructor(private service: DashboardAdminService) {}

  @Get('dashboard')
  getStats() {
    return this.service.getStats();
  }
}
