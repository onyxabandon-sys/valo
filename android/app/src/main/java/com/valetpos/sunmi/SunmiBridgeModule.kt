package com.valetpos.sunmi

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap

class SunmiBridgeModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "SunmiBridge"

    @ReactMethod
    fun getPrinterStatus(promise: Promise) {
        val result = WritableNativeMap()
        result.putString("status", "error")
        promise.resolve(result)
    }

    @ReactMethod
    fun scanBarcode(promise: Promise) {
        val result = WritableNativeMap()
        result.putString("code", "")
        promise.resolve(result)
    }

    @ReactMethod
    fun printSlip(payload: ReadableMap, promise: Promise) {
        try {
            val ticketId = requireString(payload, "ticketId")
            val ticketNumber = requireString(payload, "ticketNumber")
            val vehicleNumber = requireString(payload, "vehicleNumber")
            val vehicleType = requireString(payload, "vehicleType")
            val locationName = requireString(payload, "locationName")
            val amount = payload.getDouble("amount")
            val paymentStatus = requireString(payload, "paymentStatus")
            val createdAt = requireString(payload, "createdAt")
            val barcodeValue = requireString(payload, "barcodeValue")

            // Real Sunmi SDK printing should be implemented here.
            // This module validates and structures the payload so the SDK call can be dropped in directly.
            val result = WritableNativeMap()
            result.putBoolean("success", true)
            result.putString("ticketId", ticketId)
            result.putString("ticketNumber", ticketNumber)
            result.putString("vehicleNumber", vehicleNumber)
            result.putString("vehicleType", vehicleType)
            result.putString("locationName", locationName)
            result.putDouble("amount", amount)
            result.putString("paymentStatus", paymentStatus)
            result.putString("createdAt", createdAt)
            result.putString("barcodeValue", barcodeValue)
            promise.resolve(result)
        } catch (error: Exception) {
            promise.reject("SUNMI_PRINT_ERROR", error.message, error)
        }
    }

    private fun requireString(payload: ReadableMap, key: String): String {
        if (!payload.hasKey(key) || payload.isNull(key)) {
            throw IllegalArgumentException("Missing required field: $key")
        }
        return payload.getString(key) ?: throw IllegalArgumentException("Invalid string field: $key")
    }
}
