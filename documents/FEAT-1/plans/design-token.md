# Design Token System — Light / Dark Mode

## Overview

This design token document defines the dual-theme color system for Papa Bakery.

- **Light mode** is based on the Visual Storytelling editorial palette (demo-l) — warm cream backgrounds with artisan brown accents.
- **Dark mode** inverts the surface hierarchy while preserving the warm artisan character, using deep espresso tones for backgrounds and boosting accent luminance for readability.

---

## 1. Color Palette

### 1.1 Primary (Artisan Amber)

| Token           | Light     | Dark      | Usage                                |
| --------------- | --------- | --------- | ------------------------------------ |
| `--primary-50`  | `#FFFBF5` | `#2A1E14` | Subtle background tint               |
| `--primary-100` | `#FEF5E8` | `#3A2A1C` | Card hover, pill bg                  |
| `--primary-200` | `#FDE8D4` | `#4D3825` | Borders, secondary bg                |
| `--primary-300` | `#F9D4B0` | `#6B4E34` | Hover borders                        |
| `--primary-400` | `#F5BB87` | `#D49A6A` | Accent light                         |
| `--primary-500` | `#D4885A` | `#E0965F` | **Primary accent** (boosted in dark) |
| `--primary-600` | `#C07545` | `#C8824E` | Hover state                          |
| `--primary-700` | `#9D5F31` | `#F0B080` | Price text, logo                     |
| `--primary-800` | `#7A4620` | `#F5C8A0` | Section headings                     |
| `--primary-900` | `#5C3D1E` | `#FAE0C8` | Emphasis text                        |

### 1.2 Neutral (Parchment ↔ Espresso)

| Token           | Light     | Dark      | Usage            |
| --------------- | --------- | --------- | ---------------- |
| `--neutral-50`  | `#FDFBF9` | `#161110` | Body background  |
| `--neutral-100` | `#FAF8F5` | `#1E1712` | Card surface     |
| `--neutral-200` | `#F5F1EC` | `#2A2018` | Elevated surface |
| `--neutral-300` | `#E8E2D9` | `#3D3028` | Subtle divider   |
| `--neutral-400` | `#D6CCC0` | `#5A4D42` | Muted border     |
| `--neutral-500` | `#B8ADA0` | `#7A6E62` | Placeholder      |
| `--neutral-600` | `#9A8E83` | `#9A8E83` | Secondary icon   |
| `--neutral-700` | `#6F645A` | `#C4B8AB` | Body text        |
| `--neutral-800` | `#3D281A` | `#E8DDD2` | Heading text     |
| `--neutral-900` | `#1A110B` | `#FAF5F0` | Primary text     |

### 1.3 Semantic

| Token           | Light     | Dark      | Usage                        |
| --------------- | --------- | --------- | ---------------------------- |
| `--success-500` | `#52B788` | `#6BCCA0` | Success, seasonal badge      |
| `--warning-500` | `#F5A623` | `#F5B840` | Warning, default badge       |
| `--error-500`   | `#DC2626` | `#EF4444` | Error, HOT badge, cart badge |

### 1.4 Derived Tokens

| Token              | Light     | Dark      | Usage                   |
| ------------------ | --------- | --------- | ----------------------- |
| `--text-primary`   | `#1A110B` | `#FAF5F0` | Headings, names         |
| `--text-secondary` | `#6F645A` | `#C4B8AB` | Body copy, descriptions |
| `--text-tertiary`  | `#A89E92` | `#8A7E72` | Captions, spec labels   |
| `--text-inverse`   | `#FDFBF9` | `#161110` | Text on filled buttons  |
| `--border-light`   | `#E8E2D9` | `#3D3028` | Card borders            |
| `--border-default` | `#D6CCC0` | `#5A4D42` | Input borders           |
| `--border-strong`  | `#9A8E83` | `#7A6E62` | Active borders          |

---

## 2. Surface & Background

| Token           | Light                | Dark              | Usage                  |
| --------------- | -------------------- | ----------------- | ---------------------- |
| `--bg-body`     | `#FDFBF9`            | `#161110`         | Page background        |
| `--bg-surface`  | `#FFFFFF`            | `#1E1712`         | Cards, header          |
| `--bg-elevated` | `#FAF8F5`            | `#2A2018`         | Hover states, input bg |
| `--bg-overlay`  | `rgba(26,17,11,0.5)` | `rgba(0,0,0,0.6)` | Modal overlay          |
| `--bg-footer`   | `#3D281A`            | `#0E0A08`         | Footer                 |

---

## 3. Typography

