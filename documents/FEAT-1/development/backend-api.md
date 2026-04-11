# Implementation Plan: Backend API (NestJS)

## Overview

All backend NestJS modules, controllers, services, and DTOs for the Papa Bakery API. The backend uses Supabase as the database and auth provider, accessed via the `@supabase/supabase-js` client with the service role key.

## Module Structure

```
backend/src/
├── main.ts                          # Bootstrap (existing, modify)
├── app.module.ts                    # Root module (existing, modify)
├── app.controller.ts                # Health endpoint (existing, keep)
├── app.service.ts                   # Health service (existing, keep)
├── supabase/
│   ├── supabase.module.ts           # Global Supabase provider
│   └── supabase.service.ts          # Supabase client
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts           # Login, register, logout, LINE callback, me
│   ├── auth.service.ts              # Auth + session merge logic
│   ├── dto/
│   │   ├── login.dto.ts
│   │   └── register.dto.ts
│   └── guards/
│       ├── auth.guard.ts            # Requires valid JWT
│       └── optional-auth.guard.ts   # Allows guests
├── common/
│   ├── middleware/
│   │   └── session.middleware.ts     # Session cookie management
│   └── decorators/
│       ├── session.decorator.ts     # @SessionId()
│       └── current-user.decorator.ts # @CurrentUser()
├── product/
│   ├── product.module.ts
│   ├── product.controller.ts        # GET /api/products, GET /api/products/:id
│   └── product.service.ts
├── category/
│   ├── category.module.ts
│   ├── category.controller.ts       # GET /api/categories
│   └── category.service.ts
├── cart/
│   ├── cart.module.ts
│   ├── cart.controller.ts           # GET/POST/PATCH/DELETE /api/cart
│   ├── cart.service.ts
│   └── dto/
│       ├── add-to-cart.dto.ts
│       └── update-cart-item.dto.ts
├── favorite/
│   ├── favorite.module.ts
│   ├── favorite.controller.ts       # GET/POST/DELETE /api/favorites
│   └── favorite.service.ts
├── order/
│   ├── order.module.ts
│   ├── order.controller.ts          # POST/GET /api/orders
│   ├── order.service.ts
│   └── dto/
│       └── create-order.dto.ts
├── payment/
│   ├── payment.module.ts
│   ├── payment.controller.ts        # POST /api/payments/checkout, webhook
│   └── payment.service.ts
├── line/
│   ├── line.module.ts
│   ├── line.controller.ts           # POST /api/orders/:id/line-send
│   └── line.service.ts
└── user/
    ├── user.module.ts
    ├── user.controller.ts           # GET/PATCH /api/user/profile
    ├── user.service.ts
    └── dto/
        └── update-profile.dto.ts
```

## Step-by-Step Implementation

---

### Step 1: Install all backend dependencies

```bash
cd backend && npm install \
  @supabase/supabase-js \
  cookie-parser \
  uuid \
  @lemonsqueezy/lemonsqueezy.js \
  @line/bot-sdk \
  class-validator \
  class-transformer \
  @nestjs/throttler

cd backend && npm install -D \
  @types/cookie-parser \
  @types/uuid
```

### Step 2: Update main.ts

**File:** `backend/src/main.ts`

**Changes:**
- Add `cookie-parser` middleware
- Enable `rawBody` for webhook signature verification
- Add `class-validator` global pipe

