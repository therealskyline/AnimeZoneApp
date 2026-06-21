package com.animezone.mobile.data

import android.content.Context
import org.json.JSONObject

/**
 * AnimeDataRepository — façade publique sur AnimeDao.
 *
 * Historiquement (v1), ce repository lisait `assets/anime.json` et gardait
 * un cache en mémoire (miroir de la logique Python `load_anime_data()`).
 *
 * Depuis la v2 (migration JSON → SQLite), ce repository ne fait que déléguer
 * à `AnimeDao`. On garde cette classe pour :
 *   - Préserver l'API publique (les autres fichiers Kotlin ne changent pas).
 *   - Centraliser une éventuelle couche de cache mémoire LRU si nécessaire.
 *   - Servir de point d'entrée unique pour les futurs modules (Room, etc.).
 *
 * Côté React Native : c'est `AnimeZoneModule.kt` qui consomme ce repository
 * et expose les méthodes à JS via `@ReactMethod`.
 *
 * Toutes les méthodes sont thread-safe grâce au verrou interne de AnimeDao.
 */
class AnimeDataRepository private constructor(context: Context) {

    private val dao: AnimeDao = AnimeDao.getInstance(context)

    companion object {
        @Volatile private var INSTANCE: AnimeDataRepository? = null

        fun getInstance(context: Context): AnimeDataRepository =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: AnimeDataRepository(context.applicationContext).also { INSTANCE = it }
            }
    }

    // ------------------------------------------------------------------
    // API publique — miroir des fonctions Python de app.py
    // ------------------------------------------------------------------

    /** Équivalent Python : load_anime_data() — mais filtrable et paginée. */
    fun loadAnimeData(
        query: String? = null,
        genre: String? = null,
        limit: Int = 100
    ): List<JSONObject> = dao.searchAnimes(query = query, genre = genre, limit = limit)

    /** Équivalent Python : get_anime_by_id(id) — recherche O(log n) via index PRIMARY KEY. */
    fun getAnimeById(id: Int): JSONObject? = dao.getAnimeById(id)

    /** Équivalent Python : load_discover_data(). */
    fun loadDiscoverData(): List<JSONObject> = dao.getDiscover()

    /** Équivalent Python : get_all_genres(). */
    fun getAllGenres(): List<String> = dao.getAllGenres()

    /** Recherche filtrée (équivalent /api/anime/list). */
    fun searchAnimes(query: String? = null, genre: String? = null, limit: Int = 100): List<JSONObject> =
        dao.searchAnimes(query = query, genre = genre, limit = limit)

    /** Récupère les URLs d'un épisode précis — utile pour le player sans charger tout l'anime. */
    fun getEpisodeUrls(animeId: Int, seasonNumber: Int, episodeNumber: Int): Map<String, List<String>> =
        dao.getEpisodeUrls(animeId, seasonNumber, episodeNumber)

    /** Stats globales — pour l'écran paramètres ou le debug. */
    fun getStats(): AnimeDao.Stats = dao.getStats()

    /**
     * Télécharge un nouveau animezone.db depuis une URL et le substitue au fichier local.
     * À appeler depuis un thread background. Pas de persistance de version —
     * si l'app est relancée, le fichier assets/animezone.db d'origine sera recopié
     * uniquement si on bump DB_VERSION dans AnimeDatabaseHelper.
     *
     * Pour une vraie mise à jour OTA du catalogue, envisager :
     *   - Stocker le fichier téléchargé dans filesDir/animezone.db
     *   - Modifier AnimeDatabaseHelper pour vérifier filesDir/ en priorité
     *   - Ajouter une table `meta` avec `catalog_version` pour le suivi
     */
    fun refreshFromRemote(url: String, promise: com.facebook.react.bridge.Promise? = null) {
        Thread {
            try {
                val request = okhttp3.Request.Builder().url(url).build()
                com.animezone.mobile.network.HttpClient.client.newCall(request).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        promise?.resolve(false)
                        return@Thread
                    }
                    val body = resp.body?.bytes() ?: run {
                        promise?.resolve(false)
                        return@Thread
                    }
                    // Écrire dans filesDir — sera lu par une version future de AnimeDatabaseHelper
                    val target = java.io.File(context.filesDir, "animezone.db.new")
                    target.writeBytes(body)
                    android.util.Log.i("AnimeDataRepo", "Nouveau catalogue téléchargé: ${target.length()} bytes")
                    promise?.resolve(true)
                }
            } catch (e: Exception) {
                android.util.Log.e("AnimeDataRepo", "refreshFromRemote failed: ${e.message}")
                promise?.resolve(false)
            }
        }.start()
    }

    /** Contexte pour refreshFromRemote. */
    private val context: Context = context.applicationContext
}
