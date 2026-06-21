/**
 * AnimeZoneBridge — wrapper TypeScript autour du Native Module Kotlin.
 *
 * Pourquoi un wrapper :
 *   1. Typer fortement les retours (le module RN renvoie `any` par défaut).
 *   2. Centraliser la logique de résolution (selectBestUrl → getVideoInfo → player).
 *   3. Fournir une API idiomatique (async/await + exceptions typées) au lieu
 *      de devoir vérifier `result.success` partout dans les composants.
 *
 * Usage :
 *   import { AnimeZoneBridge } from '@/services/AnimeZoneBridge';
 *
 *   const playable = await AnimeZoneBridge.resolveEpisode(episode);
 *   // -> { url: 'https://...mp4', playerType: 'mp4', source: 'sendvid' }
 *
 *   <Video source={{ uri: playable.url }} />
 *
 * Si le Native Module n'est pas disponible (ex: en mode Metro dev sans rebuild
 * Android, ou sur iOS), on lève une erreur explicite plutôt que de crasher.
 */

import { NativeModules, Platform } from 'react-native';
import type {
  Anime,
  Episode,
  EpisodeUrls,
  Season,
  SelectBestUrlResult,
  VideoInfoResult,
} from '@/types/anime';

// Re-export pour faciliter les imports côté composants
export type { Anime, Episode, EpisodeUrls, Season } from '@/types/anime';

export interface PlayableVideo {
  url: string;
  playerType: 'mp4' | 'hls' | 'webm';
  source: 'sendvid' | 'vidmoly' | 'sibnet' | 'generic';
  segments?: number;
}

interface AnimeZoneModuleInterface {
  // --- Vidéo ---
  getVideoInfo(url: string): Promise<VideoInfoResult>;
  selectBestUrl(urlsJson: string): Promise<SelectBestUrlResult>;
  getRankedUrls(urlsJson: string): Promise<{
    success: boolean;
    ranked?: Array<{ url: string; lang: string; host: string }>;
    error?: string;
  }>;
  proxyStream(url: string): Promise<{
    success: boolean;
    base64?: string;
    contentType?: string;
    error?: string;
  }>;

  // --- Catalogue (SQLite) ---
  searchAnimes(
    query: string | null,
    genre: string | null,
    limit: number
  ): Promise<{
    success: boolean;
    animes?: AnimeSearchResultItem[];
    total?: number;
    error?: string;
  }>;

  getAnimeById(animeId: number): Promise<{
    success: boolean;
    anime?: Anime;
    error?: string;
  }>;

  getDiscover(): Promise<{
    success: boolean;
    animes?: Anime[];
    error?: string;
  }>;

  getAllGenres(): Promise<{
    success: boolean;
    genres?: string[];
    error?: string;
  }>;

