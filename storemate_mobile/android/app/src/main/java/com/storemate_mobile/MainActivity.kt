package com.storemate_mobile

import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Prevent Android from restoring old React Native Screens
   * fragments after the Activity is recreated.
   *
   * react-native-screens manages its own screen state.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript.
   */
  override fun getMainComponentName(): String = "storemate_mobile"

  /**
   * Returns the instance of the ReactActivityDelegate.
   *
   * DefaultReactActivityDelegate enables the New Architecture
   * using the fabricEnabled flag.
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(
          this,
          mainComponentName,
          fabricEnabled
      )
}