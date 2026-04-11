# Implementation Plan: Database Schema (Supabase)

## Overview

All data stored in Supabase PostgreSQL. Authentication handled by Supabase Auth (`auth.users`). Application tables live in the `public` schema. The NestJS backend accesses Supabase with the **service role key** (bypasses RLS), so RLS policies are optional but included for direct Supabase client access from admin tools.

## Tables

### 1. profiles

Extends `auth.users` with application-specific fields.

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  preferred_language TEXT DEFAULT 'zh' CHECK (preferred_language IN ('zh', 'en')),
  line_user_id TEXT,           -- LINE userId for messaging
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Index
CREATE INDEX idx_profiles_line_user_id ON public.profiles(line_user_id) WHERE line_user_id IS NOT NULL;
```

### 2. categories

```sql
CREATE TABLE public.categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO public.categories (slug, name_zh, name_en, sort_order) VALUES
  ('toast', '吐司', 'Toast', 1),
  ('cake', '蛋糕', 'Cake', 2),
  ('cookie', '餅乾', 'Cookies', 3),
  ('bread', '麵包', 'Bread', 4),
  ('other', '其他', 'Other', 5);
```

### 3. products

```sql
CREATE TABLE public.products (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES public.categories(id),
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_zh TEXT,
  description_en TEXT,
  price INT NOT NULL,                -- NTD, integer (e.g., 120 = NT$120)
  image_url TEXT,
  badge_type TEXT CHECK (badge_type IN ('hot', 'new', 'seasonal')),
  badge_text_zh TEXT,                -- e.g., 'HOT', '季節限定', 'NEW'
  badge_text_en TEXT,                -- e.g., 'HOT', 'Seasonal', 'NEW'
  specs JSONB DEFAULT '[]'::jsonb,   -- [{label_zh, label_en, value_zh, value_en}]
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_active ON public.products(is_active) WHERE is_active = TRUE;

-- Seed data (matching design-home.html)
INSERT INTO public.products (category_id, name_zh, name_en, description_zh, description_en, price, image_url, badge_type, badge_text_zh, badge_text_en, specs) VALUES
(
  (SELECT id FROM categories WHERE slug = 'toast'),
  '香濃奶油吐司', 'Rich Butter Toast',
  '採用進口麵粉和天然奶油，每一片都軟綿綿。清晨現烤，香氣撲鼻，咬下去酥脆外殼與嫩滑內心完美融合。',
  'Made with imported flour and natural butter, each slice is soft and fluffy. Freshly baked at dawn.',
  120,
  'https://images.unsplash.com/photo-1598373182133-52452f7691ef?w=400',
  NULL, NULL, NULL,
  '[{"label_zh":"重量","label_en":"Weight","value_zh":"450g","value_en":"450g"},{"label_zh":"保鮮期","label_en":"Shelf Life","value_zh":"3天","value_en":"3 days"},{"label_zh":"製作時間","label_en":"Prep Time","value_zh":"12小時","value_en":"12 hours"}]'
),
(
  (SELECT id FROM categories WHERE slug = 'cake'),
  '草莓蛋糕', 'Strawberry Cake',
  '新鮮草莓搭配輕盈海綿蛋糕，層次豐富，酸酸甜甜。選用當季最飽滿的草莓，保證每一口都是驚喜。',
  'Fresh strawberries paired with light sponge cake. Rich layers with a sweet and tangy taste.',
  380,
  'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400',
  'seasonal', '季節限定', 'Seasonal',
  '[{"label_zh":"尺寸","label_en":"Size","value_zh":"6吋","value_en":"6 inch"},{"label_zh":"保鮮期","label_en":"Shelf Life","value_zh":"2天","value_en":"2 days"},{"label_zh":"適用","label_en":"Serves","value_zh":"4-6人","value_en":"4-6 people"}]'
),
(
  (SELECT id FROM categories WHERE slug = 'cookie'),
  '手工曲奇餅乾', 'Handmade Cookies',
  '黃油香氣濃郁，手工成形的曲奇餅乾，入口即化。每一塊都展現烘焙師的細膩手藝，是下午茶的完美搭配。',
  'Rich buttery aroma, handmade cookies that melt in your mouth. Perfect for afternoon tea.',
  180,
  'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400',
  'hot', 'HOT', 'HOT',
  '[{"label_zh":"數量","label_en":"Quantity","value_zh":"12片","value_en":"12 pcs"},{"label_zh":"保鮮期","label_en":"Shelf Life","value_zh":"7天","value_en":"7 days"},{"label_zh":"包裝","label_en":"Packaging","value_zh":"禮盒","value_en":"Gift Box"}]'
),
(
  (SELECT id FROM categories WHERE slug = 'bread'),
  '法式可頌', 'French Croissant',
  '法式傳統配方，層層酥脆。精選進口黃油，經過精心折疊，烤出來的可頌酥到掉渣，香氣能飄滿整間屋子。',
  'Traditional French recipe, layers of crispy pastry. Made with premium imported butter.',
  65,
  'https://images.unsplash.com/photo-1555507036-ab1f4038024a?w=400',
  NULL, NULL, NULL,
  '[{"label_zh":"重量","label_en":"Weight","value_zh":"85g","value_en":"85g"},{"label_zh":"製作","label_en":"Production","value_zh":"每日現做","value_en":"Daily Fresh"},{"label_zh":"最佳享用","label_en":"Best Before","value_zh":"當日","value_en":"Same Day"}]'
),
(
  (SELECT id FROM categories WHERE slug = 'other'),
  '巧克力布朗尼', 'Chocolate Brownie',
  '濃郁的比利時巧克力，外酥內軟的口感。每一口都是純粹的巧克力享受，適合搭配咖啡或茶。',
  'Rich Belgian chocolate, crispy outside and soft inside. Pure chocolate indulgence.',
  220,
  'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400',
  'new', 'NEW', 'NEW',
  '[{"label_zh":"重量","label_en":"Weight","value_zh":"200g","value_en":"200g"},{"label_zh":"保鮮期","label_en":"Shelf Life","value_zh":"5天","value_en":"5 days"},{"label_zh":"口感","label_en":"Texture","value_zh":"外酥內軟","value_en":"Crispy & Soft"}]'
),
(
  (SELECT id FROM categories WHERE slug = 'bread'),
  '肉鬆麵包', 'Pork Floss Bun',
  '台式經典口味，鬆軟麵包搭配香酥肉鬆和美乃滋。是小朋友最愛的下午點心，充滿記憶中的味道。',
  'Classic Taiwanese style, soft bread with savory pork floss and mayonnaise.',
  55,
  'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400',
  NULL, NULL, NULL,
  '[{"label_zh":"重量","label_en":"Weight","value_zh":"120g","value_en":"120g"},{"label_zh":"保鮮期","label_en":"Shelf Life","value_zh":"2天","value_en":"2 days"},{"label_zh":"風味","label_en":"Flavor","value_zh":"台式經典","value_en":"Taiwanese Classic"}]'
);
```

### 4. sessions

```sql
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')  -- 90 days (Review M-7: extended from 30)
);

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_sessions_expires ON public.sessions(expires_at);
```

### 5. cart_items

```sql
CREATE TABLE public.cart_items (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 99),  -- Review M-5: upper limit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, product_id)
);

