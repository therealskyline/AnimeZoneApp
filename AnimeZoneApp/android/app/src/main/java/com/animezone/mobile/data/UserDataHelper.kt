package com.animezone.mobile.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log

/**
 * UserDataHelper — DB SQLite séparée pour les données utilisateur (V1.5).
 *
 * V1.5 : ajout de la colonne `color` sur `profile` (index 0-5 dans la palette
 * AVATAR_COLORS côté JS) + table `video_progress` pour la reprise de lecture.
 *
 * Pourquoi une DB séparée (user_data.db) plutôt que des tables dans animezone.db ?
 *   - animezone.db est pré-buildée dans l'APK et recopiée depuis assets au 1er
 *     lancement. À chaque mise à jour du catalogue (bump DB_VERSION dans
 *     AnimeDatabaseHelper), on supprime + recopie — ce qui écraserait les
 *     données utilisateur si elles étaient dans la même DB.
 *   - user_data.db est créée à la volée par SQLiteOpenHelper.onCreate, vide,
 *     et n'est JAMAIS écrasée sauf désinstallation de l'app.
 *
 * Schéma V1.5 :
 *   - profile            : profiles Netflix-style (id, name, color, created_at)
 *   - favorite           : favoris par profil
 *   - continue_watching  : épisode en cours par anime + profil
 *   - video_progress     : position de lecture sauvegardée par épisode (V1.5)
 */
class UserDataHelper private constructor(context: Context) :
    SQLiteOpenHelper(
        context.applicationContext,
        DB_NAME,
        null,
        DB_VERSION
    ) {

    private val appContext: Context = context.applicationContext

    companion object {
        private const val TAG = "UserDataHelper"
        const val DB_NAME = "user_data.db"
        const val DB_VERSION = 2  // V1.5 : bumpé pour trigger onUpgrade

        @Volatile private var INSTANCE: UserDataHelper? = null

        fun getInstance(context: Context): UserDataHelper =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: UserDataHelper(context).also { INSTANCE = it }
            }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE profile (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL UNIQUE,
                color       INTEGER NOT NULL DEFAULT 0,
                created_at  INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE favorite (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id  INTEGER NOT NULL,
                anime_id    INTEGER NOT NULL,
                added_at    INTEGER NOT NULL,
                UNIQUE (profile_id, anime_id),
                FOREIGN KEY (profile_id) REFERENCES profile(id) ON DELETE CASCADE
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE continue_watching (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id      INTEGER NOT NULL,
                anime_id        INTEGER NOT NULL,
                season_number   INTEGER NOT NULL,
                episode_number  INTEGER NOT NULL,
                last_watched    INTEGER NOT NULL,
                UNIQUE (profile_id, anime_id),
                FOREIGN KEY (profile_id) REFERENCES profile(id) ON DELETE CASCADE
            )
        """.trimIndent())

        // V1.5 : table video_progress pour la reprise de lecture
        db.execSQL("""
            CREATE TABLE video_progress (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id      INTEGER NOT NULL,
                anime_id        INTEGER NOT NULL,
                season_number   INTEGER NOT NULL,
                episode_number  INTEGER NOT NULL,
                position_ms     INTEGER NOT NULL DEFAULT 0,
                duration_ms     INTEGER NOT NULL DEFAULT 0,
                completed       INTEGER NOT NULL DEFAULT 0,
                updated_at      INTEGER NOT NULL,
                UNIQUE (profile_id, anime_id, season_number, episode_number),
                FOREIGN KEY (profile_id) REFERENCES profile(id) ON DELETE CASCADE
            )
        """.trimIndent())

        db.execSQL("CREATE INDEX idx_favorite_profile ON favorite(profile_id)")
        db.execSQL("CREATE INDEX idx_continue_profile ON continue_watching(profile_id)")
        db.execSQL("CREATE INDEX idx_continue_last ON continue_watching(last_watched)")
        db.execSQL("CREATE INDEX idx_progress_profile ON video_progress(profile_id)")
        db.execSQL("CREATE INDEX idx_progress_lookup ON video_progress(profile_id, anime_id, season_number, episode_number)")

        Log.i(TAG, "user_data.db créée avec tables profile/favorite/continue_watching/video_progress")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        Log.i(TAG, "Upgrading user_data.db from v$oldVersion to v$newVersion")
        if (oldVersion < 2) {
            // V1.5 : ajout de la colonne color à la table profile + table video_progress
            try {
                db.execSQL("ALTER TABLE profile ADD COLUMN color INTEGER NOT NULL DEFAULT 0")
                Log.i(TAG, "Colonne 'color' ajoutée à la table profile")
            } catch (e: Exception) {
                Log.w(TAG, "Colonne 'color' existe déjà : ${e.message}")
            }
            try {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS video_progress (
                        id              INTEGER PRIMARY KEY AUTOINCREMENT,
                        profile_id      INTEGER NOT NULL,
                        anime_id        INTEGER NOT NULL,
                        season_number   INTEGER NOT NULL,
                        episode_number  INTEGER NOT NULL,
                        position_ms     INTEGER NOT NULL DEFAULT 0,
                        duration_ms     INTEGER NOT NULL DEFAULT 0,
                        completed       INTEGER NOT NULL DEFAULT 0,
                        updated_at      INTEGER NOT NULL,
                        UNIQUE (profile_id, anime_id, season_number, episode_number),
                        FOREIGN KEY (profile_id) REFERENCES profile(id) ON DELETE CASCADE
                    )
                """.trimIndent())
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_progress_profile ON video_progress(profile_id)")
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_progress_lookup ON video_progress(profile_id, anime_id, season_number, episode_number)")
                Log.i(TAG, "Table 'video_progress' créée")
            } catch (e: Exception) {
                Log.w(TAG, "Table 'video_progress' existe déjà : ${e.message}")
            }
        }
        // Pour les versions futures : ajouter d'autres ALTER TABLE ici.
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }
}
