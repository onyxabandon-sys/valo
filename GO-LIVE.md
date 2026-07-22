# Go-Live Checklist

Use this in order.

## 1. Create `.env`

Copy [`.env.example`](./.env.example) to `.env` and fill the values.

Required values:
- `APP_NAME`
- `CONVEX_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `SUNMI_PRINT_ENABLED`
- `OFFLINE_QUEUE_RETENTION_DAYS`
- `DEFAULT_LOCATION_NAME`
- `DEFAULT_LOCATION_ADDRESS`

## 2. Configure Convex

1. Create or open your Convex deployment.
2. Copy the deployment URL into `CONVEX_URL`.
3. Run the Convex codegen/deploy pipeline used by your environment.
4. Replace the generated API scaffold once bindings are produced.
5. Verify ticket create, lookup, and daily report queries against the live deployment.

## 3. Configure Android signing

1. Copy [`android/keystore.properties.example`](./android/keystore.properties.example) to `android/keystore.properties`.
2. Fill in:
   - `storeFile`
   - `storePassword`
   - `keyAlias`
   - `keyPassword`
3. Confirm release signing in [`android/app/build.gradle`](./android/app/build.gradle).
4. Keep the keystore file out of source control.

## 4. Build the release APK

1. Make sure Android SDK, Java 17, and Gradle are installed.
2. Run the React Native Android release build command for your environment.
3. Confirm the APK is generated successfully.
4. Verify the release bundle has ProGuard/R8 enabled.

## 5. Verify on Sunmi hardware

1. Install the signed APK on the physical Sunmi device.
2. Turn on `SUNMI_PRINT_ENABLED=true` for the device build.
3. Check printer status.
4. Create a ticket and print a slip.
5. Scan the barcode and verify lookup.
6. Open the daily report and confirm totals.
7. Log out and log back in.

## Validation commands

Run these before release:
- `npm run typecheck`
- `npm run test:features`
- `npm run test:release`
- `npm run verify`

