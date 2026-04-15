import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartContactDraftService } from './cart-contact-draft.service';

@Module({
  controllers: [CartController],
  providers: [CartService, CartContactDraftService],
  exports: [CartService, CartContactDraftService],
})
export class CartModule {}
