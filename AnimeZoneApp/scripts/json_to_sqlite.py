#!/usr/bin/env python3
"""
json_to_sqlite.py — Convertit anime.json + data_discover.json en animezone.db
pour AnimeZone Mobile.

Schéma cible (compatible avec une future migration Room) :
  - anime          : catalogue principal, colonnes indexées + raw_json complet
  - genre          : genres uniques (lowercase)
  - anime_genre    : liaison many-to-many
  - season         : saisons (FK anime)
  - episode        : épisodes (FK season)
  - episode_url    : URLs par épisode (langue + host extrait pour priorisation)
  - discover       : animes featured (depuis data_discover.json)

Stratégie hybride :
  - Colonnes indexées (title, year, has_episodes, etc.) pour les recherches rapides
  - Colonne `raw_json` contenant le JSON original complet pour getAnimeById()
    (évite de devoir reconstruire l'arbre seasons/episodes/urls en Kotlin)

Usage :
  python3 json_to_sqlite.py [anime.json] [data_discover.json] [output.db]

Si appelé sans arguments, utilise les chemins par défaut du projet.
"""

import json
import os
import re
import sqlite3
import sys
import unicodedata
from urllib.parse import urlparse


def normalize(s: str) -> str:
    """
    Normalise une chaîne pour recherche : lowercase + suppression des accents.
    Exemple : 'Shônen' → 'shonen', 'Comédie' → 'comedie'.
    Stockée dans *_normalized pour éviter la double orthographe côté recherche.
    """
    if not s:
        return ""
    s = s.lower().strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s


# ----------------------- Host extraction -----------------------

def extract_host(url: str) -> str:
    """
    Identifie l'hébergeur depuis une URL — utilisé pour la priorisation
    côté Kotlin (vidmoly > sendvid > sibnet > ...).
    Miroir de la logique dans VideoUrlParser.kt mais pour pré-stockage.
    """
    if not url:
        return "unknown"
    try:
        host = (urlparse(url).netloc or "").lower()
    except Exception:
        return "unknown"
    if "vidmoly" in host:        return "vidmoly"
    if "sendvid" in host:        return "sendvid"
    if "sibnet" in host:         return "sibnet"
    if "vk.com" in host:         return "vk"
    if "doodstream" in host or "dood." in host: return "doodstream"
    if "streamtape" in host:     return "streamtape"
    if "streamwish" in host or "streamz" in host: return "streamwish"
    if "mega.nz" in host or "mega.co.nz" in host: return "mega"
    if "youtube" in host:        return "youtube"
    if "tune" in host or "hydrax" in host: return "hydrax"
    return host or "unknown"


# ----------------------- Schema -----------------------

SCHEMA = """
CREATE TABLE anime (
    anime_id         INTEGER PRIMARY KEY,
    title            TEXT NOT NULL,
    title_normalized TEXT NOT NULL,
    original_title   TEXT,
    description      TEXT,
    image            TEXT,
    image_url        TEXT,
    year             INTEGER,
    status           TEXT,
    rating           REAL,
    featured         INTEGER DEFAULT 0,
    has_episodes     INTEGER DEFAULT 0,
    seasons_fetched  INTEGER DEFAULT 0,
    languages        TEXT,
    raw_json         TEXT NOT NULL
);

CREATE TABLE genre (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT UNIQUE NOT NULL,
    name_normalized  TEXT UNIQUE NOT NULL
);

CREATE TABLE anime_genre (
    anime_id  INTEGER NOT NULL,
    genre_id  INTEGER NOT NULL,
    PRIMARY KEY (anime_id, genre_id),
    FOREIGN KEY (anime_id) REFERENCES anime(anime_id),
    FOREIGN KEY (genre_id) REFERENCES genre(id)
);

CREATE TABLE season (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    anime_id      INTEGER NOT NULL,
    season_number INTEGER NOT NULL,
    name          TEXT,
    -- V1.6 : on autorise plusieurs saisons avec le même numéro mais des noms
    -- différents (ex: "Saison 1" + "Saison 1 Director's Cut" pour Re:Zero).
    UNIQUE (anime_id, season_number, name),
    FOREIGN KEY (anime_id) REFERENCES anime(anime_id)
);

CREATE TABLE episode (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id      INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title          TEXT,
    description    TEXT,
    duration       TEXT,
    languages      TEXT,
    UNIQUE (season_id, episode_number),
    FOREIGN KEY (season_id) REFERENCES season(id)
);

CREATE TABLE episode_url (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id   INTEGER NOT NULL,
    language     TEXT NOT NULL,
    url          TEXT NOT NULL,
    url_position INTEGER NOT NULL,
    host         TEXT NOT NULL,
    FOREIGN KEY (episode_id) REFERENCES episode(id)
);

CREATE TABLE discover (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    position     INTEGER NOT NULL,
    anime_id     INTEGER,
    title        TEXT,
    description  TEXT,
    image        TEXT,
    rating       REAL,
    has_episodes INTEGER DEFAULT 0,
    raw_json     TEXT NOT NULL
);

-- Indexes pour recherche rapide
CREATE INDEX idx_anime_title_norm    ON anime(title_normalized);
CREATE INDEX idx_anime_year          ON anime(year);
CREATE INDEX idx_anime_rating        ON anime(rating);
CREATE INDEX idx_anime_has_episodes  ON anime(has_episodes);
CREATE INDEX idx_genre_name_norm     ON genre(name_normalized);
CREATE INDEX idx_anime_genre_genre   ON anime_genre(genre_id);
CREATE INDEX idx_anime_genre_anime   ON anime_genre(anime_id);
CREATE INDEX idx_season_anime        ON season(anime_id);
CREATE INDEX idx_episode_season      ON episode(season_id);
CREATE INDEX idx_episode_url_ep      ON episode_url(episode_id);
CREATE INDEX idx_episode_url_host    ON episode_url(host);
CREATE INDEX idx_episode_url_lang    ON episode_url(episode_id, language);
"""


