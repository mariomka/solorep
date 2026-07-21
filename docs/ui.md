# UI Conventions

## How It Works

- Mobile-first single column (`max-w-md mx-auto`) -- this is a phone-at-the-gym app; desktop is an afterthought.
- shadcn/ui primitives live in `src/components/ui/` -- add new ones with `bunx shadcn@latest add <name>`, never hand-write or edit them casually. Feature components live flat in `src/components/`.
- Tailwind 4 is CSS-first: theme tokens live in `src/index.css` (`@theme`), there is no tailwind.config file.
- Path alias `@/` -> `src/` (both tsconfig and vite resolve it).

## Key Conventions

- UI copy in Spanish; code in English.
- Errors render inline with `role="alert"` -- no toasts, no confirm dialogs (user-decided; don't add libraries for this).
- Multi-line error text (Zod `prettifyError` output) needs `whitespace-pre-line` or it collapses.
- Icon-only buttons need `aria-label`. Tests target `data-test`, never accessibility metadata.
- Every DOM element selected by a test needs a stable `data-test` attribute.
- Test behavior and state, never Tailwind classes or other CSS implementation details.
- Implement accessibility, but do not add tests whose only assertion is an accessibility attribute.
- Hidden file inputs: `sr-only` class + `aria-label`, triggered from a visible Button via ref.

## Gotchas

- ALWAYS reset `input.value = ""` in a `finally` after handling a file selection -- otherwise re-selecting the same file fires no `change` event and the import path is silently dead.
- Capture `event.currentTarget` into a local before any `await` in a handler; React nulls it afterwards.
- Biome bans non-null assertions: `ref.current?.click()`, never `ref.current!`.
- Async handlers must not float promises (delete button pattern: catch + `console.error`).
