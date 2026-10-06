import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createReceipt, createTicket } from '../src/lib/appFlows';
import { userSeed } from '../src/data/seed';
import type { SlipPrintPayload } from '../src/native/SunmiBridge';
import { shouldIgnorePrintStatusUpdate } from '../shared/receiptStatus';

const appConfig = JSON.parse(readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')) as { expo?: { android?: { package?: string } } };
const androidPackage = appConfig.expo?.android?.package;
assert.ok(androidPackage, 'app.json must define the Android package used by native sources');
const sunmiModulePath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'java', ...androidPackage.split('.'), 'sunmi', 'SunmiBridgeModule.kt');
const androidManifestPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const rootNavigatorPath = path.join(process.cwd(), 'src', 'navigation', 'RootNavigator.tsx');

const receiptPattern = /^[A-Z0-9-]{4,64}$/;
const organizationPattern = /^[A-Z0-9-]{2,32}$/;
const vehiclePattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function assertContains(source: string, expected: string, reason: string) {
  assert.ok(source.includes(expected), `${reason}: missing "${expected}"`);
}

function assertOrder(source: string, before: string, after: string, reason: string) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  assert.notEqual(beforeIndex, -1, `${reason}: missing "${before}"`);
  assert.notEqual(afterIndex, -1, `${reason}: missing "${after}"`);
  assert.ok(beforeIndex < afterIndex, reason);
}

function buildPrintablePayload(vehicleType: 'Bike' | 'Car', vehicleNumber: string, existingCount: number): SlipPrintPayload {
  const ticket = createTicket({
    vehicleType,
    vehicleNumber,
    existingCount,
    locationName: userSeed.locationName,
  });
  const receipt = createReceipt({ ticket, organizationCode: userSeed.organizationCode, organizationName: userSeed.organizationName });

  return {
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
    organizationCode: receipt.organizationCode,
    organizationName: receipt.organizationName,
    vehicleNumber: receipt.vehicleNumber,
    vehicleType: receipt.vehicleType,
    vehicleRate: receipt.vehicleRate,
    issuedAt: receipt.issuedAt,
    barcodeValue: receipt.barcodeValue,
  };
}

function assertPrintablePayload(payload: SlipPrintPayload, expectedRate: number) {
  assert.match(payload.receiptId, /^receipt_t_/);
  assert.match(payload.receiptNumber, receiptPattern);
  assert.match(payload.organizationCode, organizationPattern);
  assert.match(payload.vehicleNumber, vehiclePattern);
  assert.equal(payload.vehicleRate, expectedRate);
  assert.equal(Number.isInteger(payload.vehicleRate), true);
  assert.equal(new Date(payload.issuedAt).toISOString(), payload.issuedAt);
  assert.equal(payload.barcodeValue, payload.receiptNumber);
}

