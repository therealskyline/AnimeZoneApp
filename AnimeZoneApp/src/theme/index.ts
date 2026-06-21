/**
 * Thème AnimeZone — palette + typographie + spacing fidèles au site original.
 * Source : brief de design extrait de /home/z/my-project/AnimeZone/static/css/style.css
 *
 * V1.2 : suppression des couleurs verte (VF) et bleue (VOSTFR) — sur le site
 * d'origine les badges langue utilisent un style neutre. On ne garde que la
 * palette violet/rose + gris sombre.
 * Suppression aussi du gold (rating) et des couleurs "completed/inProgress"
 * puisque les notes et progress bars sont retirées de l'UI.
 */

export const Colors = {
  // Backgrounds
  backgroundDark: '#121212',
  backgroundCard: '#1e1e1e',
  backgroundElevated: '#252525',

  // Brand
  primary: '#6a1b9a',     // violet foncé — gradient start
  secondary: '#9c27b0',   // violet clair — gradient end
  accent: '#ff4081',      // rose magenta — accent principal

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#b3b3b3',
  textMuted: '#757575',

  // Borders / shadows
  border: '#333333',
  shadow: 'rgba(0,0,0,0.5)',
  overlayLight: 'rgba(255,255,255,0.1)',
  overlayCard: 'rgba(30,30,30,0.5)',
  overlayCardHover: 'rgba(50,50,50,0.8)',

  // Saison films (season 99)
  films: '#9b59b6',
  filmsHover: '#8e44ad',

  // Kai — bleu maintenu car c'est la signature visuelle Kai dans le site original
  kai: '#3498db',

  // V1.3 : saison active en palette violet/rose (au lieu du bleu `rgba(0,123,255,...)`
  // qui jure avec le reste du thème). On utilise le primary (violet) avec opacité.
  seasonActive: 'rgba(106, 27, 154, 0.6)',         // primary à 60%
  seasonActiveBorder: 'rgba(255, 64, 129, 0.9)',   // accent

  // Erreur
  error: '#dc3545',
  errorText: '#ff6b6b',
  errorBg: 'rgba(220,53,69,0.15)',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 64,
} as const;

export const Typography = {
  // Font family — Montserrat sera chargée via expo-google-fonts plus tard.
  // En attendant, RN fallback sur System qui rend correctement.
  fontFamily: 'Montserrat',
  fontFamilyBold: 'Montserrat-Bold',

  // Tailles (en px, conversion depuis le brief rem → px, ajustées mobile)
  heroTitle: 36,
  h1: 28,
  h2: 24,
  h3: 20,
  h4: 18,
  body: 14,
  bodyLarge: 16,
  small: 12,
  tiny: 10,
  error: 80,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 15,
  pill: 50,
  circle: 999,
} as const;

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 6,
  },
  cardHover: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 12,
  },
  buttonPrimary: {
    shadowColor: '#6a1b9a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonAuth: {
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 5,
  },
  navbar: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  dropdown: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;
