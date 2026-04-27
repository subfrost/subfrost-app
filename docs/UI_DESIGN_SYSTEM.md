# UI Design System

> Glass morphism + top highlight pattern. Reference pages: FIRE vault, dxBTC vault, Home page, Swap chart.

## Core Pattern

Every card and container uses a frosted glass background with a **single top-edge border** that creates a subtle "lift" highlight. **Full box borders are forbidden on cards, panels, and inputs.**

## CSS Utility Classes

Use the named CSS utility classes in `app/globals.css` instead of composing raw Tailwind:

| Class | Use for |
|-------|---------|
| `.sf-card` | Standard card — stronger shadow, lifts on hover |
| `.sf-card-small` | **Non-interactive** display cards — softer shadow, no hover |
| `.sf-card-clickable` | **Clickable** cards — same as `.sf-card` but adds `cursor: pointer` |
| `.sf-panel` | Nested inner sections inside a card |
| `.sf-input` | All text/number/search inputs |
| `.sf-row` | List/table rows |
| `.sf-tab-group` | Wrapper for a row of tab buttons |
| `.sf-tab-btn` | Inactive tab button — panel bg, uppercase, bold |
| `.sf-tab-btn--active` | Active tab state — primary blue bg, white text |
| `.sf-card-header` | Title bar at the top of a card — tinted bg, bottom divider, flex row |
| `.sf-card-header-action` | "View all" style link in the right of a card header |
| `.sf-tile` | Clickable inner tile nested inside a card — surface bg, hover tint |
| `.sf-table-header` | Column header row — tinted bg, bottom border, muted caps text |
| `.sf-badge-apy` | APY / yield percentage pill badge |
| `.sf-dropdown` | Floating dropdowns and overlays |
| `.sf-collapsible-trigger` | Toggle button for collapsible panels (e.g. Transaction Details) |
| `.sf-dropdown-trigger` / `.sf-dropdown-trigger--open` | Pill-shaped select button (slippage, fee mode) — glows blue when open |
| `.sf-percent-btn-pill` | Quick-fill percent buttons (25 / 50 / 75 / MAX) inside token inputs |
| `.sf-pill-input` | Small fixed-width pill number input (h-7 w-16) — no border, blue glow on :focus |
| `.sf-btn-primary` | Primary CTA button — gradient bg, white text, scale on hover/active, disabled state |
| `.sf-btn-secondary` | Secondary action button — quiet surface bg, for Cancel / Retry / Select actions |
| `.sf-btn-ghost` | Ghost button — transparent bg, primary text, hover tint |
| `.sf-alert` | Alert/info box base — always pair with a colour modifier (see below) |
| `.sf-alert-green` / `.sf-alert-blue` / `.sf-alert-yellow` / `.sf-alert-orange` / `.sf-alert-red` / `.sf-alert-gray` | Colour modifiers for `.sf-alert` — theme-aware via `--sf-info-*` tokens |
| `.sf-alert-title` | Bold heading line inside an `.sf-alert` — colour auto-matches the modifier |

## Rules for New Components

**Cards & Containers**
- Use `.sf-card` for most cards and sections (stronger shadow, lifts on hover)
- Use `.sf-card-small` for **non-interactive** display-only panels (softer shadow, no hover)
- Use `.sf-card-clickable` when the **entire card is a click target** (adds `cursor: pointer`)
- Never add `border`, `border-gray-*`, `border-slate-*`, `ring-*` classes to a card
- Never use a full box border (`border border-[color:var(--sf-outline)]`)

**Inputs**
- Use `.sf-input` — no border, blue glow shadow on focus only
- Never use `border`, `focus:ring-*`, `focus:border-*`, or `focus:outline-*` on an input

**List Rows**
- Use `.sf-row` — bottom border only, hover tints with primary color
- Never use full box borders on rows

**Transitions**
- Standard easing: `transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)]`
- Shadow-only transitions: `transition-shadow duration-[200ms]`

**Colors — always use CSS variables**
- Primary text: `text-[color:var(--sf-text)]`
- Muted/secondary: `text-[color:var(--sf-text)]/60`
- Primary CTA: `text-[color:var(--sf-primary)]` / `bg-[color:var(--sf-primary)]`
- Hover tint: `hover:bg-[color:var(--sf-primary)]/10`

**Both themes are automatic** — all `--sf-*` variables switch values under `[data-theme="light"]`. Never hardcode dark-only hex colors; always use `var(--sf-*)` tokens.

## Anti-patterns (do not replicate)
- Solid border on all 4 sides of a card
- `border border-gray-300` / `border border-slate-700`
- `focus:ring-2 focus:ring-blue-500` on inputs
- Opaque backgrounds without backdrop-blur
