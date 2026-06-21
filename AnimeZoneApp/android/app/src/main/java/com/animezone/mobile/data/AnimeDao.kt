package com.animezone.mobile.data

import android.content.Context
import android.database.Cursor
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * AnimeDao — couche d'accès aux données qui remplace `AnimeDataRepository` basé
 * sur JSON. Toutes les requêtes passent par SQLite — indexées, donc O(log n).
 *
 * Équivalences avec le code Python d'origine (app.py) :
 *   load_anime_data()    →  getAllAnimes() / searchAnimes()        (filtré par SQL)
 *   get_anime_by_id(id)  →  getAnimeById(id)                       (lecture raw_json en 1 requête)
 *   load_discover_data() →  getDiscover()                          (table `discover`)
 *   get_all_genres()     →  getAllGenres()                         (table `genre`)
 *   /api/anime/list      →  searchAnimes(query, genre, limit)      (LIKE indexé + JOIN)
 *
 * Stratégie "hybride" :
 *   - Pour les listes (searchAnimes, getDiscover), on ne lit QUE les colonnes
 *     légères (id, title, image, has_episodes). Pas de raw_json → fast.
 *   - Pour getAnimeById, on lit raw_json (l'objet complet tel qu'il était dans
 *     anime.json) et on le parse en JSONObject. Une seule colonne = une seule
 *     lecture disque.
 *
 * Threading :
 *   - SQLiteDatabase est thread-safe par défaut (verrou interne).
 *   - On ajoute un ReentrantReadWriteLock pour protéger les opérations
 *     d'écriture futures (progression, favoris) — pas nécessaire pour de la
 *     lecture seule, mais préparé pour l'extension Room/SQLite direct.
 */
class AnimeDao private constructor(private val context: Context) {

    private val helper: AnimeDatabaseHelper by lazy { AnimeDatabaseHelper.getInstance(context) }
    private val lock = ReentrantReadWriteLock()

    companion object {
        @Volatile private var INSTANCE: AnimeDao? = null

        fun getInstance(context: Context): AnimeDao =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: AnimeDao(context.applicationContext).also { INSTANCE = it }
            }