| Property                  | Value                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| **Heading font**          | `'Noto Serif TC', serif`                                            |
| **Body font**             | `'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Serif TC', sans-serif` |
| **Base size**             | `16px`                                                              |
| **Line height (body)**    | `1.65`                                                              |
| **Line height (heading)** | `1.2`                                                               |

### Scale

| Element                | Size    | Weight  |
| ---------------------- | ------- | ------- |
| Hero h1                | 64px    | 700     |
| Section h2             | 32–40px | 600–700 |
| Card title / h3        | 20–24px | 600     |
| Editorial product name | 36px    | 700     |
| Body text              | 16–18px | 400     |
| Caption / label        | 14px    | 600     |
| Badge                  | 12–14px | 600–700 |

---

## 4. Spacing

Base unit: **4px**

| Token        | Value | Usage                     |
| ------------ | ----- | ------------------------- |
| `--space-1`  | 4px   | Tight gap                 |
| `--space-2`  | 8px   | Icon-text gap             |
| `--space-3`  | 12px  | Pill gap, small padding   |
| `--space-4`  | 16px  | Card padding, element gap |
| `--space-6`  | 24px  | Section padding, grid gap |
| `--space-8`  | 32px  | Section margin            |
| `--space-10` | 40px  | Large section gap         |
| `--space-12` | 48px  | Section padding           |
| `--space-16` | 64px  | Hero padding              |
| `--space-20` | 80px  | Editorial section padding |

---

## 5. Border Radius

| Token           | Value  | Usage                         |
| --------------- | ------ | ----------------------------- |
| `--radius-sm`   | 4px    | Language toggle               |
| `--radius-md`   | 8px    | Buttons, inputs, small cards  |
| `--radius-lg`   | 12px   | Product cards                 |
| `--radius-xl`   | 16px   | Cart container, story section |
| `--radius-2xl`  | 20px   | Editorial images              |
| `--radius-3xl`  | 24px   | Process section               |
| `--radius-full` | 9999px | Pills, badges                 |

---

## 6. Shadow System

| Token             | Light                             | Dark                           |
| ----------------- | --------------------------------- | ------------------------------ |
| `--shadow-sm`     | `0 1px 3px rgba(26,17,11,0.10)`   | `0 1px 3px rgba(0,0,0,0.30)`   |
| `--shadow-md`     | `0 4px 12px rgba(26,17,11,0.08)`  | `0 4px 12px rgba(0,0,0,0.25)`  |
| `--shadow-lg`     | `0 10px 24px rgba(26,17,11,0.12)` | `0 10px 24px rgba(0,0,0,0.35)` |
| `--shadow-xl`     | `0 20px 40px rgba(26,17,11,0.15)` | `0 20px 40px rgba(0,0,0,0.45)` |
| `--shadow-header` | `0 1px 3px rgba(26,17,11,0.10)`   | `0 2px 8px rgba(0,0,0,0.35)`   |

---

## 7. Button Styles

### Primary Button (CTA / Add to Cart)

| Property   | Light                           | Dark                        |
| ---------- | ------------------------------- | --------------------------- |
| Background | `var(--primary-500)`            | `var(--primary-500)`        |
| Text       | `var(--text-inverse)`           | `#FFFFFF`                   |
| Border     | `none`                          | `none`                      |
| Hover bg   | `var(--primary-600)`            | `var(--primary-600)`        |
| Shadow     | `0 2px 6px rgba(26,17,11,0.12)` | `0 2px 8px rgba(0,0,0,0.3)` |
| Radius     | `8px`                           | `8px`                       |

### Secondary Button (Favorite / Outline)

| Property   | Light                            | Dark                             |
| ---------- | -------------------------------- | -------------------------------- |
| Background | `var(--primary-100)`             | `var(--primary-50)`              |
| Text       | `var(--primary-700)`             | `var(--primary-400)`             |
| Border     | `1.5px solid var(--primary-200)` | `1.5px solid var(--primary-200)` |
| Hover bg   | `var(--primary-200)`             | `var(--primary-100)`             |

### Ghost Button (Language Toggle)

| Property   | Light                           | Dark                            |
| ---------- | ------------------------------- | ------------------------------- |
| Background | `transparent`                   | `transparent`                   |
| Text       | `var(--primary-700)`            | `var(--primary-400)`            |
| Border     | `1px solid var(--border-light)` | `1px solid var(--border-light)` |
| Hover bg   | `var(--primary-50)`             | `var(--primary-50)`             |

### Category Pill

