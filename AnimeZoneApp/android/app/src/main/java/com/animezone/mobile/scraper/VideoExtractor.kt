package com.animezone.mobile.scraper

import com.animezone.mobile.network.HttpClient
import okhttp3.Request
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import java.io.IOException

/**
 * VideoExtractor — équivalent Kotlin des fonctions d'extraction spécifiques
 * de routes.py :
 *   - extract_vidmoly_m3u8(embed_url)        (lignes 75-93)
 *   - extract_sendvid_video(embed_url)        (lignes 96-119)
 *   - extract_sibnet_video(video_id)          (lignes 122-142)
 *
 * Port Python → Kotlin :
 *   requests.Session().get(...)  →  HttpClient.client.newCall(Request).execute()
 *   re.search(pattern, html)     →  Regex.find(html)
 *   urljoin(base, rel)           →  java.net.URI/URL.resolve() via helper `resolveUrl`
 *
 * Pourquoi Jsoup n'est PAS utilisé pour l'extraction ici :
 *   Les pages d'embed SendVid/Vidmoly/Sibnet injectent l'URL vidéo dans du JS inline
 *   (ex: `sources: [{ file: "https://.../master.m3u8" }]`) plutôt que dans des balises
 *   `<source>`. Regex sur le HTML brut reste donc l'approche la plus fiable, comme en
 *   Python. Jsoup est utilisé pour nettoyer/normaliser le HTML dans GenericExtractor
 *   quand on doit cibler des balises précises.
 *
 * Toutes les méthodes sont `suspend`-friendly via `executeSync()` : on reste bloquant
 * mais le Native Module RN délègue déjà à un thread background via `@ReactMethod`
 * + `Promise`, donc pas besoin de coroutine ici.
 */
object VideoExtractor {

    /** Résultat normalisé pour le pont RN. */
    data class ExtractedVideo(
        val type: String,   // "hls" | "mp4" | "webm"
        val url: String
    )

    // ---------------------------------------------------------------------
    // Vidmoly — extraction d'une URL M3U8 depuis la page d'embed
    // ---------------------------------------------------------------------

    // Python : r'sources\s*:\s*\[\s*{\s*file\s*:\s*["\']([^"\']+\.m3u8[^"\']*)["\']'
    private val VIDMOLY_SRC_BLOCK = Regex(
        """sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+\.m3u8[^"']*)["']""",
        RegexOption.IGNORE_CASE
    )
    // Python : r'file\s*:\s*["\']([^"\']+\.m3u8[^"\']*)["\']'
    private val VIDMOLY_FALLBACK = Regex(
        """file\s*:\s*["']([^"']+\.m3u8[^"']*)["']""",
        RegexOption.IGNORE_CASE
    )

    /**
     * Extrait l'URL M3U8 depuis une page d'embed Vidmoly.
     * @param embedUrl ex: https://vidmoly.net/embed-AB12CD34.html
     * @return URL M3U8, ou null si non trouvée.
     */
    fun extractVidmolyM3u8(embedUrl: String): String? {
        return try {
            val html = HttpClient.fetchText(embedUrl, timeoutMs = 10_000)
            VIDMOLY_SRC_BLOCK.find(html)?.groupValues?.getOrNull(1)
                ?: VIDMOLY_FALLBACK.find(html)?.groupValues?.getOrNull(1)
        } catch (e: IOException) {
            android.util.Log.e("AnimeZone", "Vidmoly M3U8 extraction failed: ${e.message}")
            null
        }
    }

    // ---------------------------------------------------------------------
    // SendVid — extraction d'une URL MP4 (parfois WebM)
    // ---------------------------------------------------------------------

    // Python pattern 1 : r'<source[^>]*src=["\']([^"\']+\.mp4[^"\']*)["\']'
    private val SENDVID_SOURCE_TAG = Regex(
        """<source[^>]*src=["']([^"']+\.mp4[^"']*)["']""",
        RegexOption.IGNORE_CASE
    )
    // Python pattern 2 : r'file\s*:\s*["\']([^"\']+\.(mp4|webm)[^"\']*)["\']'
    private val SENDVID_FILE_VAR = Regex(
        """file\s*:\s*["']([^"']+\.(?:mp4|webm)[^"']*)["']""",
        RegexOption.IGNORE_CASE
    )

    private const val SENDVID_BASE = "https://sendvid.com"

    /**
     * Extrait l'URL MP4 (ou WebM) depuis une page d'embed SendVid.
     * @param embedUrl ex: https://sendvid.com/embed/abc123
     */
    fun extractSendvidVideo(embedUrl: String): String? {
        return try {
            val html = HttpClient.fetchText(embedUrl, timeoutMs = 10_000)

            SENDVID_SOURCE_TAG.find(html)?.groupValues?.getOrNull(1)?.let { return absolutize(it, SENDVID_BASE) }
            SENDVID_FILE_VAR.find(html)?.groupValues?.getOrNull(1)?.let { return absolutize(it, SENDVID_BASE) }
            null
        } catch (e: IOException) {
            android.util.Log.e("AnimeZone", "SendVid extraction failed: ${e.message}")
            null
        }
    }

    // ---------------------------------------------------------------------
    // Sibnet — extraction M3U8 ou MP4 depuis shell.php?videoid=...
    // ---------------------------------------------------------------------

    private const val SIBNET_BASE = "https://video.sibnet.ru"

