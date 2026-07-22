# Environment Setup

Create a local `.env` file from `.env.example` and fill these values:

## Required

- `APP_NAME`
  - App display name.
  - Example: `Valet POS`

- `CONVEX_URL`
  - Your Convex deployment URL.
  - Example: `https://your-deployment.convex.cloud`

- `BETTER_AUTH_SECRET`
  - Long random secret used by Better Auth.
  - Example: `replace_me_with_a_long_random_secret`
  - Use a unique secret per environment.

- `BETTER_AUTH_URL`
  - Base URL for the auth service.
  - Example: `http://localhost:3000`

- `SUNMI_PRINT_ENABLED`
  - Enables hardware print path.
  - Example: `false` for local/dev, `true` on Sunmi hardware

- `OFFLINE_QUEUE_RETENTION_DAYS`
  - How long synced local tickets stay on the device.
  - Example: `90`

- `DEFAULT_LOCATION_NAME`
  - Fallback stand name used in the UI and seed data.
  - Example: `Main Gate, Building A`

- `DEFAULT_LOCATION_ADDRESS`
  - Fallback address shown in profile/menu.
  - Example: `Mumbai, Maharashtra`

## Recommended local values

```env
APP_NAME=Valet POS
CONVEX_URL=https://your-deployment.convex.cloud
BETTER_AUTH_SECRET=replace_me_with_a_long_random_secret
BETTER_AUTH_URL=http://localhost:3000
SUNMI_PRINT_ENABLED=false
OFFLINE_QUEUE_RETENTION_DAYS=90
DEFAULT_LOCATION_NAME=Main Gate, Building A
DEFAULT_LOCATION_ADDRESS=Mumbai, Maharashtra
```

## Notes

- Do not commit your real `.env` file.
- Keep `BETTER_AUTH_SECRET` unique and private.
- Set `SUNMI_PRINT_ENABLED=true` only on the Sunmi terminal build.
