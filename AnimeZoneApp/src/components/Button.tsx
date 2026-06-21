/**
 * Button — Variants : primary, outline, warning, auth, nextEpisode
 * Inspiré de .btn / .btn-primary / .btn-outline du style.css original.
 */
import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'react-native-linear-gradient';
import { Colors, Typography, BorderRadius, Shadows, Spacing } from '@/theme';

type Variant = 'primary' | 'outline' | 'warning' | 'auth' | 'nextEpisode' | 'favorite';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: string;          // nom d'icône FontAwesome5 — géré par le parent via <Icon>
  iconNode?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  iconNode,
  loading = false,
  disabled = false,
  fullWidth = false,
  size = 'md',
  style,
  textStyle,
}: ButtonProps) {
  const paddingVertical = size === 'lg' ? 14 : 12;
  const paddingHorizontal = size === 'lg' ? 28 : 24;
  const fontSize = size === 'lg' ? Typography.bodyLarge : Typography.body;

  // Variants using gradient
  if (variant === 'primary' || variant === 'auth' || variant === 'nextEpisode') {
    // V1.7 : primary utilise accent→secondary (rose→violet) au lieu de primary→secondary
    // (violet→violet) car le violet foncé était invisible sur le fond #121212
    const colors =
      variant === 'primary'
        ? [Colors.accent, Colors.secondary]
        : variant === 'auth'
        ? ['#FF6B6B', '#ff9a9a']
        : [Colors.accent, Colors.secondary];
    const shadow =
      variant === 'primary'
        ? Shadows.buttonPrimary
        : variant === 'auth'
        ? Shadows.buttonAuth
        : Shadows.buttonPrimary;

    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed: p }) => [
          styles.wrapper,
          fullWidth && { width: '100%' },
          { opacity: disabled ? 0.5 : 1 },
          style,
        ]}
      >
        {({ pressed: p }) => (
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.gradient,
              {
                paddingVertical,
                paddingHorizontal,
                opacity: p ? 0.85 : 1,
              },
              shadow,
              fullWidth && { width: '100%' },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                {iconNode}
                <Text
                  style={[
                    styles.label,
                    { fontSize, letterSpacing: 1 },
                    textStyle,
                  ]}
                >
                  {label.toUpperCase()}
                </Text>
              </>
            )}
          </LinearGradient>
        )}
      </Pressable>
    );
  }

  // V1.8 : variant 'favorite' — fond rose solide, PAS de bordure, texte blanc.
  // Inverse du 'outline' : quand l'anime est favori, on veut un bouton plein rose
  // bien visible (pas transparent), pour bien marquer l'état "actif".
  if (variant === 'favorite') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed: p }) => [
          styles.solid,
          {
            paddingVertical,
            paddingHorizontal,
            backgroundColor: p ? '#d63670' : Colors.accent,
            borderWidth: 0,           // V1.8 : pas de bordure
            borderColor: 'transparent',
            opacity: disabled ? 0.5 : 1,
          },
          fullWidth && { width: '100%' },
          style,
        ]}
      >
        {({ pressed: p }) =>
          loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              {iconNode}
              <Text
                style={[
                  styles.label,
                  {
                    fontSize,
                    color: '#fff',
                    letterSpacing: 1,
                  },
                  textStyle,
                ]}
              >
                {label.toUpperCase()}
              </Text>
            </>
          )
        }
      </Pressable>
    );
  }

  // Solid / outline variants
  const isOutline = variant === 'outline';
  const isWarning = variant === 'warning';
  const goldColor = '#ffc107';
  const bgColor = isWarning ? goldColor : 'transparent';
  const borderColor = isOutline ? Colors.accent : isWarning ? goldColor : 'transparent';
  const textColor = isOutline ? Colors.accent : isWarning ? '#000' : Colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed: p }) => [
        styles.solid,
        {
          paddingVertical,
          paddingHorizontal,
          backgroundColor: p
            ? isOutline
              ? Colors.accent
              : isWarning
              ? '#e0a800'
              : Colors.backgroundElevated
            : bgColor,
          borderColor,
          opacity: disabled ? 0.5 : 1,
        },
        fullWidth && { width: '100%' },
        style,
      ]}
    >
      {({ pressed: p }) =>
        loading ? (
          <ActivityIndicator color={textColor} size="small" />
        ) : (
          <>
            {iconNode}
            <Text
              style={[
                styles.label,
                {
                  fontSize,
                  color: p && isOutline ? '#fff' : textColor,
                  letterSpacing: 1,
                },
                textStyle,
              ]}
            >
              {label.toUpperCase()}
            </Text>
          </>
        )
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: BorderRadius.pill,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.pill,
  },
  solid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.pill,
    borderWidth: 2,
  },
  label: {
    color: '#fff',
    fontWeight: '600',
    fontFamily: Typography.fontFamilyBold,
  },
});
