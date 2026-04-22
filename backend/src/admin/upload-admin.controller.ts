import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { UploadAdminService } from './upload-admin.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/uploads')
@UseGuards(AdminAuthGuard)
export class UploadAdminController {
  constructor(private service: UploadAdminService) {}

  @Post('product-image')
  createUploadUrl(@Body() dto: CreateUploadUrlDto) {
    return this.service.createSignedUploadUrl(dto);
  }
}
