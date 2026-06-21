/**
 * Navbar — header sticky fidèle à .navbar du CSS original.
 *
 * V1.7 : l'avatar en haut à droite affiche maintenant la 1ère lettre du
 * profile courant, avec un gradient correspondant à la couleur du profile.
 *
 * Contient :
 *   - Logo "AnimeZone" (gradient text)
 *   - Liens Accueil / Catalogue
 *   - SearchBar (sous le logo, dédiée mobile)
 *   - User avatar (1ère lettre du profile)
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'react-native-linear-gradient';
import { SearchBar } from './SearchBar';
import { Colors, Typography, Spacing, Shadows } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Doit matcher AVATAR_COLORS de ProfilePickerScreen / SettingsScreen
const AVATAR_COLORS: [string, string][] = [
  ['#ff4081', '#9c27b0'],
  ['#03a9f4', '#3f51b5'],
  ['#4caf50', '#1b5e20'],
  ['#ff9800', '#e65100'],
  ['#9c27b0', '#3f51b5'],
  ['#f44336', '#b71c1c'],
];

interface NavbarProps {
  currentTab: 'home' | 'catalogue' | 'profile';
  onTabPress: (tab: 'home' | 'catalogue' | 'profile') => void;
  searchValue: string;
  onSearchChange: (t: string) => void;
  onSearchSubmit: () => void;
  /** V1.7 : 1ère lettre du profile courant (uppercase). */
  profileLetter?: string;
  /** V1.7 : index 0-5 dans la palette AVATAR_COLORS pour le gradient de l'avatar. */
  profileColor?: number;
}

export function Navbar({
  currentTab,
  onTabPress,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  profileLetter = '?',
  profileColor = 0,
}: NavbarProps) {
  const [c1, c2] = AVATAR_COLORS[profileColor % AVATAR_COLORS.length];

  return (
    <View style={[styles.wrapper, Shadows.navbar]}>
      <View style={styles.row}>
        {/* Logo */}
        <Pressable onPress={() => onTabPress('home')} style={styles.logoBtn}>
          <Text style={styles.logo}>
            Anime
            <Text style={styles.logoAccent}>Zone</Text>
          </Text>
        </Pressable>

        {/* Nav tabs (condensé) */}
        <View style={styles.navTabs}>
          <NavTab
            label="Accueil"
            active={currentTab === 'home'}
            onPress={() => onTabPress('home')}
          />
          <NavTab
            label="Catalogue"
            active={currentTab === 'catalogue'}
            onPress={() => onTabPress('catalogue')}
          />
        </View>

        {/* User avatar — V1.7 : lettre + couleur du profile */}
        <Pressable
          onPress={() => onTabPress('profile')}
          style={({ pressed }) => [
            styles.avatarWrapper,
            pressed && { transform: [{ scale: 1.05 }] },
          ]}
        >
          <LinearGradient
            colors={[c1, c2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarLetter}>{profileLetter}</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Search row (sous le logo, dédiée mobile) */}
      <View style={styles.searchRow}>
        <SearchBar
          value={searchValue}
          onChangeText={onSearchChange}
          onSubmit={onSearchSubmit}
        />
      </View>
    </View>
  );
}

function NavTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.navTab}>
      <Text
        style={[
          styles.navTabText,
          active && { color: Colors.accent },
        ]}
      >
        {label}
      </Text>
      {active && <View style={styles.navTabUnderline} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'rgba(18,18,18,0.95)',
    paddingTop: Spacing.sm,
    paddingBottom: 0,
    paddingHorizontal: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
  },
  logoBtn: {
    paddingVertical: 6,
  },
  logo: {
    fontSize: Typography.h3,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamilyBold,
  },
  logoAccent: {
    color: Colors.accent,
  },
  navTabs: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  navTab: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  navTabText: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
  },
  navTabUnderline: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 2,
    backgroundColor: Colors.accent,
    borderRadius: 1,
  },
  avatarWrapper: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#fff',
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
    fontSize: Typography.body,
  },
  searchRow: {
    paddingBottom: Spacing.sm,
    paddingTop: 4,
  },
});
