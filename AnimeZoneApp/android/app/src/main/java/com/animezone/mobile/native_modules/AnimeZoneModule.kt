package com.animezone.mobile.native_modules

import android.util.Log
import com.animezone.mobile.data.AnimeDataRepository
import com.animezone.mobile.data.UserDao
import com.animezone.mobile.scraper.GenericExtractor
import com.animezone.mobile.scraper.HlsParser
import com.animezone.mobile.scraper.VideoExtractor
import com.animezone.mobile.scraper.VideoUrlParser
import com.animezone.mobile.network.HttpClient
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

/**
 * AnimeZoneModule — Native Module React Native (pont Kotlin <-> JS).
 *
 * C'est le point d'entrée côté JS. Une fois enregistré via `AnimeZonePackage`,
 * le code JS y accède ainsi :
 *
 *   import { NativeModules } from 'react-native'
 *   const { AnimeZoneModule } = NativeModules
 *
 *   const info = await AnimeZoneModule.getVideoInfo(
 *     'https://sendvid.com/embed/abc123'
 *   )
 *   // -> { success: true, playerType: 'mp4', url: 'https://...mp4' }
 *
 * Architecture :
 *   - Toutes les méthodes exposées à JS sont annotées `@ReactMethod`.
 *   - Toutes prennent un `Promise` en dernier paramètre (async/await côté JS).
 *   - React Native exécute ces méthodes sur un thread background natif, donc
 *     on peut faire des appels réseau bloquants (OkHttp) sans gêner l'UI JS.
 *   - Les valeurs de retour sont des `WritableMap` (l'équivalent RN d'un objet JS).
 *
 * Mapping depuis routes.py :
 *   POST /api/video/info   →  getVideoInfo(url)
 *   GET  /api/video/stream →  streamVideo(videoKey)            (cas HLS : pas besoin côté mobile, ExoPlayer lit directement le M3U8)
 *   GET  /api/video/segment→  proxySegment(videoKey, index)    (inutile côté mobile)
 *
 * Différence clé avec le backend Flask :
 *   Côté serveur web, on devait PROXY la vidéo (le navigateur ne pouvait pas
 *   accéder directement à l'URL sur SendVid/Vidmoly à cause du CORS et des
 *   headers anti-hotlinking). Sur Android, le player ExoPlayer (ou react-native-video)
 *   fait ses propres requêtes HTTP et n'est pas soumis au CORS du navigateur.
 *   On peut donc SAUTER les routes `/stream` et `/segment` et donner directement
 *   l'URL MP4 ou M3U8 au player JS.
 *
 *   Si toutefois un domaine bloque l'accès mobile direct, on peut rebrancher un
 *   proxy local via `proxyStream(url)` qui renvoie un InputStream — mais c'est
 *   l'exception, pas la règle.
 */
class AnimeZoneModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "AnimeZoneModule"
    }

    override fun getName(): String = "AnimeZoneModule"

    // ------------------------------------------------------------------
    // 1) getVideoInfo(url) — équivalent de POST /api/video/info
    // ------------------------------------------------------------------

    /**
     * Identifie le type de lecteur, scrape la page d'embed, et renvoie
     * l'URL vidéo finale (MP4 direct, ou M3U8 pour HLS).
     *
     * Réponse JSON :
     *   {
     *     "success": true,
     *     "playerType": "mp4" | "hls" | "webm",
     *     "url": "https://.../video.mp4",        // URL jouable directement
     *     "source": "sendvid" | "vidmoly" | "sibnet" | "generic",
     *     "segments": 142                          // uniquement pour HLS
     *   }
     *
     * En cas d'échec :
     *   { "success": false, "error": "Vidéo non trouvée" }
     */
    @ReactMethod
    fun getVideoInfo(url: String?, promise: Promise) {
        if (url.isNullOrBlank()) {
            promise.resolve(errorResult("URL manquante"))
            return
        }

        try {
            val parsed = VideoUrlParser.parse(url)
            Log.i(TAG, "Traitement vidéo: ${parsed.playerType} - ${parsed.videoId}")

            when (parsed.playerType) {

                "sendvid" -> {
                    val embedUrl = "https://sendvid.com/embed/${parsed.videoId}"
                    var mp4 = VideoExtractor.extractSendvidVideo(embedUrl)

                    if (mp4 == null) {
                        // Fallback générique
                        val fallback = GenericExtractor.tryExtractAll(embedUrl)
                        if (fallback != null) {
                            promise.resolve(successResult(
                                playerType = fallback.type,
                                url = fallback.url,
                                source = "sendvid"
                            ))
                        } else {
                            promise.resolve(errorResult("Vidéo SendVid non trouvée"))
                        }
                        return
                    }

                    promise.resolve(successResult(
                        playerType = "mp4",
                        url = mp4,
                        source = "sendvid"
                    ))
                }

                "vidmoly" -> {
                    val embedUrl = "https://vidmoly.net/embed-${parsed.videoId}.html"
                    var m3u8Url = VideoExtractor.extractVidmolyM3u8(embedUrl)
                    var type = "hls"
                    var finalUrl: String? = m3u8Url

                    if (finalUrl == null) {
                        val fallback = GenericExtractor.tryExtractAll(embedUrl)
                        if (fallback == null) {
                            promise.resolve(errorResult("Vidéo Vidmoly non trouvée"))
                            return
                        }
                        type = fallback.type
                        finalUrl = fallback.url
                    }

                    if (type == "hls") {
                        // Si HLS, on résout la playlist pour valider qu'elle contient bien des segments
                        val hls = HlsParser.resolve(finalUrl!!)
                        if (hls == null || hls.segments.isEmpty()) {
                            promise.resolve(errorResult("Segments HLS non trouvés"))
                            return
                        }
                        promise.resolve(successResult(
                            playerType = "hls",
                            url = hls.playlistUrl,
                            source = "vidmoly",
                            segments = hls.segments.size
                        ))
                    } else {
                        promise.resolve(successResult(
                            playerType = "mp4",
                            url = finalUrl!!,
                            source = "vidmoly"
                        ))
                    }
                }

                "sibnet" -> {
                    val extracted = VideoExtractor.extractSibnetVideo(parsed.videoId)
                    var type: String? = extracted?.first
                    var finalUrl: String? = extracted?.second

                    if (finalUrl == null) {
                        val embedUrl = "https://video.sibnet.ru/shell.php?videoid=${parsed.videoId}"
                        val fallback = GenericExtractor.tryExtractAll(embedUrl)
                        if (fallback == null) {
                            promise.resolve(errorResult("Vidéo Sibnet non trouvée"))
                            return
                        }
                        type = fallback.type
                        finalUrl = fallback.url
                    }

                    if (type == "m3u8" || type == "hls") {
                        val hls = HlsParser.resolve(finalUrl!!)
                        if (hls == null || hls.segments.isEmpty()) {
                            promise.resolve(errorResult("Segments HLS non trouvés"))
                            return
                        }
                        promise.resolve(successResult(
                            playerType = "hls",
                            url = hls.playlistUrl,
                            source = "sibnet",
                            segments = hls.segments.size
                        ))
                    } else {
                        promise.resolve(successResult(
                            playerType = "mp4",
                            url = finalUrl!!,
                            source = "sibnet"
                        ))
                    }
                }

                else -> {
                    // generic
                    val fallback = GenericExtractor.tryExtractAll(parsed.videoId)
                    if (fallback == null) {
                        promise.resolve(errorResult("Source non trouvée"))
                        return
                    }
                    if (fallback.type == "hls") {
                        val hls = HlsParser.resolve(fallback.url)
                        if (hls == null || hls.segments.isEmpty()) {
                            promise.resolve(errorResult("Segments HLS non trouvés"))
                            return
                        }
                        promise.resolve(successResult(
                            playerType = "hls",
                            url = hls.playlistUrl,
                            source = "generic",
                            segments = hls.segments.size
                        ))
                    } else {
                        promise.resolve(successResult(
                            playerType = fallback.type,  // "mp4" ou "webm"
                            url = fallback.url,
                            source = "generic"
                        ))
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "getVideoInfo error", e)
            promise.resolve(errorResult(e.message ?: "Erreur inconnue"))
        }
    }

    // ------------------------------------------------------------------
    // 2) selectBestUrl(urlsJson) — équivalent de `select_best_url()` (routes.py, ligne 453)
    // ------------------------------------------------------------------

    /**
     * Sélectionne la meilleure URL vidéo parmi un dict {lang: [urls]}.
     * En Python, c'était une closure dans `player()`. Ici, on l'expose pour que
     * le JS puisse appeler `selectBestUrl(episode.urls)` puis `getVideoInfo(bestUrl)`.
     *
     * @param urlsJson string JSON comme: '{"VF": ["https://vidmoly/..."], "VOSTFR": [...]}'
     * @return { "url": "https://...", "lang": "VF" } ou { "error": "..." }
     */
    @ReactMethod
    fun selectBestUrl(urlsJson: String?, promise: Promise) {
        if (urlsJson.isNullOrBlank()) {
            promise.resolve(errorResult("urls manquantes"))
            return
        }
        try {
            val urls = JSONObject(urlsJson)
            val priority = listOf("vidmoly", "sendvid", "sibnet")

            // Ordre : VF d'abord, puis VOSTFR, puis n'importe quelle autre langue
            val langOrder = mutableListOf("VF", "VOSTFR")
            urls.keys().forEach { lang -> if (lang !in langOrder) langOrder.add(lang) }

            for (lang in langOrder) {
                if (!urls.has(lang)) continue
                val arr = urls.optJSONArray(lang) ?: continue
                val candidates = mutableListOf<String>()
                for (i in 0 until arr.length()) {
                    candidates.add(arr.getString(i))
                }
                // Priorité par hébergeur
                for (host in priority) {
                    val hit = candidates.firstOrNull { it.lowercase().contains(host) }
                    if (hit != null) {
                        promise.resolve(successUrlResult(hit, lang))
                        return
                    }
                }
                // Sinon premier URL dispo
                if (candidates.isNotEmpty()) {
                    promise.resolve(successUrlResult(candidates.first(), lang))
                    return
                }
            }
            promise.resolve(errorResult("Aucune URL disponible"))
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur parsing URLs"))
        }
    }

    /**
     * Renvoie TOUS les URLs d'un épisode triés par priorité (VF > VOSTFR, puis
     * Vidmoly > SendVid > Sibnet > autres). Utilisé par le JS pour faire du
     * fallback : si le 1er URL échoue au scraping, on essaie le 2e, etc.
     *
     * @param urlsJson string JSON comme: '{"VF": [...], "VOSTFR": [...]}'
     * @return { success, ranked: [{ url, lang, host }, ...] }
     */
    @ReactMethod
    fun getRankedUrls(urlsJson: String?, promise: Promise) {
        if (urlsJson.isNullOrBlank()) {
            promise.resolve(errorResult("urls manquantes"))
            return
        }
        try {
            val urls = JSONObject(urlsJson)
            val hostPriority = listOf("vidmoly", "sendvid", "sibnet")
            val langOrder = mutableListOf("VF", "VOSTFR")
            urls.keys().forEach { lang -> if (lang !in langOrder) langOrder.add(lang) }

            // Triple (url, lang, host, score) — on n'utilise pas data class locale
            // pour rester compatible avec d'anciennes versions de Kotlin.
            val rankedList = mutableListOf<Array<Any>>()
            for ((langIdx, lang) in langOrder.withIndex()) {
                if (!urls.has(lang)) continue
                val arr = urls.optJSONArray(lang) ?: continue
                for (i in 0 until arr.length()) {
                    val u = arr.getString(i)
                    val hostLower = u.lowercase()
                    val host = hostPriority.firstOrNull { hostLower.contains(it) } ?: "other"
                    val hostScore = hostPriority.indexOf(host).let { if (it == -1) hostPriority.size else it }
                    val score = langIdx * 100 + hostScore
                    rankedList.add(arrayOf(u, lang, host, score))
                }
            }
            rankedList.sortBy { it[3] as Int }

            val arr = WritableNativeArray()
            for (r in rankedList) {
                val m = WritableNativeMap()
                m.putString("url", r[0] as String)
                m.putString("lang", r[1] as String)
                m.putString("host", r[2] as String)
                arr.pushMap(m)
            }
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putArray("ranked", arr)
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur parsing URLs"))
        }
    }

    // ------------------------------------------------------------------
    // 3) Catalogue — méthodes exposant la DB SQLite à JS
    // ------------------------------------------------------------------

    private fun repo(): AnimeDataRepository =
        AnimeDataRepository.getInstance(reactContext)

    /**
     * Recherche d'animes dans le catalogue local (SQLite).
     *
     * @param query string optionnel — cherché dans le titre (insensible à la casse + accents)
     * @param genre string optionnel — filtre par genre (insensible aux accents)
     * @param limit int (défaut 100)
     * @return { success, animes: [{ anime_id, title, image, has_episodes, year, rating, genres: [] }], total }
     */
    @ReactMethod
    fun searchAnimes(query: String?, genre: String?, limit: Int, promise: Promise) {
        try {
            val safeLimit = if (limit <= 0 || limit > 1000) 100 else limit
            val results = repo().searchAnimes(
                query = query?.takeIf { it.isNotBlank() },
                genre = genre?.takeIf { it.isNotBlank() },
                limit = safeLimit
            )
            val arr = WritableNativeArray()
            for (anime in results) arr.pushMap(jsonToWritable(anime))
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putArray("animes", arr)
            resp.putInt("total", results.size)
            promise.resolve(resp)
        } catch (e: Exception) {
            Log.e(TAG, "searchAnimes failed", e)
            promise.resolve(errorResult(e.message ?: "Erreur recherche"))
        }
    }

    /**
     * Détail complet d'un anime (saisons, épisodes, URLs — via raw_json).
     * @param animeId ID numérique
     * @return { success, anime: {...} } ou { success: false, error }
     */
    @ReactMethod
    fun getAnimeById(animeId: Int, promise: Promise) {
        try {
            val anime = repo().getAnimeById(animeId)
            if (anime == null) {
                promise.resolve(errorResult("Anime $animeId non trouvé"))
                return
            }
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putMap("anime", jsonToWritable(anime))
            promise.resolve(resp)
        } catch (e: Exception) {
            Log.e(TAG, "getAnimeById failed", e)
            promise.resolve(errorResult(e.message ?: "Erreur getAnimeById"))
        }
    }

    /**
     * Liste des animes "featured" (page d'accueil / discover).
     * @return { success, animes: [...] }
     */
    @ReactMethod
    fun getDiscover(promise: Promise) {
        try {
            val list = repo().loadDiscoverData()
            val arr = WritableNativeArray()
            for (a in list) arr.pushMap(jsonToWritable(a))
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putArray("animes", arr)
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur getDiscover"))
        }
    }

    /**
     * Liste de tous les genres disponibles (pour le filtre de recherche).
     * @return { success, genres: ["shonen", "romance", ...] }
     */
    @ReactMethod
    fun getAllGenres(promise: Promise) {
        try {
            val list = repo().getAllGenres()
            val arr = WritableNativeArray()
            for (g in list) arr.pushString(g)
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putArray("genres", arr)
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur getAllGenres"))
        }
    }

    /**
     * Récupère uniquement les URLs d'un épisode précis — utile pour le player
     * sans devoir charger tout l'arbre anime.
     *
     * @return { success, urls: { "VOSTFR": [...], "VF": [...] } }
     */
    @ReactMethod
    fun getEpisodeUrls(animeId: Int, seasonNumber: Int, episodeNumber: Int, promise: Promise) {
        try {
            val map = repo().getEpisodeUrls(animeId, seasonNumber, episodeNumber)
            val urls = WritableNativeMap()
            for ((lang, list) in map) {
                val arr = WritableNativeArray()
                for (u in list) arr.pushString(u)
                urls.putArray(lang, arr)
            }
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putMap("urls", urls)
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur getEpisodeUrls"))
        }
    }

    /**
     * Stats catalog (debug / écran paramètres).
     * @return { success, totalAnimes, totalEpisodes, totalUrls, dbSizeBytes }
     */
    @ReactMethod
    fun getCatalogStats(promise: Promise) {
        try {
            val s = repo().getStats()
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putInt("totalAnimes", s.totalAnimes)
            resp.putInt("totalEpisodes", s.totalEpisodes)
            resp.putInt("totalUrls", s.totalUrls)
            resp.putDouble("dbSizeBytes", s.dbSizeBytes.toDouble())
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur stats"))
        }
    }

    // ------------------------------------------------------------------
    // 4) Profiles (V1.4) — systèmes de profils Netflix-style
    // ------------------------------------------------------------------

    private val userDao: UserDao by lazy { UserDao.getInstance(reactContext) }

    /** Crée un nouveau profile (juste un nom + couleur, pas de mdp). Renvoie l'ID. */
    @ReactMethod
    fun createProfile(name: String, color: Int, promise: Promise) {
        try {
            if (name.isBlank()) {
                promise.resolve(errorResult("Le nom ne peut pas être vide"))
                return
            }
            val id = userDao.createProfile(name, color)
            if (id == null) {
                promise.resolve(errorResult("Nom déjà pris ou erreur DB"))
            } else {
                val resp = WritableNativeMap()
                resp.putBoolean("success", true)
                resp.putDouble("profileId", id.toDouble())
                promise.resolve(resp)
            }
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur createProfile"))
        }
    }

    /** Liste tous les profiles existants. */
    @ReactMethod
    fun listProfiles(promise: Promise) {
        try {
            val profiles = userDao.listProfiles()
            val arr = WritableNativeArray()
            for (p in profiles) {
                val m = WritableNativeMap()
                m.putDouble("id", p.id.toDouble())
                m.putString("name", p.name)
                m.putDouble("createdAt", p.createdAt.toDouble())
                m.putInt("color", p.color)
                arr.pushMap(m)
            }
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putArray("profiles", arr)
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur listProfiles"))
        }
    }

    /** Renomme un profile. */
    @ReactMethod
    fun renameProfile(profileId: Double, newName: String, promise: Promise) {
        try {
            val ok = userDao.renameProfile(profileId.toLong(), newName)
            val resp = WritableNativeMap()
            resp.putBoolean("success", ok)
            if (!ok) resp.putString("error", "Renommage échoué")
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur renameProfile"))
        }
    }

    /** V1.5 : change la couleur d'un profile. */
    @ReactMethod
    fun updateProfileColor(profileId: Double, color: Int, promise: Promise) {
        try {
            val ok = userDao.updateProfileColor(profileId.toLong(), color)
            val resp = WritableNativeMap()
            resp.putBoolean("success", ok)
            if (!ok) resp.putString("error", "Mise à jour couleur échouée")
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur updateProfileColor"))
        }
    }

    /** Supprime un profile (CASCADE : supprime aussi ses favoris + continue_watching). */
    @ReactMethod
    fun deleteProfile(profileId: Double, promise: Promise) {
        try {
            val ok = userDao.deleteProfile(profileId.toLong())
            val resp = WritableNativeMap()
            resp.putBoolean("success", ok)
            if (!ok) resp.putString("error", "Suppression échouée")
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur deleteProfile"))
        }
    }

    // ------------------------------------------------------------------
    // 5) Favoris (V1.4)
    // ------------------------------------------------------------------

    /** Ajoute un anime aux favoris d'un profile. */
    @ReactMethod
    fun addFavorite(profileId: Double, animeId: Int, promise: Promise) {
        try {
            val ok = userDao.addFavorite(profileId.toLong(), animeId)
            val resp = WritableNativeMap()
            resp.putBoolean("success", ok)
            if (!ok) resp.putString("error", "Ajout échoué")
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur addFavorite"))
        }
    }

    /** Retire un anime des favoris d'un profile. */
    @ReactMethod
    fun removeFavorite(profileId: Double, animeId: Int, promise: Promise) {
        try {
            val ok = userDao.removeFavorite(profileId.toLong(), animeId)
            val resp = WritableNativeMap()
            resp.putBoolean("success", ok)
            if (!ok) resp.putString("error", "Suppression échouée")
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur removeFavorite"))
        }
    }

    /** Vérifie si un anime est favori pour ce profile. */
    @ReactMethod
    fun isFavorite(profileId: Double, animeId: Int, promise: Promise) {
        try {
            val fav = userDao.isFavorite(profileId.toLong(), animeId)
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putBoolean("isFavorite", fav)
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur isFavorite"))
        }
    }

    /** Récupère tous les favoris d'un profile (avec détails anime). */
    @ReactMethod
    fun getFavorites(profileId: Double, promise: Promise) {
        try {
            val list = userDao.getFavorites(profileId.toLong())
            val arr = WritableNativeArray()
            for (a in list) arr.pushMap(jsonToWritable(a))
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putArray("favorites", arr)
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur getFavorites"))
        }
    }

    // ------------------------------------------------------------------
    // 6) Continue Watching (V1.4)
    // ------------------------------------------------------------------

    /** Marque (ou update) un épisode comme en cours pour ce profile. */
    @ReactMethod
    fun upsertContinueWatching(
        profileId: Double,
        animeId: Int,
        seasonNumber: Int,
        episodeNumber: Int,
        promise: Promise
    ) {
        try {
            val ok = userDao.upsertContinueWatching(
                profileId.toLong(), animeId, seasonNumber, episodeNumber
            )
            val resp = WritableNativeMap()
            resp.putBoolean("success", ok)
            if (!ok) resp.putString("error", "Upsert échoué")
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur upsertContinueWatching"))
        }
    }

    /** Retire un anime de la liste "continue watching". */
    @ReactMethod
    fun removeFromContinueWatching(profileId: Double, animeId: Int, promise: Promise) {
        try {
            val ok = userDao.removeFromContinueWatching(profileId.toLong(), animeId)
            val resp = WritableNativeMap()
            resp.putBoolean("success", ok)
            if (!ok) resp.putString("error", "Suppression échouée")
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur removeFromContinueWatching"))
        }
    }

    /** Récupère la liste "continue watching" (avec détails anime + titre episode). */
    @ReactMethod
    fun getContinueWatching(profileId: Double, limit: Int, promise: Promise) {
        try {
            val safeLimit = if (limit <= 0 || limit > 100) 20 else limit
            val list = userDao.getContinueWatching(profileId.toLong(), safeLimit)
            val arr = WritableNativeArray()
            for (a in list) arr.pushMap(jsonToWritable(a))
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            resp.putArray("continueWatching", arr)
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur getContinueWatching"))
        }
    }

    // ------------------------------------------------------------------
    // 7) Video Progress (V1.5) — sauvegarde + reprise de la position de lecture
    // ------------------------------------------------------------------

    /**
     * Sauvegarde la position de lecture d'un épisode.
     * @param positionMs  position en millisecondes
     * @param durationMs  durée totale en millisecondes
     * @param completed   1 si épisode terminé, 0 sinon
     */
    @ReactMethod
    fun saveVideoProgress(
        profileId: Double,
        animeId: Int,
        seasonNumber: Int,
        episodeNumber: Int,
        positionMs: Double,
        durationMs: Double,
        completed: Int,
        promise: Promise
    ) {
        try {
            val ok = userDao.saveVideoProgress(
                profileId.toLong(),
                animeId,
                seasonNumber,
                episodeNumber,
                positionMs.toLong(),
                durationMs.toLong(),
                completed == 1
            )
            val resp = WritableNativeMap()
            resp.putBoolean("success", ok)
            if (!ok) resp.putString("error", "Save échoué")
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur saveVideoProgress"))
        }
    }

    /**
     * Récupère la position sauvegardée d'un épisode (pour la reprise).
     * @return { success, found, positionMs, durationMs, completed }
     *         Si found=false, l'épisode n'a jamais été visionné.
     */
    @ReactMethod
    fun getVideoProgress(
        profileId: Double,
        animeId: Int,
        seasonNumber: Int,
        episodeNumber: Int,
        promise: Promise
    ) {
        try {
            val progress = userDao.getVideoProgress(
                profileId.toLong(), animeId, seasonNumber, episodeNumber
            )
            val resp = WritableNativeMap()
            resp.putBoolean("success", true)
            if (progress != null) {
                resp.putBoolean("found", true)
                resp.putDouble("positionMs", progress.position.toDouble())
                resp.putDouble("durationMs", progress.duration.toDouble())
                resp.putBoolean("completed", progress.completed)
            } else {
                resp.putBoolean("found", false)
                resp.putDouble("positionMs", 0.0)
                resp.putDouble("durationMs", 0.0)
                resp.putBoolean("completed", false)
            }
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur getVideoProgress"))
        }
    }

    /** Efface la progression d'un épisode. */
    @ReactMethod
    fun clearVideoProgress(
        profileId: Double,
        animeId: Int,
        seasonNumber: Int,
        episodeNumber: Int,
        promise: Promise
    ) {
        try {
            val ok = userDao.clearVideoProgress(
                profileId.toLong(), animeId, seasonNumber, episodeNumber
            )
            val resp = WritableNativeMap()
            resp.putBoolean("success", ok)
            promise.resolve(resp)
        } catch (e: Exception) {
            promise.resolve(errorResult(e.message ?: "Erreur clearVideoProgress"))
        }
    }

    // ------------------------------------------------------------------
    // 8) proxyStream(url) — optionnel, si un domaine bloque l'accès mobile direct
    // ------------------------------------------------------------------

    /**
     * Proxy léger : récupère l'URL et renvoie le contenu en base64.
     * À N'UTILISER QUE pour de petites ressources (clé AES-128, mini manifest).
     * Pour la vidéo elle-même, préférez passer l'URL directement à react-native-video.
     *
     * @param url URL à proxifier
     * @return { "success": true, "base64": "...", "contentType": "..." }
     */
    @ReactMethod
    fun proxyStream(url: String?, promise: Promise) {
        if (url.isNullOrBlank()) {
            promise.resolve(errorResult("URL manquante"))
            return
        }
        try {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", HttpClient.USER_AGENT)
                .header("Referer", "https://animezone.example/")
                .build()

            HttpClient.client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    promise.resolve(errorResult("HTTP ${response.code}"))
                    return
                }
                val bytes = response.body?.bytes()
                    ?: throw IOException("body vide")
                val b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                val result = WritableNativeMap()
                result.putBoolean("success", true)
                result.putString("base64", b64)
                result.putString("contentType", response.header("Content-Type", "application/octet-stream"))
                promise.resolve(result)
            }
        } catch (e: Exception) {
            Log.e(TAG, "proxyStream error", e)
            promise.resolve(errorResult(e.message ?: "Erreur proxy"))
        }
    }

    // ------------------------------------------------------------------
    // Helpers de construction des réponses
    // ------------------------------------------------------------------

    private fun successResult(
        playerType: String,
        url: String,
        source: String,
        segments: Int = 0
    ): WritableMap {
        val m = WritableNativeMap()
        m.putBoolean("success", true)
        m.putString("playerType", playerType)
        m.putString("url", url)
        m.putString("source", source)
        if (segments > 0) m.putInt("segments", segments)
        return m
    }

    private fun successUrlResult(url: String, lang: String): WritableMap {
        val m = WritableNativeMap()
        m.putBoolean("success", true)
        m.putString("url", url)
        m.putString("lang", lang)
        return m
    }

    private fun errorResult(message: String): WritableMap {
        val m = WritableNativeMap()
        m.putBoolean("success", false)
        m.putString("error", message)
        return m
    }

    /**
     * Convertit un JSONObject (récursif) en WritableMap pour le bridge RN.
     * Gère tous les types rencontrés dans anime.json : String, Number, Boolean,
     * JSONObject, JSONArray, et null.
     */
    private fun jsonToWritable(json: JSONObject): WritableMap {
        val map = WritableNativeMap()
        val keys = json.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val value = json.opt(key)
            when (value) {
                null              -> map.putNull(key)
                is Boolean        -> map.putBoolean(key, value)
                is Number         -> {
                    // Distinguer Int et Double pour préserver le typage côté JS
                    val d = value.toDouble()
                    if (d == Math.floor(d) && !d.isInfinite() && !d.isNaN() && Math.abs(d) < Int.MAX_VALUE.toDouble()) {
                        map.putInt(key, d.toInt())
                    } else {
                        map.putDouble(key, d)
                    }
                }
                is String         -> map.putString(key, value)
                is JSONObject     -> map.putMap(key, jsonToWritable(value))
                is JSONArray      -> map.putArray(key, jsonArrayToWritable(value))
                else              -> map.putString(key, value.toString())
            }
        }
        return map
    }

    private fun jsonArrayToWritable(arr: JSONArray): WritableArray {
        val out = WritableNativeArray()
        for (i in 0 until arr.length()) {
            val v = arr.opt(i)
            when (v) {
                null              -> out.pushNull()
                is Boolean        -> out.pushBoolean(v)
                is Number         -> {
                    val d = v.toDouble()
                    if (d == Math.floor(d) && !d.isInfinite() && !d.isNaN() && Math.abs(d) < Int.MAX_VALUE.toDouble()) {
                        out.pushInt(d.toInt())
                    } else {
                        out.pushDouble(d)
                    }
                }
                is String         -> out.pushString(v)
                is JSONObject     -> out.pushMap(jsonToWritable(v))
                is JSONArray      -> out.pushArray(jsonArrayToWritable(v))
                else              -> out.pushString(v.toString())
            }
        }
        return out
    }
}
