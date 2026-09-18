# UI and design system

Dark-mode-first, red and black, built on Tailwind with CSS-variable tokens.

## The theming mechanism

Colours are declared once as **RGB channel triplets** on `:root`, and overridden by `html.dark`
([`app/globals.css`](../app/globals.css)):

```css
:root       { --c-surface-1: 245 245 245; --c-content: 10 10 10;   --c-ignite: 237 21 21; }
html.dark   { --c-surface-1: 10 10 10;    --c-content: 245 245 245; --c-ignite: 237 21 21; }
```

Tailwind maps them with the alpha placeholder
([`tailwind.config.ts`](../tailwind.config.ts)):

```ts
'surface-1': 'rgb(var(--c-surface-1) / <alpha-value>)'
```

The consequence: **the same utility class resolves differently per theme**. `bg-surface-1`,
`text-content` and `bg-ignite/15` all just work in both. There are no `dark:` variants anywhere
in the codebase, and you should not add any — flipping one class on `<html>` re-themes
everything.

Dark is the default (`<html className="dark">`). An inline script in the root layout reads the
stored preference *before* first paint, so users who chose light never see a dark flash.

## Tokens

| Token | Use |
| --- | --- |
| `base` | Page background |
| `surface-1` | Cards, panels, raised surfaces |
| `surface-2` | Inputs, secondary buttons, insets |
| `surface-3` | Borders, dividers |
| `content` | Primary text |
| `content-muted` | Secondary text, icons |
| `ignite` | Brand red — primary actions, active states |
| `ignite-dark` | Hover for primary, danger |
| `ignite-light` | Links and accents. **Darker in light mode**, deliberately, to hold AA contrast on white |

A fixed `ignite-50…900` scale exists for the rare case needing a specific tint that must not
shift with the theme.

### Utilities

- **`.focus-ignite`** — the accessible focus ring. Put it on **every** interactive element.
- **`.hover-glow`** — the red glow on hover for interactive surfaces.
- **`.legal-prose`** — long-form typography, scoped to policy pages so it never affects the
  dense app UI. `.not-prose` opts a nested component back out.

Reduced motion is honoured globally: all animation and transition durations collapse to ~0 under
`prefers-reduced-motion: reduce`.

## Component inventory

### Primitives — `components/ui/`

| Component | Notes |
| --- | --- |
| `Button` | Variants `primary`, `secondary`, `ghost`, `danger`. Spreads button attributes. |
| `Card` | Bordered panel with standard padding. |
| `Badge` | Tones `neutral`, `success`, `warning`, `danger`, `brand`. |
| `Select` | **Themed dropdown — see below.** |
| `PasswordInput` | Input with show/hide toggle. **`onChange` takes a `string`, not an event.** |
| `Spinner` | `bi-arrow-repeat` with slow spin. |
| `Skeleton` | Shaped loading placeholder. Prefer over a spinner when the final layout is known. |
| `Toaster` / `useToast` | Transient notifications. |
| `ThemeToggle` | Light/dark switch, persisted to `localStorage`. |

### States — `components/states/`

| Component | Use |
| --- | --- |
| `StatusPage` | Full-viewport outcome screen (404, 403, 500, maintenance, offline, session expired). |
| `EmptyState` | Nothing exists yet — an invitation to create. |
| `NoSearchResults` | Rows exist but none matched. Names the query back and offers a clear action. |
| `LoadingState` | Indeterminate in-page loading. |
| `ErrorState` | A panel failed. **Pass `onRetry` wherever the action is repeatable.** |
| `SuccessState` | Action completed. |

`EmptyState` and `NoSearchResults` are not interchangeable: one means *create something*, the
other means *change your query*.

### Layout — `components/layout/`

`Sidebar`, `Navbar`, `ProtectedShell` (authenticated), `PublicShell` (works signed in *and*
out — legal, help, support), `SiteFooter` (legal links, rendered on both sides of the login
boundary).

## The `Select` component

**Do not use the native `<select>`.** Browsers render it with OS chrome that ignores the theme
tokens entirely and looks foreign in both light and dark mode. Every dropdown in the app uses
[`components/ui/Select.tsx`](../components/ui/Select.tsx).

```tsx
<Select
  id="pref-tone"
  aria-label="Default tone"
  value={tone}
  onChange={setTone}
  options={[
    { value: 'professional', label: 'Professional' },
    { value: 'casual', label: 'Casual', icon: 'bi-emoji-smile' },
    { value: 'legacy', label: 'Legacy', disabled: true, description: 'No longer available' },
  ]}
/>
```

| Prop | Purpose |
| --- | --- |
| `options` | `{ value, label, icon?, description?, disabled? }[]` |
| `value` / `onChange` | Controlled; `onChange` receives the value string |
| `placeholder` | Shown when `value` matches no option |
| `size` | `'sm'` or `'md'` (default) |
| `name` | Emits a hidden input for native form submission |

**Implementation notes worth knowing:**

- The popup is **portalled to `<body>` and positioned `fixed`**, so it is never clipped by a
  scrolling or `overflow-hidden` ancestor — a real problem in the chat header and inside cards.
- It **flips above the trigger** when there is not enough room below, and repositions on scroll
  and resize.
- Full keyboard support: arrows, Home/End, Enter/Space, Escape, Tab, and first-letter typeahead.
- ARIA combobox/listbox semantics with `aria-activedescendant`.
- Menu `z-index` is `55` — above the mobile sidebar drawer (50), below the onboarding tour (60).

## Icons

[Bootstrap Icons](https://icons.getbootstrap.com/), imported once in `globals.css`.
Decorative icons **must** carry `aria-hidden="true"`; icon-only buttons **must** carry an
`aria-label`.

## Conventions

- Compose class names with `clsx`.
- `.focus-ignite` on every interactive element — never suppress focus rings.
- Use tokens, never raw hex or Tailwind's default palette.
- Reach for `Skeleton` over `Spinner` when you know the final shape.
- Emerald is the one sanctioned non-red accent, for success only — success must not read as
  ignite red, which signals action or danger everywhere else.
- Everything must work at phone width.

## Accessibility

Commitments and known gaps are documented user-facing at `/legal/accessibility`. The target is
**WCAG 2.1 AA**. When adding UI, keep that page honest.
