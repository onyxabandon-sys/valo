# Valet Operations dashboard

This Next.js app uses the shared Better Auth account and protected Convex administrator functions. It reads live locations, users, device assignments, and audit entries after the server confirms an active administrator session with MFA.

## Local setup

1. Copy `.env.example` to `.env.local` and set the Convex cloud and site URLs for the development deployment you intend to use.
2. From `admin-web`, run `npm ci --prefix ..` and then `npm ci` to install the locked root and admin dependencies. The Convex backend types are imported from outside this directory.
3. Start the dashboard with `npm run dev`, then open `http://127.0.0.1:3000`.
4. Run `npm run typecheck` and `npm run build` before sharing a build.

The two `NEXT_PUBLIC_CONVEX_*` values are public deployment addresses. Never put an administrator setup secret, Brevo key, or other server credential in this file or in a `NEXT_PUBLIC_*` variable.

## One-time configured administrator

Set `ADMIN_BOOTSTRAP_EMAIL`, a new, high-entropy `ADMIN_BOOTSTRAP_SECRET`, and the exact `ADMIN_DASHBOARD_ORIGIN` as server environment variables on the Convex deployment. Do not reuse a password or secret pasted into a chat. The bootstrap secret must contain at least 32 characters and is accepted only once. `ADMIN_DASHBOARD_ORIGIN` must be one HTTP or HTTPS origin without a path, such as `https://admin.example.com`; do not use a wildcard. The configured administrator must use the configured email, enable authenticator MFA, then complete the one-time setup form. Existing administrator accounts do not block this one-time setup; the server closes setup after it creates or links the configured account.

The dashboard does not initialize an administrator when either URL is missing. Management queries and mutations also reject non-admin or non-MFA sessions on the server. A hidden button or client-side role value cannot grant access.

## Operational behavior

- Attendant profiles are created by an administrator. A self-created Better Auth account cannot provision its own Valet profile or enter the mobile app.
- Disabling an attendant revokes the current device assignment and sessions while keeping receipt and ticket history.
- Releasing a device removes its current binding and requires fresh code approval and a new location fix on the replacement device. Revoking a device blocks sign-in until an administrator assigns a device again.
- Exact device coordinates are available only to an administrator session whose MFA claim is active.
- Lists load more records in pages. Workspace count cards show `200+` while their exact count is still being loaded.
- A dashboard account can sign in and manage records only after it has an active administrator profile and MFA. New admin invitations are not implemented.

## Deployment and external services

The GitHub Actions workflow installs the locked root and admin dependencies, type checks, and builds this app on every push and pull request. Connect the GitHub repository to Vercel to enable automatic deployments for every push: use `admin-web` as the Root Directory, the Next.js framework preset, and enable “Include source files outside of the Root Directory in the Build Step” because the app imports generated API types from `convex/`. The Vercel install command installs both lockfiles so those shared Convex sources can resolve their dependencies. Set `main` as the production branch so Vercel deploys it to Production and other branches to Preview. Set `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` in the matching Vercel environments so the dashboard can connect to Convex.

This repository does not confirm which Convex project should receive the schema or functions. Verify the team, project, environment, and recovery plan before setting remote environment variables or deploying.

Approval codes use direct Brevo WhatsApp delivery when the Convex deployment has a configured sender and approved template. When those WhatsApp settings are absent, the app labels the email-to-owner route as a manual WhatsApp-forward fallback. The Brevo account and sender are not configured or verified in this workspace, so delivery has only been tested with mocked provider responses.
