import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { ProductModule } from './product/product.module';
import { CategoryModule } from './category/category.module';
import { CartModule } from './cart/cart.module';
import { FavoriteModule } from './favorite/favorite.module';
import { OrderModule } from './order/order.module';
import { PickupModule } from './pickup/pickup.module';
import { LineModule } from './line/line.module';
import { UserModule } from './user/user.module';
import { AdminModule } from './admin/admin.module';
import { SiteContentModule } from './site-content/site-content.module';
import { ContentBlocksModule } from './content-blocks/content-blocks.module';
import { ShopSettingsModule } from './shop-settings/shop-settings.module';
import { SessionMiddleware } from './common/middleware/session.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SupabaseModule,
    ShopSettingsModule,
    AuthModule,
    ProductModule,
    CategoryModule,
    CartModule,
    FavoriteModule,
    OrderModule,
    PickupModule,
    LineModule,
    UserModule,
    AdminModule,
    SiteContentModule,
    ContentBlocksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes('api/*path');
  }
}
