package com.animezone.mobile.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * UserDao — couche d'accès aux données utilisateur (V1.5).
 *
 * V1.5 : ajout de la colonne `color` sur la table profile (index 0-5 dans la
 * palette AVATAR_COLORS côté JS). Rétrocompatible avec V1.4 (si la colonne
 * n'existe pas, on la crée dans UserDataHelper.onUpgrade).
 */
class UserDao private constructor(context: Context) {

    private val helper: UserDataHelper = UserDataHelper.getInstance(context)
    private val animeHelper: AnimeDatabaseHelper = AnimeDatabaseHelper.getInstance(context)
    private val lock = ReentrantReadWriteLock()

    companion object {
        @Volatile private var INSTANCE: UserDao? = null

        fun getInstance(context: Context): UserDao =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: UserDao(context.applicationContext).also { INSTANCE = it }
            }

        private const val TAG = "UserDao"
    }

    data class Profile(val id: Long, val name: String, val createdAt: Long, val color: Int = 0)

    fun createProfile(name: String, color: Int = 0): Long? {
        return lock.write {
            val db = helper.writableDatabase
            try {
                val values = android.content.ContentValues().apply {
                    put("name", name.trim())
                    put("created_at", System.currentTimeMillis())
                    put("color", color)
                }
                db.insert("profile", null, values)
            } catch (e: Exception) {
                Log.e(TAG, "createProfile failed: ${e.message}")
                null
            }
        }
    }

    fun listProfiles(): List<Profile> {
        return lock.read {
            val db = helper.readableDatabase
            val out = mutableListOf<Profile>()
            // V1.5 : on essaie d'abord avec la colonne color (V1.5+), fallback sans (V1.4)
            try {
                db.rawQuery("SELECT id, name, created_at, color FROM profile ORDER BY created_at ASC", null).use { c ->
                    while (c.moveToNext()) {
                        out.add(Profile(c.getLong(0), c.getString(1), c.getLong(2), c.getInt(3)))
                    }
                }
            } catch (_: Exception) {
                // Fallback V1.4 (pas de colonne color)
                db.rawQuery("SELECT id, name, created_at FROM profile ORDER BY created_at ASC", null).use { c ->
                    while (c.moveToNext()) {
                        out.add(Profile(c.getLong(0), c.getString(1), c.getLong(2), 0))
                    }
                }
            }
            out
        }
    }

    fun renameProfile(profileId: Long, newName: String): Boolean {
        return lock.write {
            val db = helper.writableDatabase
            try {
                val values = android.content.ContentValues().apply { put("name", newName.trim()) }
                db.update("profile", values, "id = ?", arrayOf(profileId.toString())) > 0
            } catch (e: Exception) {
                Log.e(TAG, "renameProfile failed: ${e.message}")
                false
            }
        }
    }

    fun updateProfileColor(profileId: Long, color: Int): Boolean {
        return lock.write {
            val db = helper.writableDatabase
            try {
                val values = android.content.ContentValues().apply { put("color", color) }
                db.update("profile", values, "id = ?", arrayOf(profileId.toString())) > 0
            } catch (e: Exception) {
                Log.e(TAG, "updateProfileColor failed: ${e.message}")
                false
            }
        }
    }

    fun deleteProfile(profileId: Long): Boolean {
        return lock.write {
            val db = helper.writableDatabase
            try {
                db.delete("profile", "id = ?", arrayOf(profileId.toString())) > 0
            } catch (e: Exception) {
                Log.e(TAG, "deleteProfile failed: ${e.message}")
                false
            }
        }
    }

    fun addFavorite(profileId: Long, animeId: Int): Boolean {
        return lock.write {
            val db = helper.writableDatabase
            try {
                val values = android.content.ContentValues().apply {
                    put("profile_id", profileId)
                    put("anime_id", animeId)
                    put("added_at", System.currentTimeMillis())
                }
                db.insertWithOnConflict("favorite", null, values, SQLiteDatabase.CONFLICT_REPLACE)
                true
            } catch (e: Exception) {
                Log.e(TAG, "addFavorite failed: ${e.message}")
                false
            }
        }
    }

    fun removeFavorite(profileId: Long, animeId: Int): Boolean {
        return lock.write {
            val db = helper.writableDatabase
            db.delete("favorite", "profile_id = ? AND anime_id = ?",
                arrayOf(profileId.toString(), animeId.toString())) > 0
        }
    }

    fun isFavorite(profileId: Long, animeId: Int): Boolean {
        return lock.read {
            val db = helper.readableDatabase
            db.rawQuery("SELECT 1 FROM favorite WHERE profile_id = ? AND anime_id = ? LIMIT 1",
                arrayOf(profileId.toString(), animeId.toString())).use { c -> c.moveToFirst() }
        }
    }

    fun getFavorites(profileId: Long): List<JSONObject> {
        return lock.read {
            val db = helper.readableDatabase
            val animeDb = animeHelper.readableDatabase
            val out = mutableListOf<JSONObject>()
            val animeIds = mutableListOf<Int>()
            db.rawQuery("SELECT anime_id FROM favorite WHERE profile_id = ? ORDER BY added_at DESC",
                arrayOf(profileId.toString())).use { c ->
                while (c.moveToNext()) animeIds.add(c.getInt(0))
            }
            // V1.5 : on lit raw_json pour récupérer seasons/episodes/languages complets
            // (avant on ne renvoyait que title/image/year — du coup les cards affichaient
            // "Aucun épisode disponible" même pour les animes avec épisodes).
            for (animeId in animeIds) {
                animeDb.rawQuery("SELECT raw_json FROM anime WHERE anime_id = ?",
                    arrayOf(animeId.toString())).use { c ->
                    if (c.moveToFirst()) {
                        try {
                            val anime = JSONObject(c.getString(0))
                            // S'assurer que has_episodes est cohérent avec la présence de saisons
                            val seasons = anime.optJSONArray("seasons")
                            val hasEps = seasons != null && seasons.length() > 0
                            anime.put("has_episodes", hasEps)
                            out.add(anime)
                        } catch (_: Exception) {}
                    }
                }
            }
            out
        }
    }

    data class ContinueWatchingEntry(
        val animeId: Int,
        val seasonNumber: Int,
        val episodeNumber: Int,
        val lastWatched: Long
    )

    fun upsertContinueWatching(profileId: Long, animeId: Int, seasonNumber: Int, episodeNumber: Int): Boolean {
        return lock.write {
            val db = helper.writableDatabase
            try {
                val values = android.content.ContentValues().apply {
                    put("profile_id", profileId)
                    put("anime_id", animeId)
                    put("season_number", seasonNumber)
                    put("episode_number", episodeNumber)
                    put("last_watched", System.currentTimeMillis())
                }
                db.insertWithOnConflict("continue_watching", null, values, SQLiteDatabase.CONFLICT_REPLACE)
                true
            } catch (e: Exception) {
                Log.e(TAG, "upsertContinueWatching failed: ${e.message}")
                false
            }
        }
    }

    fun removeFromContinueWatching(profileId: Long, animeId: Int): Boolean {
        return lock.write {
            val db = helper.writableDatabase
            db.delete("continue_watching", "profile_id = ? AND anime_id = ?",
                arrayOf(profileId.toString(), animeId.toString())) > 0
        }
    }

    fun getContinueWatching(profileId: Long, limit: Int = 20): List<JSONObject> {
        return lock.read {
            val db = helper.readableDatabase
            val animeDb = animeHelper.readableDatabase
            val out = mutableListOf<JSONObject>()
            val entries = mutableListOf<ContinueWatchingEntry>()
            db.rawQuery(
                "SELECT anime_id, season_number, episode_number, last_watched FROM continue_watching WHERE profile_id = ? ORDER BY last_watched DESC LIMIT ?",
                arrayOf(profileId.toString(), limit.toString())
            ).use { c ->
                while (c.moveToNext()) {
                    entries.add(ContinueWatchingEntry(c.getInt(0), c.getInt(1), c.getInt(2), c.getLong(3)))
                }
            }
            for (entry in entries) {
                animeDb.rawQuery("SELECT raw_json FROM anime WHERE anime_id = ?",
                    arrayOf(entry.animeId.toString())).use { c ->
                    if (c.moveToFirst()) {
                        try {
                            val anime = JSONObject(c.getString(0))
                            val seasons = anime.optJSONArray("seasons")
                            if (seasons != null) {
                                var found = false
                                for (i in 0 until seasons.length()) {
                                    if (found) break
                                    val season = seasons.getJSONObject(i)
                                    if (season.optInt("season_number") != entry.seasonNumber) continue
                                    val episodes = season.optJSONArray("episodes")
                                    if (episodes != null) {
                                        for (j in 0 until episodes.length()) {
                                            val ep = episodes.getJSONObject(j)
                                            if (ep.optInt("episode_number") == entry.episodeNumber) {
                                                val item = JSONObject()
                                                item.put("anime_id", entry.animeId)
                                                item.put("title", anime.optString("title"))
                                                item.put("image", anime.optString("image", ""))
                                                item.put("season_number", entry.seasonNumber)
                                                item.put("episode_number", entry.episodeNumber)
                                                item.put("episode_title", ep.optString("title", ""))
                                                item.put("last_watched", entry.lastWatched)
                                                out.add(item)
                                                found = true
                                                break
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (_: Exception) {}
                    }
                }
            }
            out
        }
    }

    // ------------------------------------------------------------------
    // V1.5 : Video progress (sauvegarde de la position de lecture)
    // ------------------------------------------------------------------

    data class VideoProgress(
        val profileId: Long,
        val animeId: Int,
        val seasonNumber: Int,
        val episodeNumber: Int,
        val position: Long,    // ms
        val duration: Long,    // ms
        val completed: Boolean,
        val updatedAt: Long
    )

    /**
     * Sauvegarde (ou met à jour) la position de lecture d'un épisode.
     * Identifie de façon unique par (profile_id, anime_id, season_number, episode_number).
     */
    fun saveVideoProgress(
        profileId: Long,
        animeId: Int,
        seasonNumber: Int,
        episodeNumber: Int,
        positionMs: Long,
        durationMs: Long,
        completed: Boolean
    ): Boolean {
        return lock.write {
            val db = helper.writableDatabase
            try {
                val values = android.content.ContentValues().apply {
                    put("profile_id", profileId)
                    put("anime_id", animeId)
                    put("season_number", seasonNumber)
                    put("episode_number", episodeNumber)
                    put("position_ms", positionMs)
                    put("duration_ms", durationMs)
                    put("completed", if (completed) 1 else 0)
                    put("updated_at", System.currentTimeMillis())
                }
                db.insertWithOnConflict(
                    "video_progress", null, values, SQLiteDatabase.CONFLICT_REPLACE
                )
                true
            } catch (e: Exception) {
                Log.e(TAG, "saveVideoProgress failed: ${e.message}")
                false
            }
        }
    }

    /** Récupère la position sauvegardée (ou null si l'épisode n'a jamais été visionné). */
    fun getVideoProgress(
        profileId: Long,
        animeId: Int,
        seasonNumber: Int,
        episodeNumber: Int
    ): VideoProgress? {
        return lock.read {
            val db = helper.readableDatabase
            db.rawQuery(
                """SELECT profile_id, anime_id, season_number, episode_number,
                          position_ms, duration_ms, completed, updated_at
                   FROM video_progress
                   WHERE profile_id = ? AND anime_id = ? AND season_number = ? AND episode_number = ?
                   LIMIT 1""".trimIndent(),
                arrayOf(
                    profileId.toString(), animeId.toString(),
                    seasonNumber.toString(), episodeNumber.toString()
                )
            ).use { c ->
                if (!c.moveToFirst()) return@read null
                VideoProgress(
                    c.getLong(0), c.getInt(1), c.getInt(2), c.getInt(3),
                    c.getLong(4), c.getLong(5), c.getInt(6) == 1, c.getLong(7)
                )
            }
        }
    }

    /** Supprime la progression sauvegardée pour un épisode (utile au reset). */
    fun clearVideoProgress(
        profileId: Long,
        animeId: Int,
        seasonNumber: Int,
        episodeNumber: Int
    ): Boolean {
        return lock.write {
            val db = helper.writableDatabase
            db.delete(
                "video_progress",
                "profile_id = ? AND anime_id = ? AND season_number = ? AND episode_number = ?",
                arrayOf(
                    profileId.toString(), animeId.toString(),
                    seasonNumber.toString(), episodeNumber.toString()
                )
            ) > 0
        }
    }
}
