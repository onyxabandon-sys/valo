# Release Checklist

## Environment

Set these values before release:
- `APP_NAME`
- `CONVEX_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `SUNMI_PRINT_ENABLED`
- `OFFLINE_QUEUE_RETENTION_DAYS`
- `DEFAULT_LOCATION_NAME`
- `DEFAULT_LOCATION_ADDRESS`

## Android signing

1. Copy `android/keystore.properties.example` to `android/keystore.properties`.
2. Fill in keystore file path, alias, and passwords.
3. Confirm `android/app/build.gradle` release signing picks up `keystore.properties`.

## Convex

1. Run `convex dev` or your deployment pipeline.
2. Generate the client bindings.
3. Replace the scaffolded `convex/_generated/api.ts` file with generated output.

## Sunmi hardware

1. Add the vendor SDK dependency to `android/app/build.gradle`.
2. Replace the stub logic in `SunmiBridgeModule.kt` with the vendor printer/scanner calls.
3. Validate on a physical Sunmi terminal with paper loaded and scanner enabled.

## Verification

Run:
- `npm run typecheck`
- `npm run test:features`
- `npm run test:release`

## Manual QA

- Sign up and log in
- Create a ticket
- Print a slip
- Reopen lookup and resolve the barcode
- Open daily report
- Log out and log back in
