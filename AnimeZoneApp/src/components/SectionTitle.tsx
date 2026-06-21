/**
 * SectionTitle — h2 centré avec underline gradient (cf .section-title::after).
 * Le gradient est reproduit via LinearGradient en absolute positionné sous le texte.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'react-native-linear-gradient';
import { Colors, Typography, Spacing } from '@/theme';

export function SectionTitle({ text, align = 'center' }: { text: string; align?: 'center' | 'left' }) {
  return (
    <View style={[styles.wrapper, align === 'center' && { alignItems: 'center' }]}>
      <Text style={styles.title}>{text}</Text>
      <LinearGradient
        colors={[Colors.primary, Colors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.underline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.xl,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: Typography.h2,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamilyBold,
    marginBottom: 12,
  },
  underline: {
    width: 100,
    height: 3,
    borderRadius: 2,
  },
});
