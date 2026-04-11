# Implementation Plan: Frontend UI (Next.js)

## Overview

Complete frontend implementation using Next.js 15 (App Router), shadcn/ui components, TanStack Query for data fetching, next-intl for i18n, and a CSS custom property theme system matching the design tokens.

## Directory Structure

```
frontend/src/
├── app/
│   ├── layout.tsx                    # Root layout (modify)
│   ├── page.tsx                      # Home page (rewrite)
│   ├── providers.tsx                 # Provider stack (modify)
│   ├── globals.css                   # Global styles + theme tokens (rewrite)
│   ├── cart/
│   │   └── page.tsx                  # Cart page
│   ├── auth/
│   │   ├── login/page.tsx            # Login page
│   │   ├── register/page.tsx         # Register page
│   │   └── callback/page.tsx         # LINE OAuth callback
│   ├── profile/
│   │   └── page.tsx                  # User profile (auth required)
│   ├── orders/
│   │   ├── page.tsx                  # Order list (auth required)
│   │   └── [id]/page.tsx             # Order detail
│   └── checkout/
│       └── success/page.tsx          # Post-payment success
├── components/
│   ├── layout/
│   │   ├── header.tsx                # Sticky header (logo, nav, actions)
│   │   ├── footer.tsx                # Footer
│   │   └── seasonal-banner.tsx       # Promo banner
│   ├── product/
│   │   ├── product-card.tsx          # Grid view card
│   │   ├── product-editorial.tsx     # Editorial view item
│   │   ├── product-grid.tsx          # Grid container
│   │   ├── product-showcase.tsx      # Editorial container
│   │   ├── category-pills.tsx        # Category filter
│   │   └── view-toggle.tsx           # Grid/editorial toggle
│   ├── cart/
│   │   ├── cart-item.tsx             # Single cart item row
│   │   ├── cart-items-list.tsx       # Cart items section
│   │   ├── customer-form.tsx         # Customer info form
│   │   ├── order-summary.tsx         # Sidebar summary
│   │   └── empty-cart.tsx            # Empty state
│   ├── auth/
│   │   ├── login-form.tsx            # Email login form
│   │   ├── register-form.tsx         # Registration form
│   │   └── auth-guard.tsx            # Client-side route protection
│   ├── ui/                           # shadcn/ui components (auto-generated)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── dialog.tsx
│   │   ├── toast.tsx
│   │   ├── skeleton.tsx
│   │   ├── separator.tsx
│   │   ├── select.tsx
│   │   └── ...
│   └── shared/
│       ├── notification.tsx          # Toast notification
│       ├── dark-mode-toggle.tsx      # Sun/moon toggle
│       └── language-toggle.tsx       # ZH/EN toggle
├── hooks/
│   ├── use-auth.ts                   # Auth state management
│   ├── use-cart.ts                   # Cart state via TanStack Query
│   └── use-favorites.ts             # Favorites state
├── queries/
│   ├── use-health.ts                 # (existing, keep)
│   ├── use-products.ts               # Product list query
│   ├── use-categories.ts             # Category list query
│   ├── use-cart.ts                   # Cart query + mutations
│   ├── use-favorites.ts             # Favorites query + mutations
│   ├── use-orders.ts                # Orders query
│   └── use-profile.ts              # Profile query + mutation
├── lib/
│   ├── api-client.ts                 # (existing, extend)
│   └── auth-context.tsx              # Auth context provider
├── i18n/
│   ├── config.ts                     # i18n configuration
│   ├── zh.json                       # Chinese translations
│   └── en.json                       # English translations
├── styles/
│   └── tokens.css                    # Design token CSS custom properties
└── utils/
    └── fetchers/                     # (existing, keep)
```

## Step-by-Step Implementation

---

### Step 1: Install dependencies

```bash
cd frontend && npm install \
  next-intl \
  next-themes \
  @supabase/supabase-js \
  zustand \
  lucide-react \
  clsx \
  tailwind-merge

# Install shadcn/ui CLI and init
cd frontend && npx shadcn@latest init
# Choose: New York style, Zinc base color, CSS variables: yes

# Add required shadcn components
cd frontend && npx shadcn@latest add \
  button input card badge dialog toast skeleton separator select \
  form label textarea dropdown-menu sheet avatar
```

