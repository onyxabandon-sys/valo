package com.valetpos
import expo.modules.ReactActivityDelegateWrapper
import com.facebook.react.ReactActivityDelegate

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
    override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      ReactActivityDelegate(this, getMainComponentName())
    );
  }
}
