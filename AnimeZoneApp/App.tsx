/**
 * App.tsx — point d'entrée de l'app AnimeZone (V1.4).
 *
 * Flux :
 *   1. Au lancement, vérifier si un profile est déjà sélectionné (AsyncStorage).
 *      - Si non → afficher ProfilePickerScreen
 *      - Si oui → afficher l'app (Home/Catalogue/Settings)
 *
 *   2. Une fois un profile sélectionné, l'app dispose de 4 onglets :
 *      - Home       : Hero + Continue Watching (avec croix) + Découvrir + Favoris
 *      - Catalogue  : recherche
 *      - Profile    : SettingsScreen (renommer, switcher, supprimer profiles)
 *      - Player     : lecteur vidéo (immersive, navbar masquée)
 *
 *   3. SettingsScreen permet de changer de profile → retour au ProfilePicker.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Navbar } from '@/components/Navbar';
import { HomeScreen } from '@/screens/HomeScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { AnimeDetailScreen } from '@/screens/AnimeDetailScreen';
import { PlayerScreen } from '@/screens/PlayerScreen';
import { ProfilePickerScreen } from '@/screens/ProfilePickerScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { AnimeZoneBridge } from '@/services/AnimeZoneBridge';
import type { Anime, Episode, Profile, ContinueWatchingEntry } from '@/services/AnimeZoneBridge';
import { Colors } from '@/theme';
import { ThemedAlertProvider } from '@/components/ThemedAlert';

type Tab = 'home' | 'catalogue' | 'profile';

type ScreenState =
  | { name: 'tab'; tab: Tab }
  | { name: 'detail'; anime: Anime }
  | { name: 'player'; anime: Anime; seasonNumber: number; seasonName?: string; episode: Episode };

const STORAGE_KEY = '@animezone/current_profile';

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [screen, setScreen] = useState<ScreenState>({ name: 'tab', tab: 'home' });
  const [searchValue, setSearchValue] = useState('');
  // Force un reload du HomeScreen quand on revient d'une autre screen
  // (pour refresh continue_watching et favoris)
  const [homeReloadKey, setHomeReloadKey] = useState(0);

  // Au lancement : récupérer le profile courant depuis AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const p = JSON.parse(stored) as Profile;
          // Vérifier que le profile existe encore en DB
          const profiles = await AnimeZoneBridge.listProfiles();
          const stillExists = profiles.find((x) => x.id === p.id);
          if (stillExists) {
            setProfile(stillExists);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch (e) {
        console.warn('Failed to load profile:', e);
      } finally {
        setProfileLoading(false);
      }
    })();
  }, []);

  const handleProfileSelected = async (p: Profile) => {
    setProfile(p);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (e) {
      console.warn('Failed to save profile:', e);
    }
    setScreen({ name: 'tab', tab: 'home' });
  };

  const handleSwitchProfile = async () => {
    setProfile(null);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn(e);
    }
  };

  const handleSearchSubmit = () => {
    setScreen({ name: 'tab', tab: 'catalogue' });
  };

  const handleAnimePress = (anime: Anime) => {
    setScreen({ name: 'detail', anime });
  };

  const handlePlayEpisode = (
    anime: Anime,
    seasonNumber: number,
    seasonName: string | undefined,
    episode: Episode
  ) => {
    setScreen({ name: 'player', anime, seasonNumber, seasonName, episode });
  };

  // Quand on tape sur un anime dans "Continue Watching" du Home
  const handleContinueWatchingPress = async (entry: ContinueWatchingEntry) => {
    try {
      // Charger l'anime complet depuis la DB
      const anime = await AnimeZoneBridge.getAnime(entry.anime_id);
      // Trouver l'épisode correspondant dans l'anime
      const season = (anime.seasons ?? []).find(
        (s) => s.season_number === entry.season_number
      );
      if (!season) return;
      const ep = (season.episodes ?? []).find(
        (e) => e.episode_number === entry.episode_number
      );
      if (!ep) return;
      handlePlayEpisode(anime, entry.season_number, season.name, ep);
    } catch (e) {
      console.warn(e);
    }
  };

  // Quand on revient du détail/player, refresh le Home
  const handleBackToHome = () => {
    setHomeReloadKey((k) => k + 1);
    setScreen({ name: 'tab', tab: 'home' });
  };

  const handleBackToDetail = (anime: Anime) => {
    setHomeReloadKey((k) => k + 1);
    setScreen({ name: 'detail', anime });
  };

  // V1.8 : la navbar est maintenant affichée sur TOUS les écrans, y compris le player.
  const showNavbar = true;

  // 1. Pendant le chargement du profile
  if (profileLoading) {
    return (
      <ThemedAlertProvider>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" backgroundColor={Colors.backgroundDark} />
          <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
            {/* Loading splash minimaliste */}
          </View>
        </SafeAreaProvider>
      </ThemedAlertProvider>
    );
  }

  // 2. Pas de profile sélectionné → ProfilePicker
  if (!profile) {
    return (
      <ThemedAlertProvider>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" backgroundColor={Colors.backgroundDark} />
          <ProfilePickerScreen onProfileSelected={handleProfileSelected} />
        </SafeAreaProvider>
      </ThemedAlertProvider>
    );
  }

  // 3. Profile sélectionné → app principale
  return (
    <ThemedAlertProvider>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={Colors.backgroundDark} />
        <SafeAreaView style={styles.container} edges={['top']}>
          {showNavbar && (
            <Navbar
              currentTab={screen.name === 'tab' ? screen.tab : 'home'}
              onTabPress={(tab) => {
                setScreen({ name: 'tab', tab });
                if (tab === 'home') setHomeReloadKey((k) => k + 1);
              }}
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              onSearchSubmit={handleSearchSubmit}
              profileLetter={profile.name.charAt(0).toUpperCase()}
              profileColor={profile.color}
            />
          )}

          <View style={styles.content}>
            {screen.name === 'tab' && screen.tab === 'home' && (
              <HomeScreen
                key={homeReloadKey}
                profile={profile}
                onAnimePress={handleAnimePress}
                onSeeAllPress={() => setScreen({ name: 'tab', tab: 'catalogue' })}
                onContinueWatchingPress={handleContinueWatchingPress}
              />
            )}

            {screen.name === 'tab' && screen.tab === 'catalogue' && (
              <SearchScreen
                query={searchValue}
                onAnimePress={handleAnimePress}
              />
            )}

            {screen.name === 'tab' && screen.tab === 'profile' && (
              <SettingsScreen
                currentProfile={profile}
                onProfileChanged={(p) => {
                  setProfile(p);
                  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p)).catch(console.warn);
                }}
                onSwitchProfile={handleSwitchProfile}
              />
            )}

            {screen.name === 'detail' && (
              <AnimeDetailScreen
                anime={screen.anime}
                profile={profile}
                onBack={handleBackToHome}
                onPlayEpisode={(seasonNumber, seasonName, episode) =>
                  handlePlayEpisode(screen.anime, seasonNumber, seasonName, episode)
                }
              />
            )}

            {screen.name === 'player' && (
              <PlayerScreen
                anime={screen.anime}
                seasonNumber={screen.seasonNumber}
                seasonName={screen.seasonName}
                episode={screen.episode}
                profileId={profile.id}
                onBack={handleBackToHome}
                onBackToAnime={() => handleBackToDetail(screen.anime)}
                canGoPrev={screen.episode.episode_number > 1}
                canGoNext={true}
                onNavigateEpisode={(dir) => {
                  const anime = screen.anime;
                  const season = (anime.seasons ?? []).find(
                    (s) => s.season_number === screen.seasonNumber
                  );
                  if (!season) return;
                  const eps = [...(season.episodes ?? [])].sort(
                    (a, b) => a.episode_number - b.episode_number
                  );
                  const idx = eps.findIndex(
                    (e) => e.episode_number === screen.episode.episode_number
                  );
                  if (idx === -1) return;
                  const nextIdx = dir === 'next' ? idx + 1 : idx - 1;
                  if (nextIdx < 0 || nextIdx >= eps.length) return;
                  setScreen({
                    name: 'player',
                    anime,
                    seasonNumber: screen.seasonNumber,
                    seasonName: season.name,
                    episode: eps[nextIdx],
                  });
                }}
              />
            )}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </ThemedAlertProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDark,
  },
  content: {
    flex: 1,
  },
});
