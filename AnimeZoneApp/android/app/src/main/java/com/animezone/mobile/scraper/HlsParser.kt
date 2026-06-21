package com.animezone.mobile.scraper

import com.animezone.mobile.network.HttpClient
import java.io.IOException

/**
 * HlsParser — équivalent Kotlin de `get_hls_segments()` (routes.py, lignes 145-164).
 *
 * En Python, on utilisait la lib `m3u8` (m3u8.loads(text)) qui fournit un parseur
 * complet (playlists, segments, durations, etc.). Sur Android, on a deux options :
 *
 *   Option A : utiliser une lib comme ExoPlayer's `HlsMediaSource` qui parse le
 *              M3U8 en interne — mais c'est lourd et lié au player.
 *
 *   Option B (choisie) : un mini-parseur maison qui suffit au cas d'usage :
 *              - Détecter si c'est un master playlist (contient #EXT-X-STREAM-INF)
 *                ou un media playlist (contient #EXTINF + segments .ts).
 *              - Si master, suivre la dernière variante (meilleure qualité,
 *                comme en Python : `master.playlists[-1]`).
 *              - Si media, retourner directement la liste des segments.
 *
 * Ce parseur est volontairement minimaliste. Si vous voulez le rendre plus robuste
 * (gestion #EXT-X-BYTERANGE, #EXT-X-KEY pour le DRM AES-128, etc.), intégrez
 * ExoPlayer ou la lib `com.squareup.okhttp:okhttp` + un parseur M3U8 dédié.
 *
 * Rappel de la logique Python d'origine :
 *   def get_hls_segments(master_url):
 *       response = video_session.get(master_url, timeout=10)
 *       master = m3u8.loads(response.text)
 *       if master.segments:
 *           return master_url, master
 *       if master.playlists:
 *           base_url = master_url.rsplit('/', 1)[0] + '/'
 *           playlist_url = urljoin(base_url, master.playlists[-1].uri)
 *           response = video_session.get(playlist_url, timeout=10)
 *           playlist = m3u8.loads(response.text)
 *           return playlist_url, playlist
 *       return None, None
 */
object HlsParser {

    /** Un segment .ts (ou autre) trouvé dans la playlist. */
    data class Segment(
        val uri: String,        // URL absolue du segment
        val duration: Double,   // durée en secondes (#EXTINF:12.5,)
        val index: Int          // position (0-based)
    )

    /** Résultat du parsing : URL finale + segments. */
    data class HlsResult(
        val playlistUrl: String,
        val segments: List<Segment>
    )

    /**
     * Point d'entrée principal.
     * @param masterUrl URL du fichier .m3u8 (master ou media playlist).
     * @return HlsResult ou null si erreur / playlist vide.
     */
    fun resolve(masterUrl: String): HlsResult? {
        return try {
            val text = HttpClient.fetchText(masterUrl, timeoutMs = 10_000)
            val baseUrl = masterUrl.substringBeforeLast('/', "") + "/"

            // Étape 1 : est-ce un master playlist ?
            val variantUri = findLastStreamInfUri(text)
            if (variantUri != null) {
                // Master playlist : suivre la dernière variante
                val playlistUrl = absolutize(variantUri, baseUrl)
                val playlistText = HttpClient.fetchText(playlistUrl, timeoutMs = 10_000)
                val segments = parseMediaPlaylist(playlistText, playlistUrl.substringBeforeLast('/', "") + "/")
                if (segments.isEmpty()) return null
                return HlsResult(playlistUrl, segments)
            }

            // Étape 2 : c'est déjà une media playlist
            val segments = parseMediaPlaylist(text, baseUrl)
            if (segments.isEmpty()) return null
            return HlsResult(masterUrl, segments)
        } catch (e: IOException) {
            android.util.Log.e("AnimeZone", "HLS resolution failed for $masterUrl: ${e.message}")
            null
        }
    }

    // ------------------------------------------------------------------
    // Parsing M3U8 maison
    // ------------------------------------------------------------------

    /**
     * Cherche la dernière URI après une ligne `#EXT-X-STREAM-INF:...`
     * pour suivre la variante de meilleure qualité (comportement miroir du Python).
     */
    private fun findLastStreamInfUri(text: String): String? {
        val lines = text.lines()
        var lastUri: String? = null
        var sawStreamInf = false
        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.startsWith("#EXT-X-STREAM-INF:")) {
                sawStreamInf = true
                continue
            }
            if (sawStreamInf && trimmed.isNotEmpty() && !trimmed.startsWith("#")) {
                lastUri = trimmed
                sawStreamInf = false
            }
        }
        return lastUri
    }

    /**
     * Parse une media playlist : renvoie tous les segments (#EXTINF + URL).
     * Format M3U8 :
     *   #EXTM3U
     *   #EXT-X-VERSION:3
     *   #EXT-X-TARGETDURATION:10
     *   #EXTINF:10.0,
     *   segment_001.ts
     *   #EXTINF:12.5,
     *   segment_002.ts
     *   #EXT-X-ENDLIST
     */
    private fun parseMediaPlaylist(text: String, baseUrl: String): List<Segment> {
        val segments = mutableListOf<Segment>()
        val lines = text.lines()
        var pendingDuration: Double? = null
        var index = 0

        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.isEmpty()) continue

            if (trimmed.startsWith("#EXTINF:")) {
                // #EXTINF:10.0, title optionnel
                val payload = trimmed.removePrefix("#EXTINF:").substringBefore(',')
                pendingDuration = payload.toDoubleOrNull() ?: 0.0
                continue
            }

            if (trimmed.startsWith("#")) continue  // autre tag : ignore

            // Ligne non-commentaire = URI du segment
            val absUrl = absolutize(trimmed, baseUrl)
            segments.add(Segment(absUrl, pendingDuration ?: 0.0, index++))
            pendingDuration = null
        }
        return segments
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
