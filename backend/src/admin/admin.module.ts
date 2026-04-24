import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { PickupModule } from '../pickup/pickup.module';
import { LineModule } from '../line/line.module';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminMeController } from './me.controller';
import { DashboardAdminController } from './dashboard-admin.controller';
import { DashboardAdminService } from './dashboard-admin.service';
import { ProductAdminController } from './product-admin.controller';
import { ProductAdminService } from './product-admin.service';
import { ContentAdminController } from './content-admin.controller';
import { ContentAdminService } from './content-admin.service';
import { OrderAdminController } from './order-admin.controller';
import { OrderAdminService } from './order-admin.service';
import { UploadAdminController } from './upload-admin.controller';
import { UploadAdminService } from './upload-admin.service';
import { FeatureFlagsAdminController } from './feature-flags-admin.controller';
import { FeatureFlagsAdminService } from './feature-flags-admin.service';
import { ContentBlocksAdminController } from './content-blocks-admin.controller';
import { ContentBlocksAdminService } from './content-blocks-admin.service';
import { PickupAdminController } from './pickup-admin.controller';

@Module({
  imports: [OrderModule, PickupModule, LineModule],
  controllers: [
    AdminMeController,
    DashboardAdminController,
    ProductAdminController,
    ContentAdminController,
    OrderAdminController,
    UploadAdminController,
    FeatureFlagsAdminController,
    ContentBlocksAdminController,
    PickupAdminController,
  ],
  providers: [
    AdminAuthGuard,
    DashboardAdminService,
    ProductAdminService,
    ContentAdminService,
    OrderAdminService,
    UploadAdminService,
    FeatureFlagsAdminService,
    ContentBlocksAdminService,
  ],
})
export class AdminModule {}
