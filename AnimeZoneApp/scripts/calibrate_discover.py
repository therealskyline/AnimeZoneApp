#!/usr/bin/env python3
"""
calibrate_discover.py — remplit la table `discover` de animezone.db avec
12 animes populaires bien choisis (One Punch Man, Naruto, Death Note, etc.).

Avant V1.4, la table discover ne contenait que 4 animes issus de
data_discover.json. C'était trop peu pour la page d'accueil.

On insère ici 12 animes "à la une" choisis manuellement pour leur popularité,
tous présents dans anime.db avec des épisodes. L'ordre des `position` détermine
l'ordre d'affichage sur le home.

Usage :
    python3 calibrate_discover.py [animezone.db]
"""

import json
import os
import sqlite3
import sys


# Liste curated de 12 animes "à la une" pour la page d'accueil.
# Ces titres sont recherchés dans anime.db (titre normalisé LIKE %name%).
# L'ordre = ordre d'affichage sur le home.
FEATURED_TITLES = [
    "One Punch Man",
    "Naruto Shippuden",
    "Death Note",
    "Demon Slayer",
    "Jujutsu Kaisen",
    "Chainsaw Man",
    "Shingeki no Kyojin",   # Attack on Titan (titre original japonais)
    "Spy X Family",
    "My Hero Academia",
    "Tokyo Revengers",
    "Sword Art Online",
    "Re:Zero",
]


def normalize(s: str) -> str:
    import unicodedata
    s = s.lower().strip()
    s = unicodedata.normalize("NFKD", s)
    return "".join(ch for ch in s if not unicodedata.combining(ch))


def find_anime_by_title(c, title: str):
    """Cherche un anime dont le titre normalisé contient `title` (normalisé)."""
    norm = normalize(title)
    # Match exact d'abord
    row = c.execute(
        "SELECT anime_id, title, raw_json FROM anime WHERE title_normalized = ? AND has_episodes = 1 LIMIT 1",
        (norm,),
    ).fetchone()
    if row:
        return row
    # Puis LIKE
    return c.execute(
        "SELECT anime_id, title, raw_json FROM anime WHERE title_normalized LIKE ? AND has_episodes = 1 ORDER BY length(title) ASC LIMIT 1",
        (f"%{norm}%",),
    ).fetchone()


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/AnimeZoneApp/android/app/src/main/assets/animezone.db"
    print(f"[1/3] Ouverture {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Vider la table discover
    print("[2/3] Vidage de la table discover...")
    c.execute("DELETE FROM discover")
    conn.commit()

    # Pour chaque titre featured, trouver l'anime dans la DB et l'insérer
    print("[3/3] Insertion des 12 animes featured...")
    inserted = 0
    missing = []
    for position, title in enumerate(FEATURED_TITLES):
        row = find_anime_by_title(c, title)
        if not row:
            print(f"  ✗ {title} — non trouvé dans la DB")
            missing.append(title)
            continue
        anime_id, found_title, raw_json = row
        anime = json.loads(raw_json)

        c.execute("""
            INSERT INTO discover (position, anime_id, title, description, image, rating, has_episodes, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            position,
            int(anime_id),
            anime.get("title", ""),
            anime.get("description", ""),
            anime.get("image"),
            float(anime.get("rating") or 0),
            1,
            raw_json,
        ))
        inserted += 1
        print(f"  ✓ [{position}] {found_title} (anime_id={anime_id})")

    conn.commit()

    # Vérification
    final_count = c.execute("SELECT COUNT(*) FROM discover").fetchone()[0]
    print(f"\n✅ {inserted} animes featured insérés (table discover: {final_count} lignes)")
    if missing:
        print(f"⚠️  {len(missing)} animes non trouvés: {missing}")

    # Afficher l'ordre final
    print("\n--- Ordre final sur le home ---")
    for r in c.execute("SELECT position, title FROM discover ORDER BY position"):
        print(f"  {r[0]:>2}. {r[1]}")
    conn.close()


if __name__ == "__main__":
    main()