        private const val TAG = "AnimeDao"
    }

    // ------------------------------------------------------------------
    // Recherche multi-critères (équivalent /api/anime/list)
    // ------------------------------------------------------------------

    /**
     * Recherche d'animes par titre + genre + filtre has_episodes.
     *
     * @param query  texte à chercher dans le titre (normalisé automatiquement)
     * @param genre  nom de genre (normalisé automatiquement, accents OK)
     * @param requireEpisodes  si true, ne renvoie que les animes ayant des épisodes
     * @param limit   nombre max de résultats (défaut 100, comme le Python)
     * @return liste de JSONObject légers { anime_id, title, image, has_episodes, year, rating, genres }
     */
    fun searchAnimes(
        query: String? = null,
        genre: String? = null,
        requireEpisodes: Boolean = true,
        limit: Int = 100
    ): List<JSONObject> {
        return lock.read {
            val db = helper.readableDatabase
            val results = mutableListOf<JSONObject>()

            val where = StringBuilder()
            val args = mutableListOf<String>()

            if (requireEpisodes) {
                where.append("a.has_episodes = 1")
            }
            val qNorm = AnimeDatabaseHelper.normalize(query)
            if (qNorm.isNotEmpty()) {
                if (where.isNotEmpty()) where.append(" AND ")
                where.append("a.title_normalized LIKE ?")
                args.add("%$qNorm%")
            }
            val gNorm = AnimeDatabaseHelper.normalize(genre)
            if (gNorm.isNotEmpty()) {
                if (where.isNotEmpty()) where.append(" AND ")
                where.append("a.anime_id IN (SELECT anime_id FROM anime_genre ag JOIN genre g ON g.id = ag.genre_id WHERE g.name_normalized = ?)")
                args.add(gNorm)
            }

            val sql = """
                SELECT a.anime_id, a.title, a.image, a.has_episodes, a.year, a.rating, a.languages
                FROM anime a
                ${if (where.isNotEmpty()) "WHERE $where" else ""}
                ORDER BY a.title COLLATE NOCASE ASC
                LIMIT ?
            """.trimIndent()
            args.add(limit.toString())

            db.rawQuery(sql, args.toTypedArray()).use { c ->
                while (c.moveToNext()) {
                    val anime = JSONObject()
                    anime.put("anime_id", c.getInt(0))
                    anime.put("title", c.getString(1))
                    if (!c.isNull(2)) anime.put("image", c.getString(2))
                    anime.put("has_episodes", c.getInt(3) == 1)
                    if (!c.isNull(4)) anime.put("year", c.getInt(4))
                    anime.put("rating", c.getDouble(5))
                    // V1.3 : on charge `languages` pour que les cards puissent afficher VF/VOSTFR.
                    if (!c.isNull(6)) {
                        val langStr = c.getString(6)
                        try {
                            val langArr = JSONArray(langStr)
                            // Convertir en List<String> pour facilement vérifier contains côté TS
                            val jsArr = JSONArray()
                            for (i in 0 until langArr.length()) {
                                jsArr.put(langArr.getString(i))
                            }
                            anime.put("languages", jsArr)
                        } catch (_: Exception) {
                            // langStr mal formé : on l'ignore
                        }
                    }
                    results.add(anime)
                }
            }

            // Pour chaque anime, charger les genres (1 petite requête par anime, ou batch)
            if (results.isNotEmpty()) {
                val ids = results.map { it.getInt("anime_id") }
                val genresByAnime = batchGetGenres(ids)
                for (anime in results) {
                    val genres = genresByAnime[anime.getInt("anime_id")] ?: emptyList()
                    val arr = JSONArray()
                    genres.forEach { arr.put(it) }
                    anime.put("genres", arr)
                }
            }

            results
        }
    }

    // ------------------------------------------------------------------
    // Détail complet d'un anime (équivalent get_anime_by_id + /anime/<id>)
    // ------------------------------------------------------------------

    /**
     * Récupère un anime complet avec toutes ses saisons/épisodes/URLs.
     * Stratégie : on lit la colonne `raw_json` qui contient l'objet JSON
     * original (tel qu'il était dans anime.json). Une seule lecture = rapide.
     *
     * @param animeId ID numérique de l'anime
     * @return JSONObject complet (peut être null si ID inconnu)
     */
    fun getAnimeById(animeId: Int): JSONObject? {
        return lock.read {
            val db = helper.readableDatabase
            db.rawQuery(
                "SELECT raw_json FROM anime WHERE anime_id = ?",
                arrayOf(animeId.toString())
            ).use { c ->
                if (!c.moveToFirst()) return@read null
                val raw = c.getString(0)
                try {
                    JSONObject(raw)
                } catch (e: Exception) {
                    Log.e(TAG, "Erreur parsing raw_json pour anime $animeId", e)
                    null
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Discover (équivalent load_discover_data)
    // ------------------------------------------------------------------

    fun getDiscover(): List<JSONObject> {
        return lock.read {
            val db = helper.readableDatabase
            val results = mutableListOf<JSONObject>()
            db.rawQuery(
                """SELECT position, anime_id, title, description, image, rating, has_episodes, raw_json
                   FROM discover
                   ORDER BY position ASC""".trimIndent(),
                null
            ).use { c ->
                while (c.moveToNext()) {
                    // On renvoie le raw_json complet pour préserver la structure
                    // exacte qu'attendait le code Python côté template index_new.html.
                    val raw = c.getString(7)
                    try {
                        results.add(JSONObject(raw))
                    } catch (e: Exception) {
                        Log.w(TAG, "Discover entry ${c.getInt(0)} : JSON invalide", e)
                    }
                }
            }
            results
        }
    }

    // ------------------------------------------------------------------
    // Genres (équivalent get_all_genres)
    // ------------------------------------------------------------------

    /**
     * @return liste des genres triés alphabétiquement (formes originales avec accents).
     */
    fun getAllGenres(): List<String> {
        return lock.read {
            val db = helper.readableDatabase
            val out = mutableListOf<String>()
            db.rawQuery(
                "SELECT name FROM genre ORDER BY name_normalized ASC",
                null
            ).use { c ->
                while (c.moveToNext()) out.add(c.getString(0))
            }
            out
        }
    }

    /**
     * Récupère les genres d'une liste d'animes en une seule requête.
     * Plus efficace que N requêtes individuelles.
     */
    private fun batchGetGenres(animeIds: List<Int>): Map<Int, List<String>> {
        if (animeIds.isEmpty()) return emptyMap()
        val db = helper.readableDatabase
        val placeholders = animeIds.joinToString(",") { "?" }
        val out = mutableMapOf<Int, MutableList<String>>()

        db.rawQuery(
            """
            SELECT ag.anime_id, g.name
            FROM anime_genre ag
            JOIN genre g ON g.id = ag.genre_id
            WHERE ag.anime_id IN ($placeholders)
            ORDER BY ag.anime_id, g.name_normalized
            """.trimIndent(),
            animeIds.map { it.toString() }.toTypedArray()
        ).use { c ->
            while (c.moveToNext()) {
                val id = c.getInt(0)
                val name = c.getString(1)
                out.getOrPut(id) { mutableListOf() }.add(name)
            }
        }
        return out
    }

    // ------------------------------------------------------------------
    // Stats (debug / UI paramètres)
    // ------------------------------------------------------------------

    data class Stats(
        val totalAnimes: Int,
        val totalEpisodes: Int,
        val totalUrls: Int,
        val dbSizeBytes: Long
    )

    fun getStats(): Stats {
        return lock.read {
            val db = helper.readableDatabase
            val totalAnimes = db.rawQuery("SELECT COUNT(*) FROM anime", null).use {
                it.moveToFirst(); it.getInt(0)
            }
            val totalEpisodes = db.rawQuery("SELECT COUNT(*) FROM episode", null).use {
                it.moveToFirst(); it.getInt(0)
            }
            val totalUrls = db.rawQuery("SELECT COUNT(*) FROM episode_url", null).use {
                it.moveToFirst(); it.getInt(0)
            }
            val dbFile = context.getDatabasePath(AnimeDatabaseHelper.DB_NAME)
            Stats(totalAnimes, totalEpisodes, totalUrls, dbFile.length())
        }
    }

    // ------------------------------------------------------------------
    // Bonus : récupérer uniquement les URLs d'un épisode (pour le player)
    // ------------------------------------------------------------------

    /**
     * Pour un anime_id + season + episode donnés, récupère les URLs classées
     * par langue. Évite de charger tout l'arbre anime quand on veut juste
     * jouer un épisode.
     *
     * @return Map<lang, List<url>>  ex: {"VOSTFR": ["https://vidmoly/...", ...]}
     */
    fun getEpisodeUrls(animeId: Int, seasonNumber: Int, episodeNumber: Int): Map<String, List<String>> {
        return lock.read {
            val db = helper.readableDatabase
            val out = mutableMapOf<String, MutableList<String>>()
            db.rawQuery(
                """
                SELECT eu.language, eu.url
                FROM episode_url eu
                JOIN episode e ON e.id = eu.episode_id
                JOIN season s ON s.id = e.season_id
                WHERE s.anime_id = ? AND s.season_number = ? AND e.episode_number = ?
                ORDER BY eu.language, eu.url_position
                """.trimIndent(),
                arrayOf(animeId.toString(), seasonNumber.toString(), episodeNumber.toString())
            ).use { c ->
                while (c.moveToNext()) {
                    val lang = c.getString(0)
                    val url = c.getString(1)
                    out.getOrPut(lang) { mutableListOf() }.add(url)
                }
            }
            out
        }
    }
}
