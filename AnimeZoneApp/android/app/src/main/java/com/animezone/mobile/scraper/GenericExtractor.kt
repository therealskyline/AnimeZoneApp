package com.animezone.mobile.scraper

import com.animezone.mobile.network.HttpClient
import org.jsoup.Jsoup
import java.io.IOException

/**
 * GenericExtractor — équivalent Kotlin de `try_extract_all_methods()` (routes.py, lignes 171-237).
 *
 * Cette fonction est appelée en fallback quand l'extracteur spécifique (SendVid/Vidmoly/Sibnet)
 * n'a rien trouvé. Elle essaie une série de patterns regex pour M3U8, puis MP4, puis WebM,
 * sur le HTML brut de la page d'embed.
 *
 * On utilise aussi Jsoup ici pour deux usages supplémentaires :
 *   1. Détecter les balises `<video>` et `<source>` même quand l'attribut `src` est
 *      échappé/découpé par le serveur (Jsoup gère les entités HTML automatiquement).
 *   2. Normaliser les URLs relatives via `doc.absUrl("src")`.
 *
 * Sortie : même format que VideoExtractor.ExtractedVideo pour homogénéité.
 */
object GenericExtractor {

    data class ExtractedVideo(
        val type: String,  // "hls" | "mp4" | "webm"
        val url: String
    )

    // ---- Patterns M3U8 (ordre important : le plus spécifique d'abord) ----
    private val M3U8_PATTERNS = listOf(
        Regex("""sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+\.m3u8[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""file\s*:\s*["']([^"']+\.m3u8[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""<source[^>]*src=["']([^"']+\.m3u8[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""src=["']([^"']+\.m3u8[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""url\s*:\s*["']([^"']+\.m3u8[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""hls\s*:\s*["']([^"']+\.m3u8[^"']*)["']""", RegexOption.IGNORE_CASE)
    )

    // ---- Patterns MP4 ----
    private val MP4_PATTERNS = listOf(
        Regex("""<source[^>]*src=["']([^"']+\.mp4[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""src=["']([^"']+\.mp4[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""file\s*:\s*["']([^"']+\.mp4[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""url\s*:\s*["']([^"']+\.mp4[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""video["']?\s*:\s*["']([^"']+\.mp4[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""src\s*=\s*["']([^"']+\.mp4[^"']*)["']""", RegexOption.IGNORE_CASE)
    )

    // ---- Patterns WebM ----
    private val WEBM_PATTERNS = listOf(
        Regex("""<source[^>]*src=["']([^"']+\.webm[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""src=["']([^"']+\.webm[^"']*)["']""", RegexOption.IGNORE_CASE),
        Regex("""file\s*:\s*["']([^"']+\.webm[^"']*)["']""", RegexOption.IGNORE_CASE)
    )

    /**
     * Teste TOUTES les méthodes d'extraction sur une page d'embed.
     * @param embedUrl URL à scraper
     * @return ExtractedVideo ou null si rien trouvé
     */
    fun tryExtractAll(embedUrl: String): ExtractedVideo? {
        return try {
            val html = HttpClient.fetchText(embedUrl, timeoutMs = 10_000)
            val baseUrl = embedUrl.substringBeforeLast('/', "") + "/"

            // 1) M3U8
            findFirstMatch(M3U8_PATTERNS, html, baseUrl)?.let { return ExtractedVideo("hls", it) }

            // 2) MP4
            findFirstMatch(MP4_PATTERNS, html, baseUrl)?.let { return ExtractedVideo("mp4", it) }

            // 3) WebM
            findFirstMatch(WEBM_PATTERNS, html, baseUrl)?.let { return ExtractedVideo("webm", it) }

            // 4) Dernier recours : Jsoup sur les balises <source>/<video>
            extractFromHtmlTags(html, baseUrl)?.let { return it }

            null
        } catch (e: IOException) {
            android.util.Log.w("AnimeZone", "Generic extraction failed for $embedUrl: ${e.message}")
            null
        }
    }

    // ------------------------------------------------------------------
    // Helpers privés
    // ------------------------------------------------------------------

    private fun findFirstMatch(patterns: List<Regex>, html: String, baseUrl: String): String? {
        for (pattern in patterns) {
            val m = pattern.find(html)
            if (m != null) {
                val raw = m.groupValues[1]
                return absolutize(raw, baseUrl)
            }
        }
        return null
    }

    /** Dernier recours : balises <source> et <video> via Jsoup. */
    private fun extractFromHtmlTags(html: String, baseUrl: String): ExtractedVideo? {
        val doc: org.jsoup.nodes.Document = Jsoup.parse(html, baseUrl)

        // <source src="..."> dans <video> ou <audio>
        for (src in doc.select("source[src]")) {
            val absUrl = src.absUrl("src")
            if (absUrl.endsWith(".m3u8", true)) return ExtractedVideo("hls", absUrl)
            if (absUrl.endsWith(".mp4", true))  return ExtractedVideo("mp4", absUrl)
            if (absUrl.endsWith(".webm", true)) return ExtractedVideo("webm", absUrl)
        }
        // <video src="...">
        for (v in doc.select("video[src]")) {
            val absUrl = v.absUrl("src")
            if (absUrl.endsWith(".mp4", true))  return ExtractedVideo("mp4", absUrl)
            if (absUrl.endsWith(".webm", true)) return ExtractedVideo("webm", absUrl)
        }
        return null
    }

    private fun absolutize(url: String, base: String): String {
        if (url.startsWith("http://", true) || url.startsWith("https://", true)) return url
        return try {
            java.net.URL(base).toURI().resolve(url).toString()
        } catch (_: Exception) {
            if (url.startsWith("/")) base.trimEnd('/') + url else "$base$url"
        }
    }
}
