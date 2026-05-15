# VieForce Patrol — Design notes

## Dual token stacks (intentional during migration)

| Layer | File | Use |
|-------|------|-----|
| **Elite / Phase 2** | `css/tokens.css` | OKLCH-aligned elevation, `--brand-navy`, dashboards, elite components. Theme via `data-theme="light|dark"`. |
| **Legacy Patrol** | `css/patrol.css` `:root` | `--navy`, `--blue`, `--green`, `--gold`, messenger bubbles, max-width 480px shell. |

New work should **prefer tokens.css** where the screen already imports it; otherwise extend **patrol.css** variables for consistency.

## Color strategy

- **Restraint (default for tools):** tinted neutrals + brand accents; no pure `#000` / `#fff` for large fields (tint toward navy or warm white).
- **Admin / desktop:** slightly wider layout (`max-width: 960px+`), still Vienovo palette.

## Impeccable policy (emphasis without stripe + clip text)

Shipped UI (`app.html`, `css/*.css`, `js/*.js`) should use:

- **Top border + full border** or **inset top shadow** for severity / pillar accents (replacing thick **left-border** stripes).
- **Solid text color** or **tinted backgrounds** for KPI emphasis — avoid **`background-clip: text`** / gradient-filled typography for body UI.

Static references under `docs/` and prototype HTML may still show older patterns; treat them as snapshots, not source of truth.

**Background gradients** on chips, avatars, and hero panels remain acceptable when they are fills on boxes — not clipped into glyphs.

## Typography

- **Inter** body, **Manrope** / **Montserrat** for display and admin headings.
- Cap line length on desktop admin (~65–70ch in prose; tables may scroll horizontally).

## Motion

- Prefer **opacity / transform**; avoid animating `height` or `layout` for primary navigation.

## Accessibility

- Modals: `role="dialog"`, `aria-modal="true"`, labelled title. **User Admin** (`admin.html`): initial focus moves into the dialog, **Tab** stays inside, **Escape** closes, focus restores to the control that opened the modal.
- Beta bar: `role="region"`, visible dismiss, keyboard focusable.
- Toasts: `role="status"` for success/error.
