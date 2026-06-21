package com.animezone.mobile.native_modules

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * AnimeZonePackage — déclare le Native Module auprès de React Native.
 *
 * Sans cette classe, le Native Module existe en Kotlin mais reste invisible
 * côté JS (`NativeModules.AnimeZoneModule` serait `undefined`).
 *
 * Il faut ensuite instancier ce package dans `MainApplication.kt` de l'app React Native :
 *
 *   override fun getPackages(): List<ReactPackage> = PackageList(this).packages.apply {
 *       add(AnimeZonePackage())   // <-- à ajouter
 *   }
 *
 * Voir README.md pour les instructions complètes.
 */
class AnimeZonePackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(AnimeZoneModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()  // Pas de view custom, juste un module de méthodes
    }
}