    // V1.9 : patterns plus ciblés pour Sibnet.
    // Sibnet utilise JW Player qui injecte les sources en JS :
    //   sources: [{"file":"https://.../master.m3u8","label":"360p"}, ...]
    // ou parfois un <source src="..."> HTML5.
    // Les anciens patterns trop larges `["']([^"']+\.m3u8[^"']*)["']` matchaient
    // aussi des URLs dans des commentaires JS ou des tracking pixels.

    // 1) JW Player : sources: [{file: "URL.m3u8"}]
    private val SIBNET_JW_M3U8 = Regex(
        """sources\s*:\s*\[[^\]]*?file\s*:\s*["']([^"']+\.m3u8[^"']*)["']""",
        RegexOption.IGNORE_CASE
    )
    // 2) VideoJS / HTML5 : <source src="URL.m3u8">
    private val SIBNET_SOURCE_TAG_M3U8 = Regex(
        """<source[^>]*src\s*=\s*["']([^"']+\.m3u8[^"']*)["']""",
        RegexOption.IGNORE_CASE
    )
    // 3) Fallback générique : "URL.m3u8" (last resort)
    private val SIBNET_FALLBACK_M3U8 = Regex(
        """["']([^"']+\.m3u8[^"']*)["']""",
        RegexOption.IGNORE_CASE
    )

    // Mêmes patterns pour MP4
    private val SIBNET_JW_MP4 = Regex(
        """sources\s*:\s*\[[^\]]*?file\s*:\s*["']([^"']+\.mp4[^"']*)["']""",
        RegexOption.IGNORE_CASE
    )
    private val SIBNET_SOURCE_TAG_MP4 = Regex(
        """<source[^>]*src\s*=\s*["']([^"']+\.mp4[^"']*)["']""",
        RegexOption.IGNORE_CASE
    )
    private val SIBNET_FALLBACK_MP4 = Regex(
        """["']([^"']+\.mp4[^"']*)["']""",
        RegexOption.IGNORE_CASE
    )

    /**
     * V1.9 : extraction Sibnet améliorée.
     *
     * Améliorations vs V1.5 :
     *   - Referer `https://video.sibnet.ru/` au lieu d'un fake `animezone.example/`
     *     (Sibnet rejette les requêtes sans Referer valide)
     *   - Accept-Language `ru-RU,ru;q=0.9` (Sibnet est russe, peut sinon renvoyer
     *     une version allégée de la page sans le player JW)
     *   - Regex plus ciblées : JW Player (`sources: [{file:"..."}]`) puis
     *     VideoJS (`<source src="...">`) puis fallback large
     *   - Résolution des URLs relatives en absolues (Sibnet sert parfois
     *     `/path/to/file.m3u8` au lieu de l'URL complète)
     *
     * @param videoId ID numérique Sibnet (ex: "1234567")
     * @return (type, url) — type est "m3u8" ou "mp4", ou null si rien trouvé.
     */
    fun extractSibnetVideo(videoId: String): Pair<String, String>? {
        return try {
            val embedUrl = "$SIBNET_BASE/shell.php?videoid=$videoId"
            // V1.9 : headers spécifiques Sibnet
            val html = HttpClient.fetchTextWithHeaders(
                url = embedUrl,
                referer = "$SIBNET_BASE/",
                acceptLanguage = "ru-RU,ru;q=0.9,en;q=0.5",
                timeoutMs = 10_000
            )

            android.util.Log.i("AnimeZone", "Sibnet HTML length: ${html.length} chars")

            // 1) Chercher M3U8 — JW Player d'abord, puis <source>, puis fallback large
            val m3u8Url = SIBNET_JW_M3U8.find(html)?.groupValues?.getOrNull(1)
                ?: SIBNET_SOURCE_TAG_M3U8.find(html)?.groupValues?.getOrNull(1)
                ?: SIBNET_FALLBACK_M3U8.find(html)?.groupValues?.getOrNull(1)

            if (m3u8Url != null) {
                val absUrl = absolutize(m3u8Url, "$SIBNET_BASE/")
                android.util.Log.i("AnimeZone", "Sibnet M3U8 trouvé: $absUrl")
                return "m3u8" to absUrl
            }

            // 2) Chercher MP4 — même priorité
            val mp4Url = SIBNET_JW_MP4.find(html)?.groupValues?.getOrNull(1)
                ?: SIBNET_SOURCE_TAG_MP4.find(html)?.groupValues?.getOrNull(1)
                ?: SIBNET_FALLBACK_MP4.find(html)?.groupValues?.getOrNull(1)

            if (mp4Url != null) {
                val absUrl = absolutize(mp4Url, "$SIBNET_BASE/")
                android.util.Log.i("AnimeZone", "Sibnet MP4 trouvé: $absUrl")
                return "mp4" to absUrl
            }

            android.util.Log.w("AnimeZone", "Sibnet: aucune URL M3U8/MP4 trouvée dans le HTML")
            null
        } catch (e: IOException) {
            android.util.Log.e("AnimeZone", "Sibnet extraction failed: ${e.message}")
            null
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /** Équivalent Python : `url if url.startswith('http') else urljoin(base, url)` */
    private fun absolutize(url: String, base: String): String {
        if (url.startsWith("http://", true) || url.startsWith("https://", true)) return url
        return try {
            java.net.URL(base).toURI().resolve(url).toString()
        } catch (_: Exception) {
            // Fallback naïf : concaténation si l'URL de base est invalide
            if (url.startsWith("/")) base + url else "$base/$url"
        }
    }
}
