# Frontend TypeScript Structure

This folder mirrors an app-oriented structure (`app`, `components`, `features`, `lib`, `types`) while still compiling to browser scripts for the current web app.

## Folder layout

```
frontend-ts/
  app/
    _layout.tsx
    globals.css
    index.tsx
  components/
    button.tsx
    header.tsx
    panel.tsx
  constants/
    theme.ts
  features/
    panels/
      panel-view-manager.ts
  hooks/
    use-panel-view.ts
  lib/
    dom.ts
  types/
    header.ts
    panel.ts
```

## Runtime output

Generated file:

- `../js/panel-component.js`
- `../styles/tailwind.generated.css`

## Build

From repository root:

```bash
cd backend
npm run build:frontend-panels
npm run build:frontend-tailwind
```

Or run both in one command:

```bash
cd backend
npm run build:frontend-ui
```

## Tailwind migration scope

Currently migrated to Tailwind component layer (`frontend-ts/app/tailwind.css`):

- `.btn` (and `.sidebar button`)
- `.panel`
- `.header-tile`
- `.review-header-tile`
- `.app-panel-header*`

## Wiring in current app

1. `index.html` loads `js/panel-component.js` before `js/navigation-layout.js`.
2. `navigation-layout.js` calls `createPanelViewManager(...)` and keeps legacy `setView(...)` compatibility.

## Ant Design icons in TS components

You can now pass Ant Design icons by prefixing with `antd:` in button options.

Example:

```ts
{
  icon: 'antd:menu-outlined',
  iconColor: '#ffffff',
  iconSize: 18
}
```

Notes:

- `icon` without `antd:` still works as a normal local/absolute asset path.
- Ant Design icons are resolved via Iconify CDN at runtime.
