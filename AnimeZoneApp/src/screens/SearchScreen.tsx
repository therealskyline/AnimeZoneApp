/**
 * SearchScreen — page catalogue fidèle à templates/search.html.
 *
 * V1.3 :
 *   - La SearchBar interne est retirée (doublon avec la Navbar). La recherche
 *     se fait via la SearchBar globale dans la Navbar, qui déclenche une
 *     nouvelle recherche à chaque submit.
 *   - Le SearchScreen réagit quand `query` change (passé par App.tsx via la
 *     valeur de la navbar).
 *
 * Structure :
 *   - Titre "Explorer les animes"
 *   - Compteur de résultats
 *   - Grille de cards (2 colonnes mobile)
 *   - État vide : "Dernières recherches" avec 20 animes récents
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SectionTitle } from '@/components/SectionTitle';
import { AnimeCard } from '@/components/AnimeCard';
import { AnimeZoneBridge } from '@/services/AnimeZoneBridge';
import type { Anime, AnimeSearchResultItem } from '@/services/AnimeZoneBridge';
import { Colors, Typography, Spacing } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const CARD_GAP = Spacing.md;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

interface SearchScreenProps {
  /** Requête de recherche provenant de la SearchBar de la Navbar. */
  query?: string;
  onAnimePress: (anime: Anime) => void;
}

export function SearchScreen({ query = '', onAnimePress }: SearchScreenProps) {
  const [results, setResults] = useState<AnimeSearchResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const { animes } = await AnimeZoneBridge.search({ query: q || undefined, limit: 100 });
      setResults(animes);
      setHasSearched(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // V1.3 : debounce 300ms pour éviter de lancer une requête SQL à chaque caractère tapé.
  // Sans ça, taper "naruto" lance 6 requêtes (n, na, nar, naru, narut, naruto).
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const renderGrid = ({ item }: { item: AnimeSearchResultItem }) => (
    <AnimeCard
      anime={item as Anime}
      width={CARD_WIDTH}
      onPress={async () => {
        try {
          const full = await AnimeZoneBridge.getAnime(item.anime_id);
          onAnimePress(full);
        } catch (e: any) {
          console.warn(e);
        }
      }}
    />
  );

  return (
    <FlatList
      data={results}
      keyExtractor={(item) => String(item.anime_id)}
      numColumns={NUM_COLUMNS}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.listContent}
      key={`grid-${NUM_COLUMNS}`}
      renderItem={renderGrid}
      ListHeaderComponent={
        <View style={styles.header}>
          <SectionTitle text="Explorer les animes" align="center" />

          {/* V1.3 : la barre de recherche du SearchScreen est retirée pour
              éviter le doublon avec celle de la Navbar. La recherche se fait
              via la SearchBar globale dans la Navbar. */}

          <Text style={styles.counter}>
            {loading
              ? 'Recherche en cours...'
              : hasSearched && query
              ? `Résultats pour "${query}" (${results.length} résultat${results.length > 1 ? 's' : ''})`
              : `Tous les animes (${results.length} résultats)`}
          </Text>

          {error && <Text style={styles.errorText}>Erreur : {error}</Text>}
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Dernières recherches</Text>
            <Text style={styles.emptyText}>
              Voici une sélection d'animes disponibles sur la plateforme.
            </Text>
          </View>
        ) : null
      }
      ListFooterComponent={
        loading ? (
          <ActivityIndicator size="large" color={Colors.accent} style={{ marginVertical: Spacing.lg }} />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  searchBar: {
    marginBottom: Spacing.md,
  },
  counter: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
  },
  errorText: {
    color: Colors.errorText,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  row: {
    gap: CARD_GAP,
    paddingHorizontal: Spacing.md,
    marginBottom: CARD_GAP,
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  empty: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.h3,
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