```typescript
// Add imports
import * as cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

// Review C-4: enable rawBody for webhook signature verification
// NestJS 10+ stores raw body on req.rawBody alongside parsed JSON body
const app = await NestFactory.create(AppModule, {
  rawBody: true,
});

// Review H-5: explicit CORS allowlist (not origin: true)
app.enableCors({
  origin: [process.env.FRONTEND_URL || 'http://localhost:3001'],
  credentials: true,
});

app.use(cookieParser());
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

### Step 3: Create Supabase Module

(See auth-and-cart-session.md Steps 1-2 for full code)

### Step 4: Create Auth Module

(See auth-and-cart-session.md Steps 3-8 for full code)

**DTOs:**

**File:** `backend/src/auth/dto/login.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;
}
```

**File:** `backend/src/auth/dto/register.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  name?: string;
}
```

---

### Step 5: Create Product Module

**File:** `backend/src/product/product.service.ts`

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ProductService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll(categorySlug?: string) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('products')
      .select('*, category:categories(*)')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (categorySlug) {
      // Filter by category slug via join
      query = supabase
        .from('products')
        .select('*, category:categories!inner(*)')
        .eq('is_active', true)
        .eq('categories.slug', categorySlug)
        .order('sort_order', { ascending: true });
    }

    const { data, error } = await query;
    if (error) throw error;

    return { products: data };
  }

  async findOne(id: number) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('products')
      .select('*, category:categories(*)')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !data) throw new NotFoundException('Product not found');

    return data;
  }
}
```

**File:** `backend/src/product/product.controller.ts`

```typescript
import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { ProductService } from './product.service';

@ApiTags('Products')
@Controller('api/products')
export class ProductController {
  constructor(private productService: ProductService) {}

  @Get()
  @ApiQuery({ name: 'category', required: false, description: 'Category slug' })
  findAll(@Query('category') category?: string) {
    return this.productService.findAll(category);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findOne(id);
  }
}
```

---

### Step 6: Create Category Module

**File:** `backend/src/category/category.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CategoryService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return { categories: data };
  }
}
```

**File:** `backend/src/category/category.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';

@ApiTags('Categories')
@Controller('api/categories')
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  @Get()
  findAll() {
    return this.categoryService.findAll();
  }
}
```

---

### Step 7: Create Cart Module

**File:** `backend/src/cart/dto/add-to-cart.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, Max } from 'class-validator';

export class AddToCartDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  product_id: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  @Max(99)  // Review M-5: quantity upper limit
  quantity: number;
}
```

**File:** `backend/src/cart/dto/update-cart-item.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, Max } from 'class-validator';

export class UpdateCartItemDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @IsPositive()
  @Max(99)  // Review M-5: quantity upper limit
  quantity: number;
}
```

