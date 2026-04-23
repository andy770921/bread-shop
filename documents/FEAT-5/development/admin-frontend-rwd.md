# Admin Frontend — Mobile RWD Pass

## Context

The admin backoffice (`admin-frontend/`) was built desktop-first. A fixed 260px sidebar, dense data tables, and a layout shell forced to `h-screen overflow-hidden` made the app unusable on phone-sized viewports — sidebar ate the horizontal space, tables overflowed, and the `ContentEditor` tabs wrapped vertically into an unreadable stack.

This pass makes every admin screen usable at phone widths (tested at 390×844) while leaving the desktop layout unchanged.

## Breakpoint

All responsive behaviour hangs off Tailwind's default `md` breakpoint (`≥ 768px`). Below `md` we render the mobile shell and card-style lists; at `md` and above we render the original desktop shell with a pinned sidebar and data tables.

## Layout Shell

### New: `Sheet` primitive

`admin-frontend/src/components/ui/sheet.tsx` — a side-drawer component built on Radix's `Dialog` primitive (re-exported via the `radix-ui` meta-package). Supports `side="left" | "right" | "top" | "bottom"` via `cva`. Uses `tw-animate-css` slide-in/out animations consistent with the existing `Dialog` component. Exposes `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetClose`.

### `DashboardLayout.tsx` — conditional viewport shell

The original shell forced `flex h-screen overflow-hidden` globally and put the main area in an `overflow-y-auto` container. Because `globals.css` already sets `html, body, #root { height: 100% }`, this stacked two scroll contexts on mobile (document scroll + inner main scroll), producing a visible double scrollbar.

The shell is now split by breakpoint:

```tsx
<div className="flex min-h-screen flex-col md:h-screen md:flex-row md:overflow-hidden">
  <Sidebar />
  <div className="flex min-h-0 flex-1 flex-col md:overflow-hidden">
    <Topbar />
    <main className="flex-1 bg-bg-body px-4 py-4 md:overflow-y-auto md:px-8 md:py-6">
      <Outlet />
    </main>
  </div>
</div>
```

- **Mobile (`< md`)**: column layout, `min-h-screen`, no `overflow-hidden` anywhere — the document scrolls naturally; only one scrollbar.
- **Desktop (`≥ md`)**: row layout, `h-screen overflow-hidden`, inner `<main>` is the sole scroll container, so the sidebar stays pinned.
- Main padding drops from `px-8 py-6` to `px-4 py-4` below `md`.

### `Sidebar.tsx` — extracted nav, hidden on mobile

The navigation content is factored into a `SidebarNav` component so both the desktop `<aside>` and the mobile drawer can render it. The desktop aside is `hidden md:flex`, so it collapses to `display: none` on phones.

### `Topbar.tsx` — hamburger + sticky

The topbar renders a hamburger `Button` (`md:hidden`) that opens a `Sheet` containing `<SidebarNav onNavigate={closeSheet} />`. Navigating via a nav link in the drawer calls `onNavigate`, so the sheet auto-closes on transition.

The topbar itself becomes `sticky top-0 z-40` below `md` (and `md:static` above) so the hamburger stays reachable while the page scrolls. The email label is hidden on mobile (`hidden md:block`) and the Logout button collapses to an icon (`<LogOut class="h-4 w-4 md:mr-2" />` + `<span class="hidden md:inline">`).

## Page-Level Changes

All pages adopt a consistent pattern: **tables render at `≥ md`; card-style lists render at `< md`**. Headings drop from `text-2xl` to `text-lg` on mobile; back buttons collapse to icon-only; long titles get `min-w-0 flex-1 truncate` so they ellipsis instead of overflowing their flex container.

### `ContentEditor.tsx`

The original `TabsList` used `flex-wrap` which, combined with narrow mobile widths, wrapped each tab label onto its own line and produced the vertically-stacked tab strip shown in the original bug screenshot.

Fixed by wrapping the list in a horizontal scroll container:

```tsx
<div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
  <TabsList className="w-max md:w-fit md:flex-wrap">...</TabsList>
</div>
```

`-mx-4 px-4` lets the scroll area extend edge-to-edge on mobile while staying aligned with the main container's `px-4` padding. `w-max` on mobile keeps the trigger row in a single horizontal strip; at `md+` we revert to `flex-wrap` because the container is wide enough.