  getEpisodeUrls(
    animeId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<{
    success: boolean;
    urls?: EpisodeUrls;
    error?: string;
  }>;

  getCatalogStats(): Promise<{
    success: boolean;
    totalAnimes?: number;
    totalEpisodes?: number;
    totalUrls?: number;
    dbSizeBytes?: number;
    error?: string;
  }>;

  // --- Profiles (V1.4 + V1.5) ---
  createProfile(name: string, color: number): Promise<{
    success: boolean;
    profileId?: number;
    error?: string;
  }>;
  listProfiles(): Promise<{
    success: boolean;
    profiles?: Array<{ id: number; name: string; createdAt: number; color: number }>;
    error?: string;
  }>;
  renameProfile(profileId: number, newName: string): Promise<{
    success: boolean;
    error?: string;
  }>;
  updateProfileColor(profileId: number, color: number): Promise<{
    success: boolean;
    error?: string;
  }>;
  deleteProfile(profileId: number): Promise<{
    success: boolean;
    error?: string;
  }>;

  // --- Favoris (V1.4) ---
  addFavorite(profileId: number, animeId: number): Promise<{ success: boolean; error?: string }>;
  removeFavorite(profileId: number, animeId: number): Promise<{ success: boolean; error?: string }>;
  isFavorite(profileId: number, animeId: number): Promise<{ success: boolean; isFavorite?: boolean; error?: string }>;
  getFavorites(profileId: number): Promise<{ success: boolean; favorites?: Anime[]; error?: string }>;

  // --- Continue Watching (V1.4) ---
  upsertContinueWatching(
    profileId: number,
    animeId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<{ success: boolean; error?: string }>;
  removeFromContinueWatching(profileId: number, animeId: number): Promise<{ success: boolean; error?: string }>;
  getContinueWatching(profileId: number, limit: number): Promise<{
    success: boolean;
    continueWatching?: ContinueWatchingEntry[];
    error?: string;
  }>;

  // --- Video Progress (V1.5) ---
  saveVideoProgress(
    profileId: number,
    animeId: number,
    seasonNumber: number,
    episodeNumber: number,
    positionMs: number,
    durationMs: number,
    completed: boolean
  ): Promise<{ success: boolean; error?: string }>;
  getVideoProgress(
    profileId: number,
    animeId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<{
    success: boolean;
    found: boolean;
    positionMs: number;
    durationMs: number;
    completed: boolean;
    error?: string;
  }>;
  clearVideoProgress(
    profileId: number,
    animeId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<{ success: boolean; error?: string }>;
}

/** Format allégé renvoyé par searchAnimes (pas de saisons/épisodes). */
export interface AnimeSearchResultItem {
  anime_id: number;
  title: string;
  image?: string;
  has_episodes: boolean;
  year?: number;
  rating: number;
  genres: string[];
  languages?: string[];
}

/** Entrée "Continue Watching" — anime + épisode en cours. */
export interface ContinueWatchingEntry {
  anime_id: number;
  title: string;
  image?: string;
  season_number: number;
  episode_number: number;
  episode_title: string;
  last_watched: number;
}

/** Profile Netflix-style (juste un nom + couleur d'avatar, pas de mdp). */
export interface Profile {
  id: number;
  name: string;
  createdAt: number;
  color: number;  // index 0-5 dans AVATAR_COLORS
}

/** V1.5 : résultat d'une reprise de lecture. */
export interface VideoProgress {
  found: boolean;
  positionMs: number;
  durationMs: number;
  completed: boolean;
}

const isAndroid = Platform.OS === 'android';
const NativeModule = isAndroid
  ? (NativeModules.AnimeZoneModule as AnimeZoneModuleInterface | undefined)
  : undefined;

function assertAvailable(): AnimeZoneModuleInterface {
  if (!NativeModule) {
    throw new Error(
      'AnimeZoneModule non disponible. ' +
        (isAndroid
          ? "Recompile l'app Android (npx react-native run-android) après avoir ajouté AnimeZonePackage à MainApplication.kt."
          : "AnimeZone ne supporte qu'Android (pas iOS, par décision produit).")
    );
  }
  return NativeModule;
}

export const AnimeZoneBridge = {
  /**
   * Récupère tous les URLs d'un épisode triés par priorité, puis tente chacun
   * jusqu'à ce qu'un marche (fallback multi-lecteurs).
   *
   * Algorithme :
   *   1. Appelle getRankedUrls qui renvoie tous les URLs triés (VF > VOSTFR,
   *      puis Vidmoly > SendVid > Sibnet > autres).
   *   2. Pour chaque URL, appelle getVideoInfo (scraping de l'embed).
   *   3. Si succès → renvoie la vidéo jouable.
   *   4. Si échec → log + essaye l'URL suivant.
   *   5. Si tous échouent → lève une erreur avec la liste des hôtes tentés.
   *
   * @param episode L'épisode à résoudre (doit contenir `urls`)
   * @param preferredLang Si fourni, essayer d'abord cette langue (VF ou VOSTFR)
   */
  async resolveEpisode(
    episode: Episode,
    preferredLang?: 'VF' | 'VOSTFR'
  ): Promise<PlayableVideo> {
    const mod = assertAvailable();

    // 1) Récupérer tous les URLs triés
    const ranked = await mod.getRankedUrls(JSON.stringify(episode.urls ?? {}));
    if (!ranked.success || !ranked.ranked || ranked.ranked.length === 0) {
      throw new Error(
        `Aucune URL disponible pour l'épisode ${episode.episode_number}: ${ranked.error ?? 'aucun URL'}`
      );
    }

    // Si l'utilisateur a demandé une langue spécifique, on remonte les URLs
    // de cette langue en tête de liste (sans retirer les autres).
    let candidates = ranked.ranked;
    if (preferredLang) {
      const preferred = candidates.filter((c) => c.lang === preferredLang);
      const others = candidates.filter((c) => c.lang !== preferredLang);
      candidates = [...preferred, ...others];
    }

    // 2) Essayer chaque URL jusqu'à succès
    const attempted: string[] = [];
    const errors: string[] = [];
    for (const candidate of candidates) {
      attempted.push(`${candidate.host}(${candidate.lang})`);
      console.log(
        `[AnimeZoneBridge] Essai ${attempted.length}/${candidates.length}: ${candidate.host} ${candidate.lang} → ${candidate.url}`
      );
      try {
        const info = await mod.getVideoInfo(candidate.url);
        if (info.success) {
          console.log(
            `[AnimeZoneBridge] ✓ Succès sur ${candidate.host} (${candidate.lang})`
          );
          return {
            url: info.url,
            playerType: info.playerType,
            source: info.source,
            segments: (info as any).segments,
          };
        }
        errors.push(`${candidate.host}: ${info.error}`);
        console.warn(
          `[AnimeZoneBridge] ✗ Échec ${candidate.host} (${candidate.lang}): ${info.error}`
        );
      } catch (e: any) {
        errors.push(`${candidate.host}: ${e.message}`);
        console.warn(
          `[AnimeZoneBridge] ✗ Exception ${candidate.host}: ${e.message}`
        );
      }
    }

    throw new Error(
      `Tous les lecteurs ont échoué pour l'épisode ${episode.episode_number}. ` +
        `Tentés: ${attempted.join(', ')}. Détails: ${errors.join(' | ')}`
    );
  },

  /**
   * Variante : résoudre directement à partir d'une URL connue
   * (sans passer par selectBestUrl).
   */
  async resolveUrl(url: string): Promise<PlayableVideo> {
    const mod = assertAvailable();
    const info = await mod.getVideoInfo(url);
    if (!info.success) {
      throw new Error(`Scraping échoué pour ${url}: ${info.error}`);
    }
    return {
      url: info.url,
      playerType: info.playerType,
      source: info.source,
      segments: (info as any).segments,
    };
  },

  /**
   * Proxy optionnel : à n'utiliser que pour les ressources bloquées
   * (clé AES-128 d'un manifest HLS, mini-sous-titres, etc.).
   * Renvoie une data URL base64 prête à être consommée par le player.
   */
  async proxyAsDataUrl(url: string): Promise<string> {
    const mod = assertAvailable();
    const res = await mod.proxyStream(url);
    if (!res.success || !res.base64) {
      throw new Error(`Proxy échoué pour ${url}: ${res.error ?? 'inconnu'}`);
    }
    return `data:${res.contentType ?? 'application/octet-stream'};base64,${res.base64}`;
  },

  /** Vrai / faux : le module natif est-il branché ? */
  isAvailable(): boolean {
    return NativeModule !== undefined;
  },

  // ------------------------------------------------------------------
  // Catalogue (SQLite)
  // ------------------------------------------------------------------

  /**
   * Recherche d'animes dans la DB locale.
   * @example
   *   const { animes } = await AnimeZoneBridge.search({ query: 'naruto', genre: 'shonen' });
   */
  async search(opts: {
    query?: string;
    genre?: string;
    limit?: number;
  } = {}): Promise<{ animes: AnimeSearchResultItem[]; total: number }> {
    const mod = assertAvailable();
    const res = await mod.searchAnimes(
      opts.query ?? null,
      opts.genre ?? null,
      opts.limit ?? 100
    );
    if (!res.success || !res.animes) {
      throw new Error(`search failed: ${res.error ?? 'inconnu'}`);
    }
    return { animes: res.animes, total: res.total ?? 0 };
  },

  /** Récupère un anime complet (saisons, épisodes, URLs) par son ID. */
  async getAnime(animeId: number): Promise<Anime> {
    const mod = assertAvailable();
    const res = await mod.getAnimeById(animeId);
    if (!res.success || !res.anime) {
      throw new Error(`Anime ${animeId} non trouvé: ${res.error ?? 'inconnu'}`);
    }
    return res.anime;
  },

  /** Liste des animes featured (page d'accueil). */
  async getDiscover(): Promise<Anime[]> {
    const mod = assertAvailable();
    const res = await mod.getDiscover();
    if (!res.success || !res.animes) {
      throw new Error(`getDiscover failed: ${res.error ?? 'inconnu'}`);
    }
    return res.animes;
  },

  /** Tous les genres disponibles (pour le dropdown de filtre). */
  async getAllGenres(): Promise<string[]> {
    const mod = assertAvailable();
    const res = await mod.getAllGenres();
    if (!res.success || !res.genres) {
      throw new Error(`getAllGenres failed: ${res.error ?? 'inconnu'}`);
    }
    return res.genres;
  },

  /**
   * Récupère uniquement les URLs d'un épisode précis — plus rapide que
   * getAnime() quand on veut juste lancer le player.
   */
  async getEpisodeUrls(
    animeId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<EpisodeUrls> {
    const mod = assertAvailable();
    const res = await mod.getEpisodeUrls(animeId, seasonNumber, episodeNumber);
    if (!res.success || !res.urls) {
      throw new Error(`getEpisodeUrls failed: ${res.error ?? 'inconnu'}`);
    }
    return res.urls;
  },

  /** Stats catalog — pour l'écran paramètres ou le debug. */
  async getCatalogStats(): Promise<{
    totalAnimes: number;
    totalEpisodes: number;
    totalUrls: number;
    dbSizeBytes: number;
  }> {
    const mod = assertAvailable();
    const res = await mod.getCatalogStats();
    if (!res.success) {
      throw new Error(`getCatalogStats failed: ${res.error ?? 'inconnu'}`);
    }
    return {
      totalAnimes: res.totalAnimes!,
      totalEpisodes: res.totalEpisodes!,
      totalUrls: res.totalUrls!,
      dbSizeBytes: res.dbSizeBytes!,
    };
  },

  // ------------------------------------------------------------------
  // Profiles (V1.4)
  // ------------------------------------------------------------------

  async createProfile(name: string, color: number = 0): Promise<number> {
    const mod = assertAvailable();
    const res = await mod.createProfile(name, color);
    if (!res.success || res.profileId == null) {
      throw new Error(`createProfile failed: ${res.error ?? 'inconnu'}`);
    }
    return res.profileId;
  },

  async listProfiles(): Promise<Profile[]> {
    const mod = assertAvailable();
    const res = await mod.listProfiles();
    if (!res.success || !res.profiles) {
      throw new Error(`listProfiles failed: ${res.error ?? 'inconnu'}`);
    }
    return res.profiles;
  },

  async renameProfile(profileId: number, newName: string): Promise<void> {
    const mod = assertAvailable();
    const res = await mod.renameProfile(profileId, newName);
    if (!res.success) {
      throw new Error(`renameProfile failed: ${res.error ?? 'inconnu'}`);
    }
  },

  async updateProfileColor(profileId: number, color: number): Promise<void> {
    const mod = assertAvailable();
    const res = await mod.updateProfileColor(profileId, color);
    if (!res.success) {
      throw new Error(`updateProfileColor failed: ${res.error ?? 'inconnu'}`);
    }
  },

  async deleteProfile(profileId: number): Promise<void> {
    const mod = assertAvailable();
    const res = await mod.deleteProfile(profileId);
    if (!res.success) {
      throw new Error(`deleteProfile failed: ${res.error ?? 'inconnu'}`);
    }
  },

  // ------------------------------------------------------------------
  // Favoris (V1.4)
  // ------------------------------------------------------------------

  async addFavorite(profileId: number, animeId: number): Promise<void> {
    const mod = assertAvailable();
    const res = await mod.addFavorite(profileId, animeId);
    if (!res.success) throw new Error(`addFavorite failed: ${res.error ?? 'inconnu'}`);
  },

  async removeFavorite(profileId: number, animeId: number): Promise<void> {
    const mod = assertAvailable();
    const res = await mod.removeFavorite(profileId, animeId);
    if (!res.success) throw new Error(`removeFavorite failed: ${res.error ?? 'inconnu'}`);
  },

  async isFavorite(profileId: number, animeId: number): Promise<boolean> {
    const mod = assertAvailable();
    const res = await mod.isFavorite(profileId, animeId);
    if (!res.success) throw new Error(`isFavorite failed: ${res.error ?? 'inconnu'}`);
    return res.isFavorite ?? false;
  },

  async getFavorites(profileId: number): Promise<Anime[]> {
    const mod = assertAvailable();
    const res = await mod.getFavorites(profileId);
    if (!res.success || !res.favorites) {
      throw new Error(`getFavorites failed: ${res.error ?? 'inconnu'}`);
    }
    return res.favorites;
  },

  // ------------------------------------------------------------------
  // Continue Watching (V1.4)
  // ------------------------------------------------------------------

  async upsertContinueWatching(
    profileId: number,
    animeId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<void> {
    const mod = assertAvailable();
    const res = await mod.upsertContinueWatching(profileId, animeId, seasonNumber, episodeNumber);
    if (!res.success) throw new Error(`upsertContinueWatching failed: ${res.error ?? 'inconnu'}`);
  },

  async removeFromContinueWatching(profileId: number, animeId: number): Promise<void> {
    const mod = assertAvailable();
    const res = await mod.removeFromContinueWatching(profileId, animeId);
    if (!res.success) throw new Error(`removeFromContinueWatching failed: ${res.error ?? 'inconnu'}`);
  },

  async getContinueWatching(profileId: number, limit = 20): Promise<ContinueWatchingEntry[]> {
    const mod = assertAvailable();
    const res = await mod.getContinueWatching(profileId, limit);
    if (!res.success || !res.continueWatching) {
      throw new Error(`getContinueWatching failed: ${res.error ?? 'inconnu'}`);
    }
    return res.continueWatching;
  },

  // ------------------------------------------------------------------
  // Video Progress (V1.5)
  // ------------------------------------------------------------------

  async saveVideoProgress(
    profileId: number,
    animeId: number,
    seasonNumber: number,
    episodeNumber: number,
    positionMs: number,
    durationMs: number,
    completed: boolean
  ): Promise<void> {
    const mod = assertAvailable();
    const res = await mod.saveVideoProgress(
      profileId, animeId, seasonNumber, episodeNumber,
      positionMs, durationMs, completed
    );
    if (!res.success) throw new Error(`saveVideoProgress failed: ${res.error ?? 'inconnu'}`);
  },

  async getVideoProgress(
    profileId: number,
    animeId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<VideoProgress> {
    const mod = assertAvailable();
    const res = await mod.getVideoProgress(profileId, animeId, seasonNumber, episodeNumber);
    if (!res.success) {
      throw new Error(`getVideoProgress failed: ${res.error ?? 'inconnu'}`);
    }
    return {
      found: res.found,
      positionMs: res.positionMs,
      durationMs: res.durationMs,
      completed: res.completed,
    };
  },

  async clearVideoProgress(
    profileId: number,
    animeId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<void> {
    const mod = assertAvailable();
    const res = await mod.clearVideoProgress(profileId, animeId, seasonNumber, episodeNumber);
    if (!res.success) throw new Error(`clearVideoProgress failed: ${res.error ?? 'inconnu'}`);
  },
};

/**
 * Utilitaire pour les composants : trouver la prochaine épisode à jouer
 * dans la saison courante, ou passer à la saison suivante.
 * (Cette logique était implicite dans la route /player de Flask.)
 */
export function findNextEpisode(
  anime: Anime,
  currentSeason: number,
  currentEpisode: number
): { season: number; episode: number } | null {
  const seasons = (anime.seasons ?? []).slice().sort(
    (a, b) => a.season_number - b.season_number
  );
  const season = seasons.find((s) => s.season_number === currentSeason);
  if (!season) return null;

  const episodes = (season.episodes ?? []).slice().sort(
    (a, b) => a.episode_number - b.episode_number
  );
  const next = episodes.find((e) => e.episode_number > currentEpisode);
  if (next) {
    return { season: currentSeason, episode: next.episode_number };
  }

  // Passer à la saison suivante
  const nextSeason = seasons.find((s) => s.season_number > currentSeason);
  if (nextSeason && nextSeason.episodes.length > 0) {
    const firstEp = nextSeason.episodes.slice().sort(
      (a, b) => a.episode_number - b.episode_number
    )[0];
    return { season: nextSeason.season_number, episode: firstEp.episode_number };
  }
  return null;
}
