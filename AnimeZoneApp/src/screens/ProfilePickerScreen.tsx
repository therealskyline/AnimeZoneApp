/**
 * ProfilePickerScreen — sélection/création de profile style Netflix (V1.5).
 *
 * V1.5 : au-dessus de l'input, on affiche un grand avatar preview en gradient
 * qui montre en live :
 *   - La 1ère lettre du pseudo en train d'être tapé
 *   - La couleur sélectionnée (cycle au tap sur l'avatar)
 *
 * L'utilisateur peut donc personnaliser son avatar avant de valider.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { LinearGradient } from 'react-native-linear-gradient';
import { AnimeZoneBridge } from '@/services/AnimeZoneBridge';
import type { Profile } from '@/services/AnimeZoneBridge';
import { Colors, Typography, BorderRadius, Shadows, Spacing } from '@/theme';
import { useThemedAlert } from '@/components/ThemedAlert';

// Palette de couleurs pour les avatars — doit matcher AVATAR_COLORS côté SettingsScreen.
export const AVATAR_COLORS: [string, string][] = [
  ['#ff4081', '#9c27b0'],  // 0 — rose/violet
  ['#03a9f4', '#3f51b5'],  // 1 — bleu
  ['#4caf50', '#1b5e20'],  // 2 — vert
  ['#ff9800', '#e65100'],  // 3 — orange
  ['#9c27b0', '#3f51b5'],  // 4 — violet foncé
  ['#f44336', '#b71c1c'],  // 5 — rouge
];

function colorForIndex(idx: number): [string, string] {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

interface ProfilePickerScreenProps {
  onProfileSelected: (profile: Profile) => void;
}

export function ProfilePickerScreen({ onProfileSelected }: ProfilePickerScreenProps) {
  const themedAlert = useThemedAlert();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [colorIdx, setColorIdx] = useState(0);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const list = await AnimeZoneBridge.listProfiles();
      setProfiles(list);
      if (list.length === 0) setShowCreate(true);
    } catch (e: any) {
      themedAlert.show({
        title: 'Erreur',
        message: e.message,
        confirmLabel: 'OK',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const cycleColor = () => {
    setColorIdx((i) => (i + 1) % AVATAR_COLORS.length);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      themedAlert.show({
        title: 'Erreur',
        message: 'Le nom ne peut pas être vide',
        confirmLabel: 'OK',
      });
      return;
    }
    try {
      const id = await AnimeZoneBridge.createProfile(name, colorIdx);
      const newProfile: Profile = {
        id,
        name,
        createdAt: Date.now(),
        color: colorIdx,
      };
      onProfileSelected(newProfile);
    } catch (e: any) {
      themedAlert.show({
        title: 'Erreur',
        message: e.message,
        confirmLabel: 'OK',
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  const [previewC1, previewC2] = colorForIndex(colorIdx);
  const previewInitial = newName.trim().charAt(0).toUpperCase() || '?';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>
            Anime<Text style={styles.logoAccent}>Zone</Text>
          </Text>
          <Text style={styles.subtitle}>
            {profiles.length === 0
              ? 'Crée ton premier profile pour commencer'
              : 'Qui regarde ?'}
          </Text>
        </View>

        {!showCreate ? (
          <>
            <FlatList
              data={profiles}
              keyExtractor={(item) => String(item.id)}
              numColumns={2}
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => {
                const [c1, c2] = colorForIndex(item.color);
                const initial = item.name.charAt(0).toUpperCase();
                return (
                  <Pressable
                    onPress={() => onProfileSelected(item)}
                    style={({ pressed }) => [
                      styles.profileCard,
                      pressed && { transform: [{ scale: 0.95 }] },
                    ]}
                  >
                    <LinearGradient
                      colors={[c1, c2]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatar}
                    >
                      <Text style={styles.avatarText}>{initial}</Text>
                    </LinearGradient>
                    <Text style={styles.profileName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
            <Pressable
              onPress={() => {
                setNewName('');
                setColorIdx(0);
                setShowCreate(true);
              }}
              style={({ pressed }) => [
                styles.addProfileBtn,
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
            >
              <Icon name="plus" size={20} color={Colors.accent} />
              <Text style={styles.addProfileText}>Ajouter un profile</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.createForm}>
            {/* V1.6 : avatar preview — juste le bouton random, plus de palette */}
            <View style={styles.previewWrap}>
              <Pressable onPress={cycleColor} style={styles.previewPressable}>
                <LinearGradient
                  colors={[previewC1, previewC2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.previewAvatar}
                >
                  <Text style={styles.previewAvatarText}>{previewInitial}</Text>
                </LinearGradient>
                <View style={styles.colorCycleHint}>
                  <Icon name="sync-alt" size={12} color={Colors.textSecondary} />
                </View>
              </Pressable>
              <Text style={styles.previewHint}>
                Tape sur l'avatar pour changer la couleur
              </Text>
            </View>

            <Text style={styles.formLabel}>Nom du profile</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholderTextColor={Colors.textMuted}
              autoFocus
              maxLength={20}
              onSubmitEditing={handleCreate}
            />
            <View style={styles.formActions}>
              {profiles.length > 0 && (
                <Pressable
                  onPress={() => setShowCreate(false)}
                  style={[styles.btnSecondary, { marginRight: Spacing.md }]}
                >
                  <Text style={styles.btnSecondaryText}>Annuler</Text>
                </Pressable>
              )}
              <Pressable onPress={handleCreate} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryText}>Créer</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDark,
    paddingHorizontal: Spacing.lg,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.backgroundDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamilyBold,
  },
  logoAccent: { color: Colors.accent },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.bodyLarge,
    marginTop: Spacing.sm,
  },
  grid: {
    paddingVertical: Spacing.xl,
  },
  profileCard: {
    flex: 1,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    ...Shadows.card,
  },
  avatarText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '800',
    fontFamily: Typography.fontFamilyBold,
  },
  profileName: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
  },
  addProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderRadius: BorderRadius.pill,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  addProfileText: {
    color: Colors.accent,
    fontSize: Typography.body,
    fontWeight: '600',
    fontFamily: Typography.fontFamilyBold,
  },
  // === V1.5 : createForm avec preview avatar ===
  createForm: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    alignItems: 'stretch',
  },
  previewWrap: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    marginTop: Spacing.lg,
  },
  previewPressable: {
    position: 'relative',
  },
  previewAvatar: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  previewAvatarText: {
    color: '#fff',
    fontSize: 56,
    fontWeight: '800',
    fontFamily: Typography.fontFamilyBold,
  },
  colorCycleHint: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.backgroundDark,
  },
  previewHint: {
    color: Colors.textMuted,
    fontSize: Typography.small,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  formLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    marginBottom: Spacing.sm,
    fontFamily: Typography.fontFamily,
  },
  input: {
    backgroundColor: Colors.backgroundElevated,
    color: Colors.textPrimary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.bodyLarge,
    marginBottom: Spacing.lg,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  btnSecondary: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnSecondaryText: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    fontWeight: '600',
  },
  btnPrimary: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.pill,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: Typography.body,
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
  },
});
