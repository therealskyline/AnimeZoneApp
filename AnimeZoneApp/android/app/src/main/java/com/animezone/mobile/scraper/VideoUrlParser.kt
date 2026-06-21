package com.animezone.mobile.scraper

/**
 * VideoUrlParser — équivalent Kotlin de `parse_video_url()` (routes.py, lignes 27-68).
 *
 * Objectif Android : identifier le type de lecteur (sendvid / vidmoly / sibnet / generic)
 * à partir d'une URL d'embed fournie par `anime.json`, sans aucune logique réseau.
 * C'est une fonction pure — facile à tester unitairement.
 *
 * Source Python d'origine :
 *   def parse_video_url(url):
 *       url_clean = url.strip().lower()
 *       if 'sendvid' in url_clean:
 *           match = re.search(r'sendvid\.[a-z]+/embed/([a-zA-Z0-9]+)', url, re.IGNORECASE)
 *           ...
 *
 * Différences notables avec la version Python :
 *   - Regex compilées en `companion object` (une seule fois, pas à chaque appel).
 *   - Retour via `data class ParseResult` plutôt qu'un tuple `(type, id)` — plus typé.
 *   - Pas d'exception : tout chemin inconnu renvoie `ParseResult("generic", url)`.
 */
object VideoUrlParser {

    data class ParseResult(
        val playerType: String,   // "sendvid" | "vidmoly" | "sibnet" | "generic"
        val videoId: String       // ID extrait, ou URL complète pour "generic"
    )

    // --- Regex compilées une seule fois (équivalent re.compile) ---
    private val SENDVID_EMBED = Regex("""sendvid\.[a-z]+/embed/([a-zA-Z0-9]+)""", RegexOption.IGNORE_CASE)
    private val SENDVID_BARE  = Regex("""sendvid\.[a-z]+/([a-zA-Z0-9]+)""", RegexOption.IGNORE_CASE)

    private val VIDMOLY_EMBED = Regex("""vidmoly\.[a-z]+/embed-([a-zA-Z0-9]+)\.html""", RegexOption.IGNORE_CASE)
    private val VIDMOLY_BARE  = Regex("""vidmoly\.[a-z]+/([a-zA-Z0-9]+)""", RegexOption.IGNORE_CASE)

    private val SIBNET_VIDEO  = Regex("""sibnet\.[a-z]+/video/(\d+)""", RegexOption.IGNORE_CASE)
    private val SIBNET_SHELL  = Regex("""videoid=(\d+)""", RegexOption.IGNORE_CASE)

    /**
     * Point d'entrée principal.
     * @param url URL brute issue de `episode.urls[lang]` dans anime.json
     */
    fun parse(url: String?): ParseResult {
        if (url.isNullOrBlank()) return ParseResult("generic", url ?: "")

        val urlClean = url.trim().lowercase()

        // ---------- SENDVID ----------
        if (urlClean.contains("sendvid")) {
            SENDVID_EMBED.find(url)?.let { return ParseResult("sendvid", it.groupValues[1]) }
            SENDVID_BARE.find(url)?.let { return ParseResult("sendvid", it.groupValues[1]) }
        }

        // ---------- VIDMOLY ----------
        if (urlClean.contains("vidmoly")) {
            VIDMOLY_EMBED.find(url)?.let { return ParseResult("vidmoly", it.groupValues[1]) }
            VIDMOLY_BARE.find(url)?.let { return ParseResult("vidmoly", it.groupValues[1]) }
        }

        // ---------- SIBNET ----------
        if (urlClean.contains("sibnet")) {
            SIBNET_VIDEO.find(url)?.let { return ParseResult("sibnet", it.groupValues[1]) }
            SIBNET_SHELL.find(url)?.let { return ParseResult("sibnet", it.groupValues[1]) }
        }

        // ---------- GENERIC ----------
        return ParseResult("generic", url)
    }
}
