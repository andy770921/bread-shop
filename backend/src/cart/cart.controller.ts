import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';

@ApiTags('Cart')
@Controller('api/cart')
@UseGuards(OptionalAuthGuard)
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  getCart(@Req() req: Request) {
    if (!req.sessionId) {
      return { items: [], subtotal: 0, shipping_fee: 0, total: 0, item_count: 0 };
    }
    return this.cartService.getCart(req.sessionId, req.user?.id);
  }

  @Post('items')
  addItem(@Req() req: Request, @Body() dto: AddToCartDto) {
    return this.cartService.addItem(req.sessionId!, dto.product_id, dto.quantity);
  }

  @Patch('items/:id')
  updateItem(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(req.sessionId!, id, dto.quantity, req.user?.id);
  }

  @Delete('items/:id')
  removeItem(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.cartService.removeItem(req.sessionId!, id, req.user?.id);
  }

  @Delete()
  clearCart(@Req() req: Request) {
    return this.cartService.clearCart(req.sessionId!, req.user?.id);
  }
}