`ContentKeyRow` header now stacks the row key and the Reset/Save buttons (`flex flex-col gap-2 sm:flex-row`).

### `ProductList.tsx`

- Desktop `<Table>` wrapped in `hidden md:block`.
- Added a mobile card list (`md:hidden`): each row is a `<Card>` with a 16×16 thumbnail, truncated name, inline badge, `category · NT$price` meta line, and edit/delete action buttons.
- "New Product" button collapses to icon-only below `md`.

### `OrderList.tsx`

- Header (title + status filter) switches from `flex-row` to `flex-col` below `sm`.
- Desktop table hidden below `md`; mobile renders a card list keyed by order — each card is a `<Link>` to the detail page with order number + status badge on the first row, customer name + total on the second, and timestamp beneath.

### `DashboardIndex.tsx`

- KPI grid drops from `md:grid-cols-3` with `gap-4` to `grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4` and smaller numeric typography on mobile.
- Recent Orders card renders `<Table>` at `md+` and a divided list (`divide-y divide-border-light`) below `md`.
- "Orders by Status" badges switch from `flex flex-wrap min-w-[120px]` to `grid grid-cols-2 sm:flex sm:flex-wrap` so the 6 statuses cleanly form a 2-column grid on narrow screens.

### `OrderDetail.tsx`

- Header (`Back` + order number + `Resend LINE`) stacks vertically below `sm`; back button becomes icon-only; order number gets `min-w-0 flex-1 truncate`.
- Card header inside "Order Details" stacks title + status `<Select>` vertically on mobile so the select gets full width (`sm:w-40` at `sm+`).
- Items list renders `<Table>` at `md+`; below `md` it's a divided list showing `name | subtotal` on row 1 and `qty × unit price` on row 2.

### `ProductEdit.tsx` / `ProductNew.tsx`

- Back button becomes icon-only.
- Title gets `min-w-0 flex-1 truncate` so long product names ellipsis.
- `ProductForm` itself was already responsive (`md:grid-cols-2`, `lg:grid-cols-3`) and needed no changes.

### `Login.tsx`

No change. Already used `min-h-screen`, a max-width card, and `px-4`, which rendered correctly on mobile.

## Files Added / Modified

**Added**

- `admin-frontend/src/components/ui/sheet.tsx`

**Modified**

- `admin-frontend/src/components/layout/Sidebar.tsx` — extract `SidebarNav`, hide desktop aside below `md`
- `admin-frontend/src/components/layout/Topbar.tsx` — hamburger + Sheet wiring, sticky on mobile, collapsed actions
- `admin-frontend/src/routes/dashboard/DashboardLayout.tsx` — conditional shell (mobile natural scroll vs desktop pinned sidebar)
- `admin-frontend/src/routes/dashboard/DashboardIndex.tsx` — mobile KPI/grid/list treatment
- `admin-frontend/src/routes/dashboard/content/ContentEditor.tsx` — horizontal-scroll tabs, stacked row header
- `admin-frontend/src/routes/dashboard/products/ProductList.tsx` — mobile card list
- `admin-frontend/src/routes/dashboard/products/ProductEdit.tsx` — truncated title, icon-only back
- `admin-frontend/src/routes/dashboard/products/ProductNew.tsx` — truncated title, icon-only back
- `admin-frontend/src/routes/dashboard/orders/OrderList.tsx` — stacked filter bar, mobile card list
- `admin-frontend/src/routes/dashboard/orders/OrderDetail.tsx` — stacked header, mobile item list

No backend, API, or data-shape changes.

## Verification

- `tsc -b --noEmit` and `vite build` both pass clean.
- Playwright at 390×844: login, dashboard, products (list + edit), content editor, orders (list + detail) all render without horizontal overflow; the hamburger opens the drawer and nav links close it.
- Scroll-container audit (query every element with `overflow-y: auto | scroll` and check `scrollHeight > clientHeight`):
  - Mobile: zero inner scrollers active — only the document scrolls.
  - Desktop (1280×600): only `<main>` scrolls; `html` and `body` stay at `scrollHeight === clientHeight`, so the sidebar remains pinned.
- Sticky topbar verified by scrolling the product edit form — the topbar remains fixed to the top of the viewport while the form content scrolls underneath.