### Step 2: Set up Tailwind CSS with design tokens

**File:** `frontend/src/app/globals.css`

Map the design tokens from `design-token.md` to CSS custom properties used by shadcn/ui's Tailwind config:

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Papa Bakery — Light Mode (from design-token.md) */
    --background: 30 33% 98%;          /* #FDFBF9 → bg-body */
    --foreground: 20 42% 8%;           /* #1A110B → text-primary */

    --card: 0 0% 100%;                 /* #FFFFFF → bg-surface */
    --card-foreground: 20 42% 8%;

    --popover: 0 0% 100%;
    --popover-foreground: 20 42% 8%;

    --primary: 24 50% 59%;             /* #D4885A → primary-500 */
    --primary-foreground: 30 33% 98%;  /* #FDFBF9 → text-inverse */

    --secondary: 30 50% 95%;           /* #FEF5E8 → primary-100 */
    --secondary-foreground: 24 53% 40%; /* #9D5F31 → primary-700 */

    --muted: 30 20% 95%;               /* #FAF8F5 → bg-elevated */
    --muted-foreground: 24 10% 39%;    /* #6F645A → text-secondary */

    --accent: 30 50% 95%;
    --accent-foreground: 24 53% 40%;

    --destructive: 0 73% 51%;          /* #DC2626 → error-500 */
    --destructive-foreground: 0 0% 100%;

    --border: 30 14% 88%;              /* #E8E2D9 → border-light */
    --input: 30 12% 80%;               /* #D6CCC0 → border-default */
    --ring: 24 50% 59%;                /* primary-500 */

    --radius: 0.5rem;

    /* Extended Papa Bakery tokens */
    --primary-50: #FFFBF5;
    --primary-100: #FEF5E8;
    --primary-200: #FDE8D4;
    --primary-300: #F9D4B0;
    --primary-400: #F5BB87;
    --primary-500: #D4885A;
    --primary-600: #C07545;
    --primary-700: #9D5F31;
    --primary-800: #7A4620;
    --primary-900: #5C3D1E;

    --neutral-50: #FDFBF9;
    --neutral-100: #FAF8F5;
    --neutral-800: #3D281A;

    --success-500: #52B788;
    --warning-500: #F5A623;
    --error-500: #DC2626;

    --shadow-sm: 0 1px 3px rgba(26,17,11,0.10);
    --shadow-md: 0 4px 12px rgba(26,17,11,0.08);
    --shadow-lg: 0 10px 24px rgba(26,17,11,0.12);
    --shadow-xl: 0 20px 40px rgba(26,17,11,0.15);

    --bg-footer: #3D281A;
    --checkout-gradient: linear-gradient(135deg, #D4885A 0%, #C07545 100%);
    --banner-gradient: linear-gradient(135deg, #F5A623 0%, #D4885A 50%, #C07545 100%);
  }

  .dark {
    --background: 15 19% 7%;           /* #161110 → bg-body dark */
    --foreground: 25 40% 96%;          /* #FAF5F0 → text-primary dark */

    --card: 20 20% 9%;                 /* #1E1712 → bg-surface dark */
    --card-foreground: 25 40% 96%;

    --popover: 20 20% 9%;
    --popover-foreground: 25 40% 96%;

    --primary: 24 60% 63%;             /* #E0965F → primary-500 dark */
    --primary-foreground: 0 0% 100%;

    --secondary: 20 25% 12%;           /* #2A1E14 → primary-50 dark */
    --secondary-foreground: 24 47% 63%; /* #D49A6A → primary-400 dark */

    --muted: 20 20% 13%;               /* #2A2018 → bg-elevated dark */
    --muted-foreground: 25 14% 70%;    /* #C4B8AB → text-secondary dark */

    --accent: 20 25% 12%;
    --accent-foreground: 24 47% 63%;

    --destructive: 0 84% 60%;          /* #EF4444 → error-500 dark */
    --destructive-foreground: 0 0% 100%;

    --border: 20 19% 20%;              /* #3D3028 → border-light dark */
    --input: 20 15% 30%;               /* #5A4D42 → border-default dark */
    --ring: 24 60% 63%;

    /* Extended dark tokens */
    --primary-50: #2A1E14;
    --primary-100: #3A2A1C;
    --primary-200: #4D3825;
    --primary-300: #6B4E34;
    --primary-400: #D49A6A;
    --primary-500: #E0965F;
    --primary-600: #C8824E;
    --primary-700: #F0B080;
    --primary-800: #F5C8A0;
    --primary-900: #FAE0C8;

    --neutral-50: #161110;
    --neutral-100: #1E1712;
    --neutral-800: #E8DDD2;

    --success-500: #6BCCA0;
    --warning-500: #F5B840;
    --error-500: #EF4444;

    --shadow-sm: 0 1px 3px rgba(0,0,0,0.30);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.25);
    --shadow-lg: 0 10px 24px rgba(0,0,0,0.35);
    --shadow-xl: 0 20px 40px rgba(0,0,0,0.45);

    --bg-footer: #0E0A08;
    --checkout-gradient: linear-gradient(135deg, #E0965F 0%, #C8824E 100%);
    --banner-gradient: linear-gradient(135deg, #C07545 0%, #9D5F31 50%, #7A4620 100%);
  }
}

@layer base {
  body {
    @apply bg-background text-foreground;
    font-family: system-ui, -apple-system, sans-serif;
    transition: background-color 400ms ease-in-out, color 400ms ease-in-out;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: 'Noto Serif TC', serif;
    font-weight: 700;
  }
}
```

---

### Step 3: Set up i18n

**File:** `frontend/src/i18n/config.ts`

```typescript
export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh';
```

**File:** `frontend/src/i18n/zh.json`

```json
{
  "nav": {
    "home": "首頁",
    "about": "關於我們",
    "contact": "聯絡我們",
    "login": "登入/註冊",
    "logout": "登出",
    "cart": "購物車",
    "profile": "個人資料",
    "orders": "訂單記錄"
  },
  "home": {
    "title": "周爸烘焙坊",
    "subtitle": "用心烘焙，傳遞幸福",
    "allCategories": "全部",
    "editorialToggle": "介紹",
    "addToCart": "加入購物車",
    "addedToCart": "已加入購物車"
  },
  "cart": {
    "title": "購物車",
    "empty": "購物車是空的",
    "emptyDesc": "探索我們的烘焙產品，找到您喜歡的商品。",
    "startShopping": "開始購物",
    "subtotal": "小計",
    "shipping": "運費",
    "freeShipping": "免運費",
    "freeShippingNote": "滿NT$500免運費",
    "total": "總計",
    "orderSummary": "訂單摘要",
    "customerInfo": "訂購資訊",
    "name": "姓名",
    "phone": "電話",
    "email": "電子郵件",
    "address": "地址",
    "notes": "備註",
    "creditCard": "信用卡付款",
    "linePay": "透過 LINE 聯繫",
    "continueShopping": "繼續購物",
    "remove": "移除"
  },
  "process": {
    "title": "製作過程",
    "step1Title": "嚴選原料",
    "step1Desc": "選用全球頂級食材，確保每份產品的品質",
    "step2Title": "精心製作",
    "step2Desc": "資深烘焙師傅手工製作，用心打造每一份",
    "step3Title": "耐心發酵",
    "step3Desc": "遵循傳統工藝，充分發酵帶出最佳風味",
    "step4Title": "每日現烤",
    "step4Desc": "清晨現烤，保證最新鮮的品質和風味"
  },
  "story": {
    "title": "周爸的故事",
    "p1": "在台灣中部一個安靜的小鎮，周爸用30年的烘焙經驗，打造出「周爸烘焙坊」。",
    "p2": "選用進口麵粉與天然酵種，每一口都能嘗到新鮮與誠意。"
  },
  "banner": {
    "text": "🎉 限時優惠：滿NT$500享免運"
  },
  "auth": {
    "login": "登入",
    "register": "註冊",
    "email": "電子郵件",
    "password": "密碼",
    "loginWithLine": "使用 LINE 登入",
    "noAccount": "還沒有帳號？",
    "hasAccount": "已有帳號？"
  }
}
```

**File:** `frontend/src/i18n/en.json`

```json
{
  "nav": {
    "home": "Home",
    "about": "About",
    "contact": "Contact",
    "login": "Login/Register",
    "logout": "Logout",
    "cart": "Cart",
    "profile": "Profile",
    "orders": "Orders"
  },
  "home": {
    "title": "Papa Bakery",
    "subtitle": "Baked with heart, shared with love",
    "allCategories": "All",
    "editorialToggle": "Intro",
    "addToCart": "Add to Cart",
    "addedToCart": "Added to Cart"
  },
  "cart": {
    "title": "Shopping Cart",
    "empty": "Your cart is empty",
    "emptyDesc": "Explore our bakery products and find something you like.",
    "startShopping": "Start Shopping",
    "subtotal": "Subtotal",
    "shipping": "Shipping",
    "freeShipping": "Free Shipping",
    "freeShippingNote": "Free shipping on orders over NT$500",
    "total": "Total",
    "orderSummary": "Order Summary",
    "customerInfo": "Customer Info",
    "name": "Name",
    "phone": "Phone",
    "email": "Email",
    "address": "Address",
    "notes": "Notes",
    "creditCard": "Pay with Credit Card",
    "linePay": "Contact via LINE",
    "continueShopping": "Continue Shopping",
    "remove": "Remove"
  },
  "process": {
    "title": "Our Process",
    "step1Title": "Premium Ingredients",
    "step1Desc": "Selecting top-tier ingredients from around the world",
    "step2Title": "Handcrafted",
    "step2Desc": "Made by experienced bakers with care and precision",
    "step3Title": "Patient Fermentation",
    "step3Desc": "Traditional techniques for the best flavor",
    "step4Title": "Freshly Baked Daily",
    "step4Desc": "Baked every morning for guaranteed freshness"
  },
  "story": {
    "title": "Papa's Story",
    "p1": "In a quiet town in central Taiwan, Papa built Papa Bakery with 30 years of baking experience.",
    "p2": "Using imported flour and natural starters, every bite is full of freshness and sincerity."
  },
  "banner": {
    "text": "🎉 Limited Offer: Free Shipping on Orders Over NT$500"
  },
  "auth": {
    "login": "Login",
    "register": "Register",
    "email": "Email",
    "password": "Password",
    "loginWithLine": "Login with LINE",
    "noAccount": "Don't have an account?",
    "hasAccount": "Already have an account?"
  }
}
```

---

### Step 4: Create Auth Context

**File:** `frontend/src/lib/auth-context.tsx`

```typescript
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { MeResponse } from '@repo/shared';

interface AuthContextType {
  user: MeResponse | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    // Check for stored token on mount
    const stored = localStorage.getItem('access_token');
    if (stored) {
      setToken(stored);
      fetchUser(stored);
    } else {
      setIsLoading(false);
    }
  }, []);

  async function fetchUser(accessToken: string) {
    try {
      const res = await fetch(`${apiUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (res.ok) {
        setUser(await res.json());
      } else {
        localStorage.removeItem('access_token');
        setToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await res.json()).message);
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    setToken(data.access_token);
    await fetchUser(data.access_token);
  }

  async function register(email: string, password: string, name?: string) {
    const res = await fetch(`${apiUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) throw new Error((await res.json()).message);
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    setToken(data.access_token);
    await fetchUser(data.access_token);
  }

  async function logout() {
    await fetch(`${apiUrl}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    localStorage.removeItem('access_token');
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    if (token) await fetchUser(token);
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

---

### Step 5: Create i18n hook (simple approach)

**File:** `frontend/src/hooks/use-locale.ts`

```typescript
'use client';

import { useState, useCallback } from 'react';
import zhMessages from '../i18n/zh.json';
import enMessages from '../i18n/en.json';
import { Locale } from '../i18n/config';

const messages: Record<Locale, typeof zhMessages> = { zh: zhMessages, en: enMessages };

export function useLocale() {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('locale') as Locale) || 'zh';
    }
    return 'zh';
  });

  const t = useCallback(
    (key: string): string => {
      const keys = key.split('.');
      let result: any = messages[locale];
      for (const k of keys) {
        result = result?.[k];
      }
      return result || key;
    },
    [locale],
  );

  const toggleLocale = useCallback(() => {
    const next = locale === 'zh' ? 'en' : 'zh';
    setLocale(next);
    localStorage.setItem('locale', next);
  }, [locale]);

  return { locale, t, toggleLocale };
}
```

---

### Step 6: Create TanStack Query hooks

**File:** `frontend/src/queries/use-products.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { ProductListResponse } from '@repo/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export function useProducts(category?: string) {
  const params = category ? `?category=${category}` : '';

  return useQuery<ProductListResponse>({
    queryKey: ['products', category || 'all'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/products${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
  });
}
```

**File:** `frontend/src/queries/use-cart.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CartResponse } from '@repo/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useCart() {
  return useQuery<CartResponse>({
    queryKey: ['cart'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/cart`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch cart');
      return res.json();
    },
  });
}

export function useAddToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, quantity }: { productId: number; quantity: number }) => {
      const res = await fetch(`${API_URL}/api/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ product_id: productId, quantity }),
      });
      if (!res.ok) throw new Error('Failed to add to cart');
      return res.json();
    },
    // Review M-13: use returned data directly instead of invalidating (avoids double-fetch)
    onSuccess: (data) => {
      queryClient.setQueryData(['cart'], data);
    },
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: number; quantity: number }) => {
      const res = await fetch(`${API_URL}/api/cart/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ quantity }),
      });
      if (!res.ok) throw new Error('Failed to update cart');
      return res.json();
    },
    // Review M-13: use returned data directly
    onSuccess: (data) => {
      queryClient.setQueryData(['cart'], data);
    },
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: number) => {
      const res = await fetch(`${API_URL}/api/cart/items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to remove item');
      return res.json();
    },
    // Review M-13: use returned data directly
    onSuccess: (data) => {
      queryClient.setQueryData(['cart'], data);
    },
  });
}
```

**File:** `frontend/src/queries/use-favorites.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FavoriteListResponse } from '@repo/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

