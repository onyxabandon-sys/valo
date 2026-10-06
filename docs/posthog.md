# PostHog

## Project and environment setup

PostHog is optional at app startup. `App.tsx` creates one SDK provider. It stays
disabled unless `POSTHOG_API_KEY` is a public `phc_` project ingestion token,
`POSTHOG_HOST` is `https://us.i.posthog.com`, and `POSTHOG_ENVIRONMENT` matches
the build (`development` or `production`). Product events and logs receive that
environment label. The selected target is project `635980` in PostHog US Cloud
for both development and production. Those environments share one project and
its quotas, retention, and billing. The public project token is stored only in
the ignored local development override, not in tracked environment files.

The repository's `.env` is tracked by Git, so do not put the project token or
other credentials there. In development, React Native dotenv loads `.env` and
then overlays `.env.local`; do not set `APP_ENV_FILE` on the normal Metro path.
The local override contains only PostHog values. Production builds must receive
the same public token from the approved release secret path with the production
environment label; production config has not been changed. Never use a personal
API key or `POSTHOG_CLI_API_KEY` in the app bundle. PostHog receives and retains
collected data under project `635980` settings and retention.

## Data contract

The app captures only these explicit product events. Screen events use stable
React Navigation route names and never include route parameters.

| Event | Boundary | Properties |
| --- | --- | --- |
| `user_session_started` | Resolved authenticated session starts | None |
| `ticket_created` | Receipt has been saved locally | `vehicle_type`: `Bike` or `Car` |
| `report_exported` | Report share completes successfully | None |

The React Native SDK's default app lifecycle events are enabled. Generic touch
autocapture, console capture, and network capture are disabled. The app never
identifies an operator or sends an account ID, email, name, receipt data, plate,
amount, location, prompt, or generated content. On login, logout, or account
change, the client resets its anonymous identity; it never uses analytics
identity for authorization.

## Replay and sensitive data

The app displays operator and customer names and emails, vehicle plate numbers,
organization and location names and addresses, receipt amounts and payment
status, receipt/barcode values, and device GPS/location details. It does not
display health or food data. The requester approved recording these listed data
types. Login and signup passwords, authenticator secrets, one-time and backup
codes, and organization access codes are credentials and are excluded with the
SDK's `PostHogMaskView`.

The installed `posthog-react-native` 4.78.0 SDK exposes independent
`maskAllTextInputs` and `maskAllImages` options. The integration sets both to
`false` only when `POSTHOG_SESSION_REPLAY_ENABLED=true`; it also leaves
`maskAllSandboxedViews=true` and disables log, network, and touch capture.
Touch coordinates can expose values entered on known keypads. This is
full-fidelity collection of visible app text, text
inputs, and images. Passwords, auth tokens, private keys, and other credentials
must never be recorded. `PostHogMaskView` is the SDK's supported view-level
exclusion. The project onboarding enabled Session Replay, and the ignored local
development config enables recording. The JavaScript bundle contains the US
host and replay-enabled config, but no Android runtime replay has been received
or inspected because no device or emulator is connected. Keep production replay
off until a production release is approved and operator notice or consent
requirements are met.

## Flags, experiments, and surveys

`valetpos-report-export-enabled` is the one registered app flag. It controls
optional Excel report sharing only. Its safe local default is enabled, and the
export remains subject to the app's existing authentication and data checks. It
does not control access to tickets, receipts, or accounts. The PostHog SDK uses
its normal quota-limited default response when flags cannot be fetched.

There is no suitable experiment yet: the app has no proposed non-essential
variant with a defined success metric and stop condition. Do not experiment on
ticket creation, receipt printing, identity, location, or other core POS paths.

The SDK survey provider is present but disabled by default. Draft survey wording:

> How well did Valet POS support your last shift?
>
> Rate from 1 (not well) to 5 (very well).

This rating-only draft avoids free-text collection. The audience, trigger, and
frequency still need approval before a survey is created or published. A mobile
survey cannot use web URL or CSS selector targeting.

## Errors, logs, AI, and messaging

The SDK error boundary and JavaScript uncaught exception, unhandled rejection,
and handled UI error capture are configured. `before_send` limits `$exception`
events to exception type, level, handled state, and bounded runtime/version
fields; it replaces raw exception messages, preserves only safe stack-frame
identifiers and line numbers, and removes component stacks and breadcrumbs to
avoid sending user text or credentials. Native crash capture is available through
the installed plugin, but stays off because native payloads bypass the
JavaScript redactor. This trades native crash reports for a verified redaction
boundary. No Sentry SDK or AI provider call exists in this app, so neither
duplicate Sentry forwarding nor AI traces are configured. React Native release
bundles need source maps for readable JavaScript stacks. This repository has no
source-map upload step or private upload key; add that only to an approved
release pipeline, with the key in its secret store.

Structured PostHog logs are allowlisted to receipt sync and print failures. They
include SDK service, environment, and version fields, have a rate cap, and omit
error messages, user data, and receipt details. Console and network logs are
disabled.

The app has no relevant PostHog push or broadcast integration. Do not create or
publish workflows or messages without a concrete approved use case and reviewed
audience, trigger, and content.

## Limits and volume estimate

The public pricing page checked on 2026-09-30 lists monthly free allowances of
1M analytics events, 5K session recordings, 1M feature flag requests, 100K
exceptions, 1,500 survey responses, 10GB logs, and 100K AI observability events.
Experiments are billed with feature flag requests. The free plan allows one
project and one year of event retention; recordings are retained for one month
and logs for 14 days. Project onboarding selected the Free plan. The billing
settings page was not inspected, so billing limits and retention overrides
remain unverified. Usage stops at free limits; no paid plan or paid usage was
enabled.

There is no defensible numeric volume estimate without active operator/session
counts. At current event boundaries, analytics volume is approximately one
session event plus successful ticket and report actions and screen changes per
operator session, in addition to SDK lifecycle events. Flags generate requests
when the SDK loads or refreshes flags. Local development records eligible
sessions without sampling; production replay remains off. Exceptions and logs
follow actual failures, with logs capped at 100 per minute per app instance. AI
observability and survey volume remain zero while those features are not
configured.

See [PostHog pricing](https://posthog.com/pricing), [PostHog React Native
documentation](https://posthog.com/docs/libraries/react-native), and [Expo's
PostHog integration guide](https://docs.expo.dev/guides/using-posthog/).
