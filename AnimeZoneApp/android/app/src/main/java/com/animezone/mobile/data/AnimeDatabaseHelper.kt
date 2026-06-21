package com.animezone.mobile.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/**
 * AnimeDatabaseHelper — ouvre la DB SQLite pré-buildée `animezone.db` qui est
 * embarquée dans l'APK sous `assets/`.
 *
 * Pattern standard Android pour shipper une DB pré-remplie :
 *   1. Au premier lancement, `assets/animezone.db` est copié vers
 *      `/data/data/<pkg>/databases/animezone.db` (stockage interne de l'app).
 *   2. Les lectures suivantes se font sur la copie locale (accès direct
 *      SQLiteDatabase, pas de surcouche assets).
 *   3. À chaque mise à jour de l'APK avec une nouvelle version de la DB,
 *      on incrémente DB_VERSION et `onUpgrade` supprime + recopie le fichier.
 *
 * Pourquoi ne pas lire directement depuis assets/ :
 *   - SQLite ne peut pas ouvrir un fichier via le chemin `/android_asset/...`
 *     (ce n'est pas un vrai filesystem).
 *   - On aurait besoin d'un AssetManager à chaque requête → lent et lourd.
 *
 * Alternative moderne : utiliser Room avec `.createFromAsset("animezone.db")`.
 * Mais Room est optionnel dans ce projet — on reste sur SQLiteOpenHelper pur
 * pour éviter d'imposer une dépendance. La migration Room plus tard est
 * trivialement possible : il suffit d'annoter les entités correspondant aux
 * tables de ce schéma.
 *
 * Schéma SQL complet : voir /home/z/my-project/scripts/json_to_sqlite.py
 * Tables : anime, genre, anime_genre, season, episode, episode_url, discover
 */
class AnimeDatabaseHelper private constructor(context: Context) :
    SQLiteOpenHelper(
        context.applicationContext,
        DB_NAME,
        null,
        DB_VERSION
    ) {

    // V1.3 : on garde une référence au contexte applicatif pour pouvoir l'utiliser
    // dans onUpgrade() sans dépendre du singleton INSTANCE (qui peut être null
    // à ce moment-là, et qui n'est pas un Context de toute façon).
    private val appContext: Context = context.applicationContext

    companion object {
        private const val TAG = "AnimeDBHelper"
        const val DB_NAME = "animezone.db"
        const val DB_VERSION = 1

        @Volatile private var INSTANCE: AnimeDatabaseHelper? = null

        fun getInstance(context: Context): AnimeDatabaseHelper =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: AnimeDatabaseHelper(context).also { INSTANCE = it }
            }

        /**
         * Normalise une chaîne côté Kotlin — miroir exact de `normalize()` côté Python.
         * Utilisée pour les recherches : on normalise l'input utilisateur avant de
         * faire un LIKE sur la colonne `*_normalized`.
         *
         * Exemple : "Shônen" → "shonen", "Narutô" → "naruto"
         */
        fun normalize(input: String?): String {
            if (input.isNullOrBlank()) return ""
            val nfkd = java.text.Normalizer.normalize(input.lowercase().trim(), java.text.Normalizer.Form.NFKD)
            return nfkd.replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
        }
    }

    init {
        // Au premier accès, s'assurer que la DB est copiée depuis assets
        if (!databaseExists()) {
            copyDatabaseFromAssets()
        }
    }

    // ------------------------------------------------------------------
    // Lifecycle SQLiteOpenHelper
    // ------------------------------------------------------------------

    /**
     * Non utilisé : la DB est pré-buildée, pas créée par CREATE TABLE.
     * Mais SQLiteOpenHelper exige une implémentation.
     */
    override fun onCreate(db: SQLiteDatabase) {
        // no-op
    }

    /**
     * En cas de changement de version (nouveau catalogue dans un nouvel APK),
     * on supprime la DB locale et on recopie depuis assets.
     * Pas de migration champ-par-champ : le catalogue est régénéré à chaque
     * release, donc une recopie complète est plus simple et plus sûre.
     */
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        Log.i(TAG, "Upgrading DB from v$oldVersion to v$newVersion — recopying from assets")
        db.close()
        // V1.3 : on utilise appContext (propriété privée) au lieu de INSTANCE
        // qui peut être null et n'est de toute façon pas un Context.
        val dbFile = appContext.getDatabasePath(DB_NAME)
        if (dbFile.exists()) dbFile.delete()
        copyDatabaseFromAssets()
    }

    override fun onDowngrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        onUpgrade(db, oldVersion, newVersion)
    }

    // ------------------------------------------------------------------
    // Copie assets → stockage interne
    // ------------------------------------------------------------------

    private fun databaseExists(): Boolean {
        val dbFile = appContext.getDatabasePath(DB_NAME)
        return dbFile.exists() && dbFile.length() > 0
    }

    private fun copyDatabaseFromAssets() {
        val dbFile = appContext.getDatabasePath(DB_NAME)
        dbFile.parentFile?.mkdirs()

        try {
            appContext.assets.open(DB_NAME).use { input ->
                FileOutputStream(dbFile).use { output ->
                    input.copyTo(output, bufferSize = 8192)
                }
            }
            Log.i(TAG, "DB copiée depuis assets vers ${dbFile.absolutePath} (${dbFile.length() / 1024} Ko)")
        } catch (e: IOException) {
            Log.e(TAG, "Échec de la copie de la DB depuis assets", e)
            throw RuntimeException("Impossible de charger la base de données animezone.db", e)
        }
    }
}