export function useFavorites(enabled = false) {
  return useQuery<FavoriteListResponse>({
    queryKey: ['favorites'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/favorites`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch favorites');
      return res.json();
    },
    enabled, // Only fetch when user is logged in
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, isFavorited }: { productId: number; isFavorited: boolean }) => {
      const method = isFavorited ? 'DELETE' : 'POST';
      const res = await fetch(`${API_URL}/api/favorites/${productId}`, {
        method,
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to toggle favorite');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
```

---

### Step 7: Build key components

**File:** `frontend/src/components/layout/header.tsx`

Key elements:
- Logo: "周爸烘焙坊" / "Papa Bakery" (based on locale)
- Nav: Home, About, Contact
- Actions: Language toggle (EN/中), Dark mode toggle (sun/moon), Auth button, Cart icon with badge
- Sticky header with `position: sticky; top: 0`
- Uses shadcn/ui `Button` and `Badge` components
- Cart badge shows `item_count` from `useCart()`
- Auth button shows "登入/註冊" or user name based on `useAuth()`

**File:** `frontend/src/components/product/product-card.tsx`

Key elements:
- Product image with hover zoom (scale 1.05)
- Badge (HOT/NEW/Seasonal) positioned top-right
- Category label
- Product name (Noto Serif TC)
- Price in NTD
- "Add to Cart" button (calls `useAddToCart()`)
- Favorite heart button (calls `useToggleFavorite()`, only visible when logged in)
- Card styling: rounded-lg, shadow-md, hover:shadow-lg, hover:translateY(-4px)

**File:** `frontend/src/components/product/product-editorial.tsx`

Key elements:
- Alternating layout (image left/right on even/odd items)
- Large product image (500px height, rounded-2xl)
- Category label, product name (28px), description
- Specs grid (3 columns: label + value pairs)
- Price (28px, primary-600)
- "Add to Cart" button (gradient background)

**File:** `frontend/src/components/cart/order-summary.tsx`

Key elements:
- Sticky sidebar (top: 120px)
- Item summary list (name × qty = price)
- Subtotal, shipping (free if >= 500), total
- Two checkout buttons:
  - "信用卡付款" → creates order with `payment_method: 'lemon_squeezy'`, then calls checkout API
  - "透過 LINE 聯繫" → creates order with `payment_method: 'line'`, then calls LINE send API
- "Continue Shopping" link

---

### Step 8: Build pages

**File:** `frontend/src/app/page.tsx` — Home page

```typescript
'use client';

import { useState } from 'react';
import { useProducts } from '@/queries/use-products';
import { useCategories } from '@/queries/use-categories';
import { useFavorites } from '@/queries/use-favorites';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/hooks/use-locale';
import { Header } from '@/components/layout/header';
import { SeasonalBanner } from '@/components/layout/seasonal-banner';
import { CategoryPills } from '@/components/product/category-pills';
import { ViewToggle } from '@/components/product/view-toggle';
import { ProductGrid } from '@/components/product/product-grid';
import { ProductShowcase } from '@/components/product/product-showcase';
import { ProcessSection } from '@/components/home/process-section';
import { StorySection } from '@/components/home/story-section';
import { Footer } from '@/components/layout/footer';

export default function HomePage() {
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<'grid' | 'editorial'>('grid');
  const { locale, t } = useLocale();
  const { user } = useAuth();

  const { data: productsData, isLoading } = useProducts(selectedCategory);
  const { data: categoriesData } = useCategories();
  const { data: favoritesData } = useFavorites(!!user);

  const products = productsData?.products || [];
  const categories = categoriesData?.categories || [];
  const favoriteIds = new Set(favoritesData?.product_ids || []);

  return (
    <>
      <Header />
      <SeasonalBanner />

      {/* Hero Section */}
      <section className="relative h-[600px] bg-cover bg-center bg-fixed flex items-center justify-center text-white"
               style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), url('...')" }}>
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-4">{t('home.title')}</h1>
          <p className="text-2xl font-light tracking-wider">{t('home.subtitle')}</p>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-6 py-16">
        <div className="flex items-center gap-6 mb-10 flex-wrap">
          <CategoryPills
            categories={categories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            locale={locale}
          />
          <div className="w-px h-6 bg-border" />
          <ViewToggle active={viewMode === 'editorial'} onToggle={() => setViewMode(v => v === 'grid' ? 'editorial' : 'grid')} />
        </div>

        {viewMode === 'grid' ? (
          <ProductGrid products={products} favoriteIds={favoriteIds} locale={locale} />
        ) : (
          <ProductShowcase products={products} locale={locale} />
        )}
      </main>

      <ProcessSection />
      <StorySection />
      <Footer />
    </>
  );
}
```

**File:** `frontend/src/app/cart/page.tsx` — Cart page

Implements the design from `design-cart.html`:
- Cart items list with image, name, price, quantity controls, remove button
- Customer info form (name, phone, email, address, notes)
- Order summary sidebar (sticky)
- Two checkout buttons
- Empty cart state with "Start Shopping" CTA

**File:** `frontend/src/app/profile/page.tsx` — Profile page

- Auth guard (redirect to login if not authenticated)
- Display and edit: name, phone
- Save button calls `PATCH /api/user/profile`

**File:** `frontend/src/app/orders/page.tsx` — Order list

- Auth guard
- List of orders with order_number, status badge, total, date
- Click → navigate to `/orders/[id]`

**File:** `frontend/src/app/orders/[id]/page.tsx` — Order detail

- Order status timeline (pending → paid → preparing → shipping → delivered)
- Order items table
- Customer info
- Payment method badge

---

### Step 9: Update providers

**File:** `frontend/src/app/providers.tsx`

```typescript
'use client';

import { ThemeProvider } from 'next-themes';
// Review M-9: match existing export style (default export in current codebase)
import TanStackQueryProvider from '@/vendors/tanstack-query/provider';
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from '@/components/ui/toaster';
// Review L-6: error boundary for TanStack Query throwOnError
import { ErrorBoundary } from '@/components/shared/error-boundary';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TanStackQueryProvider>
        <AuthProvider>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster />
        </AuthProvider>
      </TanStackQueryProvider>
    </ThemeProvider>
  );
}
```

### Step 10: Update root layout

**File:** `frontend/src/app/layout.tsx`

```typescript
import { Providers } from './providers';
import './globals.css';
// Review L-5: use next/font for self-hosted fonts (no layout shift, no blocking CDN request)
import { Noto_Serif_TC } from 'next/font/google';

const notoSerifTC = Noto_Serif_TC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-serif-tc',
  display: 'swap',
});

export const metadata = {
  title: '周爸烘焙坊 — Papa Bakery',
  description: '用心烘焙，傳遞幸福',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" suppressHydrationWarning className={notoSerifTC.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

---

### Step 11: Configure API requests with credentials

Ensure all `fetch()` calls include `credentials: 'include'` so the `session_id` cookie is sent with every request.

Update the TanStack Query default fetch function in `frontend/src/vendors/tanstack-query/provider.tsx`:

```typescript
// In QueryClient defaultOptions.queries.queryFn:
const response = await fetch(url, { credentials: 'include' });
```

## Component ↔ Design Mapping

| Design Element | Component | shadcn/ui |
|---|---|---|
| Header | `header.tsx` | `Button`, `Badge` |
| Seasonal Banner | `seasonal-banner.tsx` | — (custom) |
| Category Pills | `category-pills.tsx` | `Button` variant="outline" |
| Product Card | `product-card.tsx` | `Card`, `Button`, `Badge` |
| Editorial Item | `product-editorial.tsx` | `Button`, `Separator` |
| Cart Item | `cart-item.tsx` | `Button`, `Input` |
| Customer Form | `customer-form.tsx` | `Input`, `Label`, `Textarea` |
| Order Summary | `order-summary.tsx` | `Card`, `Separator`, `Button` |
| Login Form | `login-form.tsx` | `Input`, `Label`, `Button` |
| Dark Mode Toggle | `dark-mode-toggle.tsx` | `Button` |
| Language Toggle | `language-toggle.tsx` | `Button` |
| Notification | shadcn `toast` | `Toast`, `Toaster` |

## Testing Steps

1. `cd frontend && npm run build` — Verify build succeeds
2. `npm run dev` — Start dev server on port 3001
3. Manual test checklist:
   - [ ] Home page loads with products from API
   - [ ] Category filtering works
   - [ ] Grid ↔ editorial view toggle works
   - [ ] Dark mode toggle works
   - [ ] Language toggle works (ZH ↔ EN)
   - [ ] Add to cart works (check cart badge updates)
   - [ ] Cart page shows items, quantities update, remove works
   - [ ] Customer form validation works
   - [ ] Checkout buttons trigger correct flow
   - [ ] Login/register works, cart persists
   - [ ] Favorites work for logged-in users
   - [ ] Profile page edits save
   - [ ] Orders page shows history
   - [ ] Responsive on mobile (375px, 768px, 1024px)

## Dependencies

- Depends on: shared-types.md, backend-api.md (APIs must be running)
- Must complete before: final integration testing

## Review Remediations Applied

### M-9: Provider import mismatch
Use default import for `TanStackQueryProvider` to match existing export style.

### M-10: Add `credentials: 'include'` to existing fetcher
Update `frontend/src/utils/fetchers/fetchers.utils.ts` — add `credentials: 'include'` to the fetch options in `getFetchQueryOptions()`. Also update the TanStack Query default `queryFn`.

### M-14: Use `next/image` for product images
Configure `next.config.ts`:

```typescript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'images.unsplash.com' },
  ],
},
```

Use `<Image>` component in `product-card.tsx` and `product-editorial.tsx` with `fill` and `sizes` props.

### L-2: Add missing `useCategories` hook

**File:** `frontend/src/queries/use-categories.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { CategoryListResponse } from '@repo/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export function useCategories() {
  return useQuery<CategoryListResponse>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/categories`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // categories rarely change
  });
}
```

### L-5: Use `next/font/google` instead of `<link>` tag
Updated root layout to use `Noto_Serif_TC` from `next/font/google`. Reference via CSS variable `--font-noto-serif-tc`.

Update `globals.css` heading rule:

```css
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-noto-serif-tc), 'Noto Serif TC', serif;
}
```

### L-6: Error boundary
Add `frontend/src/components/shared/error-boundary.tsx`:

```typescript
'use client';
import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### M-18: Complete design tokens in globals.css

Add the missing tokens from `design-token.md`:

```css
/* Add to :root and .dark blocks */

/* Full neutral scale */
--neutral-200: #F5F1EC;  /* dark: #2A2018 */
--neutral-300: #E8E2D9;  /* dark: #3D3028 */
--neutral-400: #D6CCC0;  /* dark: #5A4D42 */
--neutral-500: #B8ADA0;  /* dark: #7A6E62 */
--neutral-600: #9A8E83;  /* dark: #9A8E83 */
--neutral-700: #6F645A;  /* dark: #C4B8AB */

/* Derived tokens */
--text-tertiary: #A89E92;   /* dark: #8A7E72 */
--border-strong: #9A8E83;   /* dark: #7A6E62 */
--bg-overlay: rgba(26,17,11,0.5); /* dark: rgba(0,0,0,0.6) */
--shadow-header: 0 1px 3px rgba(26,17,11,0.10); /* dark: 0 2px 8px rgba(0,0,0,0.35) */

/* Spacing (Tailwind extend in tailwind.config.ts) */
/* Map --space-X tokens to Tailwind spacing scale */

/* Radius (Tailwind extend) */
/* --radius-sm: 4px, --radius-md: 8px, --radius-lg: 12px, --radius-xl: 16px */
```

### M-19: Fix body font stack and card hover

```css
/* globals.css — match design-token.md exactly */
body {
  font-family: 'Segoe UI', Roboto, 'Helvetica Neue', var(--font-noto-serif-tc), sans-serif;
  line-height: 1.65;  /* Review L-7 */
}

h1, h2, h3, h4, h5, h6 {
  line-height: 1.2;   /* Review L-7 */
}
```

Product card hover: use `hover:-translate-y-1.5` (6px) instead of `hover:-translate-y-1` (4px).

### L-8: Responsive grid breakpoints

| Breakpoint | Product Grid Columns | Editorial View |
|---|---|---|
| < 600px | 1 column | Single column |
| 600-768px | 2 columns | Single column |
| 768-1024px | 2 columns | Single column, reduced gap |
| > 1024px | 3 columns (auto-fit, minmax(280px, 1fr)) | Two-column alternating layout |

### M-12: SSR / SEO note

The current approach uses `'use client'` for the home page due to TanStack Query hooks. This is acceptable for the MVP. For future SEO improvement:
- Use `next-intl` with `[locale]` route segments and `generateStaticParams`
- Pre-fetch product data on the server using `dehydrate()` and `HydrationBoundary`
- This enables SSR while still using TanStack Query for client-side updates

### H-4: localStorage token storage note

Storing tokens in `localStorage` is a known XSS risk. For the MVP, this is accepted with the following mitigations:
- Add `Content-Security-Policy` header in `next.config.ts` to restrict script sources
- All user content is rendered as text (no `dangerouslySetInnerHTML`)
- Future improvement: migrate to HttpOnly cookie-based token storage

## Notes

- All API calls use `credentials: 'include'` to ensure session cookie is sent (Review M-10)
- Auth tokens are stored in `localStorage` and sent as `Bearer` header (Review H-4: accepted for MVP)
- The `next-themes` package handles `.dark` class on `<html>`, matching the design token system
- Product names/descriptions use locale-aware fields (`name_zh`/`name_en`) based on current locale
- shadcn/ui components are styled via CSS custom properties, automatically adapting to light/dark mode
- Font `Noto Serif TC` loaded via `next/font/google` (Review L-5: self-hosted, no layout shift)
- Cart mutations use `setQueryData` instead of `invalidateQueries` to avoid double-fetch (Review M-13)
- `ErrorBoundary` wraps the app to catch TanStack Query `throwOnError` crashes (Review L-6)
