package com.valetpos

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader
import com.valetpos.sunmi.SunmiBridgePackage

class MainApplication : Application(), ReactApplication {
    private val reactNativeHost: ReactNativeHost = object : DefaultReactNativeHost(this) {
        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
        override fun getPackages(): List<ReactPackage> {
            val packages = PackageList(this).packages.toMutableList()
            packages.add(SunmiBridgePackage())
            return packages
        }
        override fun getJSMainModuleName(): String = "index"
        override fun getEnableNewArchitecture(): Boolean = false
        override fun getUseTurboModules(): Boolean = false
    }

    override fun getReactNativeHost(): ReactNativeHost = reactNativeHost

    override fun onCreate() {
        super.onCreate()
        SoLoader.init(this, false)
        DefaultNewArchitectureEntryPoint.load()
    }
}
