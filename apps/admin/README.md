# Wasil Admin Portal

React/Vite browser portal for operations, moderation, support, delivery log,
orders, driver operations, finance, and notifications.

## Setup and commands

```bash
cp apps/admin/.env.example apps/admin/.env
pnpm install

# Run API first
pnpm --dir apps/api dev

# Run portal (normally http://localhost:5174)
pnpm --dir apps/admin dev

# Validate/build/preview
pnpm --dir apps/admin typecheck
pnpm --dir apps/admin build
pnpm --dir apps/admin preview
```

Use `VITE_API_URL=/api` locally. In production set it to an HTTPS API prefix,
for example `https://api.example.com/api`, and add the exact portal origin to
the API CORS settings. `VITE_*` values are public browser-build values—never
put secrets in them.

Only active `ADMIN` accounts can enter this portal. Bootstrap is described in
the API guide.