# ----------------------- Conversion -----------------------

def fix_image_url(url):
    """
    V1.3 : réécrit les URLs cdn.statically.io/gh/Anime-Sama/IMG/img/... en
    raw.githubusercontent.com/Anime-Sama/IMG/img/... car le premier fait un
    redirect 301 vers du HTTP cleartext (bloqué par Android par défaut) avant
    de rebasculer en HTTPS. Le 2nd sert directement l'image en HTTPS 200.
    """
    if not url:
        return url
    return url.replace(
        "cdn.statically.io/gh/Anime-Sama/IMG/img",
        "raw.githubusercontent.com/Anime-Sama/IMG/img"
    )


def insert_anime(c, anime: dict):
    """Insère un anime + ses genres + saisons + épisodes + URLs."""
    anime_id = anime.get("anime_id") or anime.get("id", 0)
    if not anime_id:
        return  # skip entries without ID

    # V1.3 : patcher les URLs d'images pour éviter le redirect HTTP bloqué par Android
    if "image" in anime and anime["image"]:
        anime["image"] = fix_image_url(anime["image"])
    if "image_url" in anime and anime["image_url"]:
        anime["image_url"] = fix_image_url(anime["image_url"])

    c.execute("""
        INSERT OR REPLACE INTO anime
        (anime_id, title, title_normalized, original_title, description, image, image_url,
         year, status, rating, featured, has_episodes, seasons_fetched,
         languages, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        int(anime_id),
        anime.get("title", ""),
        normalize(anime.get("title", "")),
        anime.get("original_title"),
        anime.get("description"),
        anime.get("image"),
        anime.get("image_url"),
        anime.get("year"),
        anime.get("status"),
        float(anime.get("rating") or 0),
        1 if anime.get("featured") else 0,
        1 if anime.get("has_episodes") or (anime.get("seasons") and len(anime["seasons"]) > 0) else 0,
        1 if anime.get("seasons_fetched") else 0,
        json.dumps(anime.get("languages", [])),
        json.dumps(anime, ensure_ascii=False),  # raw_json complet
    ))

    # Genres (lowercase pour recherche case-insensitive côté Kotlin)
    for genre_name in anime.get("genres", []) or []:
        name_lc = genre_name.lower()
        name_norm = normalize(genre_name)
        c.execute(
            "INSERT OR IGNORE INTO genre (name, name_normalized) VALUES (?, ?)",
            (name_lc, name_norm),
        )
        genre_id = c.execute(
            "SELECT id FROM genre WHERE name_normalized = ?", (name_norm,)
        ).fetchone()[0]
        c.execute(
            "INSERT OR IGNORE INTO anime_genre (anime_id, genre_id) VALUES (?, ?)",
            (int(anime_id), genre_id),
        )

    # Seasons + Episodes + URLs
    for season in anime.get("seasons", []) or []:
        season_number = season.get("season_number", 0)
        season_name = season.get("name", "")
        c.execute("""
            INSERT OR IGNORE INTO season (anime_id, season_number, name)
            VALUES (?, ?, ?)
        """, (int(anime_id), int(season_number), season_name))
        # V1.6 : on récupère l'ID par (anime_id, season_number, name) car il
        # peut y avoir plusieurs saisons avec le même numéro (Director's Cut).
        season_id = c.execute(
            "SELECT id FROM season WHERE anime_id = ? AND season_number = ? AND name = ?",
            (int(anime_id), int(season_number), season_name),
        ).fetchone()[0]

        for episode in season.get("episodes", []) or []:
            ep_num = episode.get("episode_number", 0)
            c.execute("""
                INSERT OR IGNORE INTO episode
                (season_id, episode_number, title, description, duration, languages)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                season_id, int(ep_num),
                episode.get("title", ""),
                episode.get("description", ""),
                episode.get("duration", ""),
                json.dumps(episode.get("languages", [])),
            ))
            episode_id = c.execute(
                "SELECT id FROM episode WHERE season_id = ? AND episode_number = ?",
                (season_id, int(ep_num)),
            ).fetchone()[0]

            urls = episode.get("urls", {}) or {}
            for lang, url_list in urls.items():
                if isinstance(url_list, str):
                    url_list = [url_list]
                if not isinstance(url_list, list):
                    continue
                for pos, url in enumerate(url_list):
                    if not url:
                        continue
                    c.execute("""
                        INSERT INTO episode_url
                        (episode_id, language, url, url_position, host)
                        VALUES (?, ?, ?, ?, ?)
                    """, (episode_id, lang, url, pos, extract_host(url)))


