# End-to-End Test Plan: Cart & Auth User Flows

## Prerequisites

- Backend running at `http://localhost:3000`
- Frontend running at `http://localhost:3001`
- Supabase project seeded with 6 products (IDs 1–6)
- Test user credentials:
  - **Email:** `test@papabakery.com`
  - **Password:** `test123456`

### Product Reference (from seed data)

| ID | Name (ZH)      | Price (NTD) |
|----|----------------|-------------|
| 1  | 香濃奶油吐司    | 120         |
| 2  | 草莓蛋糕        | 380         |
| 3  | 手工曲奇餅乾    | 180         |
| 4  | 法式可頌        | 65          |
| 5  | 巧克力布朗尼    | 220         |
| 6  | 肉鬆麵包        | 55          |

---

## Test Case 1: Guest adds two different products to cart

**Objective:** Verify a guest (not logged in) can add two different products and see them in the cart page.

### Steps

1. Open `http://localhost:3001` (Home page).
2. Wait for products to load (6 product cards should appear in the grid).
3. Locate the first product card ("香濃奶油吐司", NT$120) and click its "加入購物車" button.
4. Verify a toast/notification appears confirming the item was added.
5. Locate the second product card ("草莓蛋糕", NT$380) and click its "加入購物車" button.
6. Navigate to `/cart` (click the cart icon in the header, or go directly).
7. **Verify:**
   - Two cart items are visible.
   - Item 1: "香濃奶油吐司", quantity = 1, price = NT$120.
   - Item 2: "草莓蛋糕", quantity = 1, price = NT$380.
   - Subtotal = NT$500.
   - Shipping = NT$0 (free, because subtotal >= 500).
   - Total = NT$500.

### Expected Result

Cart page shows both items with correct prices and quantities. Shipping is free at NT$500 subtotal.

---

## Test Case 2: Guest adds products, then removes items from cart

**Objective:** Verify quantity controls and item removal work correctly, with price recalculations.

### Steps

1. Open `http://localhost:3001` (Home page).
2. Wait for products to load.
3. Click "加入購物車" on the first product ("香濃奶油吐司", NT$120) — **once**.
4. Click "加入購物車" on the second product ("草莓蛋糕", NT$380) — **three times**.
5. Navigate to `/cart`.
6. **Verify initial cart state:**
   - Item 1: "香濃奶油吐司", quantity = 1, subtotal = NT$120.
   - Item 2: "草莓蛋糕", quantity = 3, subtotal = NT$1,140.
   - Cart subtotal = NT$1,260.
   - Shipping = NT$0 (free).
   - Total = NT$1,260.
7. Remove "香濃奶油吐司" entirely (click the remove/trash button on that item).
8. **Verify after removing first item:**
   - Only "草莓蛋糕" remains, quantity = 3, subtotal = NT$1,140.
   - Cart subtotal = NT$1,140.
   - Total = NT$1,140.
9. Decrease "草莓蛋糕" quantity by 1 (click the "−" button once).
10. **Verify final cart state:**
    - "草莓蛋糕", quantity = 2, subtotal = NT$760.
    - Cart subtotal = NT$760.
    - Shipping = NT$0 (free, >= 500).
    - Total = NT$760.

### Expected Result

After removals and quantity decrease, cart shows 1 item (草莓蛋糕 × 2) with subtotal NT$760 and total NT$760.

---

## Test Case 3: Guest adds products, then logs in — cart persists

**Objective:** Verify that a guest's cart items survive the login process (session merge).

### Steps

1. Open `http://localhost:3001` (Home page).
2. Wait for products to load.
3. Click "加入購物車" on "香濃奶油吐司" (NT$120) — **once**.
4. Click "加入購物車" on "草莓蛋糕" (NT$380) — **three times**.
5. Verify the cart badge in the header shows **4** (1 + 3 items).
6. Navigate to `/auth/login`.
7. Enter email: `test@papabakery.com`.
8. Enter password: `test123456`.
9. Click the login button.
10. **Verify login succeeds** — the header should now show the user name or a profile link instead of "登入/註冊".
11. Navigate to `/cart`.
12. **Verify cart contents are preserved after login:**
    - Item 1: "香濃奶油吐司", quantity = 1, subtotal = NT$120.
    - Item 2: "草莓蛋糕", quantity = 3, subtotal = NT$1,140.
    - Cart subtotal = NT$1,260.
    - Total = NT$1,260.

### Expected Result

After logging in, the guest cart items are merged into the authenticated user's session. All items, quantities, and prices remain correct.

---

## Notes

- **Session mechanics:** The backend assigns a `session_id` cookie (HttpOnly) to every visitor. On login, the `mergeSessionOnLogin()` function links the session to the user and merges any cart items from older sessions.
- **Cart badge:** The header cart icon badge reflects `item_count` from the `GET /api/cart` response (total quantity across all items).
- **Price computation:** All prices are server-computed. The frontend never sends price data — only product IDs and quantities.
- **Shipping rule:** Free shipping when subtotal >= NT$500; otherwise NT$60.
- **Test user cleanup:** If tests modify the test user's cart, clear it between test runs by calling `DELETE /api/cart` or creating a fresh session (clear cookies).
