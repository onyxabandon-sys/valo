# Release Checklist

## Environment

Set these values before release:
- `APP_NAME`
- `CONVEX_URL`
- `CONVEX_SITE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `SUNMI_PRINT_ENABLED`
- `OFFLINE_QUEUE_RETENTION_DAYS`
- `DEFAULT_LOCATION_NAME`
- `DEFAULT_LOCATION_ADDRESS`

Select the production file in the release PowerShell session:

```powershell
$env:APP_ENV_FILE='.env.production'
```

## Android signing

1. Copy `android/keystore.properties.example` to `android/keystore.properties`.
2. Fill in keystore file path, alias, and passwords.
3. Confirm `android/app/build.gradle` release signing picks up `keystore.properties`.

## Convex

1. Deploy the reviewed backend to the explicitly approved production deployment.
2. Generate the client bindings.
3. Verify the production identity, tenant, ticket, receipt, and report paths.

## Sunmi hardware

1. Confirm the official SUNMI printer dependency is resolved.
2. Validate on a physical Sunmi V2 Pro with paper loaded.
3. Confirm the successful print result is stored and visible in the report.

## Verification

Run:
- `npm run typecheck`
- `npm run test:features`
- `npm run test:release`
- `npm run test:e2e`
- `npm run test:golive`
- `npx expo-doctor`
- `npm audit --omit=dev`

Build from the repository root only after all blocking checks pass:

```powershell
Set-Location android
.\gradlew.bat :app:assembleRelease --no-daemon --console=plain
```

## Manual QA

- Sign up and log in
- Create a ticket
- Print a slip
- Reopen lookup and resolve the barcode
- Open daily report
- Log out and log back in
