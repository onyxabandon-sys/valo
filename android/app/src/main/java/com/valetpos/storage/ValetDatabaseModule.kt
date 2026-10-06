package com.valetpos.storage

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap

private class ValetDatabase(context: Context) : SQLiteOpenHelper(context, "valet-pos.db", null, 4) {
    init {
        setWriteAheadLoggingEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE receipts (
                receipt_id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL UNIQUE,
                receipt_number TEXT NOT NULL UNIQUE,
                barcode_value TEXT NOT NULL,
                organization_code TEXT NOT NULL,
                organization_name TEXT NOT NULL,
                location_id TEXT NOT NULL,
                location_name TEXT NOT NULL,
                vehicle_number TEXT NOT NULL,
                vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('Bike', 'Car')),
                vehicle_rate INTEGER NOT NULL CHECK(vehicle_rate IN (50, 100)),
                issued_at TEXT NOT NULL,
                operator_id TEXT NOT NULL,
                operator_name TEXT NOT NULL,
                payment_method TEXT NOT NULL DEFAULT 'cash',
                payment_status TEXT NOT NULL DEFAULT 'paid',
                print_status TEXT NOT NULL DEFAULT 'pending',
                sync_status TEXT NOT NULL DEFAULT 'pending',
                reprint_count INTEGER NOT NULL DEFAULT 0,
                canonical_ticket_id TEXT,
                canonical_receipt_id TEXT,
                device_latitude REAL,
                device_longitude REAL,
                device_accuracy REAL,
                device_location_provider TEXT,
                device_location_captured_at TEXT,
                last_error TEXT,
                device_id TEXT NOT NULL DEFAULT 'legacy',
                account_email TEXT NOT NULL DEFAULT '',
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX receipts_by_sync_status ON receipts(sync_status, created_at_ms)")
        db.execSQL("CREATE INDEX receipts_by_issued_at ON receipts(issued_at)")
        db.execSQL("CREATE INDEX receipts_by_vehicle_number ON receipts(vehicle_number)")
        db.execSQL("CREATE INDEX receipts_by_account_and_sync ON receipts(operator_id, sync_status, updated_at_ms)")
        db.execSQL("CREATE INDEX receipts_by_account_and_issued_at ON receipts(operator_id, issued_at)")
        db.execSQL("CREATE TABLE user_sessions (device_id TEXT NOT NULL, account_email TEXT NOT NULL, is_logged_in INTEGER NOT NULL, last_activity_timestamp INTEGER NOT NULL, PRIMARY KEY(device_id, account_email))")
        db.execSQL("CREATE TABLE receipt_metadata (receipt_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, account_email TEXT NOT NULL, timestamp INTEGER NOT NULL, is_synced INTEGER NOT NULL, lamport_clock INTEGER NOT NULL, last_mutation_id TEXT NOT NULL)")
        db.execSQL("CREATE INDEX receipt_metadata_by_sync ON receipt_metadata(account_email, is_synced, timestamp)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE receipts ADD COLUMN device_latitude REAL")
            db.execSQL("ALTER TABLE receipts ADD COLUMN device_longitude REAL")
            db.execSQL("ALTER TABLE receipts ADD COLUMN device_accuracy REAL")
            db.execSQL("ALTER TABLE receipts ADD COLUMN device_location_provider TEXT")
            db.execSQL("ALTER TABLE receipts ADD COLUMN device_location_captured_at TEXT")
        }
        if (oldVersion < 3) {
            db.execSQL("CREATE INDEX IF NOT EXISTS receipts_by_account_and_sync ON receipts(operator_id, sync_status, updated_at_ms)")
            db.execSQL("CREATE INDEX IF NOT EXISTS receipts_by_account_and_issued_at ON receipts(operator_id, issued_at)")
        }
        if (oldVersion < 4) {
            db.execSQL("ALTER TABLE receipts ADD COLUMN device_id TEXT NOT NULL DEFAULT 'legacy'")
            db.execSQL("ALTER TABLE receipts ADD COLUMN account_email TEXT NOT NULL DEFAULT ''")
            db.execSQL("CREATE TABLE IF NOT EXISTS user_sessions (device_id TEXT NOT NULL, account_email TEXT NOT NULL, is_logged_in INTEGER NOT NULL, last_activity_timestamp INTEGER NOT NULL, PRIMARY KEY(device_id, account_email))")
            db.execSQL("CREATE TABLE IF NOT EXISTS receipt_metadata (receipt_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, account_email TEXT NOT NULL, timestamp INTEGER NOT NULL, is_synced INTEGER NOT NULL, lamport_clock INTEGER NOT NULL, last_mutation_id TEXT NOT NULL)")
            db.execSQL("CREATE INDEX IF NOT EXISTS receipt_metadata_by_sync ON receipt_metadata(account_email, is_synced, timestamp)")
        }
    }
}

class ValetDatabaseModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val database = ValetDatabase(context.applicationContext)

    override fun getName(): String = "ValetDatabase"

    @ReactMethod
    fun saveSession(deviceId: String, accountEmail: String, isLoggedIn: Boolean, promise: Promise) {
        try {
            require(deviceId.isNotBlank() && accountEmail.isNotBlank()) { "Device and account are required" }
            val values = ContentValues().apply {
                put("device_id", deviceId)
                put("account_email", accountEmail.trim().lowercase())
                put("is_logged_in", if (isLoggedIn) 1 else 0)
                put("last_activity_timestamp", System.currentTimeMillis())
            }
            database.writableDatabase.insertWithOnConflict("user_sessions", null, values, SQLiteDatabase.CONFLICT_REPLACE)
            promise.resolve(successResult())
        } catch (error: Exception) {
            promise.reject("LOCAL_SESSION_SAVE_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun clearStoredReceiptLocations(promise: Promise) {
        try {
            val db = database.writableDatabase
            db.beginTransaction()
            try {
                db.execSQL("UPDATE receipts SET device_latitude = NULL, device_longitude = NULL, device_accuracy = NULL, device_location_provider = NULL, device_location_captured_at = NULL")
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
            promise.resolve(successResult())
        } catch (error: Exception) {
            promise.reject("LOCAL_LOCATION_CLEAR_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun saveReceipt(payload: ReadableMap, promise: Promise) {
        try {
            val now = System.currentTimeMillis()
            val values = ContentValues().apply {
                put("receipt_id", requireString(payload, "receiptId"))
                put("client_id", requireString(payload, "clientId"))
                put("receipt_number", requireString(payload, "receiptNumber"))
                put("barcode_value", requireString(payload, "barcodeValue"))
                put("organization_code", requireString(payload, "organizationCode"))
                put("organization_name", requireString(payload, "organizationName"))
                put("location_id", requireString(payload, "locationId"))
                put("location_name", requireString(payload, "locationName"))
                put("vehicle_number", requireString(payload, "vehicleNumber"))
                val vehicleType = requireVehicleType(payload)
                put("vehicle_type", vehicleType)
                put("vehicle_rate", requireRate(payload, vehicleType))
                put("issued_at", requireString(payload, "issuedAt"))
                put("operator_id", requireString(payload, "operatorId"))
                put("operator_name", requireString(payload, "operatorName"))
                put("payment_method", "cash")
                put("payment_status", "paid")
                put("print_status", "pending")
                put("sync_status", "pending")
                put("reprint_count", 0)
                put("created_at_ms", now)
                put("updated_at_ms", now)
            }
            val db = database.writableDatabase
            val deviceId = requireString(payload, "deviceId")
            val accountEmail = requireString(payload, "accountEmail").lowercase()
            values.put("device_id", deviceId)
            values.put("account_email", accountEmail)
            db.beginTransaction()
            try {
                val inserted = db.insertWithOnConflict("receipts", null, values, SQLiteDatabase.CONFLICT_IGNORE)
                if (inserted == -1L && !matchesExistingReceipt(db, values)) {
                    throw IllegalStateException("Receipt ID, client ID, or receipt number is already assigned to different data")
                }
                val metadata = ContentValues().apply {
                    put("receipt_id", values.getAsString("receipt_id"))
                    put("device_id", deviceId)
                    put("account_email", accountEmail)
                    put("timestamp", now)
                    put("is_synced", 0)
                    put("lamport_clock", now)
                    put("last_mutation_id", values.getAsString("client_id"))
                }
                db.insertWithOnConflict("receipt_metadata", null, metadata, SQLiteDatabase.CONFLICT_REPLACE)
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
            promise.resolve(successResult())
        } catch (error: Exception) {
            promise.reject("LOCAL_RECEIPT_SAVE_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun listPendingReceipts(locationId: String, operatorId: String, deviceId: String, accountEmail: String, limit: Double, promise: Promise) {
        try {
            require(locationId.isNotBlank() && operatorId.isNotBlank()) { "Account and location are required" }
            val safeLimit = limit.toInt().coerceIn(1, 50)
            val rows = WritableNativeArray()
            database.readableDatabase.rawQuery(
                "SELECT * FROM receipts WHERE location_id = ? AND operator_id = ? AND device_id = ? AND account_email = ? AND sync_status IN (?, ?) " +
                    "ORDER BY CASE sync_status WHEN 'pending' THEN 0 ELSE 1 END, updated_at_ms ASC LIMIT ?",
                arrayOf(locationId, operatorId, deviceId, accountEmail.lowercase(), "pending", "failed", safeLimit.toString()),
            ).use { cursor ->
                while (cursor.moveToNext()) rows.pushMap(cursorToMap(cursor))
            }
            promise.resolve(rows)
        } catch (error: Exception) {
            promise.reject("LOCAL_RECEIPT_LIST_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun listReceipts(locationId: String, operatorId: String, deviceId: String, accountEmail: String, from: String, to: String, limit: Double, promise: Promise) {
        try {
            require(locationId.isNotBlank() && operatorId.isNotBlank()) { "Account and location are required" }
            require(from.isNotBlank() && to.isNotBlank() && from < to) { "Invalid receipt date range" }
            val safeLimit = limit.toInt().coerceIn(1, 5000)
            val rows = WritableNativeArray()
            database.readableDatabase.query(
                "receipts",
                null,
                "location_id = ? AND operator_id = ? AND device_id = ? AND account_email = ? AND issued_at >= ? AND issued_at < ?",
                arrayOf(locationId, operatorId, deviceId, accountEmail.lowercase(), from, to),
                null,
                null,
                "issued_at DESC",
                safeLimit.toString(),
            ).use { cursor ->
                while (cursor.moveToNext()) rows.pushMap(cursorToMap(cursor))
            }
            promise.resolve(rows)
        } catch (error: Exception) {
            promise.reject("LOCAL_RECEIPT_REPORT_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun markSynced(receiptId: String, ticketId: String, canonicalReceiptId: String, promise: Promise) {
        updateReceipt(
            receiptId,
            ContentValues().apply {
                put("sync_status", "synced")
                put("canonical_ticket_id", ticketId)
                put("canonical_receipt_id", canonicalReceiptId)
                putNull("last_error")
            },
            promise,
        )
    }

    @ReactMethod
    fun markSyncFailed(receiptId: String, message: String, promise: Promise) {
        updateReceipt(
            receiptId,
            ContentValues().apply {
                put("sync_status", "failed")
                put("last_error", message.take(240))
            },
            promise,
        )
    }

    @ReactMethod
    fun updatePrintStatus(receiptId: String, status: String, isReprint: Boolean, promise: Promise) {
        if (status !in setOf("pending", "printed", "failed")) {
            promise.reject("INVALID_PRINT_STATUS", "Unsupported print status: $status")
            return
        }
        updateReceipt(
            receiptId,
            ContentValues().apply {
                put("print_status", status)
            },
            promise,
            incrementReprint = status == "printed" && isReprint,
        )
    }

    private fun updateReceipt(
        receiptId: String,
        values: ContentValues,
        promise: Promise,
        incrementReprint: Boolean = false,
    ) {
        try {
            values.put("updated_at_ms", System.currentTimeMillis())
            val db = database.writableDatabase
            val changed = if (incrementReprint) {
                db.beginTransaction()
                try {
                    val updated = db.compileStatement(
                        "UPDATE receipts SET print_status = ?, reprint_count = reprint_count + 1, updated_at_ms = ? WHERE receipt_id = ?",
                    ).apply {
                        bindString(1, "printed")
                        bindLong(2, System.currentTimeMillis())
                        bindString(3, receiptId)
                    }.executeUpdateDelete()
                    db.setTransactionSuccessful()
                    updated
                } finally {
                    db.endTransaction()
                }
            } else {
                db.update("receipts", values, "receipt_id = ?", arrayOf(receiptId))
            }
            if (changed == 0) throw IllegalArgumentException("Receipt not found: $receiptId")
            promise.resolve(successResult())
        } catch (error: Exception) {
            promise.reject("LOCAL_RECEIPT_UPDATE_FAILED", error.message, error)
        }
    }

    private fun cursorToMap(cursor: android.database.Cursor): WritableNativeMap = WritableNativeMap().apply {
        putString("receiptId", cursor.string("receipt_id"))
        putString("clientId", cursor.string("client_id"))
        putString("receiptNumber", cursor.string("receipt_number"))
        putString("barcodeValue", cursor.string("barcode_value"))
        putString("organizationCode", cursor.string("organization_code"))
        putString("organizationName", cursor.string("organization_name"))
        putString("locationId", cursor.string("location_id"))
        putString("locationName", cursor.string("location_name"))
        putString("vehicleNumber", cursor.string("vehicle_number"))
        putString("vehicleType", cursor.string("vehicle_type"))
        putDouble("vehicleRate", cursor.getInt(cursor.getColumnIndexOrThrow("vehicle_rate")).toDouble())
        putString("issuedAt", cursor.string("issued_at"))
        putString("operatorId", cursor.string("operator_id"))
        putString("operatorName", cursor.string("operator_name"))
        putString("paymentMethod", cursor.string("payment_method"))
        putString("paymentStatus", cursor.string("payment_status"))
        putString("printStatus", cursor.string("print_status"))
        putString("syncStatus", cursor.string("sync_status"))
        putString("deviceId", cursor.string("device_id"))
        putString("accountEmail", cursor.string("account_email"))
        putInt("reprintCount", cursor.getInt(cursor.getColumnIndexOrThrow("reprint_count")))
    }

    private fun matchesExistingReceipt(db: SQLiteDatabase, expected: ContentValues): Boolean {
        db.query(
            "receipts",
            arrayOf("client_id", "receipt_number", "organization_code", "location_id", "vehicle_number", "vehicle_type", "vehicle_rate", "issued_at", "operator_id"),
            "receipt_id = ?",
            arrayOf(expected.getAsString("receipt_id")),
            null,
            null,
            null,
            "1",
        ).use { cursor ->
            if (!cursor.moveToFirst()) return false
            return cursor.string("client_id") == expected.getAsString("client_id") &&
                cursor.string("receipt_number") == expected.getAsString("receipt_number") &&
                cursor.string("organization_code") == expected.getAsString("organization_code") &&
                cursor.string("location_id") == expected.getAsString("location_id") &&
                cursor.string("vehicle_number") == expected.getAsString("vehicle_number") &&
                cursor.string("vehicle_type") == expected.getAsString("vehicle_type") &&
                cursor.getInt(cursor.getColumnIndexOrThrow("vehicle_rate")) == expected.getAsInteger("vehicle_rate") &&
                cursor.string("issued_at") == expected.getAsString("issued_at") &&
                cursor.string("operator_id") == expected.getAsString("operator_id")
        }
    }

    private fun android.database.Cursor.string(column: String): String = getString(getColumnIndexOrThrow(column))

    private fun requireVehicleType(payload: ReadableMap): String {
        val value = requireString(payload, "vehicleType")
        require(value == "Bike" || value == "Car") { "Unsupported vehicle type: $value" }
        return value
    }

    private fun requireRate(payload: ReadableMap, vehicleType: String): Int {
        val value = payload.getDouble("vehicleRate").toInt()
        val expected = if (vehicleType == "Bike") 50 else 100
        require(value == expected && payload.getDouble("vehicleRate") == value.toDouble()) {
            "The $vehicleType rate must be Rs. $expected"
        }
        return value
    }

    private fun requireString(payload: ReadableMap, key: String): String {
        require(payload.hasKey(key) && !payload.isNull(key)) { "Missing required field: $key" }
        return payload.getString(key)?.trim()?.takeIf { it.isNotEmpty() }
            ?: throw IllegalArgumentException("Invalid string field: $key")
    }

    private fun successResult() = WritableNativeMap().apply { putBoolean("success", true) }
}
