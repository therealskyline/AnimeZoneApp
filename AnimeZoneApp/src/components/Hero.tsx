/**
 * Hero — section d'accueil avec titre gradient + sous-titre + CTA.
 * Miroir de .hero / .hero-title / .hero-subtitle du CSS original.
 *
 * Adaptation mobile :
 *   - minHeight réduite à 320 (vs 500 desktop) pour ne pas gaspiller l'écran
 *   - Le background SVG animé est remplacé par un LinearGradient violet/rose
 *     avec overlay sombre (l'animation 8s infinite est omise pour économie batterie)
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'react-native-linear-gradient';
import { Button } from './Button';
import { Colors, Typography, Spacing } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HeroProps {
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCtaPress: () => void;
}

export function Hero({ title, subtitle, ctaLabel, onCtaPress }: HeroProps) {
  return (
    <View style={styles.wrapper}>
      {/* Background gradient violet animé (équivalent .hero::before) */}
      <LinearGradient
        colors={[Colors.backgroundDark, '#1a0d2e', Colors.backgroundDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgGradient}
      />
      <LinearGradient
        colors={[Colors.primary, Colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgAccent}
      />
      {/* Overlay sombre pour lisibilité */}
      <View style={styles.overlay} />

      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.ctaRow}>
          <Button label={ctaLabel} onPress={onCtaPress} variant="primary" size="lg" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    minHeight: 320,
    width: SCREEN_WIDTH,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  bgGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bgAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.15,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  title: {
    fontSize: Typography.heroTitle,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamilyBold,
    textAlign: 'center',
    marginBottom: Spacing.md,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: Typography.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 600,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  ctaRow: {
    alignItems: 'center',
  },
});
