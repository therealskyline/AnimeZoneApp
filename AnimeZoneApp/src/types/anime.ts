/**
 * Types partagés entre le Kotlin (Native Module) et le TS (app React Native).
 * Miroir des structures renvoyées par AnimeZoneModule.kt.
 */

export type PlayerType = 'mp4' | 'hls' | 'webm';
export type VideoSource = 'sendvid' | 'vidmoly' | 'sibnet' | 'generic';

/**
 * Décode les entités HTML courantes dans les titres/descriptions d'anime.
 * Les données sont scrapées depuis Anime-Sama qui garde les entités comme
 * &quot;, &amp;, &#39;, etc. dans ses fichiers JSON.
 *
 * À appeler avant d'afficher un titre d'anime.
 */
export function decodeHtmlEntities(input?: string | null): string {
  if (!input) return '';
  return input
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Réponse de AnimeZoneModule.getVideoInfo(url). */
export interface VideoInfoSuccess {
  success: true;
  playerType: PlayerType;
  url: string;
  source: VideoSource;
  segments?: number;
}

export interface VideoInfoError {
  success: false;
  error: string;
}

export type VideoInfoResult = VideoInfoSuccess | VideoInfoError;

/** Réponse de AnimeZoneModule.selectBestUrl(urlsJson). */
export interface SelectBestUrlSuccess {
  success: true;
  url: string;
  lang: 'VF' | 'VOSTFR' | string;
}

export interface SelectBestUrlError {
  success: false;
  error: string;
}

export type SelectBestUrlResult = SelectBestUrlSuccess | SelectBestUrlError;

/** Structure d'un épisode dans anime.json (résumée). */
export interface EpisodeUrls {
  VF?: string[];
  VOSTFR?: string[];
  [lang: string]: string[] | undefined;
}

export interface Episode {
  episode_number: number;
  title?: string;
  description?: string;
  duration?: string;
  languages?: string[];
  urls: EpisodeUrls;
}

export interface Season {
  season_number: number;
  name?: string;
  episodes: Episode[];
}

export interface Anime {
  anime_id: number;
  id?: number;
  title: string;
  original_title?: string;
  description?: string;
  synopsis?: string;
  image?: string;
  image_url?: string;
  genres?: string[];
  year?: number;
  status?: string;
  rating?: number;
  featured?: boolean;
  has_episodes?: boolean;
  seasons_fetched?: boolean;
  languages?: string[];
  seasons?: Season[];
}
