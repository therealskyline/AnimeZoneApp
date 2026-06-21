/**
 * EpisodeRow — item d'épisode fidèle à .episode-item / .episode-link.
 *
 * V1.2 : suppression de la barre de progression et du badge "Terminé" (couleur
 * verte) — la persistance utilisateur viendra plus tard. On garde juste :
 * numéro, titre, badges VF/VOSTFR, description, et icône play/film.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { LanguageBadge } from './LanguageBadge';
import { Colors, Typography, BorderRadius, Spacing } from '@/theme';

export interface EpisodeRowProps {
  episodeNumber: number;
  title: string;
  description?: string;
  languages: string[];
  isMovie?: boolean;
  onPress: () => void;
}

export function EpisodeRow({
  episodeNumber,
  title,
  description,
  languages,
  isMovie = false,
  onPress,
}: EpisodeRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        pressed && {
          transform: [{ scale: 0.99 }],
          backgroundColor: 'rgba(50,50,50,0.7)',
        },
      ]}
    >
      <View style={styles.numberCircle}>
        <Text style={styles.numberText}>{episodeNumber}</Text>
      </View>

      <View style={styles.details}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {languages.includes('VF') && <LanguageBadge type="VF" />}
          {languages.includes('VOSTFR') && <LanguageBadge type="VOSTFR" />}
        </View>

        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>

      <View style={styles.iconCol}>
        <Icon
          name={isMovie ? 'film' : 'play-circle'}
          size={22}
          color={Colors.accent}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: 'rgba(30,30,30,0.5)',
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  numberCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    // V1.3 : cohérent avec la palette violet/rose du site (au lieu du bleu).
    backgroundColor: 'rgba(255, 64, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  numberText: {
    color: Colors.accent,
    fontWeight: 'bold',
    fontFamily: Typography.fontFamilyBold,
    fontSize: Typography.body,
  },
  details: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.body,
    fontWeight: '600',
    fontFamily: Typography.fontFamilyBold,
    flexShrink: 1,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: Typography.small,
    lineHeight: 18,
  },
  iconCol: {
    marginLeft: Spacing.sm,
  },
});