**File:** `backend/src/cart/cart.service.ts`

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CartService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get the effective session ID(s) for the current user.
   * - Guest: returns [sessionId from cookie]
   * - Authenticated: returns all session IDs for this user
   */
  private async getSessionIds(sessionId: string, userId?: string): Promise<string[]> {
    if (!userId) return [sessionId];

    const supabase = this.supabaseService.getClient();
    const { data } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', userId);

    return data?.map(s => s.id) || [sessionId];
  }

  async getCart(sessionId: string, userId?: string) {
    const supabase = this.supabaseService.getClient();
    const sessionIds = await this.getSessionIds(sessionId, userId);

    const { data: items, error } = await supabase
      .from('cart_items')
      .select(`
        id,
        session_id,
        product_id,
        quantity,
        product:products(
          id,
          name_zh,
          name_en,
          price,
          image_url,
          category:categories(name_zh, name_en)
        )
      `)
      .in('session_id', sessionIds)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Review H-2: omit session_id from response (internal field)
    const cartItems = (items || []).map(item => ({
      id: item.id,
      product_id: item.product_id,
      quantity: item.quantity,
      product: {
        id: item.product.id,
        name_zh: item.product.name_zh,
        name_en: item.product.name_en,
        price: item.product.price,
        image_url: item.product.image_url,
        category_name_zh: item.product.category.name_zh,
        category_name_en: item.product.category.name_en,
      },
      line_total: item.quantity * item.product.price,
    }));

    const subtotal = cartItems.reduce((sum, item) => sum + item.line_total, 0);
    const shipping_fee = subtotal >= 500 ? 0 : 60;

    return {
      items: cartItems,
      subtotal,
      shipping_fee,
      total: subtotal + shipping_fee,
      item_count: cartItems.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  async addItem(sessionId: string, productId: number, quantity: number) {
    const supabase = this.supabaseService.getClient();

    // Validate product exists and is active
    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (!product) throw new BadRequestException('Product not found or inactive');

    // Upsert: if product already in cart, increase quantity
    const { data: existing } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('session_id', sessionId)
      .eq('product_id', productId)
      .single();

    if (existing) {
      await supabase
        .from('cart_items')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('cart_items')
        .insert({ session_id: sessionId, product_id: productId, quantity });
    }

    return this.getCart(sessionId);
  }

  async updateItem(sessionId: string, cartItemId: number, quantity: number, userId?: string) {
    const supabase = this.supabaseService.getClient();
    const sessionIds = await this.getSessionIds(sessionId, userId);

    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity })
      .eq('id', cartItemId)
      .in('session_id', sessionIds)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Cart item not found');

    return this.getCart(sessionId, userId);
  }

  async removeItem(sessionId: string, cartItemId: number, userId?: string) {
    const supabase = this.supabaseService.getClient();
    const sessionIds = await this.getSessionIds(sessionId, userId);

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', cartItemId)
      .in('session_id', sessionIds);

    if (error) throw error;

    return this.getCart(sessionId, userId);
  }

  async clearCart(sessionId: string, userId?: string) {
    const supabase = this.supabaseService.getClient();
    const sessionIds = await this.getSessionIds(sessionId, userId);

    await supabase
      .from('cart_items')
      .delete()
      .in('session_id', sessionIds);

    // Review H-3: empty cart should have 0 shipping and 0 total
    return { items: [], subtotal: 0, shipping_fee: 0, total: 0, item_count: 0 };
  }
}
```

**File:** `backend/src/cart/cart.controller.ts`

```typescript
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
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
    return this.cartService.getCart(req.sessionId!, req.user?.id);
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
```

---

### Step 8: Create Favorite Module

**File:** `backend/src/favorite/favorite.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class FavoriteService {
  constructor(private supabaseService: SupabaseService) {}

  async getAll(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data } = await supabase
      .from('favorites')
      .select('product_id')
      .eq('user_id', userId);

    return { product_ids: data?.map(f => f.product_id) || [] };
  }

  async add(userId: string, productId: number) {
    const supabase = this.supabaseService.getClient();

    await supabase
      .from('favorites')
      .upsert(
        { user_id: userId, product_id: productId },
        { onConflict: 'user_id,product_id' },
      );

    return { success: true };
  }

  async remove(userId: string, productId: number) {
    const supabase = this.supabaseService.getClient();

    await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);

    return { success: true };
  }
}
```

**File:** `backend/src/favorite/favorite.controller.ts`

```typescript
import { Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FavoriteService } from './favorite.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Favorites')
@Controller('api/favorites')
@UseGuards(AuthGuard)
export class FavoriteController {
  constructor(private favoriteService: FavoriteService) {}

  @Get()
  getAll(@CurrentUser() user: any) {
    return this.favoriteService.getAll(user.id);
  }

  @Post(':productId')
  add(@CurrentUser() user: any, @Param('productId', ParseIntPipe) productId: number) {
    return this.favoriteService.add(user.id, productId);
  }

  @Delete(':productId')
  remove(@CurrentUser() user: any, @Param('productId', ParseIntPipe) productId: number) {
    return this.favoriteService.remove(user.id, productId);
  }
}
```

---

### Step 9: Create Order Module

**File:** `backend/src/order/dto/create-order.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: '周小明' })
  @IsString()
  customer_name: string;

  @ApiProperty({ example: '0912345678' })
  @IsString()
  customer_phone: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  customer_email?: string;

  @ApiProperty({ example: '台北市信義區信義路五段7號' })
  @IsString()
  customer_address: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ enum: ['lemon_squeezy', 'line'] })
  @IsIn(['lemon_squeezy', 'line'])
  payment_method: 'lemon_squeezy' | 'line';
}
```

**File:** `backend/src/order/order.service.ts`

```typescript
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CartService } from '../cart/cart.service';

@Injectable()
export class OrderService {
  constructor(
    private supabaseService: SupabaseService,
    private cartService: CartService,
  ) {}

