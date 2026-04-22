import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { OrderAdminService } from './order-admin.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/orders')
@UseGuards(AdminAuthGuard)
export class OrderAdminController {
  constructor(private service: OrderAdminService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list({
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderStatusDto) {
    return this.service.updateStatus(id, dto.status);
  }

  @Post(':id/resend-line')
  resendLine(@Param('id', ParseIntPipe) id: number) {
    return this.service.resendLine(id);
  }
}
