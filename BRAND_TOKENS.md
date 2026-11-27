# HIFY Brand Guidelines & Design Tokens (US Stocks)

> **Universal Reference:** This file aligns with the shared Trading Log color palette at `D:\AI Projects\Trading Log\HIFY_COLOR_PALETTE.md` (**Gold Identity + Neutral Intelligence**, matching `https://www.happy-investing.in/`).  
> *(Note: Older Teal-based tokens `#0F8F87` / `#16A39A` are superseded and deprecated.)*

---

## 1. Design Philosophy
- **Light Mode:** *"Clean, quiet, editorial"* — `#FAFAF8` canvas, `#FFFFFF` cards, `#E4E4E7` hairline borders, `#C8A951` Primary Gold CTAs (with `#18181B` text), and `#8E6C20` Deep Gold for readable gold text on light surfaces.
- **Dark Mode:** *"Focused, calm, institutional"* — `#121214` canvas, `#18181B` surfaces, `#27272A` raised surfaces, `#2E2E33` borders, `#C8A951` Primary Gold CTAs, and `#EDEDED` / `#A1A1AA` typography.
- **Gold Budget:** ≤ 4% of visible UI (80% neutral canvas/surfaces, 16% structure/typography, ≤ 4% gold). Zero gradients on interactive UI.

---

## 2. Color Palette & CSS Variables

See `D:\AI Projects\Trading Log\HIFY_COLOR_PALETTE.md` for the full master table and `:root` / `.dark` CSS variables (`--hify-gold`, `--hify-gold-hover`, `--hify-gold-deep`, `--hify-bg`, `--hify-surface`, `--hify-surface-raised`, `--hify-text`, `--hify-text-secondary`, `--hify-border`, `--hify-success`, `--hify-error`, `--hify-warning`).

### Semantic Status & Financial Colors (Separate from Brand Gold)
- **Active / Profit / Target Met:** Emerald (`#10B981` with soft tinted badge pill)
- **Pending / Staged GTT / Caution:** Warning Orange (`#EA580C` with soft tinted pill)
- **Closed Loss / Drawdown / Validation Error:** Rose (`#F43F5E` with soft tinted pill)

---

## 3. Component & Layout Conventions (US Stocks)
- **Typography:** Clean geometric sans-serif (`Inter`) for UI/headings + Monospace (`JetBrains Mono`, `tabular-nums`) for ticker prices, fractional `Shares`, Buy/Sell GTT targets, cost basis, FX/cashflows, and P&L. Minimum font size floor: `10px` (`text-[10px]`).
- **Primary Button:** Solid `--hify-gold` (`#C8A951`) with `#18181B` text; hover shifts to `--hify-gold-hover` (`#B6933A`). One dominant gold CTA per screen.
- **Secondary Button:** `--hify-surface` background with `1px` `--hify-border`; neutral hover.
- **Cards & Tables:** `1px` bordered cards (`rounded-xl`) with clear title, muted subtitle, sortable tabular columns (`SortableTh.tsx`), and clean modal actions (`CloseLotModal.tsx`).
- **Status Pills:** Dot + label inside neutral/semantic soft tinted pill (`Open`, `Staged GTT`, `Closed`).
- **Top Bar + Responsive Ready:** Neutral top navigation with HIFY bar-chart mark, theme toggle (Light/Dark), and `44px–48px` touch targets for responsive desktop/mobile use.
