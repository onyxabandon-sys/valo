package com.valetpos.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class DeviceLocationModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "DeviceLocation"

    @ReactMethod
    fun getCurrentLocation(promise: Promise) {
        try {
            if (!hasFineLocationPermission()) {
                promise.reject("LOCATION_PERMISSION_DENIED", "Fine location permission is required.")
                return
            }

            val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
                .filter { provider -> manager.isProviderEnabled(provider) }
            if (providers.isEmpty()) {
                promise.reject("LOCATION_PROVIDER_DISABLED", "No location provider is enabled.")
                return
            }

            val latestKnown = providers
                .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
                .maxByOrNull { location -> location.time }
            if (latestKnown != null && System.currentTimeMillis() - latestKnown.time <= 30_000) {
                promise.resolve(locationMap(latestKnown))
                return
            }

            requestSingleUpdate(manager, providers.first(), promise)
        } catch (error: SecurityException) {
            promise.reject("LOCATION_PERMISSION_DENIED", error.message, error)
        } catch (error: Exception) {
            promise.reject("LOCATION_UNAVAILABLE", error.message, error)
        }
    }

    private fun requestSingleUpdate(manager: LocationManager, provider: String, promise: Promise) {
        val handler = Handler(Looper.getMainLooper())
        var completed = false
        lateinit var timeoutRunnable: Runnable
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                if (completed) return
                completed = true
                manager.removeUpdates(this)
                handler.removeCallbacks(timeoutRunnable)
                promise.resolve(locationMap(location))
            }

            override fun onProviderDisabled(disabledProvider: String) = Unit
            override fun onProviderEnabled(enabledProvider: String) = Unit
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        }

        timeoutRunnable = Runnable {
            if (!completed) {
                completed = true
                manager.removeUpdates(listener)
                promise.reject("LOCATION_TIMEOUT", "Device location was not available quickly enough.")
            }
        }
        handler.postDelayed(timeoutRunnable, 3_000L)

        manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
    }

    private fun hasFineLocationPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
            context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun locationMap(location: Location) = WritableNativeMap().apply {
        putDouble("latitude", location.latitude)
        putDouble("longitude", location.longitude)
        if (location.hasAccuracy()) putDouble("accuracy", location.accuracy.toDouble())
        putString("provider", location.provider)
        putString("capturedAt", isoTimestamp(if (location.time > 0) location.time else System.currentTimeMillis()))
    }

    private fun isoTimestamp(timestamp: Long): String {
        val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        formatter.timeZone = TimeZone.getTimeZone("UTC")
        return formatter.format(Date(timestamp))
    }
}
