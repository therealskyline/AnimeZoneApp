package com.animezone.mobile.network

import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * HttpClient — singleton OkHttp qui remplace `video_session = requests.Session()`
 * (app.py, lignes 28-30).
 *
 * Le User-Agent doit matcher celui du Python (`Mozilla/5.0 ... Win64; x64`) car
 * SendVid/Vidmoly/Sibnet font du fingerprinting UA : un UA Android natif serait
 * bloqué ou renverrait une page mobile sans la balise vidéo.
 *
 * Toutes les méthodes d'extraction (VideoExtractor, GenericExtractor, HlsParser)
 * passent par ce singleton pour bénéficier :
 *   - Du partage de keep-alive / connection pool
 *   - D'un timeout cohérent
 *   - Du suivi des redirects (OkHttp suit automatiquement)
 *
 * Pour le streaming vidéo bytes-par-bytes (proxy HLS), on expose aussi `client`
 * directement afin que le Native Module puisse faire `client.newCall(...).execute()`
 * et streamer le body.
 */
object HttpClient {

    // V1.3 : `internal` au lieu de `private` pour que AnimeZoneModule.proxyStream
    // puisse y accéder depuis le même module Kotlin.
    internal const val USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

    val client: OkHttpClient by lazy { buildClient() }

    private fun buildClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .retryOnConnectionFailure(true)
            .build()
    }

    /**
     * Récupère le body texte d'une URL (équivalent `requests.get(url).text`).
     * Lance IOException en cas d'échec — l'appelant gère ou propage.
     */
    fun fetchText(url: String, timeoutMs: Long = 10_000): String {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.8")
            .header("Referer", "https://animezone.example/")  // anti-hotlinking
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code} for $url")
            }
            return response.body?.string()
                ?: throw IOException("Empty body for $url")
        }
    }

    /**
     * V1.9 : variante de fetchText avec headers personnalisés.
     * Utilisé par Sibnet qui nécessite un Referer spécifique (https://video.sibnet.ru/)
     * et un Accept-Language russe pour ne pas être redirigé vers une version
     * différente de la page.
     *
     * @param url URL à fetch
     * @param referer Referer header (si null, ne met pas de Referer)
     * @param acceptLanguage Accept-Language header (si null, utilise défaut français)
     */
    fun fetchTextWithHeaders(
        url: String,
        referer: String? = null,
        acceptLanguage: String? = null,
        timeoutMs: Long = 10_000
    ): String {
        val builder = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", acceptLanguage ?: "fr-FR,fr;q=0.9,en;q=0.8")
        if (referer != null) {
            builder.header("Referer", referer)
        }
        val request = builder.build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code} for $url")
            }
            return response.body?.string()
                ?: throw IOException("Empty body for $url")
        }
    }
}
