/**
 * LanguageBadge — pill VF / VOSTFR en style neutre violet/rose.
 * V1.2 : retrait des couleurs verte/bleue pour rester fidèle au site original
 * qui n'utilise que la palette violet/rose.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '@/theme';

export function LanguageBadge({ type }: { type: 'VF' | 'VOSTFR' }) {
  // VF : accent (rose), VOSTFR : secondary (violet clair) — on reste dans la palette.
  const bg = type === 'VF' ? Colors.accent : Colors.secondary;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.text}>{type}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },
  text: {
    color: '#fff',
    fontSize: Typography.small,
    fontWeight: 'bold',
    fontFamily: Typography.fontFamilyBold,
  },
});
