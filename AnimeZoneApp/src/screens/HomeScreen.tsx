/**
 * HomeScreen — page d'accueil fidèle à templates/index_new.html.
 *
 * V1.4 :
 *   - Récupère les vrais "Continue Watching" depuis user_data.db (par profile)
 *   - Récupère les vrais favoris depuis user_data.db (par profile)
 *   - Ajoute la croix (×) sur les cards "Continue Watching" pour les retirer
 *
 * Sections dans l'ordre :
 *   1. Hero (titre gradient + sous-titre + CTA)
 *   2. Continuer à regarder (carousel horizontal avec croix ×)
 *   3. Découvrir de Nouvelles Séries (12 animes featured depuis discover table)
 *   4. Mes favoris (grid 2 colonnes)
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Hero } from '@/components/Hero';
import { SectionTitle } from '@/components/SectionTitle';
import { AnimeCard } from '@/components/AnimeCard';
import { Button } from '@/components/Button';
import { AnimeZoneBridge } from '@/services/AnimeZoneBridge';
import type {
  Anime,
  ContinueWatchingEntry,
  Profile,
} from '@/services/AnimeZoneBridge';
import { decodeHtmlEntities } from '@/types/anime';
import { Colors, Typography, Spacing } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const CARD_GAP = Spacing.md;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

interface HomeScreenProps {
  profile: Profile;
  onAnimePress: (anime: Anime) => void;
  onSeeAllPress: () => void;
  onContinueWatchingPress: (entry: ContinueWatchingEntry) => void;
}

export function HomeScreen({
  profile,
  onAnimePress,
  onSeeAllPress,
  onContinueWatchingPress,
}: HomeScreenProps) {
  const [featured, setFeatured] = useState<Anime[]>([]);
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingEntry[]>([]);
  const [favorites, setFavorites] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [discover, cw, favs] = await Promise.all([
        AnimeZoneBridge.getDiscover(),
        AnimeZoneBridge.getContinueWatching(profile.id, 20),
        AnimeZoneBridge.getFavorites(profile.id),
      ]);
      setFeatured(discover);
      setContinueWatching(cw);
      setFavorites(favs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Recharge quand l'écran reprend le focus (par ex. retour depuis PlayerScreen)
  // Pour l'instant pas de navigation focus listener — App.tsx va trigger un reload via key.

  const handleRemoveFromCW = async (animeId: number) => {
    try {
      await AnimeZoneBridge.removeFromContinueWatching(profile.id, animeId);
      setContinueWatching((prev) => prev.filter((e) => e.anime_id !== animeId));
    } catch (e: any) {
      console.warn(e);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Chargement du catalogue...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>Erreur : {error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={[1]}
      keyExtractor={() => 'root'}
      renderItem={() => null}
      ListHeaderComponent={
        <View>
          {/* 1. Hero */}
          <Hero
            title="Bienvenue sur AnimeZone"
            subtitle="Reprenez votre visionnage et découvrez de nouveaux animes parmi notre vaste collection. Profitez de la meilleure expérience anime !"
            ctaLabel="Parcourir tous les animes"
            onCtaPress={onSeeAllPress}
          />

          {/* 2. Continuer à regarder — vrai data depuis user_data.db */}
          {continueWatching.length > 0 && (
            <Section title="Continuer à regarder">
              <FlatList
                data={continueWatching}
                keyExtractor={(item) => String(item.anime_id)}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hListContent}
                ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => onContinueWatchingPress(item)}
                    style={({ pressed }) => [
                      pressed && { transform: [{ scale: 0.98 }], opacity: 0.95 },
                    ]}
                  >
                    <AnimeCard
                      anime={item as unknown as Anime}
                      variant="continueWatch"
                      episodeInfo={{
                        season: item.season_number,
                        episode: item.episode_number,
                        title: decodeHtmlEntities(item.episode_title),
                      }}
                      width={CARD_WIDTH * 1.3}
                      onRemove={() => handleRemoveFromCW(item.anime_id)}
                      onPress={() => onContinueWatchingPress(item)}
                    />
                  </Pressable>
                )}
              />
            </Section>
          )}

          {/* 3. À la une — 12 animes featured curated (DB discover table) */}
          {featured.length > 0 && (
            <Section title="À la une">
              <View style={styles.grid}>
                {featured.map((a) => (
                  <AnimeCard
                    key={a.anime_id}
                    anime={a}
                    width={CARD_WIDTH}
                    onPress={() => onAnimePress(a)}
                  />
                ))}
              </View>
              <View style={styles.seeAllRow}>
                <Button
                  label="Voir tous les animes"
                  onPress={onSeeAllPress}
                  variant="primary"
                />
              </View>
            </Section>
          )}

          {/* 4. Mes favoris */}
          {favorites.length > 0 && (
            <Section title="Mes favoris">
              <View style={styles.grid}>
                {favorites.map((a) => (
                  <AnimeCard
                    key={a.anime_id}
                    anime={a}
                    width={CARD_WIDTH}
                    onPress={() => onAnimePress(a)}
                  />
                ))}
              </View>
            </Section>
          )}
        </View>
      }
      contentContainerStyle={{ paddingBottom: Spacing.xxl }}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionTitle text={title} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundDark,
  },
  loadingText: {
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    fontFamily: Typography.fontFamily,
  },
  errorText: {
    color: Colors.errorText,
    padding: Spacing.lg,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  hListContent: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    justifyContent: 'space-between',
  },
  seeAllRow: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
});