CREATE INDEX idx_cart_items_session ON public.cart_items(session_id);
```

### 6. favorites

```sql
CREATE TABLE public.favorites (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX idx_favorites_user ON public.favorites(user_id);
```

### 7. orders

```sql
CREATE TABLE public.orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,         -- e.g., 'ORD-20260411-0001'
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'preparing', 'shipping', 'delivered', 'cancelled')),
  subtotal INT NOT NULL,                     -- NTD
  shipping_fee INT NOT NULL DEFAULT 0,
  total INT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  customer_address TEXT NOT NULL,
  notes TEXT,
  payment_method TEXT CHECK (payment_method IN ('lemon_squeezy', 'line')),
  payment_id TEXT,                           -- Lemon Squeezy order ID
  line_user_id TEXT,                         -- LINE userId (for messaging)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON public.orders(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_orders_number ON public.orders(order_number);
CREATE INDEX idx_orders_status ON public.orders(status);

-- Sequence for concurrency-safe order numbering (Review H-8)
CREATE SEQUENCE public.order_number_seq START 1;

-- Order number generation function (uses SEQUENCE to avoid race conditions)
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_val INT;
  today_str TEXT;
BEGIN
  today_str := TO_CHAR(NOW(), 'YYYYMMDD');
  seq_val := nextval('public.order_number_seq');
  NEW.order_number := 'ORD-' || today_str || '-' || LPAD(seq_val::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL)
  EXECUTE FUNCTION public.generate_order_number();
```

### 8. order_items

```sql
CREATE TABLE public.order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES public.products(id),
  product_name_zh TEXT NOT NULL,
  product_name_en TEXT NOT NULL,
  product_price INT NOT NULL,
  quantity INT NOT NULL,
  subtotal INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON public.order_items(order_id);
```

## Updated_at Trigger

```sql
-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

## Session Cleanup (Cron)

Use Supabase's `pg_cron` extension to clean expired sessions:

```sql
-- Enable pg_cron (in Supabase dashboard → Database → Extensions)
SELECT cron.schedule(
  'clean-expired-sessions',
  '0 3 * * *',  -- daily at 3 AM UTC
  $$DELETE FROM public.sessions WHERE expires_at < NOW()$$
);
```

## Entity Relationship Diagram

```
auth.users
    │
    ├── 1:1 ── profiles
    │
    ├── 1:N ── sessions ── 1:N ── cart_items ── N:1 ── products ── N:1 ── categories
    │
    ├── 1:N ── favorites ── N:1 ── products
    │
    └── 1:N ── orders ── 1:N ── order_items ── N:1 ── products
```

## Step-by-Step Implementation

### Step 1: Run migration via Supabase CLI (Review M-17)

Use Supabase CLI for repeatable migrations instead of manual SQL:

```bash
npx supabase migration new init_schema
# Paste all CREATE TABLE/FUNCTION/TRIGGER statements into the generated .sql file
npx supabase db push   # Apply to remote Supabase project
```

Alternatively, for initial setup, use Supabase Dashboard SQL Editor.

### Step 2: Seed categories and products

Run the `INSERT` statements for categories and products.

### Step 3: Verify with test queries

```sql
-- Verify products with categories
SELECT p.id, p.name_zh, c.name_zh as category, p.price
FROM products p JOIN categories c ON p.category_id = c.id
ORDER BY p.sort_order;

-- Verify session + cart flow
INSERT INTO sessions (id) VALUES ('test-session-uuid') RETURNING *;
INSERT INTO cart_items (session_id, product_id, quantity) VALUES ('test-session-uuid', 1, 2);
SELECT ci.*, p.name_zh, p.price, (ci.quantity * p.price) as line_total
FROM cart_items ci JOIN products p ON ci.product_id = p.id
WHERE ci.session_id = 'test-session-uuid';
-- Clean up test data after verification
```

## Dependencies

- Must complete before: backend-api.md, auth-and-cart-session.md
- Depends on: Supabase project setup (URL + service key in .env)

## Notes

- All prices are stored as integers in NTD (no decimal handling needed for TWD)
- Product `specs` uses JSONB for flexibility — each spec has bilingual labels and values
- The `sessions` table uses UUID as primary key for security (non-guessable)
- Order items snapshot product data at order time to preserve historical accuracy
- `ON DELETE SET NULL` on orders.user_id preserves order records even if user deletes account
