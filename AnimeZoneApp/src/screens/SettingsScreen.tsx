/**
 * SettingsScreen — paramètres du profile courant.
 *
 * Sections :
 *   1. Profile courant : avatar + nom éditable (rename)
 *   2. Switch profile : bouton pour changer de profile (retour au ProfilePicker)
 *   3. Liste des profiles : pour switcher directement, ou supprimer
 *   4. Stats du catalogue (debug)
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { AnimeZoneBridge } from '@/services/AnimeZoneBridge';
import type { Profile } from '@/services/AnimeZoneBridge';
import { Colors, Typography, BorderRadius, Shadows, Spacing } from '@/theme';
import { useThemedAlert } from '@/components/ThemedAlert';

const AVATAR_COLORS: [string, string][] = [
  ['#ff4081', '#9c27b0'],
  ['#03a9f4', '#3f51b5'],
  ['#4caf50', '#1b5e20'],
  ['#ff9800', '#e65100'],
  ['#9c27b0', '#3f51b5'],
  ['#f44336', '#b71c1c'],
];
function colorForIndex(idx: number): [string, string] {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

interface SettingsScreenProps {
  currentProfile: Profile;
  onProfileChanged: (profile: Profile) => void;
  onSwitchProfile: () => void;
}

export function SettingsScreen({
  currentProfile,
  onProfileChanged,
  onSwitchProfile,
}: SettingsScreenProps) {
  const themedAlert = useThemedAlert();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(currentProfile.name);
  const [stats, setStats] = useState<{
    totalAnimes: number;
    totalEpisodes: number;
    totalUrls: number;
    dbSizeBytes: number;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        AnimeZoneBridge.listProfiles(),
        AnimeZoneBridge.getCatalogStats(),
      ]);
      setProfiles(list);
      setStats(s);
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
    loadData();
  }, []);

  const handleRename = async () => {
    const name = newName.trim();
    if (!name) {
      themedAlert.show({
        title: 'Erreur',
        message: 'Le nom ne peut pas être vide',
        confirmLabel: 'OK',
      });
      return;
    }
    if (name === currentProfile.name) {
      setEditingName(false);
      return;
    }
    try {
      await AnimeZoneBridge.renameProfile(currentProfile.id, name);
      onProfileChanged({ ...currentProfile, name });
      setEditingName(false);
      themedAlert.show({
        title: '✓',
        message: 'Nom modifié',
        confirmLabel: 'OK',
      });
      loadData();
    } catch (e: any) {
      themedAlert.show({
        title: 'Erreur',
        message: e.message,
        confirmLabel: 'OK',
      });
    }
  };

  const handleSwitchTo = (profile: Profile) => {
    if (profile.id === currentProfile.id) return;
    onProfileChanged(profile);
  };

  const handleDelete = (profile: Profile) => {
    themedAlert.show({
      title: 'Supprimer le profile',
      message: `Supprimer "${profile.name}" ? Les favoris et l'historique de visionnage de ce profile seront perdus.`,
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      destructive: true,
      onConfirm: async () => {
        try {
          await AnimeZoneBridge.deleteProfile(profile.id);
          if (profile.id === currentProfile.id) {
            onSwitchProfile();
          } else {
            loadData();
          }
        } catch (e: any) {
          themedAlert.show({
            title: 'Erreur',
            message: e.message,
            confirmLabel: 'OK',
          });
        }
      },
    });
  };

  const [c1, c2] = colorForIndex(currentProfile.color);

  const handleChangeColor = async (newColor: number) => {
    if (newColor === currentProfile.color) return;
    try {
      await AnimeZoneBridge.updateProfileColor(currentProfile.id, newColor);
      const updated = { ...currentProfile, color: newColor };
      onProfileChanged(updated);
      loadData();
    } catch (e: any) {
      themedAlert.show({
        title: 'Erreur',
        message: e.message,
        confirmLabel: 'OK',
      });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <FlatList
        data={[1]}
        keyExtractor={() => 'root'}
        renderItem={() => null}
        ListHeaderComponent={
          <View style={styles.container}>
            {/* === Section 1 : Profile courant === */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Profile courant</Text>
              <View style={styles.currentProfileCard}>
                <LinearGradient
                  colors={[c1, c2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.currentAvatar}
                >
                  <Text style={styles.currentAvatarText}>
                    {currentProfile.name.charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>

                {editingName ? (
                  <View style={styles.editRow}>
                    <TextInput
                      style={styles.nameInput}
                      value={newName}
                      onChangeText={setNewName}
                      autoFocus
                      maxLength={20}
                      onSubmitEditing={handleRename}
                    />
                    <Pressable onPress={handleRename} style={styles.iconBtn}>
                      <Icon name="check" size={16} color={Colors.accent} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditingName(false);
                        setNewName(currentProfile.name);
                      }}
                      style={styles.iconBtn}
                    >
                      <Icon name="times" size={16} color={Colors.textMuted} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.editRow}>
                    <Text style={styles.currentName}>{currentProfile.name}</Text>
                    <Pressable
                      onPress={() => {
                        setNewName(currentProfile.name);
                        setEditingName(true);
                      }}
                      style={styles.iconBtn}
                    >
                      <Icon name="pen" size={14} color={Colors.accent} />
                    </Pressable>
                  </View>
                )}
              </View>

              <Pressable
                onPress={onSwitchProfile}
                style={({ pressed }) => [
                  styles.switchBtn,
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
              >
                <Icon name="exchange-alt" size={14} color={Colors.accent} />
                <Text style={styles.switchBtnText}>Changer de profile</Text>
              </Pressable>

              {/* V1.6 : bouton random pour changer la couleur de l'avatar (cycle au tap) */}
              <Pressable
                onPress={() => handleChangeColor((currentProfile.color + 1) % AVATAR_COLORS.length)}
                style={({ pressed }) => [
                  styles.switchBtn,
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
              >
                <Icon name="sync-alt" size={14} color={Colors.accent} />
                <Text style={styles.switchBtnText}>Changer la couleur de l'avatar</Text>
              </Pressable>
            </View>

            {/* === Section 2 : Tous les profiles === */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tous les profiles ({profiles.length})</Text>
              {profiles.map((p) => {
                const [pc1, pc2] = colorForIndex(p.color);
                const isCurrent = p.id === currentProfile.id;
                return (
                  <View
                    key={p.id}
                    style={[styles.profileRow, isCurrent && styles.profileRowCurrent]}
                  >
                    <Pressable
                      onPress={() => handleSwitchTo(p)}
                      style={({ pressed }) => [
                        styles.profileRowLeft,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <LinearGradient
                        colors={[pc1, pc2]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.miniAvatar}
                      >
                        <Text style={styles.miniAvatarText}>
                          {p.name.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
                      <Text style={styles.profileName}>{p.name}</Text>
                      {isCurrent && (
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>ACTIF</Text>
                        </View>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(p)}
                      style={styles.deleteBtn}
                      hitSlop={8}
                    >
                      <Icon name="trash" size={14} color={Colors.errorText} />
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {/* === Section 3 : Stats catalogue === */}
            {stats && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Catalogue</Text>
                <View style={styles.statsCard}>
                  <StatRow label="Animes" value={stats.totalAnimes.toLocaleString('fr-FR')} />
                  <StatRow label="Épisodes" value={stats.totalEpisodes.toLocaleString('fr-FR')} />
                  <StatRow label="URLs vidéo" value={stats.totalUrls.toLocaleString('fr-FR')} />
                  <StatRow
                    label="Taille DB"
                    value={`${(stats.dbSizeBytes / 1024 / 1024).toFixed(1)} Mo`}
                    last
                  />
                </View>
              </View>
            )}

            {/* === Section 4 : À propos === */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>À propos</Text>
              <View style={styles.statsCard}>
                <StatRow label="Application" value="AnimeZone Mobile" />
                <StatRow label="Version" value="1.4" />
                <StatRow label="Plateforme" value="Android" last />
              </View>
            </View>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

function StatRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.statRow, !last && styles.statRowBorder]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: Typography.small,
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  currentProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  currentAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  currentAvatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    fontFamily: Typography.fontFamilyBold,
  },
  editRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  currentName: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.h3,
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
  },
  nameInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.h3,
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.accent,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlayLight,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderRadius: BorderRadius.pill,
  },
  switchBtnText: {
    color: Colors.accent,
    fontSize: Typography.body,
    fontWeight: '600',
    fontFamily: Typography.fontFamilyBold,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  profileRowCurrent: {
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  profileRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  miniAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  miniAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: Typography.fontFamilyBold,
  },
  profileName: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
  },
  currentBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
    marginLeft: Spacing.sm,
  },
  currentBadgeText: {
    color: '#fff',
    fontSize: Typography.tiny,
    fontWeight: 'bold',
    fontFamily: Typography.fontFamilyBold,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlayLight,
  },
  statsCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xs,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  statRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: Typography.body,
    fontWeight: '600',
    fontFamily: Typography.fontFamilyBold,
  },
});
