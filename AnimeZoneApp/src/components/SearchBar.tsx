/**
 * SearchBar — input pill avec icône loupe, fond rgba(255,255,255,0.1).
 * Miroir de .search-input / .search-button.
 */
import React from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { Colors, Typography, BorderRadius, Spacing } from '@/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
}

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Rechercher un anime... (Entrée pour valider)',
  style,
  autoFocus = false,
}: SearchBarProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable onPress={onSubmit} style={styles.button} hitSlop={8}>
        <Icon name="search" size={16} color={Colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.overlayLight,
    borderRadius: BorderRadius.pill,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    height: 44,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    paddingVertical: 0,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
