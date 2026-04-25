import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ShopSettingsService } from './shop-settings.service';

@ApiTags('Shop Settings')
@Controller('api/shop-settings')
export class ShopSettingsController {
  constructor(private service: ShopSettingsService) {}

  @Get()
  @ApiOkResponse({ description: 'Public shop-wide settings (shipping + promo banner toggle).' })
  get() {
    return this.service.getSettings();
  }
}
