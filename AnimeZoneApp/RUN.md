# AnimeZoneApp — Projet React Native buildable

Projet React Native 0.86 avec UI fidèle au site AnimeZone original.
Stack : RN + Kotlin native module + SQLite pré-buildée + react-native-video.

## V1.9 — changements

### Bug 1 — Reprise de lecture vidéo
Inspiré du site original (`player.html` lignes 521-528) qui fait :
```js
hlsPlayerElement.addEventListener('loadedmetadata', () => {
    const savedTime = {{ time_position }};
    if (savedTime > 0 && savedTime < hlsPlayerElement.duration) {
        hlsPlayerElement.currentTime = savedTime;
    }
});
```

**Cause du bug** : race condition entre le `useEffect` async (qui charge la position depuis la DB) et le `onLoad` du `<Video>` qui peut se déclencher AVANT que `setResumePosition` ait re-rendered. Sans ref, `onLoad` lit `resumePosition` state qui est encore à 0.

**Fix** :
- Nouveau `resumePositionRef = useRef<number>(0)` mis à jour immédiatement dans le useEffect (en plus du state)
- `onLoad` lit `resumePositionRef.current` au lieu de `resumePosition` state
- Nouveau `hasSeekedRef = useRef<boolean>(false)` pour éviter un double seek
- Nouveau handler `onReadyForDisplay` comme backup : si le seek au `onLoad` a échoué (HLS pas encore prêt), on retente quand la 1ère frame est rendue
- Délai du seek passé de 300ms à 500ms (HLS met du temps à charger les segments à la position demandée)
- Logs détaillés : `[PlayerScreen] ✓ Reprise à 123456ms (onLoad)` ou `(onReadyForDisplay)` pour debug

### Bug 2 — Sibnet ne marche pas
Le code Python original (`routes.py` lignes 122-142) utilisait des regex larges `["']([^"']+\.m3u8[^"']*)["']` sans Referer spécifique. En Kotlin on avait la même approche, mais Sibnet rejette souvent les requêtes sans Referer valide, et peut renvoyer une version allégée de la page sans le player JW.

**Fix** :
- Nouvelle méthode `HttpClient.fetchTextWithHeaders(url, referer, acceptLanguage)` qui accepte des headers custom
- `extractSibnetVideo` utilise maintenant :
  - Referer `https://video.sibnet.ru/` (au lieu du fake `animezone.example/`)
  - Accept-Language `ru-RU,ru;q=0.9,en;q=0.5` (Sibnet est russe)
- Regex plus ciblées, par ordre de priorité :
  1. JW Player : `sources: [{file: "URL.m3u8"}]` (le plus spécifique)
  2. VideoJS / HTML5 : `<source src="URL.m3u8">`
  3. Fallback générique : `"URL.m3u8"` (last resort, last position pour éviter les faux positifs)
