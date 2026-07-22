# Sunmi Bridge Implementation Notes

The current Kotlin module validates payloads and exposes a stable RN contract.

To complete hardware printing/scanning on Sunmi devices:
- add the Sunmi printer SDK dependency in `android/app/build.gradle`
- initialize the SDK in `SunmiBridgeModule`
- implement `printSlip` with `InnerPrinterManager` or the vendor's recommended API
- implement `scanBarcode` using the device scanner broadcast receiver
- map printer status to `ready`, `no_paper`, or `error`
- keep the existing validation and rejection path for malformed payloads

The JS side already calls the bridge through `src/native/SunmiBridge.ts`.
