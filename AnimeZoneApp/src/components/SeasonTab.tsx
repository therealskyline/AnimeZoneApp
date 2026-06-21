/**
 * SeasonTab — bouton d'onglet saison (V1.5).
 *
 * États :
 *   - default : bg rgba(30,30,30,0.5)
 *   - active  : fond violet plein + bordure rose (plus net que le semi-transparent V1.4)
 *   - Films (seasonNumber === 99) : bg violet #9b59b6
 *   - Kai (name contient "Kai") : badge bleu #3498db à côté du label
 *
 * V1.5 : retiré le minWidth pour que les boutons longs ("Saison 1 Director's Cut")
 * s'adaptent, et le fond actif est opaque au lieu de 60% pour mieux le
 * distinguer des autres.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '@/theme';

interface SeasonTabProps {
  seasonNumber: number;
  name?: string;
  isActive: boolean;
  onPress: () => void;
}

export function SeasonTab({ seasonNumber, name, isActive, onPress }: SeasonTabProps) {
  const isFilms = seasonNumber === 99;
  const isKai = (name ?? '').includes('Kai');

  // Background logic — V1.5 : actif opaque pour plus de contraste
  const bgColor = isActive
    ? Colors.primary              // violet plein quand actif
    : isFilms
    ? Colors.films
    : 'rgba(30,30,30,0.5)';

  const borderColor = isActive
    ? Colors.accent               // bordure rose pleine quand actif
    : isFilms
    ? Colors.films
    : 'rgba(255,255,255,0.1)';

  // Label
  let label: string;
  if (isFilms) {
    label = 'Films';
  } else if (name) {
    label = name;
  } else {
    label = `Saison ${seasonNumber}`;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        {
          backgroundColor: pressed
            ? isFilms
              ? Colors.filmsHover
              : 'rgba(50,50,50,0.8)'
            : bgColor,
          borderColor,
          borderWidth: isActive ? 2 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          isActive && { color: '#fff', fontWeight: '700' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {isKai && (
        <View style={styles.kaiBadge}>
          <Text style={styles.kaiBadgeText}>KAI</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    // V1.5 : pas de minWidth pour s'adapter aux longs labels
  },
  label: {
    color: Colors.textPrimary,
    fontWeight: '500',
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
  },
  kaiBadge: {
    backgroundColor: Colors.kai,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },
  kaiBadgeText: {
    color: '#fff',
    fontSize: Typography.tiny,
    fontWeight: 'bold',
    fontFamily: Typography.fontFamilyBold,
  },
});