function main() {
  const ticketsBackend = readFileSync(path.join(process.cwd(), 'convex', 'tickets.ts'), 'utf8');
  const bikePayload = buildPrintablePayload('Bike', ' lea 12 3456 ', 0);
  assertPrintablePayload(bikePayload, 50);

  const carPayload = buildPrintablePayload('Car', 'ABC-123', 1);
  assertPrintablePayload(carPayload, 100);

  assert.throws(() => createTicket({ vehicleType: 'Bike', vehicleNumber: 'ABC/123', existingCount: 0 }), /INVALID_VEHICLE_NUMBER/);
  assert.equal(shouldIgnorePrintStatusUpdate('printed', 'pending'), true, 'an older pending sync cannot downgrade a printed receipt');
  assert.equal(shouldIgnorePrintStatusUpdate('printed', 'failed'), true, 'an older failed sync cannot downgrade a printed receipt');
  assert.equal(shouldIgnorePrintStatusUpdate('printed', 'printed'), false, 'an idempotent printed update is accepted');
  assert.equal(shouldIgnorePrintStatusUpdate('failed', 'pending'), false, 'a failed receipt can return to pending for a retry');
  assert.match(ticketsBackend, /shouldIgnorePrintStatusUpdate\(receipt\.printStatus, args\.printStatus\)/, 'the server must preserve printed status under out-of-order sync');
  assert.match(ticketsBackend, /receipt\.deviceId !== assignment\.deviceId/, 'print-status updates must stay on the approved device');
  assert.match(ticketsBackend, /export const listTodayTickets = query\([\s\S]*?\.take\(501\)[\s\S]*?TICKET_PAGE_REQUIRED/, 'the compatible ticket query must fail explicitly above its bounded result size');
  assert.match(ticketsBackend, /export const listTodayTicketPage = query\([\s\S]*?paginationOpts: paginationOptsValidator[\s\S]*?\.paginate\(args\.paginationOpts\)/, 'larger ticket histories must have a paginated API');

  const sunmiModule = readFileSync(sunmiModulePath, 'utf8');
  const androidManifest = readFileSync(androidManifestPath, 'utf8');
  const rootNavigator = readFileSync(rootNavigatorPath, 'utf8');

  assert.match(
    androidManifest,
    /<package\s+android:name="woyou\.aidlservice\.jiuiv5"\s*\/>/,
    'Android 11 package visibility must allow the app to bind the SUNMI printer service',
  );
  assertContains(sunmiModule, 'AtomicBoolean(false)', 'Native bridge must serialize print jobs');
  assertContains(sunmiModule, 'InnerPrinterManager.getInstance().bindService', 'Native bridge must bind the SUNMI printer service');
  assertContains(sunmiModule, 'service.updatePrinterState()', 'Native bridge must check hardware status before printing');
  assertContains(sunmiModule, 'if (state != 1)', 'Native bridge must reject non-ready printer states');
  assertContains(sunmiModule, 'service.enterPrinterBuffer(true)', 'Native bridge must use a transaction buffer');
  assertOrder(sunmiModule, 'service.enterPrinterBuffer(true)', 'writeReceipt(service, receipt)', 'Receipt must be written inside the printer buffer');
  assertOrder(sunmiModule, 'writeReceipt(service, receipt)', 'service.exitPrinterBufferWithCallback(true, resultCallback)', 'Native bridge must wait for the SDK print callback');
  assertContains(sunmiModule, 'override fun onPrintResult(code: Int, message: String?)', 'Native bridge must receive the print result callback');
  assertContains(sunmiModule, 'if (code == 0)', 'Native bridge must only resolve success for SDK success code');
  assertContains(sunmiModule, 'SUNMI_PRINT_TIMEOUT', 'Native bridge must fail when the printer never confirms');
  assertContains(sunmiModule, 'service.exitPrinterBuffer(false)', 'Native bridge must discard the buffer after validation or hardware failure');

  assertContains(sunmiModule, 'val receiptNumber = requirePattern(payload, "receiptNumber", RECEIPT_PATTERN, 64)', 'Native bridge must validate receipt number');
  assertContains(sunmiModule, 'val organizationCode = requirePattern(payload, "organizationCode", ORGANIZATION_PATTERN, 32)', 'Native bridge must validate organization code');
  assertContains(sunmiModule, 'val vehicleNumber = requirePattern(payload, "vehicleNumber", VEHICLE_PATTERN, 24)', 'Native bridge must validate vehicle number');
  assertContains(sunmiModule, 'if (vehicleType != "Bike" && vehicleType != "Car")', 'Native bridge must restrict vehicle types');
  assertContains(sunmiModule, 'val expectedRate = if (vehicleType == "Bike") 50 else 100', 'Native bridge must enforce fixed rates');
  assertContains(sunmiModule, 'if (barcodeValue != receiptNumber)', 'Native bridge must keep barcode and receipt number identical');
  assertContains(sunmiModule, 'it == \'\\n\' || it == \'\\r\'', 'Native bridge must reject multiline printed fields');
  assertContains(sunmiModule, 'val RECEIPT_PATTERN = Regex("^[A-Z0-9-]{4,64}$")', 'Native receipt regex must match the JS-generated payload');
  assertContains(sunmiModule, 'val ORGANIZATION_PATTERN = Regex("^[A-Z0-9-]{2,32}$")', 'Native organization regex must match the JS-generated payload');
  assertContains(sunmiModule, 'val VEHICLE_PATTERN = Regex("^[A-Z0-9]+(?:-[A-Z0-9]+)*$")', 'Native vehicle regex must match normalized vehicle numbers');

  assertContains(sunmiModule, 'service.printText("CAR PARKING TICKET\\n", null)', 'Printed slip must include a title');
  assertContains(sunmiModule, 'service.printText("${receipt.organizationName}\\n", null)', 'Printed slip must include organization name');
  assertOrder(
    sunmiModule,
    'service.printText("${receipt.organizationName}\\n", null)',
    'service.lineWrap(1, null)',
    'Printed slip should add spacing after organization name before receipt detail lines',
  );
  assert.doesNotMatch(
    sunmiModule,
    /service\.printText\("\$\{receipt\.organizationName\}\\n", null\)\s*[\r\n]\s*service\.printText\("\$\{receipt\.receiptNumber\}\\n", null\)/,
    'Printed slip header must not print the receipt number immediately after organization name',
  );
  assert.doesNotMatch(sunmiModule, /vehicle rate/i, 'Printed slip must not use vehicle rate wording');
  assertOrder(sunmiModule, 'service.printText("Vehicle number: ${receipt.vehicleNumber}\\n", null)', 'service.printText("Vehicle type:   ${receipt.vehicleType}\\n", null)', 'Printed slip must match the Receipt Ready detail order');
  assertOrder(sunmiModule, 'service.printText("Vehicle type:   ${receipt.vehicleType}\\n", null)', 'service.printText("Parking fee:    Rs. ${receipt.vehicleRate}\\n", null)', 'Printed slip must match the Receipt Ready detail order');
  assertOrder(sunmiModule, 'service.printText("Parking fee:    Rs. ${receipt.vehicleRate}\\n", null)', 'service.printText("Issued date:    ${issuedAt.date}\\n", null)', 'Printed slip must match the Receipt Ready detail order');
  assertOrder(sunmiModule, 'service.printText("Issued date:    ${issuedAt.date}\\n", null)', 'service.printText("Issued time:    ${issuedAt.time}\\n", null)', 'Printed slip must match the Receipt Ready detail order');
  assertContains(sunmiModule, 'service.printText("Vehicle number: ${receipt.vehicleNumber}\\n", null)', 'Printed slip must include vehicle number');
  assertContains(sunmiModule, 'service.printText("Vehicle type:   ${receipt.vehicleType}\\n", null)', 'Printed slip must include vehicle type');
  assertContains(sunmiModule, 'service.printText("Parking fee:    Rs. ${receipt.vehicleRate}\\n", null)', 'Printed slip must include parking fee');
  assertContains(sunmiModule, 'service.printText("Issued date:    ${issuedAt.date}\\n", null)', 'Printed slip must include issue date');
  assertContains(sunmiModule, 'service.printText("Issued time:    ${issuedAt.time}\\n", null)', 'Printed slip must include issue time');
  assertContains(sunmiModule, 'service.printText("BARCODE VALUE\\n", null)', 'Printed slip must include barcode value label');
  assertContains(sunmiModule, 'service.printBarCode(receipt.barcodeValue, CODE_128, 80, 2, 2, null)', 'Printed slip must include a Code 128 barcode');
  assertContains(sunmiModule, 'service.printText("${receipt.barcodeValue}\\n", null)', 'Printed slip must include human-readable barcode value');

  assertOrder(rootNavigator, 'await ValetDatabase.saveReceipt(storedReceipt)', 'const printed = await printReceipt(receipt)', 'App must save the receipt locally before printing');
  assertOrder(rootNavigator, 'const printed = await printReceipt(receipt)', 'await syncStoredReceipt({', 'App must finish printing before syncing its final print status');
  assertContains(rootNavigator, 'receiptId: receipt.id', 'App must send receipt id to native print');
  assertContains(rootNavigator, 'receiptNumber: receipt.receiptNumber', 'App must send receipt number to native print');
  assertContains(rootNavigator, 'organizationCode: receipt.organizationCode', 'App must send organization code to native print');
  assertContains(rootNavigator, 'organizationName: receipt.organizationName', 'App must send organization name to native print');
  assertContains(rootNavigator, 'vehicleNumber: receipt.vehicleNumber', 'App must send vehicle number to native print');
  assertContains(rootNavigator, 'vehicleType: receipt.vehicleType', 'App must send vehicle type to native print');
  assertContains(rootNavigator, 'vehicleRate: receipt.vehicleRate', 'App must send parking fee to native print');
  assertContains(rootNavigator, 'issuedAt: receipt.issuedAt', 'App must send issue time to native print');
  assertContains(rootNavigator, 'barcodeValue: receipt.barcodeValue', 'App must send barcode value to native print');
  assertContains(rootNavigator, "ValetDatabase.updatePrintStatus(receipt.id, 'printed', isReprint)", 'App must persist successful print status');
  assertContains(rootNavigator, "ValetDatabase.updatePrintStatus(receipt.id, 'failed', false)", 'App must persist failed print status');

  console.log('Print slip checks passed');
}

main();
