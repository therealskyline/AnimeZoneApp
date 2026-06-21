/**
 * AnimeDetailScreen — page détail fidèle à templates/anime_new.html.
 *
 * V1.2 : suppression du rating (X/10), des tags genres (drama, etc.), et du
 * badge "completed" vert. Layout épuré : poster + titre + bouton favori +
 * description + seasons tabs + liste épisodes.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { SeasonTab } from '@/components/SeasonTab';
import { EpisodeRow } from '@/components/EpisodeRow';
import { Button } from '@/components/Button';
import type { Anime, Episode, Season } from '@/types/anime';
import { decodeHtmlEntities } from '@/types/anime';
import { Colors, Typography, BorderRadius, Shadows, Spacing } from '@/theme';
import { AnimeZoneBridge } from '@/services/AnimeZoneBridge';
import type { Profile } from '@/services/AnimeZoneBridge';
import { useThemedAlert } from '@/components/ThemedAlert';

interface AnimeDetailScreenProps {
  anime: Anime;
  profile: Profile;
  onBack: () => void;
  onPlayEpisode: (seasonNumber: number, seasonName: string | undefined, episode: Episode) => void;
}

export function AnimeDetailScreen({
  anime,
  profile,
  onBack,
  onPlayEpisode,
}: AnimeDetailScreenProps) {
  const themedAlert = useThemedAlert();
  const [isFav, setIsFav] = useState(false);
  const [favLoading, setFavLoading] = useState(true);

  // Vérifier si l'anime est favori au chargement
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fav = await AnimeZoneBridge.isFavorite(profile.id, anime.anime_id);
        if (!cancelled) setIsFav(fav);
      } catch (e) {
        console.warn(e);
      } finally {
        if (!cancelled) setFavLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile.id, anime.anime_id]);

  const handleToggleFavorite = async () => {
    try {
      if (isFav) {
        await AnimeZoneBridge.removeFavorite(profile.id, anime.anime_id);
        setIsFav(false);
      } else {
        await AnimeZoneBridge.addFavorite(profile.id, anime.anime_id);
        setIsFav(true);
      }
    } catch (e: any) {
      themedAlert.show({
        title: 'Erreur',
        message: e.message,
        confirmLabel: 'OK',
      });
    }
  };
  // Tri saisons : regular + films (99) + kai
  const sortedSeasons = useMemo(() => {
    const seasons = anime.seasons ?? [];
    const regular = seasons.filter(
      (s) => s.season_number !== 99 && !(s.name ?? '').includes('Kai')
    );
    const films = seasons.filter((s) => s.season_number === 99);
    const kai = seasons.filter((s) => (s.name ?? '').includes('Kai'));
    regular.sort((a, b) => a.season_number - b.season_number);
    kai.sort((a, b) => a.season_number - b.season_number);
    return [...regular, ...films, ...kai];
  }, [anime]);

  // V1.6 : on identifie une saison par sa "key" (season_number + name)
  // au lieu de juste season_number, sinon 2 saisons avec le même numéro
  // ("Saison 1" et "Saison 1 Director's Cut") apparaissent toutes les deux actives.
  const seasonKey = (s: Season): string =>
    `${s.season_number}::${s.name ?? ''}`;

  const [activeSeasonKey, setActiveSeasonKey] = useState<string>(
    sortedSeasons[0] ? seasonKey(sortedSeasons[0]) : '1::'
  );

  const activeSeasonData: Season | undefined = sortedSeasons.find(
    (s) => seasonKey(s) === activeSeasonKey
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: Spacing.xxl }}
    >
      {/* Breadcrumb */}
      <View style={styles.breadcrumb}>
        <Pressable onPress={onBack}>
          <Text style={styles.breadcrumbLink}>Home</Text>
        </Pressable>
        <Text style={styles.breadcrumbSep}>/</Text>
        <Text style={styles.breadcrumbCurrent} numberOfLines={1}>
          {decodeHtmlEntities(anime.title)}
        </Text>
      </View>

      {/* Layout : poster + info (vertical mobile) */}
      <View style={styles.detailLayout}>
        {/* Poster */}
        <View style={styles.posterWrap}>
          {anime.image ? (
            <Image
              source={{ uri: anime.image }}
              style={styles.poster}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.poster, { backgroundColor: '#333' }]} />
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.title}>{decodeHtmlEntities(anime.title)}</Text>
          {anime.original_title ? (
            <Text style={styles.originalTitle}>
              {decodeHtmlEntities(anime.original_title)}
            </Text>
          ) : null}

          {/* Bouton favori — V1.4 : fonctionnel avec persistance par profile
              V1.8 : nouveau variant 'favorite' — fond rose solide + pas de bordure
              quand actif, inverse nette du 'outline' (transparent + bordure rose) */}
          <View style={styles.favRow}>
            <Button
              label={
                favLoading
                  ? 'Chargement...'
                  : isFav
                  ? 'Retirer des favoris'
                  : 'Ajouter aux favoris'
              }
              variant={isFav ? 'favorite' : 'outline'}
              onPress={handleToggleFavorite}
              disabled={favLoading}
              iconNode={
                <Icon
                  name="heart"
                  size={14}
                  color={isFav ? '#fff' : Colors.accent}
                  solid={isFav}
                />
              }
            />
          </View>
        </View>
      </View>

      {/* Description */}
      {anime.description ? (
        <Text style={styles.description}>{decodeHtmlEntities(anime.description)}</Text>
      ) : null}

      {/* Seasons & Episodes */}
      <View style={styles.seasonsBlock}>
        <Text style={styles.seasonsTitle}>Saisons, Films et Épisodes</Text>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          {sortedSeasons.map((s) => {
            const key = seasonKey(s);
            return (
              <SeasonTab
                key={key}
                seasonNumber={s.season_number}
                name={s.name}
                isActive={key === activeSeasonKey}
                onPress={() => setActiveSeasonKey(key)}
              />
            );
          })}
        </View>

        {/* Contenu saison active */}
        {activeSeasonData?.season_number === 99 ? (
          <View style={styles.filmsHeader}>
            <Icon name="film" size={16} color={Colors.accent} />
            <Text style={styles.filmsHeaderText}>Films disponibles</Text>
          </View>
        ) : null}

        {activeSeasonData?.episodes?.length ? (
          <View style={styles.episodesList}>
            {activeSeasonData.episodes.map((ep: Episode) => (
              <EpisodeRow
                key={ep.episode_number}
                episodeNumber={ep.episode_number}
                title={decodeHtmlEntities(ep.title ?? `Épisode ${ep.episode_number}`)}
                description={decodeHtmlEntities(ep.description)}
                languages={ep.languages ?? []}
                isMovie={activeSeasonData.season_number === 99}
                onPress={() =>
                  onPlayEpisode(activeSeasonData.season_number, activeSeasonData.name, ep)
                }
              />
            ))}
          </View>
        ) : (
          <View style={styles.noEpisodes}>
            <Icon name="exclamation-circle" size={48} color={Colors.textMuted} />
            <Text style={styles.noEpisodesTitle}>Aucun épisode disponible</Text>
            <Text style={styles.noEpisodesText}>
              Les épisodes pour cette saison ne sont pas encore disponibles.
            </Text>
          </View>
        )}
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
    flexShrink: 1,
    fontFamily: Typography.fontFamily,
  },
  detailLayout: {
    flexDirection: 'column',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  posterWrap: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  poster: {
    width: 220,
    height: 330,
    borderRadius: BorderRadius.lg,
    ...Shadows.card,
  },
  info: { width: '100%' },
  title: {
    fontSize: Typography.h1,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamilyBold,
    marginBottom: 4,
    textAlign: 'center',
  },
  originalTitle: {
    fontSize: Typography.body,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  favRow: { alignItems: 'center' },
  description: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    lineHeight: 22,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },
  seasonsBlock: { paddingHorizontal: Spacing.md },
  seasonsTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.h3,
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
    marginBottom: Spacing.md,
  },
  tabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  filmsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
  },
  filmsHeaderText: {
    color: Colors.textPrimary,
    fontSize: Typography.bodyLarge,
    fontWeight: '600',
    fontFamily: Typography.fontFamilyBold,
  },
  episodesList: { paddingBottom: Spacing.lg },
  noEpisodes: {
    padding: Spacing.xl,
    backgroundColor: 'rgba(30,30,30,0.5)',
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  noEpisodesTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.h4,
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
  },
  noEpisodesText: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
