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
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CartService } from './cart.service';
import { CartContactDraftService } from './cart-contact-draft.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { UpsertCartContactDraftDto } from './dto/upsert-cart-contact-draft.dto';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';

@ApiTags('Cart')
@Controller('api/cart')
@UseGuards(OptionalAuthGuard)
export class CartController {
  constructor(
    private cartService: CartService,
    private cartContactDraftService: CartContactDraftService,
  ) {}

  @Get()
  getCart(@Req() req: Request) {
    if (!req.sessionId) {
      return {
        cart_id: null,
        version: 0,
        items: [],
        subtotal: 0,
        shipping_fee: 0,
        total: 0,
        item_count: 0,
      };
    }
    return this.cartService.getCart(req.sessionId, req.user?.id);
  }

  @Post('items')
  addItem(@Req() req: Request, @Body() dto: AddToCartDto) {
    return this.cartService.addItem(req.sessionId!, dto.product_id, dto.quantity, req.user?.id);
  }

  @Patch('items/:id')
  updateItem(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(req.sessionId!, id, dto.quantity, req.user?.id);
  }

  @Delete('items/:id')
  removeItem(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.cartService.removeItem(req.sessionId!, id, req.user?.id);
  }

  @Delete()
  clearCart(@Req() req: Request) {
    return this.cartService.clearCart(req.sessionId!, req.user?.id);
  }

  @Get('contact-draft')
  getContactDraft(@Req() req: Request) {
    if (!req.sessionId) return null;
    return this.cartContactDraftService.getForSession(req.sessionId);
  }

  @Put('contact-draft')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  updateContactDraft(@Req() req: Request, @Body() dto: UpsertCartContactDraftDto) {
    return this.cartContactDraftService.upsertForSession(
      req.sessionId!,
      req.user?.id,
      dto,
    );
  }

  @Delete('contact-draft')
  @HttpCode(204)
  clearContactDraft(@Req() req: Request) {
    if (!req.sessionId) return;
    return this.cartContactDraftService.clearForSession(req.sessionId);
  }
}
