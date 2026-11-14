# Frontend conventions

This package covers WBS-4.1 (frontend setup) and WBS-4.2 (shared layout and components). Run commands from `frontend/` as described in the [main README](../README.md). No database setup is needed.

The package builds on Ege's WBS-28.1 scaffold: React 18, React Router 6, Tailwind 3 and Vitest. Backend and frontend have separate lockfiles; Prisma stays in `backend/`.

- Use TypeScript with strict checks, function components, named exports, two-space indentation, single quotes and no semicolons. Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` before review.
- Put pages in `src/pages/`, reusable UI in `src/components/ui/`, and the common navigation and page frame in `src/components/layout/`. Keep tests in `frontend/tests/`, following the project submission guide.
- Add routes under `AppLayout` in `AppRoutes` in `src/App.tsx` so every page shares navigation, the skip link, main landmark and footer. Use `PageLayout` for the page heading and content spacing. `src/config/navigation.ts` supplies the current menu and placeholder destinations. Replace placeholders with feature pages only in their own work packages. Add a document title for new routes in `AppLayout`.
- Keep all user-facing labels, validation text and status messages in Turkish. Use Tailwind 3 utilities and the theme tokens in `tailwind.config.js` and `src/index.css`. Layouts start with one column and adapt with `sm`, `md` and `lg` breakpoints. Maintain 44px touch targets, visible focus indicators and readable form text. Test at 360px and desktop widths; the later project-wide real-phone check remains WBS-4.3.

## Shared components

| Component | Contract |
| --- | --- |
| `Button` | Native button props and ref; `primary`, `secondary`, `ghost` or `danger`; defaults to `type="button"`; `loading` disables interaction and sets `aria-busy`. Use `type="submit"` explicitly inside forms. |
| `LinkButton` | React Router link props with the same visual variants. Use for navigation, keeping native link semantics. |
| `Card` | Native div attributes, children and additional classes; common border, surface and responsive padding. |
| `Form` | Native form attributes and standard vertical spacing. The feature owns submission and validation; the component performs no requests. |
| `Input`, `Select`, `Textarea` | Native element props plus required `label`, optional `hint` and `error`. Unique IDs are generated unless supplied. Labels, hints and errors are associated automatically. Errors set `aria-invalid`; custom `aria-describedby` values are preserved. Native `required`, `disabled`, controlled values and refs are supported by `forwardRef` for React 18. |
| `Alert` | `variant="error"`, `"success"` or `"info"`, a `title`, optional children and ID. Errors use `role="alert"`; other messages use `role="status"`. Insert dynamic messages when their state changes. |

```tsx
import { Form } from './components/ui/Form'
import { Input } from './components/ui/FormControls'
import { Button } from './components/ui/Button'

// The feature supplies handleSubmit and emailError.
<Form onSubmit={handleSubmit} aria-label="Örnek form">
  <Input
    name="email"
    type="email"
    autoComplete="email"
    label="E-posta"
    hint="İTÜ e-posta adresini kullan."
    error={emailError}
    required
  />
  <Button type="submit">Devam et</Button>
</Form>
```

Tests exercise actual navigation, direct route rendering, unknown-page recovery, mobile menu state and keyboard dismissal, focus after navigation, form validation, disabled/loading buttons, label associations and error/success announcements. No feature API or sample database records are used.

Tests run with Vitest and React Testing Library. Use `src/lib/api.ts` for future backend requests; `/api` and `/health` proxy to port 3000 during development. Only browser-safe configuration belongs in `VITE_*` variables. Do not import Prisma or database URLs into frontend code.

Setup references: [Vite](https://vite.dev/guide/), [Tailwind's Vite integration](https://tailwindcss.com/docs/installation/using-vite), and [React Router declarative mode](https://reactrouter.com/start/declarative/installation).
