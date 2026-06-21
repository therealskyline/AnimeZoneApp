/**
 * AnimeCard — card d'anime fidèle à .anime-card du CSS original.
 *
 * V1.2 :
 *   - Suppression du rating (étoile + X/10) — inutile
 *   - Suppression des tags genres (drama, etc.) — inutiles
 *   - Suppression de la barre de progression (sera gérée par persistance plus tard)
 *   - Les badges VF/VOSTFR restent mais en palette violet/rose (cf LanguageBadge)
 *
 * Adaptation mobile :
 *   - Le hover (translateY -15 + scale 1.02 + shadow profonde) est reproduit
 *     via Pressable pressed state (scale 0.98 + opacity 0.95).
 *   - L'image poster fait 220px en hauteur — width adaptative via numColumns du
 *     FlatList parent.
 */
import React from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { LinearGradient } from 'react-native-linear-gradient';
import { LanguageBadge } from './LanguageBadge';
import { Colors, Typography, BorderRadius, Shadows, Spacing } from '@/theme';
import type { Anime } from '@/types/anime';
import { decodeHtmlEntities } from '@/types/anime';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 3) / 2;

export interface AnimeCardProps {
  anime: Anime;
  variant?: 'default' | 'continueWatch';
  episodeInfo?: { season: number; episode: number; title: string };
  onPress: () => void;
  onRemove?: () => void;
  width?: number;
}

export function AnimeCard({
  anime,
  variant = 'default',
  episodeInfo,
  onPress,
  onRemove,
  width = CARD_WIDTH,
}: AnimeCardProps) {
  const languages: string[] = anime.languages ?? [];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.95 },
      ]}
    >
      {/* Image + overlay */}
      <View style={styles.imageWrapper}>
        {anime.image ? (
          <Image
            source={{ uri: anime.image }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.image, { backgroundColor: '#333' }]} />
        )}

        {/* Gradient fade bas (cf .anime-card::after) */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.imageFade}
        />

        {/* Badge × pour continue watching */}
        {variant === 'continueWatch' && onRemove && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={({ pressed }) => [
              styles.removeButton,
              pressed && { backgroundColor: 'rgba(255,0,0,0.7)', transform: [{ scale: 1.1 }] },
            ]}
            hitSlop={8}
          >
            <Icon name="times" size={14} color="#fff" />
          </Pressable>
        )}

        {/* Overlay play (continue watching seulement) */}
        {variant === 'continueWatch' && (
          <View style={styles.playOverlay}>
            <View style={styles.playBadge}>
              <Icon name="play-circle" size={14} color="#fff" />
              <Text style={styles.playBadgeText}>Regarder</Text>
            </View>
          </View>
        )}

        {/* Languages en haut à gauche */}
        {languages.length > 0 && (
          <View style={styles.langRow}>
            {languages.includes('VF') && <LanguageBadge type="VF" />}
            {languages.includes('VOSTFR') && <LanguageBadge type="VOSTFR" />}
          </View>
        )}
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {decodeHtmlEntities(anime.title)}
        </Text>

        {variant === 'continueWatch' && episodeInfo && (
          <Text style={styles.episodeSubtitle} numberOfLines={1}>
            S{episodeInfo.season}E{episodeInfo.episode}: {decodeHtmlEntities(episodeInfo.title)}
          </Text>
        )}

        {/* Bouton "Regarder" / "Continuer l'épisode" */}
        <View style={styles.actionRow}>
          {variant === 'continueWatch' ? (
            <LinearGradient
              colors={[Colors.accent, Colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.continueBtn}
            >
              <Icon name="play-circle" size={14} color="#fff" />
              <Text style={styles.continueBtnText}>CONTINUER L'ÉPISODE</Text>
            </LinearGradient>
          ) : (
            <View style={styles.outlineBtn}>
              <Text style={styles.outlineBtnText}>REGARDER</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.card,
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    height: 220,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
  },
  removeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  playBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  playBadgeText: {
    color: '#fff',
    fontSize: Typography.small,
    fontWeight: '600',
    fontFamily: Typography.fontFamilyBold,
  },
  langRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    gap: 4,
  },
  body: {
    padding: Spacing.md,
  },
  title: {
    fontSize: Typography.bodyLarge,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamilyBold,
    marginBottom: Spacing.sm,
    minHeight: Typography.bodyLarge * 2,
  },
  episodeSubtitle: {
    fontSize: Typography.small,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  actionRow: {
    marginTop: 4,
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderRadius: BorderRadius.pill,
    paddingVertical: 8,
    alignItems: 'center',
  },
  outlineBtnText: {
    color: Colors.accent,
    fontSize: Typography.small,
    fontWeight: '600',
    letterSpacing: 1,
    fontFamily: Typography.fontFamilyBold,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
  },
  continueBtnText: {
    color: '#fff',
    fontSize: Typography.small,
    fontWeight: '600',
    letterSpacing: 1,
    fontFamily: Typography.fontFamilyBold,
  },
});
