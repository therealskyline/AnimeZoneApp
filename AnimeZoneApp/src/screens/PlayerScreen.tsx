/**
 * PlayerScreen — page lecteur fidèle à templates/player.html.
 *
 * V1.2 :
 *   - Layout des boutons refait : 2 lignes claires au lieu d'un wrap brouillon
 *      • Ligne 1 : navigation épisodes (Précédent · Suivant) — largeur égale
 *      • Ligne 2 : bouton "Tous les épisodes" — largeur pleine
 *   - Indicateur visuel du fallback multi-lecteurs : on affiche en temps réel
 *     quel lecteur a été essayé et lequel marche, pour que l'utilisateur comprenne
 *     quand le scraping prend du temps (surtout en cas de fallback).
 *   - Changement de langue : appuyer sur VF/VOSTFR relance resolveEpisode
 *     avec preferredLang pour fallback intelligent.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import Video from 'react-native-video';
import { Button } from '@/components/Button';
import { AnimeZoneBridge } from '@/services/AnimeZoneBridge';
import type { Anime, Episode, PlayableVideo } from '@/services/AnimeZoneBridge';
import { decodeHtmlEntities } from '@/types/anime';
import { useThemedAlert } from '@/components/ThemedAlert';
import { Colors, Typography, BorderRadius, Spacing } from '@/theme';
import Orientation from 'react-native-orientation-locker';

interface PlayerScreenProps {
  anime: Anime;
  seasonNumber: number;
  /** V1.7 : name de la saison (ex: "Avec Fillers", "Film", "Saison 1") pour affichage breadcrumb */
  seasonName?: string;
  episode: Episode;
  profileId: number;
  onBack: () => void;
  onBackToAnime: () => void;
  onNavigateEpisode?: (direction: 'prev' | 'next') => void;
  canGoPrev?: boolean;
  canGoNext?: boolean;
}

