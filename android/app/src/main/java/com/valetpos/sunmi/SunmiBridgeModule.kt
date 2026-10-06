package com.valetpos.sunmi

import android.os.Handler
import android.os.Looper
import android.os.RemoteException
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import com.sunmi.peripheral.printer.InnerPrinterCallback
import com.sunmi.peripheral.printer.InnerPrinterException
import com.sunmi.peripheral.printer.InnerPrinterManager
import com.sunmi.peripheral.printer.InnerResultCallback
import com.sunmi.peripheral.printer.SunmiPrinterService
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicBoolean

class SunmiBridgeModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    @Volatile
    private var printerService: SunmiPrinterService? = null
    private val printInProgress = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val serviceLock = Object()
    private var serviceBound = false

    private val printerCallback = object : InnerPrinterCallback() {
        override fun onConnected(service: SunmiPrinterService) {
            synchronized(serviceLock) {
                printerService = service
                serviceLock.notifyAll()
            }
            Log.i(TAG, "SUNMI printer service connected")
        }

        override fun onDisconnected() {
            synchronized(serviceLock) {
                printerService = null
                serviceLock.notifyAll()
            }
            serviceBound = false
            Log.w(TAG, "SUNMI printer service disconnected")
        }
    }

    override fun getName(): String = "SunmiBridge"

    override fun initialize() {
        super.initialize()
        bindPrinterService()
    }

    override fun invalidate() {
        if (serviceBound) {
            try {
                InnerPrinterManager.getInstance().unBindService(context.applicationContext, printerCallback)
            } catch (_: InnerPrinterException) {
                // The service can already be gone during application shutdown.
            }
        }
        serviceBound = false
        printerService = null
        super.invalidate()
    }

    @ReactMethod
    fun getPrinterStatus(promise: Promise) {
        val service = printerService
        if (service == null) {
            bindPrinterService()
            promise.resolve(statusResult("disconnected", null))
            return
        }

        try {
            val state = service.updatePrinterState()
            Log.i(TAG, "SUNMI printer status=$state (${statusName(state)})")
            promise.resolve(statusResult(statusName(state), state))
        } catch (error: RemoteException) {
            printerService = null
            Log.e(TAG, "Could not read SUNMI printer state", error)
            promise.reject("SUNMI_STATUS_ERROR", "Could not read the SUNMI printer state.", error)
        }
    }

    @ReactMethod
    fun scanBarcode(promise: Promise) {
        promise.reject("BARCODE_SCANNER_UNAVAILABLE", "Barcode scanning is not configured for this device build.")
    }

    @ReactMethod
    fun printSlip(payload: ReadableMap, promise: Promise) {
        if (!printInProgress.compareAndSet(false, true)) {
            promise.reject("SUNMI_PRINTER_BUSY", "Another receipt is currently printing.")
            return
        }

        val startedAt = SystemClock.elapsedRealtime()
        val completed = AtomicBoolean(false)
        var timeout: Runnable? = null
        var activeService: SunmiPrinterService? = null
        var bufferEntered = false
        try {
            val receipt = parseReceipt(payload)
            val service = awaitPrinterService()
            activeService = service
            val state = service.updatePrinterState()
            Log.i(TAG, "Starting SUNMI print receipt=${receipt.receiptNumber} state=$state (${statusName(state)})")
            if (state != 1) {
                throw PrinterFailure("SUNMI_PRINTER_${statusName(state).uppercase(Locale.US)}", statusMessage(state))
            }

            timeout = Runnable {
                if (completed.compareAndSet(false, true)) {
                    printInProgress.set(false)
                    promise.reject("SUNMI_PRINT_TIMEOUT", "The printer did not confirm the receipt within 10 seconds. Check the paper before retrying.")
                }
            }
            mainHandler.postDelayed(timeout, PRINT_TIMEOUT_MS)

            val resultCallback = object : InnerResultCallback() {
                override fun onRunResult(isSuccess: Boolean) = Unit

                override fun onReturnString(result: String?) = Unit

                override fun onRaiseException(code: Int, message: String?) {
                    Log.e(TAG, "SUNMI print exception code=$code message=${message.orEmpty()}")
                    finishPrint(completed, timeout) {
                        promise.reject("SUNMI_PRINT_EXCEPTION_$code", message ?: "The SUNMI printer rejected the receipt.")
                    }
                }

                override fun onPrintResult(code: Int, message: String?) {
                    Log.i(TAG, "SUNMI print result code=$code message=${message.orEmpty()}")
                    finishPrint(completed, timeout) {
                        if (code == 0) {
                            val result = WritableNativeMap().apply {
                                putBoolean("success", true)
                                putString("receiptId", receipt.receiptId)
                                putDouble("durationMs", (SystemClock.elapsedRealtime() - startedAt).toDouble())
                            }
                            promise.resolve(result)
                        } else {
                            promise.reject("SUNMI_PRINT_RESULT_$code", message ?: "The SUNMI printer reported a failed print.")
                        }
                    }
                }
            }

            service.enterPrinterBuffer(true)
            bufferEntered = true
            writeReceipt(service, receipt)
            service.exitPrinterBufferWithCallback(true, resultCallback)
        } catch (error: PrinterFailure) {
            Log.w(TAG, "SUNMI print rejected: ${error.code} ${error.message}")
            failPrint(completed, timeout, activeService, bufferEntered) {
                promise.reject(error.code, error.message)
            }
        } catch (error: Exception) {
            Log.e(TAG, "SUNMI print failed", error)
            failPrint(completed, timeout, activeService, bufferEntered) {
                promise.reject("SUNMI_PRINT_ERROR", error.message ?: "Could not print the receipt.", error)
            }
        }
    }

    private fun bindPrinterService() {
        if (serviceBound) return
        try {
            serviceBound = InnerPrinterManager.getInstance().bindService(context.applicationContext, printerCallback)
            Log.i(TAG, "SUNMI bindService result=$serviceBound")
        } catch (_: InnerPrinterException) {
            serviceBound = false
            printerService = null
            Log.e(TAG, "SUNMI bindService threw InnerPrinterException")
        }
    }

    private fun awaitPrinterService(): SunmiPrinterService {
        printerService?.let { return it }
        bindPrinterService()
        if (!serviceBound) {
            throw PrinterFailure("SUNMI_BIND_FAILED", "The SUNMI printer service could not be bound.")
        }

        val deadline = SystemClock.elapsedRealtime() + SERVICE_CONNECT_TIMEOUT_MS
        synchronized(serviceLock) {
            while (printerService == null) {
                val remaining = deadline - SystemClock.elapsedRealtime()
                if (remaining <= 0) break
                try {
                    serviceLock.wait(remaining)
                } catch (error: InterruptedException) {
                    Thread.currentThread().interrupt()
                    throw PrinterFailure("SUNMI_BIND_INTERRUPTED", "The SUNMI printer service connection was interrupted.")
                }
            }
            return printerService ?: throw PrinterFailure("SUNMI_PRINTER_DISCONNECTED", "The SUNMI printer service is not connected.")
        }
    }

    private fun finishPrint(completed: AtomicBoolean, timeout: Runnable, finish: () -> Unit) {
        if (!completed.compareAndSet(false, true)) return
        mainHandler.removeCallbacks(timeout)
        printInProgress.set(false)
        finish()
    }

    private fun failPrint(
        completed: AtomicBoolean,
        timeout: Runnable?,
        service: SunmiPrinterService?,
        bufferEntered: Boolean,
        finish: () -> Unit,
    ) {
        if (!completed.compareAndSet(false, true)) return
        if (timeout != null) mainHandler.removeCallbacks(timeout)
        if (bufferEntered && service != null) {
            try {
                service.exitPrinterBuffer(false)
            } catch (_: RemoteException) {
                // The original printer error remains the actionable failure.
            }
        }
        printInProgress.set(false)
        finish()
    }

    private fun writeReceipt(service: SunmiPrinterService, receipt: PrintableReceipt) {
        val separator = "--------------------------------\n"
        val issuedAt = formatIssuedAt(receipt.issuedAt)
        service.printerInit(null)
        service.setAlignment(1, null)
        service.setFontSize(28f, null)
        service.printText("CAR PARKING TICKET\n", null)
        service.setFontSize(24f, null)
        service.printText("${receipt.organizationName}\n", null)
        service.lineWrap(1, null)
        service.setAlignment(0, null)
        service.setFontSize(22f, null)
        service.printText(separator, null)
        service.printText("Vehicle number: ${receipt.vehicleNumber}\n", null)
        service.printText("Vehicle type:   ${receipt.vehicleType}\n", null)
        service.printText("Parking fee:    Rs. ${receipt.vehicleRate}\n", null)
        service.printText("Issued date:    ${issuedAt.date}\n", null)
        service.printText("Issued time:    ${issuedAt.time}\n", null)
        service.printText(separator, null)
        service.setAlignment(1, null)
        service.printText("BARCODE VALUE\n", null)
        service.printBarCode(receipt.barcodeValue, CODE_128, 80, 2, 2, null)
        service.printText("${receipt.barcodeValue}\n", null)
        service.lineWrap(4, null)
    }

    private fun parseReceipt(payload: ReadableMap): PrintableReceipt {
        val receiptId = requireString(payload, "receiptId", 96)
        val receiptNumber = requirePattern(payload, "receiptNumber", RECEIPT_PATTERN, 64)
        val organizationCode = requirePattern(payload, "organizationCode", ORGANIZATION_PATTERN, 32)
        val organizationName = optionalPrintableString(payload, "organizationName", 80) ?: organizationCode
        val vehicleNumber = requirePattern(payload, "vehicleNumber", VEHICLE_PATTERN, 24)
        val vehicleType = requireString(payload, "vehicleType", 4)
        if (vehicleType != "Bike" && vehicleType != "Car") {
            throw PrinterFailure("INVALID_VEHICLE_TYPE", "Only Bike and Car receipts can be printed.")
        }
        if (!payload.hasKey("vehicleRate") || payload.isNull("vehicleRate")) {
            throw PrinterFailure("INVALID_PARKING_FEE", "Parking fee is required.")
        }
        val vehicleRate = payload.getDouble("vehicleRate").toInt()
        val expectedRate = if (vehicleType == "Bike") 50 else 100
        if (vehicleRate != expectedRate || payload.getDouble("vehicleRate") != vehicleRate.toDouble()) {
            throw PrinterFailure("INVALID_PARKING_FEE", "The $vehicleType parking fee must be Rs. $expectedRate.")
        }
        val issuedAt = requireString(payload, "issuedAt", 40)
        if (parseIsoTimestamp(issuedAt) == null) {
            throw PrinterFailure("INVALID_ISSUED_AT", "Receipt timestamp is invalid.")
        }
        val barcodeValue = requirePattern(payload, "barcodeValue", RECEIPT_PATTERN, 64)
        if (barcodeValue != receiptNumber) {
            throw PrinterFailure("INVALID_BARCODE", "Barcode must match the receipt number.")
        }
        return PrintableReceipt(receiptId, receiptNumber, organizationCode, organizationName, vehicleNumber, vehicleType, vehicleRate, issuedAt, barcodeValue)
    }

    private fun optionalPrintableString(payload: ReadableMap, key: String, maxLength: Int): String? {
        if (!payload.hasKey(key) || payload.isNull(key)) return null
        val value = payload.getString(key)?.trim().orEmpty()
        if (value.isEmpty()) return null
        if (value.length > maxLength || value.any { it == '\n' || it == '\r' }) {
            throw PrinterFailure("INVALID_${key.uppercase(Locale.US)}", "Invalid receipt field: $key.")
        }
        return value
    }

    private fun requirePattern(payload: ReadableMap, key: String, pattern: Regex, maxLength: Int): String {
        val value = requireString(payload, key, maxLength)
        if (!pattern.matches(value)) throw PrinterFailure("INVALID_${key.uppercase(Locale.US)}", "Invalid receipt field: $key.")
        return value
    }

    private fun requireString(payload: ReadableMap, key: String, maxLength: Int): String {
        if (!payload.hasKey(key) || payload.isNull(key)) throw PrinterFailure("MISSING_${key.uppercase(Locale.US)}", "Missing receipt field: $key.")
        val value = payload.getString(key)?.trim().orEmpty()
        if (value.isEmpty() || value.length > maxLength || value.any { it == '\n' || it == '\r' }) {
            throw PrinterFailure("INVALID_${key.uppercase(Locale.US)}", "Invalid receipt field: $key.")
        }
        return value
    }

    private fun parseIsoTimestamp(value: String): Date? {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US).apply {
            isLenient = false
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val position = ParsePosition(0)
        val parsed = parser.parse(value, position)
        return if (parsed != null && position.index == value.length) parsed else null
    }

    private fun formatIssuedAt(value: String): PrintableIssuedAt {
        val issuedAt = parseIsoTimestamp(value) ?: return PrintableIssuedAt(value, "")
        val localTimeZone = TimeZone.getDefault()
        val date = SimpleDateFormat("dd MMM yyyy", Locale.US).apply {
            timeZone = localTimeZone
        }.format(issuedAt)
        val time = SimpleDateFormat("hh:mm a", Locale.US).apply {
            timeZone = localTimeZone
        }.format(issuedAt)
        return PrintableIssuedAt(date, time)
    }

    private fun statusResult(status: String, code: Int?) = WritableNativeMap().apply {
        putString("status", status)
        if (code != null) putInt("code", code)
    }

    private fun statusName(code: Int) = when (code) {
        1 -> "ready"
        2 -> "initializing"
        3 -> "hardware_error"
        4 -> "out_of_paper"
        5 -> "overheated"
        6 -> "cover_open"
        7 -> "cutter_error"
        8 -> "cutter_recovered"
        9 -> "black_mark_missing"
        505 -> "not_found"
        else -> "unknown_error"
    }

    private fun statusMessage(code: Int) = when (code) {
        2 -> "The printer is still initializing."
        3 -> "The printer hardware is unavailable."
        4 -> "The printer is out of paper."
        5 -> "The printer is overheated."
        6 -> "The printer cover is open."
        7 -> "The printer cutter reported an error."
        9 -> "The configured black-mark paper was not found."
        505 -> "No built-in SUNMI printer was found."
        else -> "The printer is not ready (state $code)."
    }

    private data class PrintableReceipt(
        val receiptId: String,
        val receiptNumber: String,
        val organizationCode: String,
        val organizationName: String,
        val vehicleNumber: String,
        val vehicleType: String,
        val vehicleRate: Int,
        val issuedAt: String,
        val barcodeValue: String,
    )

    private data class PrintableIssuedAt(
        val date: String,
        val time: String,
    )

    private class PrinterFailure(val code: String, override val message: String) : IllegalArgumentException(message)

    private companion object {
        const val TAG = "ValetSunmiBridge"
        const val SERVICE_CONNECT_TIMEOUT_MS = 3_000L
        const val PRINT_TIMEOUT_MS = 10_000L
        const val CODE_128 = 8
        val RECEIPT_PATTERN = Regex("^[A-Z0-9-]{4,64}$")
        val ORGANIZATION_PATTERN = Regex("^[A-Z0-9-]{2,32}$")
        val VEHICLE_PATTERN = Regex("^[A-Z0-9]+(?:-[A-Z0-9]+)*$")
    }
}
