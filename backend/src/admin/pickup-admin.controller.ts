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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { PickupService } from '../pickup/pickup.service';
import { CreatePickupLocationDto } from '../pickup/dto/create-pickup-location.dto';
import { UpdatePickupLocationDto } from '../pickup/dto/update-pickup-location.dto';
import { UpdatePickupSettingsDto } from '../pickup/dto/update-pickup-settings.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin')
@UseGuards(AdminAuthGuard)
export class PickupAdminController {
  constructor(private readonly pickupService: PickupService) {}

  @Get('pickup-settings')
  getSettings() {
    return this.pickupService.getAdminSettings();
  }

  @Put('pickup-settings')
  updateSettings(@Body() dto: UpdatePickupSettingsDto, @CurrentUser() user: { id: string }) {
    return this.pickupService.updateSettings(dto, user.id);
  }

  @Get('pickup-locations')
  listLocations() {
    return this.pickupService.listLocations({ includeInactive: true });
  }

  @Post('pickup-locations')
  createLocation(@Body() dto: CreatePickupLocationDto) {
    return this.pickupService.createLocation(dto);
  }

  @Patch('pickup-locations/:id')
  updateLocation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePickupLocationDto,
  ) {
    return this.pickupService.updateLocation(id, dto);
  }

  @Delete('pickup-locations/:id')
  @HttpCode(204)
  async deleteLocation(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.pickupService.softDeleteLocation(id);
  }
}