| Property   | Light (inactive)     | Light (active)        | Dark (inactive)      | Dark (active)        |
| ---------- | -------------------- | --------------------- | -------------------- | -------------------- |
| Background | `var(--primary-100)` | `var(--primary-500)`  | `var(--primary-50)`  | `var(--primary-500)` |
| Text       | `var(--primary-800)` | `var(--text-inverse)` | `var(--primary-400)` | `#FFFFFF`            |
| Border     | `var(--primary-200)` | `var(--primary-500)`  | `var(--primary-200)` | `var(--primary-500)` |

---

## 8. Gradients

| Name             | Light                                             | Dark                                      | Usage           |
| ---------------- | ------------------------------------------------- | ----------------------------------------- | --------------- |
| **Hero overlay** | `rgba(212,136,90,0.25) → rgba(212,136,90,0.25)`   | `rgba(22,17,16,0.5) → rgba(22,17,16,0.5)` | Hero image tint |
| **Banner**       | `135deg, #F5A623 → #D4885A → #C07545`             | `135deg, #C07545 → #9D5F31 → #7A4620`     | Seasonal banner |
| **Process bg**   | `135deg, var(--primary-50) → var(--primary-100)`  | `135deg, #1E1712 → #2A2018`               | Process section |
| **Checkout btn** | `135deg, #D4885A → #C07545`                       | `135deg, #E0965F → #C8824E`               | Checkout CTA    |
| **Process icon** | `135deg, var(--primary-400) → var(--primary-600)` | `135deg, #D49A6A → #C8824E`               | Step icons      |

---

## 9. Transitions

| Property         | Value                                     |
| ---------------- | ----------------------------------------- |
| Default          | `300ms ease-in-out`                       |
| Button hover     | `300ms ease-out`                          |
| Card hover       | `300ms ease-in-out`                       |
| Image zoom       | `600ms cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Scroll fade-in   | `700ms ease-out`                          |
| Dark mode toggle | `400ms ease-in-out` (applied to `body *`) |

---

## 10. Component Tokens

### Card (Product Grid)

| Property        | Light                           | Dark                            |
| --------------- | ------------------------------- | ------------------------------- |
| Background      | `#FFFFFF`                       | `var(--neutral-100)`            |
| Border          | `1px solid var(--border-light)` | `1px solid var(--border-light)` |
| Shadow          | `var(--shadow-sm)`              | `var(--shadow-sm)`              |
| Hover shadow    | `var(--shadow-lg)`              | `var(--shadow-lg)`              |
| Hover translate | `translateY(-6px)`              | `translateY(-6px)`              |
| Image height    | `240px`                         | `240px`                         |
| Radius          | `12px`                          | `12px`                          |

### Editorial Product (Intro View)

| Property          | Light              | Dark               |
| ----------------- | ------------------ | ------------------ |
| Image height      | `500px`            | `500px`            |
| Image radius      | `20px`             | `20px`             |
| Image shadow      | `var(--shadow-xl)` | `var(--shadow-xl)` |
| Content padding   | `40px`             | `40px`             |
| Gap between items | `120px`            | `120px`            |

### Header

| Property      | Light                           | Dark                            |
| ------------- | ------------------------------- | ------------------------------- |
| Background    | `#FFFFFF`                       | `var(--neutral-100)`            |
| Border bottom | `1px solid var(--border-light)` | `1px solid var(--border-light)` |
| Shadow        | `var(--shadow-header)`          | `var(--shadow-header)`          |

### Footer

| Property   | Light                | Dark                 |
| ---------- | -------------------- | -------------------- |
| Background | `var(--neutral-800)` | `var(--bg-footer)`   |
| Text       | `#C4BFBA`            | `#9A8E83`            |
| Link hover | `var(--primary-300)` | `var(--primary-400)` |

---

## 11. Dark Mode Toggle

- Triggered by a manual button in the header (not `prefers-color-scheme`).
- Implementation: toggling a `.dark` class on `<html>`.
- All color tokens are re-mapped via CSS custom properties under `html.dark { ... }`.
- A smooth `400ms ease-in-out` transition is applied to `background-color` and `color` on the `body` and key elements to prevent jarring mode switches.
- The toggle button uses a sun/moon icon pair.

---

## 12. View Mode Toggle

- A toggle button labeled **"介紹"** sits alongside the category filter pills.
- When inactive (default): products display in a **3-column card grid** (demo-f-var1 style).
- When active: products display in a **single-column editorial layout** with alternating image-text (demo-l style).
- The active state is visually distinct (filled accent background, like an active pill).
- Switching between views triggers a subtle fade animation.
