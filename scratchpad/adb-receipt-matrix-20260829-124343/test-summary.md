# ADB receipt test matrix

Execution date: 2026-08-29  
Calendar month: August 2026  
Device: emulator-5554 (`device`)  
Package: `com.valetpos`  
Build path: debug app using Metro on reverse port 8081

## Results

| Case | Result | Observed evidence |
|---|---|---|
| Primary login/profile | PASS | Supplied primary account authenticated; Profile shows the expected primary email and organization. |
| TC-01 / Test 1: three receipts | PASS | Bike Rs.50 + Car Rs.100 + Car Rs.100; Daily shows 3 and Rs.250.00; three unique receipt IDs are present. |
| TC-02 / duplicate retry | PASS with scope | “Try printing again” on the offline receipt retained the same receipt ID and did not add a row. Evidence is in `tc02-duplicate-retry.xml` and `tc02-duplicate-retry-timing.txt`. |
| TC-03 / live offline report | PASS | With airplane mode enabled, the already-loaded Monthly report remained usable and showed 3 / Rs.250.00. |
| TC-04 / offline receipt creation | PASS | Offline Bike receipt `PK04OFFLINE` saved in 79 ms, had a unique barcode, and initially showed `Sync: pending`. Daily then showed 4 / Rs.300.00. |
| TC-05 / offline kill and reopen | FAIL | After force-stop/reopen with airplane mode enabled, the app displayed Login rather than restoring Home/history. Evidence: `tc05-offline-after-receipt.png/xml`. |
| TC-06 / reconnect and sync | PASS | After network restoration, the same offline receipt became `Sync: synced`; Daily and Monthly both showed 4 / Rs.300.00. |
| TC-07 / explicit logout | PASS | Logout returned to Login; the primary session was then restored by an explicit primary login. |
| TC-08 / daily-monthly increment | PASS | Baseline 3 / Rs.250.00 increased by exactly one Rs.50 receipt to 4 / Rs.300.00 in both views. |
| Test 5 / date boundary | NOT RUN | No second day fixture was available; device clock was not changed. |
| Test 6 / account isolation | BLOCKED | The supplied secondary login was rejected as `Invalid email or password`; the current Login screen exposed no signup control, so no account was created with guessed organization details. |
| Test 7 / device isolation | NOT RUN | Only emulator-5554 was connected; no second device identity was available. |

## Important runtime findings

- The emulator has no SUNMI printer service. Every tested receipt was saved, but the UI reported `Print: failed` with a transparent SUNMI binding message.
- Some debug relaunch/reload paths displayed the React Native red box `ValetDatabase.listReceipts got 6 arguments, expected 9`; the in-app reload recovered Home. No Android `FATAL EXCEPTION` was found in the final captured logcat.
- The Bike slip title displayed `CAR PARKING TICKET`, although the receipt type and report row correctly showed Bike.

## Evidence

The directory contains screenshots, UI XML dumps, per-case logcat captures, timing files, Metro logs, device status, Android version, airplane-mode state, and the final 1000-line logcat capture. Network was restored at handoff (`airplane_mode_on=0`), and the primary account was left active on Profile.
