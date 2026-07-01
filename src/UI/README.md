# UI

Bare-bones React UI scaffold for the monorepo.

This first pass is intentionally domain-neutral. It provides a small Vite + React + TypeScript application shell that can be shaped later once product orientation is defined.

## Scripts

- `npm run dev`: start the local development server.
- `npm run build`: type-check and build the UI.
- `npm run preview`: preview the production build locally.
- `npm run lint`: run ESLint.

## Structure

```text
src/UI/
  index.html
  package.json
  src/
    App.tsx
    main.tsx
    styles.css
```

## Current Scope

- React application shell.
- Neutral placeholder layout.
- TypeScript configuration.
- ESLint configuration.
- No domain model, business logic, routes, data fetching, or product-specific UI.