export function PlayerScreen({
  anime,
  seasonNumber,
  seasonName,
  episode,
  profileId,
  onBack,
  onBackToAnime,
  onNavigateEpisode,
  canGoPrev = false,
  canGoNext = false,
}: PlayerScreenProps) {
  const themedAlert = useThemedAlert();
  const [playable, setPlayable] = useState<PlayableVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<'VF' | 'VOSTFR' | null>(null);
  const [availableLangs, setAvailableLangs] = useState<Array<'VF' | 'VOSTFR'>>([]);

  // V1.5 : reprise de lecture — position de départ (ms) récupérée depuis user_data.db
  // V1.9 : on utilise aussi un useRef pour éviter la race condition entre le
  // useEffect async (qui charge la position depuis la DB) et le onLoad du
  // <Video> qui peut se déclencher AVANT que setResumePosition ait re-rendered.
  // Sans ref, onLoad lit `resumePosition` state qui est encore à 0.
  const [resumePosition, setResumePosition] = useState<number>(0);
  const resumePositionRef = React.useRef<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const videoRef = React.useRef<any>(null);
  const lastSaveRef = React.useRef<number>(0);  // throttle save progress
  const hasSeekedRef = React.useRef<boolean>(false);  // V1.9 : éviter double seek

  // V1.8 : auto-rotate landscape sur fullscreen, retour portrait à la sortie
  useEffect(() => {
    // Au mount : s'assurer qu'on est en portrait
    Orientation.lockToPortrait();
    return () => {
      // Au unmount : libérer le lock pour ne pas garder l'app en portrait
      // si l'utilisateur va ailleurs
      Orientation.unlockAllOrientations();
    };
  }, []);

  // Détection des langues disponibles pour cet épisode + récupération de la
  // position sauvegardée pour la reprise de lecture
  useEffect(() => {
    const urls = episode.urls ?? {};
    const langs: Array<'VF' | 'VOSTFR'> = [];
    if (Array.isArray(urls.VF) && urls.VF.length > 0) langs.push('VF');
    if (Array.isArray(urls.VOSTFR) && urls.VOSTFR.length > 0) langs.push('VOSTFR');
    setAvailableLangs(langs);
    setActiveLang(langs.includes('VF') ? 'VF' : langs[0] ?? null);

    // V1.9 : reset le flag de seek pour le nouvel épisode
    hasSeekedRef.current = false;
    resumePositionRef.current = 0;
    setResumePosition(0);

    // V1.5 : charger la position sauvegardée
    (async () => {
      try {
        const progress = await AnimeZoneBridge.getVideoProgress(
          profileId, anime.anime_id, seasonNumber, episode.episode_number
        );
        if (progress.found && !progress.completed && progress.positionMs > 5000) {
          // Ne reprendre que si on avait regardé plus de 5s et que ce n'était pas terminé
          // V1.9 : set le ref EN PLUS du state pour que onLoad puisse y accéder
          // immédiatement, même si le re-render n'a pas encore eu lieu.
          resumePositionRef.current = progress.positionMs;
          setResumePosition(progress.positionMs);
          console.log(`[PlayerScreen] Position sauvegardée: ${progress.positionMs}ms — sera appliquée au onLoad`);
        } else {
          resumePositionRef.current = 0;
          setResumePosition(0);
        }
      } catch (e) {
        console.warn('[PlayerScreen] getVideoProgress failed:', e);
      }
    })();
  }, [episode, profileId, anime.anime_id, seasonNumber]);

  // Résolution de l'épisode — relancée quand activeLang change
  const resolve = useCallback(
    async (lang: 'VF' | 'VOSTFR' | null) => {
      setLoading(true);
      setError(null);
      setPlayable(null);
      try {
        const result = await AnimeZoneBridge.resolveEpisode(episode, lang ?? undefined);
        setPlayable(result);

        // V1.4 : marquer l'épisode comme en cours dans user_data.db
        // (sans attendre — si ça échoue, on ne bloque pas la lecture)
        AnimeZoneBridge.upsertContinueWatching(
          profileId,
          anime.anime_id,
          seasonNumber,
          episode.episode_number
        ).catch((e) => console.warn('[PlayerScreen] upsertContinueWatching failed:', e));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [episode, profileId, anime.anime_id, seasonNumber]
  );

  useEffect(() => {
    resolve(activeLang);
  }, [activeLang, resolve]);

  const handleLangPress = (lang: 'VF' | 'VOSTFR') => {
    if (lang === activeLang) return; // déjà actif
    setActiveLang(lang);
  };

  // V1.7 : calcule un libellé propre pour la saison (au lieu de "S{num}")
  // - Films (season 99) → "Film"
  // - Saison avec name custom (ex: "Avec Fillers", "Kai") → le name
  // - Sinon → "Saison {num}"
  const seasonLabel: string = (() => {
    if (seasonNumber === 99) return 'Film';
    if (seasonName && !seasonName.startsWith('Saison')) return seasonName;
    return seasonName || `Saison ${seasonNumber}`;
  })();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: Spacing.xxl }}
    >
      {/* Breadcrumb */}
      <View style={styles.breadcrumb}>
        <Pressable onPress={onBack}>
          <Text style={styles.breadcrumbLink}>Accueil</Text>
        </Pressable>
        <Text style={styles.breadcrumbSep}>/</Text>
        <Pressable onPress={onBackToAnime}>
          <Text
            style={styles.breadcrumbLink}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {decodeHtmlEntities(anime.title)}
          </Text>
        </Pressable>
        <Text style={styles.breadcrumbSep}>/</Text>
        <Text style={styles.breadcrumbCurrent} numberOfLines={1}>
          {seasonLabel} - Épisode {episode.episode_number}
        </Text>
      </View>

      {/* Video container 16:9 */}
      <View style={styles.videoContainer}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>
              {activeLang ? `Recherche source ${activeLang}...` : 'Détection du lecteur...'}
            </Text>
            <Text style={styles.loadingSubtext}>
              Si un lecteur échoue, on essaie automatiquement le suivant.
            </Text>
          </View>
        )}

        {error && !loading && (
          <View style={styles.loadingOverlay}>
            <Icon name="exclamation-circle" size={48} color={Colors.errorText} />
            <Text style={styles.errorOverlay}>Source indisponible</Text>
            <Text style={styles.errorDetail}>{error}</Text>
          </View>
        )}

        {playable && !loading && (
          <Video
            ref={videoRef}
            source={{ uri: playable.url }}
            style={styles.video}
            controls
            resizeMode="contain"
            playInBackground={false}
            // V1.9 : reprise de lecture — on utilise resumePositionRef.current
            // (mis à jour immédiatement) au lieu de resumePosition state (qui
            // peut encore être à 0 si le re-render n'est pas encore effectif).
            // On a aussi un guard hasSeekedRef pour éviter un double seek.
            onLoad={(data: any) => {
              const dur = data?.duration ?? 0;
              if (dur > 0) setVideoDuration(dur * 1000);
              const posMs = resumePositionRef.current;
              if (posMs > 0 && !hasSeekedRef.current) {
                // Attendre un peu que la vidéo soit vraiment prête (HLS met du temps)
                setTimeout(() => {
                  try {
                    const ref = videoRef.current as any;
                    if (ref && typeof ref.seek === 'function') {
                      ref.seek(posMs / 1000);
                      hasSeekedRef.current = true;
                      console.log(`[PlayerScreen] ✓ Reprise à ${posMs}ms (onLoad)`);
                    } else {
                      console.warn('[PlayerScreen] ref.seek indisponible au onLoad');
                    }
                  } catch (e) {
                    console.warn('[PlayerScreen] seek onLoad failed:', e);
                  }
                }, 500);
              }
            }}
            // V1.9 : backup — si le seek au onLoad n'a pas marché (HLS pas encore
            // prêt), on retente au onReadyForDisplay qui est déclenché quand la
            // 1ère frame est rendue.
            onReadyForDisplay={() => {
              const posMs = resumePositionRef.current;
              if (posMs > 0 && !hasSeekedRef.current) {
                try {
                  const ref = videoRef.current as any;
                  if (ref && typeof ref.seek === 'function') {
                    ref.seek(posMs / 1000);
                    hasSeekedRef.current = true;
                    console.log(`[PlayerScreen] ✓ Reprise à ${posMs}ms (onReadyForDisplay)`);
                  }
                } catch (e) {
                  console.warn('[PlayerScreen] seek onReadyForDisplay failed:', e);
                }
              }
            }}
            onProgress={(data: any) => {
              // V1.5 : throttle save progress toutes les 5 secondes
              const now = Date.now();
              if (now - lastSaveRef.current < 5000) return;
              lastSaveRef.current = now;
              const posMs = Math.floor((data?.currentTime ?? 0) * 1000);
              const durMs = Math.floor((data?.seekableDuration ?? data?.playableDuration ?? 0) * 1000);
              if (posMs > 0) {
                AnimeZoneBridge.saveVideoProgress(
                  profileId, anime.anime_id, seasonNumber, episode.episode_number,
                  posMs, durMs || videoDuration, false
                ).catch((e) => console.warn('saveProgress failed:', e));
              }
            }}
            onEnd={() => {
              // V1.5 : marquer comme terminé
              AnimeZoneBridge.saveVideoProgress(
                profileId, anime.anime_id, seasonNumber, episode.episode_number,
                videoDuration, videoDuration, true
              ).catch(console.warn);
            }}
            onError={(e) => {
              console.warn('player error', e);
              themedAlert.show({
                title: 'Lecteur',
                message: `Erreur de lecture (${playable.playerType} / ${playable.source}). Essaie un autre épisode ou change de langue.`,
                confirmLabel: 'OK',
              });
            }}
            // V1.8 : auto-rotate landscape quand l'utilisateur passe en fullscreen
            onFullscreenPlayerWillPresent={() => {
              Orientation.unlockAllOrientations();
              Orientation.lockToLandscape();
            }}
            // V1.8 : retour portrait quand on quitte le fullscreen
            onFullscreenPlayerWillDismiss={() => {
              Orientation.lockToPortrait();
            }}
          />
        )}
      </View>

      {/* Source info */}
      <View style={styles.sourceInfo}>
        <Text style={styles.sourceText}>
          Source :{' '}
          {playable
            ? `${playable.source} · ${playable.playerType.toUpperCase()}`
            : loading
            ? 'Recherche en cours...'
            : 'Indisponible'}
        </Text>
        {activeLang && (
          <Text style={styles.sourceLang}> · {activeLang}</Text>
        )}
      </View>

      {/* Episode info */}
      <View style={styles.episodeInfo}>
        <Text style={styles.episodeTitle}>{decodeHtmlEntities(episode.title)}</Text>
        <View style={styles.episodeMeta}>
          <Text style={styles.episodeMetaAccent}>
            {seasonLabel} · Épisode {episode.episode_number}
          </Text>
          <Text style={styles.episodeMetaSep}>•</Text>
          <Text style={styles.episodeMetaSecondary} numberOfLines={1}>
            {decodeHtmlEntities(anime.title)}
          </Text>
        </View>
        {episode.description ? (
          <Text style={styles.episodeDesc}>{decodeHtmlEntities(episode.description)}</Text>
        ) : null}
      </View>

      {/* === Contrôles — layout V1.2 refait === */}

      {/* Ligne 1 : Sélecteur de langue (si plus d'une langue dispo) */}
      {availableLangs.length > 1 && (
        <View style={styles.langSelectorRow}>
          <Text style={styles.sectionLabel}>Langue</Text>
          <View style={styles.langButtons}>
            {availableLangs.map((lang) => (
              <Pressable
                key={lang}
                onPress={() => handleLangPress(lang)}
                disabled={loading}
                style={({ pressed }) => [
                  styles.langButton,
                  activeLang === lang && styles.langButtonActive,
                  pressed && { transform: [{ scale: 0.97 }] },
                  loading && { opacity: 0.5 },
                ]}
              >
                <Icon
                  name={lang === 'VF' ? 'language' : 'closed-captioning'}
                  size={14}
                  color={activeLang === lang ? '#fff' : Colors.accent}
                />
                <Text
                  style={[
                    styles.langButtonText,
                    activeLang === lang && styles.langButtonTextActive,
                  ]}
                >
                  {lang}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Ligne 2 : Navigation épisodes (Précédent / Suivant) — largeur égale */}
      <View style={styles.navRow}>
        <Pressable
          onPress={() => onNavigateEpisode?.('prev')}
          disabled={!canGoPrev || loading}
          style={({ pressed }) => [
            styles.navButton,
            (!canGoPrev || loading) && { opacity: 0.4 },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <Icon name="step-backward" size={14} color={Colors.accent} />
          <Text style={styles.navButtonText}>Précédent</Text>
        </Pressable>

        <Pressable
          onPress={() => onNavigateEpisode?.('next')}
          disabled={!canGoNext || loading}
          style={({ pressed }) => [
            styles.navButton,
            (!canGoNext || loading) && { opacity: 0.4 },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.navButtonText}>Suivant</Text>
          <Icon name="step-forward" size={14} color={Colors.accent} />
        </Pressable>
      </View>

      {/* Ligne 3 : Tous les épisodes — pleine largeur */}
      <View style={styles.allEpsRow}>
        <Button
          label="Tous les épisodes"
          variant="primary"
          size="lg"
          onPress={onBackToAnime}
          iconNode={<Icon name="list" size={14} color="#fff" />}
          fullWidth
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDark,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 6,
    flexWrap: 'wrap',
  },
  breadcrumbLink: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
  },
  breadcrumbSep: { color: Colors.textMuted },
  breadcrumbCurrent: {
    color: Colors.textPrimary,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    flexShrink: 1,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  video: { width: '100%', height: '100%' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  loadingText: {
    color: '#fff',
    marginTop: Spacing.md,
    fontFamily: Typography.fontFamily,
    fontSize: Typography.body,
  },
  loadingSubtext: {
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    fontSize: Typography.small,
    textAlign: 'center',
  },
  errorOverlay: {
    color: Colors.errorText,
    textAlign: 'center',
    marginTop: Spacing.md,
    fontFamily: Typography.fontFamilyBold,
    fontSize: Typography.bodyLarge,
  },
  errorDetail: {
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    fontSize: Typography.small,
    fontFamily: Typography.fontFamily,
  },
  sourceInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  sourceText: {
    color: Colors.textMuted,
    fontSize: Typography.small,
    fontFamily: Typography.fontFamily,
  },
  sourceLang: {
    color: Colors.accent,
    fontSize: Typography.small,
    fontWeight: '600',
    fontFamily: Typography.fontFamilyBold,
  },
  episodeInfo: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  episodeTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.h3,
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
    marginBottom: Spacing.sm,
  },
  episodeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  episodeMetaAccent: {
    color: Colors.accent,
    fontWeight: '600',
    fontSize: Typography.body,
    fontFamily: Typography.fontFamilyBold,
  },
  episodeMetaSep: { color: Colors.textMuted },
  episodeMetaSecondary: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
  },
  episodeDesc: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    lineHeight: 22,
  },
  // === Layout V1.3 ===
  langSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: Typography.small,
    fontFamily: Typography.fontFamilyBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  langButtons: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  // V1.3 : boutons langue plus discrets — padding réduit, pas de `flex: 1`,
  // taille de texte plus petite. On veut que ça passe presque inaperçu.
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  langButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  langButtonText: {
    color: Colors.accent,
    fontSize: Typography.small,
    fontWeight: '600',
    fontFamily: Typography.fontFamilyBold,
    letterSpacing: 0.5,
  },
  langButtonTextActive: {
    color: '#fff',
  },
  navRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  navButtonText: {
    color: Colors.accent,
    fontSize: Typography.body,
    fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: Typography.fontFamilyBold,
  },
  allEpsRow: {
    paddingHorizontal: Spacing.md,
  },
});