- Résolution des URLs relatives en absolues via `absolutize()` (Sibnet sert parfois `/path/to/file.m3u8` au lieu de l'URL complète)
- Logs ajoutés : `Sibnet HTML length: ...`, `Sibnet M3U8 trouvé: ...`, `Sibnet: aucune URL M3U8/MP4 trouvée dans le HTML`

### Version
- `versionCode` bumpé à 9, `versionName` à "1.9"
- Aucune nouvelle dépendance
- Aucune modification TS (juste Kotlin + TSX)

---

## V1.8 — changements (historique)

### Bug 1 — Bouton favori toujours invisible quand actif
- Cause : le variant `primary` du Button utilisait un gradient `accent → secondary` (rose → violet). Bien plus visible que la V1.6, mais l'utilisateur voulait une inversion nette : bordure none + fond rose solide
- Fix : nouveau variant `favorite` dans `Button.tsx` — fond `Colors.accent` (rose `#ff4081`) plein, `borderWidth: 0`, texte blanc, icône cœur `solid`
- `AnimeDetailScreen` : `variant={isFav ? 'favorite' : 'outline'}` → inverse nette entre les 2 états
- Non favori : transparent + bordure rose + icône cœur vide + texte rose
- Favori : fond rose solide + pas de bordure + icône cœur pleine + texte blanc

### Bug 2 — Alertes Android natives moches
- Cause : tous les `Alert.alert(...)` dans les écrans utilisaient la popup native Android (blanc/gris avec boutons bleus par défaut) qui jure avec le thème sombre violet/rose
- Fix : nouveau composant `ThemedAlert.tsx` — modale personnalisée avec :
  - Overlay sombre `rgba(0,0,0,0.7)` + animation fade
  - Dialog dark `Colors.backgroundCard` avec bordure `Colors.border`
  - Titre blanc bold + message gris secondary
  - Bouton "Annuler" en outline (transparent + bordure)
  - Bouton "Confirmer" en primary (rose) ou rouge si `destructive: true`
  - Back Android ferme la modale
- `ThemedAlertProvider` wrappé autour de toute l'app dans `App.tsx`
- Hook `useThemedAlert()` accessible partout
- Tous les `Alert.alert` remplacés dans : `SettingsScreen`, `ProfilePickerScreen`, `AnimeDetailScreen`, `PlayerScreen`
- Exemple : suppression d'un profile → popup dark avec bouton "Supprimer" en rouge

### Bug 3 — Auto-rotate landscape sur fullscreen vidéo
- Cause : `react-native-video` expose des events fullscreen mais il faut explicitement locker l'orientation
- Fix : nouvelle dépendance `react-native-orientation-locker` (^1.7.0)
- `PlayerScreen` ajoute 2 handlers sur le `<Video>` :
  - `onFullscreenPlayerWillPresent` → `Orientation.lockToLandscape()` (l'écran tourne automatiquement en mode paysage)
  - `onFullscreenPlayerWillDismiss` → `Orientation.lockToPortrait()` (retour en mode portrait à la sortie du fullscreen)
- Au mount du PlayerScreen : `Orientation.lockToPortrait()` (s'assure qu'on commence en portrait)
- Au unmount : `Orientation.unlockAllOrientations()` (libère le lock pour les autres écrans)

### Bug 4 — Navbar sur la page player
- Cause : `showNavbar = screen.name !== 'player'` cachait la navbar sur le player pour "immersion"
- Fix : `showNavbar = true` partout. L'utilisateur a maintenant accès à la navbar (logo + Accueil + Catalogue + search + avatar) même sur la page player — plus pratique pour naviguer

### Dépendance ajoutée
- `react-native-orientation-locker` ^1.7.0 — pour le lock d'orientation programmatique
- Config `orientation` déjà présente dans `AndroidManifest.xml` (via `configChanges`), pas besoin de modification

### Version
- `versionCode` bumpé à 8, `versionName` à "1.8"

---

## V1.7 — changements (historique)

### Bug 1 — Bouton favori invisible
- Cause : le variant `primary` du Button utilisait un gradient `#6a1b9a → #9c27b0` (violet foncé → violet clair) qui était trop proche du fond `#121212` — quasi invisible
- Fix : `Button.tsx` → le gradient du variant `primary` est maintenant `accent → secondary` (rose `#ff4081` → violet `#9c27b0`), bien plus contrasté
- Sur `AnimeDetailScreen` : le bouton favori utilise `variant="primary"` + icône cœur pleine quand actif → maintenant clairement visible

### Bug 2 — Avatar navbar "A" → 1ère lettre du profile
- Cause : l'avatar était hardcoded `<Text>A</Text>` dans `Navbar.tsx`
- Fix : `Navbar` accepte maintenant 2 nouvelles props :
  - `profileLetter` (string) — la 1ère lettre du profile en uppercase
  - `profileColor` (number 0-5) — l'index dans la palette `AVATAR_COLORS`
- L'avatar est maintenant un `LinearGradient` (rose/violet, bleu, vert, etc. selon la couleur du profile) avec la lettre en blanc
- `App.tsx` passe automatiquement `profile.name.charAt(0).toUpperCase()` et `profile.color` à la Navbar

### Bug 3 + 4 — Breadcrumb "S2E1" pour "Avec Fillers" + Films nommés "S99"
- Cause : Anime-Sama numérote ses saisons bizarrement. Par exemple Naruto Shippuden a `season_number=2` pour "Avec Fillers" (que l'utilisateur considère comme la Saison 1). Et tous les films sont `season_number=99`.
- Avant, le breadcrumb affichait `S{seasonNumber}E{episode}` → "S2E1" pour "Avec Fillers", "S99E1" pour les films
- Fix : `PlayerScreen` accepte maintenant une prop `seasonName` (passée depuis `AnimeDetailScreen` et `App.tsx`). Le breadcrumb et l'episode info affichent un `seasonLabel` calculé intelligemment :
  - Si `season_number === 99` → "Film"
  - Si le `name` ne commence pas par "Saison" → afficher le `name` (ex: "Avec Fillers", "Kai", "Sans Fillers")
  - Sinon → afficher le `name` tel quel (ex: "Saison 1", "Saison 2")
- Exemples de rendu :
  - `Accueil / Naruto Shippuden / Avec Fillers - Épisode 1`
  - `Accueil / Re:Zero / Film - Épisode 1`
  - `Accueil / Death Note / Saison 1 - Épisode 1`
- Tous les flows (depuis détail, depuis continue watching, navigation prev/next) propagent maintenant le `seasonName` correctement

### Bug 5 — Reprise de lecture
- Cause : le `seek` imperative via `videoRef.current.seek()` était tenté une seule fois avec un setTimeout 300ms — la ref n'était parfois pas encore disponible
- Fix : nouveau système de retry — `trySeek()` est appelé toutes les 200ms (jusqu'à 10 tentatives) jusqu'à ce que `videoRef.current.seek` soit disponible. Log de succès/échec dans la console pour faciliter le debug
- La prop `seek` réactive a été retirée (elle pouvait causer des conflits avec le seek imperative)
- Sur `onLoad` : si `resumePosition > 0`, on lance la séquence de retry → la vidéo démarre à la position sauvegardée

### Version
- `versionCode` bumpé à 7, `versionName` à "1.7"
- Aucune nouvelle dépendance
- Aucune modification Kotlin (juste TS)

---

## V1.6 — changements (historique)

### Bug "Saison 1 / Saison 1 Director's Cut" auto-select — corrigé
- Cause : `AnimeDetailScreen` identifiait une saison par `season_number` seul, donc 2 saisons avec le même numéro (1 et 1) apparaissaient toutes les deux "actives" en même temps
- Fix : identification par `season_number + name` via une fonction `seasonKey(s)` qui produit `"1::Saison 1"` vs `"1::Saison 1 Director's Cut"`. Le state `activeSeasonKey` (string) remplace `activeSeason` (number). Chaque tab a sa propre key, donc seul celui sur lequel tu tapes devient actif
- Bonus : le `key={key}` du React `.map()` utilise aussi cette key — fini les warnings React "duplicate keys"

### HomeScreen — section "Animes" redondante retirée
- La section "Animes" (20 animes depuis `search({ limit: 20 })`) était redondante avec le Catalogue qui contient déjà tous les animes
- Le Home garde maintenant : Hero + Continue Watching (avec croix) + "À la une" (12 curated) + Mes favoris
- Le bouton "Voir tous les animes" reste présent sous "À la une" pour aller au Catalogue
- Imports nettoyés : `AnimeSearchResultItem` retiré du HomeScreen (plus utilisé)

### Script `json_to_sqlite.py` — contrainte UNIQUE corrigée
- Avant : `UNIQUE (anime_id, season_number)` → 2 saisons avec le même numéro étaient écrasées (par exemple "Saison 1 Director's Cut" de Re:Zero était perdue à l'insertion)
- Après : `UNIQUE (anime_id, season_number, name)` → autorise les saisons multiples avec le même numéro tant que le `name` diffère
- La requête `SELECT id FROM season WHERE anime_id=? AND season_number=?` est également mise à jour pour filtrer sur `name` en plus (sinon elle retournait toujours la 1ère saison trouvée)
- Note : la DB elle-même sera regénérée en V1.7/V1.8 quand tu mettras à jour le catalogue Anime-Sama

### ProfilePickerScreen — UI allégée
- Palette de couleurs (6 pastilles) retirée — garde juste le bouton "random" (tap sur l'avatar pour cycle couleur, avec icône sync en bas à droite)
- Placeholder "Ex: Skyline" retiré du TextInput (tout le monde sait ce qu'est un pseudo en 2026)
- Styles associés (`colorPalette`, `colorDot`, `colorDotActive`, `colorDotGradient`) supprimés pour gagner en lisibilité

### SettingsScreen — UI allégée
- Palette de couleurs retirée également, remplacée par un simple bouton "Changer la couleur de l'avatar" (icône `sync-alt`) qui cycle à travers les 6 couleurs au tap
- Plus compact, prend moins de place verticale

### Version
- `versionCode` bumpé à 6, `versionName` à "1.6"
- Aucune nouvelle dépendance
- Aucune modification Kotlin (juste TS + Python)

---

## V1.5 — changements (historique)

### UserDao.kt — version fix fournie par l'utilisateur
- Adoptée la version nettoyée par l'utilisateur (gestion `var found = false` + `break` plus propre)
- Ajout de la colonne `color` au modèle `Profile` (rétrocompatible V1.4 via onUpgrade)

### Personnalisation de l'avatar (couleur)
- Au-dessus de l'input de création de profile, **grand avatar preview en gradient** qui montre en live :
  - La 1ère lettre du pseudo tapé
  - La couleur sélectionnée
- **2 façons de changer la couleur** :
  - Tap sur l'avatar → cycle à la couleur suivante (avec icône sync en bas à droite)
  - Tap direct sur une pastille de la palette (6 couleurs)
- `SettingsScreen` : palette identique pour changer la couleur du profile courant après coup
- Couleur persistée dans `user_data.db > profile.color` (colonne ajoutée en V1.5 via `onUpgrade`)

### Reprise de lecture vidéo (comme le site original)
- Nouvelle table `video_progress` dans `user_data.db` (profile_id, anime_id, season_number, episode_number, position_ms, duration_ms, completed, updated_at)
- Au chargement du `PlayerScreen` : récupère la position sauvegardée. Si > 5s et non terminé, **seek automatique à cette position** après le `onLoad`
- Pendant la lecture : `onProgress` throttle à **5s** pour sauvegarder la position en arrière-plan
- À la fin (`onEnd`) : marque `completed = true`
- 3 nouvelles méthodes Kotlin : `saveVideoProgress`, `getVideoProgress`, `clearVideoProgress`

### HomeScreen — section "Animes" avec vrai data
- **"Découvrir de Nouvelles Séries"** renommé en **"À la une"** (garde les 12 animes featured curated)
- Nouvelle section **"Animes"** juste après, qui charge **20 animes réels depuis anime.db** via `search({ limit: 20 })`
- Bouton "Voir tous les animes" toujours présent pour aller au catalogue

### Bug favoris "Aucun épisode disponible" — corrigé
- Cause : `getFavorites` en V1.4 ne renvoyait que `{ anime_id, title, image, has_episodes, year }` — sans `seasons`
- Fix V1.5 : `getFavorites` lit maintenant `raw_json` complet (qui contient `seasons`, `episodes`, `languages`, `urls`, etc.)
- En bonus : `has_episodes` est recalculé à partir de la présence de saisons (au cas où la valeur en DB serait incohérente)
- Testé sur Re:Zero (anime_id=953) : affiche maintenant correctement ses 5 saisons et 26+ épisodes

### SeasonTab — fix visuel
- Le fond actif était `rgba(106, 27, 154, 0.6)` (violet semi-transparent) — pas assez contrasté
- V1.5 : `bgColor` actif = `Colors.primary` (violet plein opaque) + bordure `Colors.accent` (rose) + `borderWidth: 2`
- `minWidth: 120` retiré → les longs labels comme "Saison 1 Director's Cut" s'adaptent mieux
- Label passe en `fontWeight: '700'` quand actif pour plus de distinction

### Version
- `versionCode` bumpé à 5, `versionName` à "1.5"
- `UserDataHelper.DB_VERSION` bumpé à 2 (trigger `onUpgrade` qui ajoute la colonne `color` et la table `video_progress`)

---

## V1.4 — changements (historique)

### Système de profiles (style Netflix)
- **Pas de mot de passe** — tout est local sur le téléphone, pas besoin d'auth
- **Plusieurs profiles possibles** — chacun avec son pseudo, ses favoris et son historique
- **ProfilePickerScreen** : au 1er lancement, crée ton 1er profile. Ensuite, liste tous les profiles avec avatars colorés + bouton "Ajouter un profile"
- **Persistance** : le profile courant est sauvegardé dans `AsyncStorage` (clé `@animezone/current_profile`), retrouvé à chaque lancement
- **Switch de profile** : depuis SettingsScreen, bouton "Changer de profile" ou tape sur un autre profile dans la liste

### Architecture : 2 DBs SQLite séparées
- `animezone.db` (pré-buildée, read-only) : catalogue (1298 animes, 37k épisodes)
- `user_data.db` (créée à la volée, persistée) : profiles + favoris + continue_watching
- **Pourquoi 2 DBs ?** Si on mettait les données user dans animezone.db, elles seraient écrasées à chaque mise à jour du catalogue (bump de version → recopie depuis assets)
- `UserDataHelper.kt` + `UserDao.kt` : nouvelle couche d'accès, miroir de `AnimeDatabaseHelper` / `AnimeDao`

### HomeScreen V1.4
- **Section "Continuer à regarder"** : vrai data depuis `user_data.db`, trié par `last_watched DESC`
- **Croix (×) sur chaque card Continue Watching** : tape pour retirer de la liste (comme le site original)
- **Section "Mes favoris"** : juste sous "Découvrir de Nouvelles Séries", grid 2 colonnes
- Les deux sections se mettent à jour automatiquement quand tu reviens du Player ou du détail

### AnimeDetailScreen V1.4
- **Bouton favori fonctionnel** : heart icon, passe de "Ajouter aux favoris" (outline) à "Retirer des favoris" (primary fill)
- Vérifie l'état initial au chargement via `isFavorite(profileId, animeId)`

### PlayerScreen V1.4
- **Continue watching auto-save** : dès qu'un épisode est lancé (résolution réussie), on appelle `upsertContinueWatching(profileId, animeId, seasonNumber, episodeNumber)` en arrière-plan
- Ne bloque pas la lecture si l'enregistrement échoue

### SettingsScreen V1.4 (nouveau)
- **Section Profile courant** : avatar + nom éditable inline (rename)
- **Section Tous les profiles** : liste pour switcher directement, bouton supprimer (avec confirmation)
- **Section Catalogue** : stats (nb animes, épisodes, URLs, taille DB)
- **Section À propos** : version, plateforme

### Animes featured du home calibrés
- Script Python `scripts/calibrate_discover.py` créé : remplit la table `discover` avec 12 animes populaires curated (One Punch Man, Naruto Shippuden, Death Note, Demon Slayer, Jujutsu Kaisen, Chainsaw Man, Shingeki no Kyojin, Spy X Family, My Hero Academia, Tokyo Revengers, Sword Art Online, Re:Zero)
- DB patchée avec ces 12 animes en ordre — la table discover contient maintenant les vrais animes populaires

### Dépendance ajoutée
- `@react-native-async-storage/async-storage` : pour persister le profile courant entre les lancements

### Version
- `versionCode` bumpé à 4, `versionName` à "1.4"

---

## V1.3 — changements (historique)

### Bugs Gradle corrigés (les 4 que tu as identifiés)
1. `HttpClient.kt` : import `java.io.IOException` ajouté (manquait)
2. `HttpClient.kt` : `USER_AGENT` passé de `private` à `internal` pour que `AnimeZoneModule.proxyStream` puisse y accéder
3. `AnimeZoneModule.kt` : `!Double.isInfinite(d)` → `!d.isInfinite()` (Kotlin utilise des méthodes d'instance, pas statiques)
4. `AnimeDatabaseHelper.kt` : `onUpgrade` fixé — `appContext` est maintenant une `private val` du constructeur, plus besoin du singleton `INSTANCE` qui n'était de toute façon pas un `Context`

### Config locale
- Fichier `android/local.properties` créé avec `sdk.dir=C\:\\Users\\Skyline\\AppData\\Local\\Android\\Sdk` (adapte si besoin)

### Images qui ne s'affichaient pas
- Cause : `cdn.statically.io/gh/Anime-Sama/IMG/img/...` faisait un 301 vers `http://` (cleartext) avant de rebasculer en HTTPS — Android bloquait
- Fix : DB patchée pour réécrire les URLs en `raw.githubusercontent.com/Anime-Sama/IMG/img/...` (sert directement en HTTPS 200)
- Script `json_to_sqlite.py` mis à jour avec `fix_image_url()` pour les prochaines regenérations
- `AndroidManifest.xml` : `android:usesCleartextTraffic="true"` + `ACCESS_NETWORK_STATE` permission ajoutés (au cas où d'autres domaines font des redirects HTTP)

### Entités HTML dans les titres
- Cause : les titres d'anime venaient avec `&quot;`, `&amp;`, `&#39;`, etc. depuis Anime-Sama
- Fix : helper `decodeHtmlEntities()` ajouté dans `src/types/anime.ts`, appliqué partout où on affiche un titre ou une description (AnimeCard, AnimeDetailScreen, PlayerScreen)

### 2 inputs dans catalogue
- SearchBar interne du `SearchScreen` retirée — seule la SearchBar de la Navbar reste
- Le `SearchScreen` réagit maintenant à la prop `query` (passée par App.tsx depuis la navbar)
- Debounce 300ms pour éviter de lancer une requête SQL à chaque caractère tapé

### Cards du catalogue affichent VF/VOSTFR
- `AnimeDao.searchAnimes` renvoie maintenant la colonne `languages` (en plus de title/image/etc.)
- Les badges VF/VOSTFR s'affichent déjà via `<LanguageBadge>` sur l'AnimeCard (en haut à gauche de l'image)

### Couleur bleue des season tabs retirée
- `Colors.seasonActive` : `rgba(0,123,255,0.6)` → `rgba(106, 27, 154, 0.6)` (violet)
- `Colors.seasonActiveBorder` : `rgba(0,123,255,0.9)` → `rgba(255, 64, 129, 0.9)` (rose)
- Cercle numéro d'épisode : `rgba(0,123,255,0.2)` → `rgba(255, 64, 129, 0.15)` (rose)
- Plus aucun bleu dans l'UI (sauf Kai badge qui reste sa signature visuelle)

### Boutons langue du player plus discrets
- Padding vertical réduit de 12 → 6
- Padding horizontal réduit à 12 (au lieu de `flex: 1`)
- Taille texte : `Typography.body` → `Typography.small`
- Border width : 1.5 → 1
- Le label "Langue" est maintenant sur la même ligne que les boutons (économie d'espace vertical)

### Barre de recherche du menu home
- Placeholder mis à jour : "Rechercher un anime... (Entrée pour valider)"
- Sur catalogue : recherche live avec debounce 300ms (quand on tape, la recherche se relance)
- Sur home : taper Entrée (ou cliquer la loupe) bascule sur catalogue et lance la recherche

### Version
- `versionCode` bumpé à 3, `versionName` à "1.3"

---

## V1.2 — changements (historique)

- Commentaires Python `#` dans `HlsParser.kt` remplacés par `//` Kotlin valides
- `jsonToWritable` : `pushMap(null)` corrigé en `pushArray()` pour les nested arrays
- Comparaison `Math.abs(d) < Int.MAX_VALUE.toLong()` (type mismatch) corrigée
- Suppression du rating, des tags genres, des couleurs verte/bleue VF/VOSTFR
- Fallback multi-lecteurs : nouvelle méthode `getRankedUrls` qui renvoie tous les URLs triés, et `resolveEpisode` qui essaie chacun jusqu'à succès
- Layout PlayerScreen refait en 3 lignes (langue / précédent-suivant / tous les épisodes)

---

## ⚡ Lancement rapide (3 commandes)

```bash
# 1. Installer les deps (déjà fait si tu as reçu le ZIP avec node_modules,
#    sinon à refaire)
npm install

# 2. Lancer Metro (le bundler JS) — laisser tourner dans un terminal
npm start

# 3. Dans un AUTRE terminal : builder + installer sur l'émulateur/device
npm run android
```

> Prérequis : Android Studio + un émulateur Android lancé, ou un téléphone
> physique en mode développeur branché en USB. Voir §1 ci-dessous.

---

## 1. Prérequis (à n'installer qu'une fois sur ta machine)

### 1.1 Android Studio
Télécharge : https://developer.android.com/studio

Au premier lancement, choisis "Standard Setup" — il va installer :
- Android SDK Platform 35 (ou plus récent)
- Android SDK Build-Tools 35
- Android Emulator
- Android SDK Platform-Tools (adb)

### 1.2 Créer un émulateur Android
Dans Android Studio :
1. Ouvre **Tools → Device Manager**
2. Clique **+ Create Device**
3. Choisis un téléphone (ex: Pixel 7) → Next
4. Télécharge une image système (ex: API 34, "Tiramisu") → Next → Finish
5. Démarre l'émulateur (▶ bouton play)

L'émulateur doit rester ouvert pendant tout le développement.

### 1.3 Variables d'environnement (une seule fois)

Ajoute dans ton `~/.bashrc` ou `~/.zshrc` :

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

Puis `source ~/.bashrc`. Sur Windows, ajoute ces variables via les
"Variables d'environnement système".

Vérifie :
```bash
adb --version           # doit afficher la version
echo $ANDROID_HOME      # doit pointer vers /home/<user>/Android/Sdk
```

---

## 2. Lancer le projet — deux méthodes

### Méthode A : Ligne de commande (recommandée pour débuter)

```bash
cd AnimeZoneApp

# Terminal 1 : Metro (bundler JS, à laisser ouvert)
npm start

# Terminal 2 : build + install sur l'émulateur
npm run android
```

La première fois, Gradle télécharge ~500 Mo de dépendances → 5-10 min.
Ensuite, les rebuilds prennent 30-60 s.

### Méthode B : Android Studio (GUI)

1. Ouvre Android Studio
2. **File → Open** → sélectionne le dossier `AnimeZoneApp/android`
3. Attend que Gradle sync (première fois : plusieurs minutes)
4. Sélectionne l'émulateur dans la barre d'outils
5. Clique ▶ Run

> Tu peux aussi garder Android Studio ouvert juste pour voir les Logcat
> (les logs du Native Module Kotlin arrivent avec le tag `AnimeZoneModule`,
> `AnimeDBHelper`, `AnimeDao`).

---

## 3. Ce que fait l'app de démo (App.tsx)

3 écrans en navigation par state simple :

1. **SearchScreen** — au lancement, charge les 50 premiers animes dont le titre
   contient "naruto". Tu peux taper ta propre recherche et appuyer sur Entrée.
   Les résultats viennent de la DB SQLite locale via `AnimeZoneBridge.search()`.

2. **AnimeDetailScreen** — quand tu tapes un anime, charge le détail complet
   (saisons + épisodes) via `AnimeZoneBridge.getAnime(id)`, puis affiche
   jusqu'à 20 épisodes par saison sous forme de boutons.

3. **PlayerScreen** — quand tu tapes un épisode, le Native Module scrape
   l'embed SendVid/Vidmoly/Sibnet en direct, extrait l'URL MP4 ou M3U8,
   et lance `react-native-video` (ExoPlayer) dessus.

---

## 4. Dépannage — erreurs fréquentes

### `npm run android` dit "No connected devices"
- Vérifie que l'émulateur est lancé : `adb devices` doit lister `emulator-5554`
- Si pas : lance Android Studio → Device Manager → ▶ sur ton émulateur
- Si tu utilises un vrai téléphone : active "Débogage USB" dans Options développeur

### `SDK location not found`
→ La variable `ANDROID_HOME` n'est pas set. Voir §1.3.

### `Cannot find symbol: class AnimeZonePackage` après modification Kotlin
→ React Native ne recharge pas le code natif à chaud. Rebuild :
```bash
cd android && ./gradlew clean && cd ..
npm run android
```

### L'app crash au lancement avec "Impossible de charger la base de données"
→ La DB `animezone.db` n'a pas été copiée. Vérifie qu'elle est bien dans
`android/app/src/main/assets/animezone.db` (35 Mo).

### Metro dit "Unable to resolve module @/services/..."
→ Le plugin `module-resolver` n'est pas chargé. Redémarre Metro avec reset cache :
```bash
npm start -- --reset-cache
```

### Le lecteur vidéo affiche "Source indisponible"
→ L'hébergeur (SendVid/Vidmoly/Sibnet) a peut-être changé son HTML.
Regarde les logs Logcat (tag `AnimeZoneModule`) pour voir l'URL tentée.
Tu peux aussi essayer un autre épisode — tous les épisodes n'ont pas
tous les hébergeurs.

### `More than one file was found with OS independent path 'lib/x86/libhermes.so'`
→ Conflit de packaging. Ajoute dans `android/app/build.gradle` :
```gradle
android {
    packagingOptions {
        pickFirst 'lib/x86/libhermes.so'
        pickFirst 'lib/x86_64/libhermes.so'
    }
}
```

---

## 5. Modifier le code Kotlin

À chaque modif d'un fichier `.kt`, le hot-reload Metro ne suffit pas — il faut
recompiler l'APK :

```bash
# Soit via npm
npm run android

# Soit via Gradle direct (plus de contrôle)
cd android && ./gradlew installDebug
```

Pour voir les logs Kotlin en temps réel :
```bash
adb logcat -s AnimeZoneModule AnimeDBHelper AnimeDao AnimeZone:V
```

---

## 6. Régénérer la DB SQLite si le catalogue Python évolue

```bash
# Récupère le JSON à jour depuis le repo Python d'origine
git clone https://github.com/myAiByMe/AnimeZone.git

# Régénère la DB
python3 AnimeZoneApp/scripts/json_to_sqlite.py \
  AnimeZone/static/data/anime.json \
  AnimeZone/data_discover.json \
  AnimeZoneApp/android/app/src/main/assets/animezone.db

# Pense à bumper la version dans AnimeDatabaseHelper.kt (DB_VERSION = 2)
# pour que l'app re-copie la nouvelle DB au prochain lancement.
```

---

## 7. Build release APK (pour partager l'app)

```bash
cd android
./gradlew assembleRelease
# APK généré dans :
# android/app/build/outputs/apk/release/app-release.apk
```

> Le keystore de release n'est pas configuré — il utilise encore le debug
> keystore. Pour une release publique, suis :
> https://reactnative.dev/docs/signed-apk-android

---

## 8. Structure du projet

```
AnimeZoneApp/
├── App.tsx                                    ← Démo : recherche → détail → lecteur
├── index.js                                   ← Entrypoint RN
├── package.json                               ← Deps : react-native-video, etc.
├── babel.config.js                            ← Plugin alias @/ → src/
├── tsconfig.json                              ← Config TS avec alias @/
├── metro.config.js                            ← Bundler RN
│
├── src/
│   ├── types/anime.ts                         ← Types TS miroir du Kotlin
│   └── services/AnimeZoneBridge.ts            ← Wrapper async typé
│
├── scripts/
│   └── json_to_sqlite.py                      ← Regénère animezone.db
│
└── android/
    ├── build.gradle                           ← Config Gradle racine
    ├── settings.gradle
    ├── gradlew                                ← Wrapper Gradle (pas besoin d'installer Gradle)
    └── app/
        ├── build.gradle                       ← Deps OkHttp + Jsoup ajoutées ici
        └── src/main/
            ├── AndroidManifest.xml            ← Permission Internet (déjà là)
            ├── assets/
            │   └── animezone.db               ← DB SQLite 35 Mo
            └── java/
                ├── com/animezoneapp/          ← MainApplication.kt + MainActivity.kt
                │   ├── MainApplication.kt     ← Register AnimeZonePackage ici
                │   └── MainActivity.kt
                └── com/animezone/mobile/      ← Code du pont natif
                    ├── network/HttpClient.kt
                    ├── scraper/
                    │   ├── VideoUrlParser.kt
                    │   ├── VideoExtractor.kt
                    │   ├── GenericExtractor.kt
                    │   └── HlsParser.kt
                    ├── data/
                    │   ├── AnimeDatabaseHelper.kt
                    │   ├── AnimeDao.kt
                    │   └── AnimeDataRepository.kt
                    └── native_modules/
                        ├── AnimeZoneModule.kt
                        └── AnimeZonePackage.kt
```

---

## 9. Où aller après ?

1. **Ajouter la persistance progression/favoris** — créer une 2e DB SQLite
   `user_data.db` avec tables `user_progress` + `user_favorite` (Room optionnel).
2. **Cache des URLs vidéo résolues** — pour éviter de re-scrappper l'embed
   à chaque lecture (TTL 24h).
3. **Écran paramètres** — afficher les stats catalog via
   `AnimeZoneBridge.getCatalogStats()`.
4. **Navigation + écrans** — installer `@react-navigation/native` pour un vrai
   routing avec back button Android.
5. **Design system** — `react-native-paper` ou `tamagui` pour des composants
   stylés sans tout réinventer.