def insert_discover(c, position: int, anime: dict):
    """Insère une entrée discover."""
    anime_id = anime.get("anime_id") or anime.get("id")
    c.execute("""
        INSERT INTO discover
        (position, anime_id, title, description, image, rating, has_episodes, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        position,
        int(anime_id) if anime_id else None,
        anime.get("title", ""),
        anime.get("description", ""),
        anime.get("image"),
        float(anime.get("rating") or 0),
        1 if anime.get("has_episodes") else 0,
        json.dumps(anime, ensure_ascii=False),
    ))


def main():
    # Args
    anime_path    = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/AnimeZone/static/data/anime.json"
    discover_path = sys.argv[2] if len(sys.argv) > 2 else "/home/z/my-project/AnimeZone/data_discover.json"
    output_db     = sys.argv[3] if len(sys.argv) > 3 else "/home/z/my-project/download/animezone-mobile/android/app/src/main/assets/animezone.db"

    print(f"[1/4] Lecture {anime_path}...")
    with open(anime_path, encoding="utf-8") as f:
        data = json.load(f)
    animes = data.get("anime", data) if isinstance(data, dict) else data
    print(f"      → {len(animes)} animes chargés")

    print(f"[2/4] Lecture {discover_path}...")
    with open(discover_path, encoding="utf-8") as f:
        d = json.load(f)
    discover = d.get("anime", d) if isinstance(d, dict) else d
    print(f"      → {len(discover)} entrées discover")

    # Ensure output dir
    os.makedirs(os.path.dirname(output_db), exist_ok=True)
    if os.path.exists(output_db):
        os.remove(output_db)

    print(f"[3/4] Création {output_db}...")
    conn = sqlite3.connect(output_db)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.executescript(SCHEMA)

    c = conn.cursor()
    for anime in animes:
        insert_anime(c, anime)
    for i, item in enumerate(discover):
        insert_discover(c, i, item)
    conn.commit()

    # Stats
    total_anime    = c.execute("SELECT COUNT(*) FROM anime").fetchone()[0]
    total_genres   = c.execute("SELECT COUNT(*) FROM genre").fetchone()[0]
    total_seasons  = c.execute("SELECT COUNT(*) FROM season").fetchone()[0]
    total_episodes = c.execute("SELECT COUNT(*) FROM episode").fetchone()[0]
    total_urls     = c.execute("SELECT COUNT(*) FROM episode_url").fetchone()[0]
    total_discover = c.execute("SELECT COUNT(*) FROM discover").fetchone()[0]

    # Top hosts (sanity check)
    print("\n[4/4] Répartition par hébergeur :")
    for host, count in c.execute("""
        SELECT host, COUNT(*) as cnt
        FROM episode_url
        GROUP BY host
        ORDER BY cnt DESC
        LIMIT 10
    """):
        print(f"      {host:15s} {count:>6d}")

    # DB size
    db_size = os.path.getsize(output_db) / (1024 * 1024)

    print(f"""
✅ Conversion terminée
   Animes     : {total_anime:>6}
   Genres     : {total_genres:>6}
   Saisons    : {total_seasons:>6}
   Épisodes   : {total_episodes:>6}
   URLs       : {total_urls:>6}
   Discover   : {total_discover:>6}
   Taille DB  : {db_size:.2f} Mo
""")
    conn.close()


if __name__ == "__main__":
    main()
