# Shared Types

`@food-delivery/types` contains domain types shared by API and mobile. It is a
pnpm workspace dependency and has no separate runtime process.

```bash
pnpm typecheck:mobile
pnpm --dir apps/api exec tsc --noEmit
```

Keep API DTO validation and mobile handling compatible when changing a shared
domain type.