  async createOrder(
    sessionId: string,
    userId: string | null,
    dto: {
      customer_name: string;
      customer_phone: string;
      customer_email?: string;
      customer_address: string;
      notes?: string;
      payment_method: 'lemon_squeezy' | 'line';
    },
  ) {
    const supabase = this.supabaseService.getClient();

    // 1. Get current cart
    const cart = await this.cartService.getCart(sessionId, userId || undefined);

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Review H-12: validate all products are still active before creating order
    const supabase = this.supabaseService.getClient();
    const productIds = cart.items.map(i => i.product_id);
    const { data: activeProducts } = await supabase
      .from('products')
      .select('id')
      .in('id', productIds)
      .eq('is_active', true);
    const activeIds = new Set(activeProducts?.map(p => p.id) || []);
    const inactiveItems = cart.items.filter(i => !activeIds.has(i.product_id));
    if (inactiveItems.length > 0) {
      throw new BadRequestException(
        `Some products are no longer available: ${inactiveItems.map(i => i.product.name_zh).join(', ')}`,
      );
    }

    // 2. Create order (order_number auto-generated by trigger)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        status: 'pending',
        subtotal: cart.subtotal,
        shipping_fee: cart.shipping_fee,
        total: cart.total,
        customer_name: dto.customer_name,
        customer_phone: dto.customer_phone,
        customer_email: dto.customer_email,
        customer_address: dto.customer_address,
        notes: dto.notes,
        payment_method: dto.payment_method,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 3. Create order items (snapshot)
    const orderItems = cart.items.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name_zh: item.product.name_zh,
      product_name_en: item.product.name_en,
      product_price: item.product.price,
      quantity: item.quantity,
      subtotal: item.line_total,
    }));

    await supabase.from('order_items').insert(orderItems);

    // 4. Clear cart
    await this.cartService.clearCart(sessionId, userId || undefined);

    // 5. Return order with items
    return this.getOrderById(order.id, userId);
  }

  async getOrderById(orderId: number, userId?: string | null) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.single();

    if (error || !data) throw new NotFoundException('Order not found');

    return data;
  }

  async getOrdersByUser(userId: string) {
    const supabase = this.supabaseService.getClient();

    // Review M-1: explicit columns, omit internal fields (user_id, payment_id, line_user_id)
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, subtotal, shipping_fee, total, customer_name, payment_method, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { orders: data };
  }
}
```

**File:** `backend/src/order/order.controller.ts`

```typescript
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
    return this.orderService.createOrder(
      req.sessionId!,
      req.user?.id || null,
      dto,
    );
  }

  @Get()
  @UseGuards(AuthGuard)
  findAll(@CurrentUser() user: any) {
    return this.orderService.getOrdersByUser(user.id);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  findOne(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.orderService.getOrderById(id, user.id);
  }
}
```

---

### Step 10: Create User Module

**File:** `backend/src/user/dto/update-profile.dto.ts`

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: '周小明' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: ['zh', 'en'] })
  @IsOptional()
  @IsIn(['zh', 'en'])
  preferred_language?: 'zh' | 'en';
}
```

**File:** `backend/src/user/user.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class UserService {
  constructor(private supabaseService: SupabaseService) {}

  async getProfile(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    const { data: { user } } = await supabase.auth.admin.getUserById(userId);

    return {
      id: userId,
      email: user?.email || '',
      name: data?.name || null,
      phone: data?.phone || null,
      preferred_language: data?.preferred_language || 'zh',
    };
  }

  async updateProfile(userId: string, updates: { name?: string; phone?: string; preferred_language?: string }) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    return data;
  }
}
```

**File:** `backend/src/user/user.controller.ts`

```typescript
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('User')
@Controller('api/user')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: any) {
    return this.userService.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(user.id, dto);
  }
}
```

---

### Step 11: Update AppModule

**File:** `backend/src/app.module.ts`

