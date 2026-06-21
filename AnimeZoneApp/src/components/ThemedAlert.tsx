/**
 * ThemedAlert — modale personnalisée au thème AnimeZone (V1.8).
 *
 * Remplace les Alert.alert natifs Android qui étaient moches (popup blanche
 * avec boutons bleus par défaut). Ici on a une modal dark avec overlay,
 * boutons thématiques (annuler en outline, confirmer en primary rose).
 *
 * Usage :
 *   const alert = useThemedAlert();
 *   alert.show({
 *     title: 'Supprimer le profile',
 *     message: 'Voulez-vous vraiment supprimer ce profile ?',
 *     confirmLabel: 'Supprimer',
 *     destructive: true,
 *     onConfirm: () => { ... },
 *   });
 *
 * Pour les alertes simples (juste un message + OK) :
 *   alert.show({ title: 'Erreur', message: '...', confirmLabel: 'OK' });
 */
import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  BackHandler,
} from 'react-native';
import { LinearGradient } from 'react-native-linear-gradient';
import { Colors, Typography, BorderRadius, Shadows, Spacing } from '@/theme';

interface ThemedAlertOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;     // bouton confirm en rouge au lieu de rose
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface ThemedAlertContextValue {
  show: (opts: ThemedAlertOptions) => void;
  hide: () => void;
}

const ThemedAlertContext = createContext<ThemedAlertContextValue | null>(null);

export function useThemedAlert(): ThemedAlertContextValue {
  const ctx = useContext(ThemedAlertContext);
  if (!ctx) {
    // Fallback silencieux si pas de provider — évite un crash en dev
    return {
      show: (opts) => console.warn('[ThemedAlert] Pas de provider. Affichage fallback:', opts.title),
      hide: () => {},
    };
  }
  return ctx;
}

export function ThemedAlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState<ThemedAlertOptions | null>(null);

  const show = useCallback((o: ThemedAlertOptions) => {
    setOpts(o);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    setOpts(null);
  }, []);

  const handleConfirm = () => {
    const cb = opts?.onConfirm;
    hide();
    cb?.();
  };

  const handleCancel = () => {
    const cb = opts?.onCancel;
    hide();
    cb?.();
  };

  // Back Android ferme la modale
  React.useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCancel();
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  const isDestructive = opts?.destructive ?? false;
  const confirmColor = isDestructive ? '#dc3545' : Colors.accent;
  const confirmColorPressed = isDestructive ? '#b02a37' : '#d63670';

  return (
    <ThemedAlertContext.Provider value={{ show, hide }}>
      {children}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.title}>{opts?.title ?? ''}</Text>
            {opts?.message ? (
              <Text style={styles.message}>{opts.message}</Text>
            ) : null}

            <View style={styles.actions}>
              {opts?.cancelLabel !== undefined && (
                <Pressable
                  onPress={handleCancel}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnOutline,
                    pressed && { backgroundColor: 'rgba(255,255,255,0.05)' },
                  ]}
                >
                  <Text style={styles.btnOutlineText}>
                    {opts.cancelLabel}
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={handleConfirm}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnConfirm,
                  {
                    backgroundColor: pressed ? confirmColorPressed : confirmColor,
                  },
                ]}
              >
                <Text style={styles.btnConfirmText}>
                  {opts?.confirmLabel ?? 'OK'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedAlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.dropdown,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.h4,
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
    marginBottom: Spacing.sm,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'flex-end',
  },
  btn: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
    minWidth: 90,
    alignItems: 'center',
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnOutlineText: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    fontWeight: '600',
    fontFamily: Typography.fontFamilyBold,
  },
  btnConfirm: {
    // backgroundColor défini inline selon destructive
  },
  btnConfirmText: {
    color: '#fff',
    fontSize: Typography.body,
    fontWeight: '700',
    fontFamily: Typography.fontFamilyBold,
  },
});
