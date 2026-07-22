# Android Integration Notes

This folder is a native scaffold for the valet POS app.

What to wire in a real Android project:
- `MainApplication.kt` package registration
- Sunmi printer/scanner SDK dependencies in `android/app/build.gradle`
- Kotlin version alignment with the RN template
- ProGuard / R8 release rules
- Keystore signing config
- release build signing config in `android/keystore.properties`

Sunmi bridge contract:
- `SunmiBridge.printSlip(payload)`
- `SunmiBridge.scanBarcode()`
- `SunmiBridge.getPrinterStatus()`

The current Kotlin module is a safe, validation-first stub:
- it resolves the contract
- it validates the payload structure before printing
- it does not attempt device SDK calls yet
- replace the stub bodies with Sunmi SDK invocations on the actual terminal
