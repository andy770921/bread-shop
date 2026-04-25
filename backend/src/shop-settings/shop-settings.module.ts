import { Global, Module } from '@nestjs/common';
import { ShopSettingsService } from './shop-settings.service';
import { ShopSettingsController } from './shop-settings.controller';
import { InventoryService } from './inventory.service';

@Global()
@Module({
  providers: [ShopSettingsService, InventoryService],
  controllers: [ShopSettingsController],
  exports: [ShopSettingsService, InventoryService],
})
export class ShopSettingsModule {}
