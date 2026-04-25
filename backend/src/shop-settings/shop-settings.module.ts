import { Global, Module } from '@nestjs/common';
import { ShopSettingsService } from './shop-settings.service';
import { ShopSettingsController } from './shop-settings.controller';

@Global()
@Module({
  providers: [ShopSettingsService],
  controllers: [ShopSettingsController],
  exports: [ShopSettingsService],
})
export class ShopSettingsModule {}
