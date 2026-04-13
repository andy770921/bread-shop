import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OrderModule } from '../order/order.module';
import { LineModule } from '../line/line.module';

@Module({
  imports: [OrderModule, LineModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
