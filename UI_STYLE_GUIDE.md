# Nexora — UI/UX Style Guide

This documents the **actual, current** design system used across Nexora (all modules, including IMS). It's extracted directly from the live source — every class name and value below is copy-pasted from real components, not idealized. Use this to keep any new screen visually identical to the rest of the app.

---

## 1. Tech Stack

- **React + Vite**, **Tailwind CSS** (utility classes only — no CSS-in-JS, no styled-components)
- **Dark mode**: Tailwind `darkMode: 'class'` — toggled via a `dark` class on `<html>`, driven by `ThemeContext` (`src/context/ThemeContext.jsx`)
- **Icons**: `lucide-react` exclusively
- **Dropdowns/Selects**: custom `ThemedSelect` (`src/components/theme/ThemedSelect.jsx`) — never native `<select>`
- **Date pickers**: custom `ThemedDatePicker`
- **Alerts/confirms**: `sweetalert2` (`Swal.fire(...)`) — never `window.confirm`/`alert`
- **PDF export**: `jspdf` + `jspdf-autotable`
- Config files: `tailwind.config.js`, `src/index.css`

---

## 2. Typography

- **Font family**: `"Inter", system-ui, sans-serif` — set once, globally, in `src/index.css`:
  ```css
  html { font-family: "Inter", system-ui, sans-serif; }
  ```
  Never override with `font-mono`/`font-serif` unless displaying literal code — even GST/PAN/account numbers use the default Inter font (a monospace override was explicitly removed from the PO details drawer for consistency).

- **Type scale** (Tailwind classes actually used, smallest → largest):

  | Class | Used for |
  |---|---|
  | `text-[9px]` / `text-[10px]` | Uppercase micro-labels above a value (`GST NUMBER`, `VENDOR CONTACT`) — always paired with `font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500` |
  | `text-[11px]` / `text-xs` (12px) | Secondary/meta text, table cell values, badges |
  | `text-sm` (14px) | Default body text, form inputs, button labels |
  | `text-base` | Card titles, drawer sub-headers |
  | `text-lg` | Drawer title (`po.id`), sidebar company name |
  | `text-xl` / `text-2xl` / `text-3xl` | Hero numbers (stat card values, "Total Value" in a drawer hero) |

- **Weights**: `font-medium` for normal emphasis, `font-bold` for labels/headers, `font-black` for hero numbers and grand totals (e.g. `text-base font-black text-green-600`). Plain paragraph text has no weight class.

- **The "micro-label + value" pattern** (used everywhere — vendor details, delivery details, item metadata):
  ```jsx
  <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">GST NUMBER</p>
  <p className="text-[13px] font-bold text-gray-800 dark:text-gray-100">{value}</p>
  ```

---

## 3. Color System

### 3.1 Dynamic theme color (per-company)
Nexora is multi-tenant — each company has its own brand color, resolved at runtime via `useTheme().getThemeColor()` and exposed as a CSS variable:

```css
:root {
  --theme-primary: #f97316;       /* default: orange-500 */
  --theme-primary-light: #fb923c;
  --theme-primary-dark: #ea580c;
}
```
`ThemeContext` overwrites these 3 variables from the company record on load. Utility classes exist for it:
`theme-bg`, `theme-bg-hover`, `theme-bg-dark`, `theme-text`, `theme-text-light`, `theme-border`, `theme-ring`, `theme-nav-hover`, `theme-gradient`.

**Rule of thumb**: any "brand" surface (active sidebar item, primary CTA button, drawer icon tile, gradient hero) uses `getThemeColor()` / `theme-*` classes — NOT a hardcoded orange. Hardcoded Tailwind `orange-*` is only used for secondary accents (warning banners, "locked" badges), not primary actions.

```jsx
const { getThemeColor } = useTheme()
<div style={{ backgroundColor: getThemeColor() }}>...</div>
<div style={{ background: `linear-gradient(135deg, ${getThemeColor()}, ${getThemeColor()}99)` }}>...</div>
```

### 3.2 Static Tailwind primary palette (fallback / non-dynamic contexts)
`tailwind.config.js` extends `primary`:
```
50 #fff7ed  100 #ffedd5  200 #fed7aa  300 #fdba74  400 #fb923c
500 #f97316 (DEFAULT)  600 #ea580c  700 #c2410c  800 #9a3412  900 #7c2d12
```

