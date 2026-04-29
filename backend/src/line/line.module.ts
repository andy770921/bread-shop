import { Module } from '@nestjs/common';
import { LineService } from './line.service';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [OrderModule],
  providers: [LineService],
  exports: [LineService],
})
export class LineModule {}
