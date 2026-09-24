# Core Convexity Trading Journal

A Vite + React trading journal workspace inspired by professional execution and analytics dashboards.

## Run locally

```bash
pnpm install
pnpm dev
```

Build the production bundle with `pnpm build`.

## Draft structure

- `src/App.jsx` — app shell, navigation, theme, privacy mode, and filters
- `src/pages.jsx` — dashboard, calendar, daily journal, trade review, reports, and prop-firm views
- `src/components.jsx` — reusable navigation, cards, metrics, and shared UI
- `src/charts.jsx` — lightweight SVG and CSS chart components
- `src/data.js` — draft data ready to be replaced by an API or store
- `src/styles.css` — design tokens, dark/light themes, and responsive layout

The secondary workspace sections are scaffolded as polished placeholders so custom components can be dropped in as they arrive.