```typescript
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
import { PaymentModule } from './payment/payment.module';
import { LineModule } from './line/line.module';
import { UserModule } from './user/user.module';
import { SessionMiddleware } from './common/middleware/session.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    AuthModule,
    ProductModule,
    CategoryModule,
    CartModule,
    FavoriteModule,
    OrderModule,
    PaymentModule,
    LineModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SessionMiddleware)
      .exclude('api/webhooks/(.*)') // Review H-6: exclude webhook routes
      .forRoutes('api/*');
  }
}
```

---

### Step 12: Update CORS in main.ts

Ensure `credentials: true` is set (already exists) and that the frontend origin is allowed:

```typescript
app.enableCors({
  origin: [process.env.FRONTEND_URL || 'http://localhost:3001'],
  credentials: true,
});
```

## Testing Steps

1. `cd backend && npm run build` — Verify compilation
2. `cd backend && npm run test` — Run unit tests
3. Start backend, visit Swagger at `http://localhost:3000` — Verify all endpoints documented
4. Use Swagger or curl to test each endpoint:
   - `GET /api/products` — returns product list
   - `POST /api/cart/items` — adds item (check cookie set)
   - `GET /api/cart` — returns cart with computed totals
   - `POST /api/auth/register` — creates user
   - `POST /api/auth/login` — returns tokens, merges cart
   - `GET /api/auth/me` — returns user profile
   - `POST /api/favorites/1` — adds favorite
   - `POST /api/orders` — creates order from cart

## Dependencies

- Depends on: database-schema.md, shared-types.md, auth-and-cart-session.md
- Must complete before: frontend-ui.md (frontend needs backend APIs)

## Module Declarations (Review H-13)

Each module needs a `@Module()` file. Key dependency: `CartModule` must export `CartService` so `OrderModule` can inject it.

```typescript
// cart/cart.module.ts
@Module({
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService], // exported for OrderModule
})
export class CartModule {}

// order/order.module.ts
@Module({
  imports: [CartModule], // imports CartService
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}

// All other modules follow the same simple pattern:
// @Module({ controllers: [XController], providers: [XService] })
```

Guards (`AuthGuard`, `OptionalAuthGuard`) inject `SupabaseService` from the global `SupabaseModule` — they work via NestJS DI without explicit imports.

## Consolidated Environment Variables (Review M-15)

Complete `backend/.env.example`:

```
# Server
NODE_ENV=development
PORT=3000

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# URLs
FRONTEND_URL=http://localhost:3001
BACKEND_URL=http://localhost:3000

# Lemon Squeezy
LEMON_SQUEEZY_API_KEY=
LEMON_SQUEEZY_STORE_ID=
LEMON_SQUEEZY_VARIANT_ID=
LEMON_SQUEEZY_WEBHOOK_SECRET=

# LINE
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
```

## Supabase Type Generation (Review M-11)

Generate typed Supabase client for type-safe queries:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > backend/src/supabase/database.types.ts
```

Update `SupabaseService`:

```typescript
import { Database } from './database.types';

this.client = createClient<Database>(url, key);
```

## Notes

- Each module follows NestJS conventions: `Module` → `Controller` → `Service`
- All DTOs use `class-validator` for input validation and `@nestjs/swagger` for API docs
- The `OptionalAuthGuard` is used on endpoints accessible by both guests and authenticated users (cart, order creation)
- The `AuthGuard` is used on endpoints requiring authentication (favorites, order history, profile)
- Cart prices are always computed from the database — never trust client-submitted prices
- **Review C-1:** Payment and LINE send endpoints must verify order ownership by checking `session_id` or `user_id` on the order (see payment-and-line.md for updated code)
- **Review C-3:** Add a public `GET /api/orders/by-number/:orderNumber` endpoint returning limited info (status, total) for the checkout success page, in case the session cookie was lost mid-redirect
- **Review M-4:** Install `@nestjs/throttler` and apply `@Throttle(5, 60)` to login/register endpoints to prevent brute-force attacks
- **Review M-8:** Guards inject SupabaseService from the global SupabaseModule — no explicit import needed in each consuming module
- **Review M-16:** For Vercel serverless, lazy session creation (see auth-and-cart-session.md) and Supabase connection pooling (`?pgbouncer=true`) help stay within the 10s timeout