### 3.3 Neutrals
All surfaces/text use Tailwind gray scale with light/dark pairs:
- Page background: `bg-gray-50 dark:bg-gray-900`
- Card/drawer surface: `bg-white dark:bg-gray-800`
- Muted surface (inset panels, item rows): `bg-gray-50 dark:bg-gray-900/40`
- Borders: `border-gray-200 dark:border-gray-700` (cards), `border-gray-300 dark:border-gray-600` (inputs)
- Primary text: `text-gray-900 dark:text-white`
- Secondary/muted text: `text-gray-500 dark:text-gray-400`
- Micro-labels: `text-gray-400 dark:text-gray-500`

### 3.4 Semantic status colors
Status badges use a fixed light/dark pair map — reuse this exact map for any new status badge, don't invent new colors:

```js
const STATUS_BADGE = {
    Draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    'Pending L1': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    Approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'GRN Pending': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    'GRN Fulfilled': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    'GRN Variance': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    'Ready for Payment': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    Fulfilled: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'On Hold': 'bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',
    Blocked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    Cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}
```
Semantic meaning: **amber** = pending/waiting, **blue/indigo** = in-progress/approved-stage, **green/teal** = success/complete, **red** = rejected/blocked/cancelled, **gray/slate** = neutral/paused, **orange** = variance/warning.

Money/positive values: `text-green-600 dark:text-green-400`. Negative/shortfall: `text-red-500`. Excess/informational: `text-blue-500`.

---

## 4. Dark Mode

- Toggle: `ThemeContext.toggleTheme()` — flips `document.documentElement.classList` and persists to `localStorage.theme` (`'dark'`/`'light'`) + an encrypted `storageHelper` mirror.
- **Every single color utility must ship a `dark:` variant.** There are no light-only components in this codebase — a `bg-white` without a paired `dark:bg-gray-800` is treated as a bug (this exact issue was fixed across the entire public-facing quotation portal).
- Initial theme is applied **synchronously** before first paint (a `useRef` guard in `ThemeProvider`, not a `useEffect`) to avoid a flash of the wrong theme.

---

## 5. Layout Shell

### 5.1 Sidebar (`src/layout/components/DesktopSidebar.jsx`)
- Floating card look, not flush to the viewport edge: `lg:my-1 lg:ml-1 lg:rounded-xl`, `bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl`, soft shadow `shadow-[0_8px_30px_rgb(0,0,0,0.04)]`.
- Widths: **expanded `lg:w-64`**, **collapsed `lg:w-20`** (icon-only, tooltips appear on hover via a `createPortal`-rendered flyout with a triangular arrow pointing at the item, `border-left: 3px solid var(--theme-primary)`).
- Logo block is a fixed `h-16` row (matches header height), shows a rounded gradient-tinted initials tile if no logo image, `getCompanyInitials(companyName)`.
- Nav sections: uppercase micro-header `text-[10px] font-semibold text-gray-400 uppercase tracking-wider`, no background, `pointer-events-none`.
- Nav items: `text-[15px]`, `py-2 px-2.5 rounded-lg`. Active item: `theme-bg/10 theme-text font-semibold`. Inactive: `text-gray-600 dark:text-gray-300` + `theme-nav-hover` (hover recolors text to the brand color, no background hover).
- Expandable groups: chevron rotates 90° when open (`rotate-90`), sub-items indented `ml-[22px] pl-3`, sub-item text `text-[14px]` / `text-[13px]` in the collapsed-flyout variant.
- Mobile: full sidebar slides in as an overlay (`translate-x-0 w-80 max-w-[85vw]`) with a `bg-black/50 backdrop-blur-sm` scrim.

### 5.2 Header/topbar (`src/layout/components/Header.jsx`)
- Fixed height row aligned with the sidebar logo block (`h-16`).
- Right-aligned cluster of icon buttons: theme toggle, notifications, announcements, online users, fullscreen, profile dropdown (avatar + initials fallback, same gradient-tile pattern as the sidebar logo).
- Profile dropdown uses the same `ThemedSelect`-adjacent portal/positioning conventions as other popups.

