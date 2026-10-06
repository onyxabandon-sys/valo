# Environment Setup

The checkout tracks `.env`, so do not put the PostHog token or other credentials
in that file. In development, put local overrides in ignored `.env.local`.
`react-native-dotenv` loads `.env` first and overlays `.env.local` automatically;
do not set `APP_ENV_FILE` for the normal Metro or Android development path. For
a production build, provide production values through the approved CI secret
store or an ignored `.env.production` file. Do not build or publish production
without release approval.

## Required

- `APP_NAME`
  - App display name.
  - Example: `Valet POS`

- `CONVEX_URL`
  - Your Convex deployment URL.
  - Example: `https://your-deployment.convex.cloud`

- `CONVEX_SITE_URL`
  - Public HTTP URL for the same Convex deployment.
  - Example: `https://your-deployment.convex.site`

- `POSTHOG_API_KEY`, `POSTHOG_HOST`, and `POSTHOG_ENVIRONMENT` (optional)
  - Set the public `phc_` project token and its matching region host to enable PostHog.
  - Use `https://us.i.posthog.com` for US Cloud or `https://eu.i.posthog.com` for EU Cloud.
  - Leave the key or host empty to disable PostHog. Do not use a personal API key here.
  - This app is configured for PostHog US project `635980` in development and production. The environments share the project's data, quotas, retention, and billing.
  - Project `635980` in US Cloud is selected for both environments. Local development uses `.env.local`; production must use the same public project token and host with `POSTHOG_ENVIRONMENT=production` from the approved release secret path. Never use a personal API key or PostHog CLI upload key in the app environment.

- `POSTHOG_SESSION_REPLAY_ENABLED` and `POSTHOG_SURVEYS_ENABLED` (optional)
  - Both default to `false` in `.env.example`.
  - Local development has replay enabled in ignored `.env.local`. Replay records visible text, inputs, and images without masks; credential entry views stay inside `PostHogMaskView`.
  - The PostHog project has Session Replay enabled. Keep production replay off until a production release is approved and operator notice or consent requirements are met.
  - Surveys stay hidden until a survey has an approved purpose, wording, audience, and frequency limit.

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
  - Must be an integer from `1` to `30`.
  - Example: `30`

- `DEFAULT_LOCATION_NAME`
  - Fallback stand name used in the UI and seed data.
  - Example: `Main Gate, Building A`

- `DEFAULT_LOCATION_ADDRESS`
  - Fallback address shown in profile/menu.
  - Example: `Mumbai, Maharashtra`

## Device access approval

The preferred route sends an eight-digit, one-use code from the Convex server through Brevo's WhatsApp sender to the WhatsApp number saved on the approved user profile. The code expires after 15 minutes and is bound to that sign-in session and device. The app asks for foreground location only after code approval and stays outside the home screen until Convex saves the location.

Set these values on each Convex deployment that runs the app. Keep them out of the React Native `.env` file because the mobile bundle is public:

- `BREVO_API_KEY`: a server-only Brevo API key allowed to send transactional WhatsApp messages.
- `BREVO_WHATSAPP_SENDER_NUMBER`: the activated WhatsApp sender number in country-code format without a leading `+`.
- `BREVO_WHATSAPP_TEMPLATE_ID`: the approved Brevo template ID. Configure template parameters named `code` and `expiresInMinutes`.
- `BETTER_AUTH_SECRET`: the existing Better Auth secret, also used as the server-only HMAC key for approval codes. Keep it at least 32 characters and do not rotate it without a planned auth migration.

Activate the WhatsApp Business sender and approve the template in Brevo before adding these values. The approved Valet user profile must contain a WhatsApp number in E.164 format, such as `+14155550123`. See [Brevo's WhatsApp messages API](https://developers.brevo.com/docs/whatsapp-messages) and [Convex deployment environment variables](https://docs.convex.dev/production/environment-variables). Set values through the selected Convex deployment's settings. Use separate credentials for development and production. Never put a real API key in this document, `.env.example`, or the app bundle.

When all three WhatsApp variables are absent, the app uses the labeled manual-forward fallback. That route requires `ACCESS_APPROVER_EMAIL`, `BREVO_SENDER_EMAIL`, and `BREVO_API_KEY` for transactional email; the owner must forward the code to the requester in a private, one-to-one WhatsApp chat. A partially configured WhatsApp route or a Brevo rejection blocks access and shows a retry message. A new sign-in session always needs a new code, and logging out revokes that session's approval.

## Recommended local values

```env
APP_NAME=Valet POS
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_SITE_URL=https://your-deployment.convex.site
POSTHOG_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_ENVIRONMENT=development
POSTHOG_SESSION_REPLAY_ENABLED=false
POSTHOG_SURVEYS_ENABLED=false
BETTER_AUTH_SECRET=replace_me_with_a_long_random_secret
BETTER_AUTH_URL=http://localhost:3000
SUNMI_PRINT_ENABLED=false
OFFLINE_QUEUE_RETENTION_DAYS=30
DEFAULT_LOCATION_NAME=Main Gate, Building A
DEFAULT_LOCATION_ADDRESS=Mumbai, Maharashtra
```

## Notes

- Do not commit your real `.env` file.
- Keep `BETTER_AUTH_SECRET` unique and private.
- Set `SUNMI_PRINT_ENABLED=true` only on the Sunmi terminal build.
- Never place production credentials in `.env.local`; it is loaded as a local
  development override on top of `.env`.
