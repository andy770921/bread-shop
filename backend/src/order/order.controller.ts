import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Orders')
@Controller('api/orders')
export class OrderController {
  constructor(private orderService: OrderService) {}

  @Post()
  @UseGuards(OptionalAuthGuard)
  create(@Req() req: Request, @Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(req.sessionId!, req.user?.id || null, dto);
  }

  @Get()
  @UseGuards(AuthGuard)
  findAll(@CurrentUser() user: any) {
    return this.orderService.getOrdersByUser(user.id);
  }

  @Get('by-number/:orderNumber')
  findByNumber(@Param('orderNumber') orderNumber: string) {
    return this.orderService.getOrderByNumber(orderNumber);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  findOne(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.orderService.getOrderById(id, user.id);
  }
}