### 5.3 Page content wrapper
Every module page follows the same skeleton:
```jsx
<div>
  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Page Title</h1>
  <p className="text-sm text-gray-500 dark:text-gray-400">One-line description</p>
  <StatsCards cards={...} activeFilter={...} onCardClick={...} />
  {/* filter bar */}
  {/* table */}
  <IMSPagination ... />
</div>
```

---

## 6. Stat Cards (`src/modules/ims/components/StatsCards.jsx`)

Generic clickable KPI grid used at the top of every list page.

```jsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
  <button className="h-full bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow hover:shadow-lg transition-all duration-200 text-left relative overflow-hidden group">
    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{label}</p>
    <p className="text-2xl sm:text-3xl font-medium text-gray-900 dark:text-white mt-2">{value}</p>
    <Icon className="absolute bottom-2 right-2 w-6 h-6 text-gray-400 transition-all duration-300 group-hover:scale-110" strokeWidth={2.5} />
  </button>
</div>
```
- Card count decides the grid: 3→`grid-cols-1 sm:grid-cols-3`, 4→`grid-cols-2 sm:grid-cols-4`, 5/6→`lg:grid-cols-5`/`6` (see `GRID_COLS` map — always use the literal Tailwind class, never a template string, so Tailwind's JIT scanner can find it).
- Selected/active filter card gets `ring-2 {card.ringColor}`.
- Icon sits bottom-right, faded (`text-gray-400`), grows slightly on hover — it's decorative, not a button.

---

## 7. Buttons

| Type | Classes |
|---|---|
| Primary CTA | `style={{ backgroundColor: getThemeColor() }}` + `text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90` (color is dynamic, never hardcoded) |
| Secondary/neutral | `bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600` |
| Danger (Delete/Reject) | `bg-red-600 hover:bg-red-700 text-white` or outline `border-red-200 text-red-600` for less destructive contexts |
| Success (Approve) | `bg-green-600 hover:bg-green-700 text-white` |
| Icon-only (close, edit, download) | `w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-95` |

Shared traits: `rounded-lg`, `transition-colors` or `transition-all`, `active:scale-95` on icon buttons for tactile press feedback, `disabled:opacity-40 disabled:cursor-not-allowed`.

Compact drawer-footer buttons (when many actions must fit): `px-2.5 py-1.5 text-xs` with `w-3.5 h-3.5` icons.

---

## 8. Cards & Panels

- Standard card: `bg-white dark:bg-gray-800 rounded-lg (or rounded-xl) shadow` + `border border-gray-200 dark:border-gray-700` when it needs a visible edge (drawers use borders more than shadows internally).
- Inset/nested panel (inside a drawer, grouping related fields): `bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border border-gray-200 dark:border-gray-700`.
- Colored info/alert panel (warning, locked-state banner): `bg-{color}-50 dark:bg-{color}-900/10 border border-{color}-200 dark:border-{color}-800/40 rounded-xl p-3.5`, paired with a small icon tile `w-8 h-8 bg-{color}-100 dark:bg-{color}-900/30 rounded-lg`.
- Hero/gradient banner (drawer top summary): `rounded-2xl p-5 text-white`, `background: linear-gradient(135deg, ${getThemeColor()}, ${getThemeColor()}99)`.

Radius convention: `rounded-lg` (8px) is the default for buttons/inputs/table cells; `rounded-xl` (12px) for cards/panels/badges-with-icons; `rounded-2xl` (16px) only for the big hero banner; `rounded-full` for pills/badges/avatars.

---

## 9. Tables / Lists

Standard responsive table (`src/modules/ims/components/*Table.jsx`):
```jsx
<table className="w-full">
  <thead>{/* uppercase, muted */}</thead>
  <tbody>
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer" onClick={() => onViewDetails(row)}>
      <td className="px-3 sm:px-6 py-4">...</td>
    </tr>
  </tbody>
</table>
```
- Rows are **entirely clickable** (opens a details drawer) — action buttons inside a row must `e.stopPropagation()`.
- Responsive column hiding: `hidden md:table-cell`, `hidden lg:table-cell` on secondary columns (never horizontal scroll for the primary columns).
- Status column always renders the shared `STATUS_BADGE` pill: `px-2.5 py-1 rounded-full text-xs font-medium`.
- Money columns: right-aligned, `font-bold`, `₹ {value.toLocaleString('en-IN')}`.
- Empty state: a single centered row/message, muted gray text, no icon needed for tables (icon-based empty states are used on full-page emptiness instead).

### Item/metadata sub-rows (inside drawers)
Never cram metadata into one wrapped inline line. Use a labeled grid instead:
```jsx
<div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-2 mt-2.5 pt-2.5 border-t border-gray-200 dark:border-gray-700">
  <div>
    <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Qty</p>
    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-0.5">{qty} {unit}</p>
  </div>
  {/* ...one <div> per field */}
</div>
```

---

## 10. Pagination (`IMSPagination.jsx`)

```jsx
<div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg mt-4">
  {/* "Showing X to Y of Z items" + rows-per-page ThemedSelect */}
  {/* Prev / numbered pages (max 5 visible, ellipsis for the rest) / Next */}
</div>
```
- Page-number buttons: `px-2.5 sm:px-3 py-1.5 min-w-[32px] border rounded`. Current page: `bg-blue-600 text-white border-blue-600` (note: pagination's "current page" uses static blue, not the dynamic theme color — this is an intentional exception).
- Prev/Next include the chevron icon + a label that's hidden on mobile (`hidden sm:inline`).

---

## 11. Dropdowns / Selects (`ThemedSelect.jsx`)

**Never use a native `<select>`.** `ThemedSelect` is a custom button + portal-rendered popup:
- Trigger: `w-full px-3 py-2 border rounded-md h-10 shadow-sm`, focus ring is the dynamic theme color via inline `style={{ boxShadow: '0 0 0 2px ' + themeColor }}`, chevron rotates 180° when open.
- Popup renders via `ReactDOM.createPortal(..., document.body)` and is positioned with `getBoundingClientRect()` (`position: fixed`) so it never gets clipped by a scrollable ancestor (e.g. a horizontally-scrolling table). Auto-flips to open upward if there isn't 250px below.
- Search box auto-shows when there are >8 options, or always via `alwaysShowSearch` — `w-full pl-8 pr-2 py-1.5 text-sm border rounded` with a `Search` icon absolutely positioned inside.
- Options list: `max-h-60 overflow-y-auto custom-scrollbar`, each option `px-3 py-2` with a `Check` icon (colored with the theme color) on the selected row.
- Supports avatar/initials-tile options (same 28px circular tile pattern as the header/sidebar).

Date pickers (`ThemedDatePicker`) follow the same visual language (bordered trigger, portal popup, theme-colored selected day).

---

## 12. Drawers — the dominant "modal" pattern

**Side drawers, not centered modals, are used for every create/edit/details view in IMS** (Purchase Orders, Quotations, MRs, GRNs, Accounts). This is the single most important pattern to replicate.

```jsx
return ReactDOM.createPortal(
  <div className="fixed inset-0 z-[10000] flex justify-end">
    <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in" onClick={onClose} />
    <div
      className="bg-white dark:bg-gray-800 w-full max-w-2xl h-full shadow-2xl flex flex-col relative border-l border-gray-200 dark:border-gray-700"
      style={{ animation: 'slideInRight 0.3s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm" style={{ backgroundColor: getThemeColor() }}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate">{title}</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium truncate">{subtitle}</p>
          </div>
        </div>
        {/* header-right icon buttons: Download, then X close, w-8 h-8 each */}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 space-y-6">
        {/* sections, each: <section><h3 className="text-xs font-bold ...">Section Title</h3>...</section> */}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800">
        {/* Cancel + primary action, or Edit/Delete/Reject/Approve/Hold cluster */}
      </div>
    </div>
  </div>,
  document.body
)
```

Key rules:
- **Width**: `max-w-2xl` for details/simple forms, `max-w-3xl` for GRN-style forms, `max-w-5xl` for complex multi-section forms (Purchase Order create/edit).
- **Slides in from the right** (`slideInRight` keyframe, 0.3s ease-out), backdrop fades in (`animate-fade-in`).
- **z-index**: `z-[10000]` for the drawer itself; a nested popup (e.g. a search side-panel within a drawer) goes to `z-[10050]`+.
- Header and footer are `flex-shrink-0` and sticky-looking (stay put while content scrolls); only the middle content section scrolls (`overflow-y-auto custom-scrollbar`).
- Icon tile in the header is always the 40×40px (`w-10 h-10`) rounded-lg square filled with `getThemeColor()`.
- Sections inside the content area are separated by `space-y-6` on the parent, each section optionally prefixed with a small icon + `text-xs font-bold` heading.
- **Locked/read-only fields** (data copied from an approved upstream document, e.g. a quotation's rate flowing into a PO): `disabled` + `opacity-60 cursor-not-allowed`, plus a small colored badge (`Lock` icon, `bg-blue-50 text-blue-600` pill reading "From Quotation"). **No "unlock/edit manually" escape hatch for financial/commercial fields** — once locked from an authoritative source, it stays locked. (A "Edit manually" unlock link is acceptable for less sensitive contact-info fields elsewhere, e.g. the public quotation portal's supplier lookup — but the default for anything financial is a hard lock.)

---

## 13. Modals / Confirmations

Native `confirm()`/`alert()` are never used. All confirmations go through `sweetalert2`:
```jsx
const { value: reason, isConfirmed } = await Swal.fire({
    title: 'Put this PO on hold?',
    input: 'text',
    inputPlaceholder: 'Reason (optional)',
    showCancelButton: true,
    confirmButtonText: 'Hold PO',
})
```
SweetAlert2 is forced above everything with a global z-index override in `index.css` (`.swal2-container { z-index: 99999 !important; }`).

---

## 14. Forms

Standard text/number input:
```jsx
const inputClass = (field) =>
  `w-full px-3 py-2.5 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
    errors[field] ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
  }`
```
- Label: `block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5`, required marker is a red asterisk: `<span className="text-red-500">*</span>`.
- Inline validation error: `<p className="text-xs text-red-500 mt-1">{errors.field}</p>` directly under the field.
- Disabled/locked fields: `opacity-60 cursor-not-allowed` layered on top of the normal input classes, never a visually distinct "disabled style" beyond that.
- Number inputs globally have the native spinner removed (`index.css`, `input[type=number]`).
- Currency display formatting: whole-rupee `Math.round(n).toLocaleString('en-IN')`; 2-decimal when precision matters (per-line GST math): `n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Always prefixed with `₹` (UI) or `Rs.` (PDF exports, since jsPDF's default font can't render ₹).

---

## 15. Icons

- **`lucide-react` only.** Never mix in another icon set.
- Sizing convention: `w-3.5 h-3.5` (14px, inline with small text/badges) → `w-4 h-4` (16px, buttons/inputs) → `w-5 h-5` (20px, drawer header icon tile, close button) → `w-6 h-6` (24px, stat-card decorative icon) → `w-8`–`w-11` for the colored icon-tile container itself (the icon inside stays 18-20px, centered).
- Icon tiles are always `rounded-lg` (or `rounded-xl` for larger ones), colored background at 10-30% opacity in dark mode (`dark:bg-orange-900/20`), full-opacity solid color in light mode (`bg-orange-100`), icon itself uses the ~500/600 shade (`text-orange-500`).

---

## 16. Spacing, Radius & Shadow Cheat Sheet

| Token | Value | Where |
|---|---|---|
| Page/section gap | `space-y-6` | Between drawer sections |
| Card padding | `p-3` to `p-5` | `p-3` compact rows, `p-4`/`p-5` cards & hero banners |
| Grid gap | `gap-2` to `gap-4` | Stat cards `gap-3 sm:gap-4`, form grids `gap-4` |
| Border radius (buttons/inputs) | `rounded-lg` (8px) | |
| Border radius (cards/panels) | `rounded-xl` (12px) | |
| Border radius (hero banner) | `rounded-2xl` (16px) | |
| Border radius (pills/avatars) | `rounded-full` | |
| Default border | `border border-gray-200 dark:border-gray-700` | Cards |
| Input border | `border border-gray-300 dark:border-gray-600` | Form fields |
| Shadow (card) | `shadow` → `hover:shadow-lg` | Stat cards |
| Shadow (drawer) | `shadow-2xl` | |
| Shadow (icon tile) | `shadow-sm` | |

---

## 17. Animation & Transition Conventions

Defined in `index.css` / `tailwind.config.js`:
- `animate-fade-in` — 0.5s ease-in-out opacity (backdrops)
- `slideInRight` (inline `style={{ animation: 'slideInRight 0.3s ease-out' }}`) — drawers
- `animate-fade-in-down` / `animate-fade-in-up` — 0.3s, dropdown/tooltip entrances
- Hover/press: `transition-colors` or `transition-all duration-200`, icon buttons add `active:scale-95` for a tactile press
- Custom dropdown entrance (when not using the portal default): `animate-in fade-in slide-in-from-top-2 duration-200 ease-out`

---

## 18. Scrollbars

Three named scrollbar utilities in `index.css`, always paired with a `dark:` variant:
- `.custom-scrollbar` — 8px, theme-orange thumb on hover (`rgba(249,115,22,0.6)`) — the default for drawer content and dropdown option lists
- `.custom-horizontal-scrollbar` — 6px height, for horizontally-scrolling tables
- `.no-scrollbar` / `.scrollbar-hide` — fully hidden, for carousels/chip rows
- Global fallback: every element gets a thin 6px gray scrollbar (`scrollbar-width: thin`) even without an explicit class

---

## 19. Public-Facing Pages (outside the authenticated shell)

Public portal pages (e.g. supplier quotation submission) reuse the same shell component (`PublicPortalShell.jsx`) and shared constants (`publicInputClass`, `publicLabelClass`, `publicCardClass`) — **they must carry the exact same `dark:` variants as the authenticated app**, since the app defaults to dark mode. Width variants: `max-w-xl` (default), `max-w-3xl` (`wide`), `max-w-6xl` (`extraWide`, pricing/comparison tables).

Native browser autofill must be suppressed on lookup/search-style inputs that could trigger Chrome's address heuristics (`type="search"` instead of `type="text"`, plus `[&::-webkit-search-cancel-button]:appearance-none` to hide the native clear icon).

---

## 20. PDF Exports

Generated client-side with `jspdf` + `jspdf-autotable` (see `PurchaseOrderDetailsDrawer.jsx`'s `downloadPDF`). House style:
- Primary color `[26, 54, 93]` (navy) — **not** the dynamic theme color; PDFs use a fixed corporate navy regardless of company branding
- Section header: filled navy bar, white bold centered text, `doc.rect(10, y, 190, 8, 'F')`
- Info grid: 4-column label/value rows with alternating filled/outlined cells (`doc.rect(..., 'FD')`)
- Money: `Rs. ` prefix (₹ glyph isn't reliable in the default PDF font), `toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
- Status pills inside tables: tinted cell background matched to status (`APPROVED` → light green, `REJECTED` → light red, `PENDING` → light gray, `INITIATED` → light blue)
- File naming: `{DocumentId}.pdf` (e.g. `PO-2026-513.pdf`)

---

## 21. Component Reference Map

| Pattern | Reference file |
|---|---|
| Sidebar | `src/layout/components/DesktopSidebar.jsx` |
| Topbar | `src/layout/components/Header.jsx` |
| Theme system | `src/context/ThemeContext.jsx`, `src/index.css` |
| Stat cards | `src/modules/ims/components/StatsCards.jsx` |
| Table | `src/modules/ims/components/PurchaseOrderTable.jsx` |
| Pagination | `src/modules/ims/components/IMSPagination.jsx` |
| Select dropdown | `src/components/theme/ThemedSelect.jsx` |
| Drawer (details, read-only) | `src/modules/ims/components/PurchaseOrderDetailsDrawer.jsx` |
| Drawer (form, create/edit) | `src/modules/ims/components/PurchaseOrderFormDrawer.jsx` |
| Public portal shell | `src/modules/ims/components/PublicPortalShell.jsx` |
| PDF export | `downloadPDF` inside `PurchaseOrderDetailsDrawer.jsx` |

**When building any new screen: find the closest existing pattern in this map, open that file, and copy its structure — don't invent new spacing/color/radius values.**
