"""Lightweight SQLite helper functions for the Texas Hold'em club leaderboard."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable, Optional

# leaderboard points awarded per rank
DEFAULT_RANK_POINTS = {
    1: 200,
    2: 150,
    3: 120,
    4: 100,
    5: 80,
    6: 60,
    7: 50,
    8: 40,
    9: 30,
}

DB_PATH = Path(__file__).resolve().parent / "club.db"


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    """Return a connection with row factory configured for name-based access."""
    path = db_path or DB_PATH
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def initialize_database(force: bool = False) -> None:
    """Create tables if they do not exist. Optionally drop existing data."""
    ddl_statements = [
        """
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT NOT NULL UNIQUE,
            total_points INTEGER NOT NULL DEFAULT 0,
            avatar_url TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS score_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            delta INTEGER NOT NULL,
            reason TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
        );
        """,
    ]

    with connect() as conn:
        if force:
            conn.execute("DROP TABLE IF EXISTS score_history;")
            conn.execute("DROP TABLE IF EXISTS players;")
        for ddl in ddl_statements:
            conn.execute(ddl)
        conn.commit()


DEFAULT_AVATARS = {
    "AceHigh": "https://api.dicebear.com/7.x/initials/svg?seed=AceHigh&backgroundType=gradientLinear&fontSize=40",
    "RiverQueen": "https://api.dicebear.com/7.x/initials/svg?seed=RiverQueen&backgroundType=gradientLinear&fontSize=40",
    "LuckyChip": "https://api.dicebear.com/7.x/initials/svg?seed=LuckyChip&backgroundType=gradientLinear&fontSize=40",
    "SilentShark": "https://api.dicebear.com/7.x/initials/svg?seed=SilentShark&backgroundType=gradientLinear&fontSize=40",
}


def seed_sample_data() -> None:
    """Populate the database with some starter players and score events."""
    sample_players: Iterable[dict[str, object]] = [
        {
            "nickname": "AceHigh",
            "slogan": "Stack 'em high, rake it in.",
            "avatar_url": DEFAULT_AVATARS.get("AceHigh"),
            "events": [
                (+420, "Season opener victory"),
                (+380, "Heads-up challenge sweep"),
                (+460, "Cash game heater"),
            ],
        },
        {
            "nickname": "RiverQueen",
            "slogan": "Read the table, rule the river.",
            "avatar_url": DEFAULT_AVATARS.get("RiverQueen"),
            "events": [
                (+300, "Weekly league win"),
                (+260, "Rebuy tournament runner-up"),
                (+220, "Cash game gain"),
                (-40, "Charity bounty buy-in"),
            ],
        },
        {
            "nickname": "LuckyChip",
            "slogan": "Good vibes, better cards.",
            "avatar_url": DEFAULT_AVATARS.get("LuckyChip"),
            "events": [
                (+150, "Welcome knockout bonus"),
                (+210, "Sit & go victory"),
                (+190, "Weekend ring game"),
                (+160, "Tuesday turbo event"),
            ],
        },
        {
            "nickname": "SilentShark",
            "slogan": "Let the chips do the talking.",
            "avatar_url": DEFAULT_AVATARS.get("SilentShark"),
            "events": [
                (+180, "Mixed game podium finish"),
                (+210, "Cash game session"),
                (+120, "Heads-up challenge"),
                (+130, "League points"),
            ],
        },
    ]

    with connect() as conn:
        existing = conn.execute("SELECT COUNT(*) AS c FROM players;").fetchone()["c"]
        if existing:
            return

        for player in sample_players:
            cursor = conn.execute(
                "INSERT INTO players (nickname, notes, avatar_url) VALUES (?, ?, ?);",
                (player["nickname"], player.get("slogan", ""), player.get("avatar_url")),
            )
            player_id = cursor.lastrowid
            for delta, reason in player.get("events", []):
                conn.execute(
                    "INSERT INTO score_history (player_id, delta, reason) VALUES (?, ?, ?);",
                    (player_id, delta, reason),
                )
                conn.execute(
                    "UPDATE players SET total_points = total_points + ?, updated_at = datetime('now') WHERE id = ?;",
                    (delta, player_id),
                )
        conn.commit()


def list_leaderboard(limit: int = 50) -> list[sqlite3.Row]:
    """Return top players sorted by score descending."""
    with connect() as conn:
        cursor = conn.execute(
            """
            SELECT
                p.id,
                p.nickname,
                p.total_points,
                p.notes AS slogan,
                p.avatar_url,
                (
                    SELECT COUNT(*)
                    FROM score_history h
                    WHERE h.player_id = p.id
                ) AS finals_played
            FROM players p
            ORDER BY total_points DESC, nickname ASC
            LIMIT ?;
            """,
            (limit,),
        )
        return cursor.fetchall()


def get_player(player_id: int) -> Optional[sqlite3.Row]:
    """Fetch a single player row by id."""
    with connect() as conn:
        row = conn.execute(
            """
            SELECT
                p.id,
                p.nickname,
                p.total_points,
                p.notes AS slogan,
                p.avatar_url,
                p.created_at,
                p.updated_at,
                (
                    SELECT COUNT(*)
                    FROM score_history h
                    WHERE h.player_id = p.id
                ) AS finals_played
            FROM players p
            WHERE p.id = ?;
            """,
            (player_id,),
        ).fetchone()
        return row


def get_player_history(player_id: int, limit: int = 20) -> list[sqlite3.Row]:
    with connect() as conn:
        cursor = conn.execute(
            """
            SELECT delta, reason, created_at
            FROM score_history
            WHERE player_id = ?
            ORDER BY created_at DESC
            LIMIT ?;
            """,
            (player_id, limit),
        )
        return cursor.fetchall()


def add_player(nickname: str, slogan: str = "", avatar_url: Optional[str] = None) -> int:
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO players (nickname, notes, avatar_url) VALUES (?, ?, ?);",
            (nickname, slogan, avatar_url),
        )
        conn.commit()
        return cursor.lastrowid


def record_score_change(player_id: int, delta: int, reason: str = "") -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO score_history (player_id, delta, reason) VALUES (?, ?, ?);",
            (player_id, delta, reason),
        )
        conn.execute(
            "UPDATE players SET total_points = total_points + ?, updated_at = datetime('now') WHERE id = ?;",
            (delta, player_id),
        )
        conn.commit()


def get_player_by_nickname(nickname: str) -> Optional[sqlite3.Row]:
    with connect() as conn:
        row = conn.execute(
            "SELECT id, nickname, total_points, notes, created_at, updated_at FROM players WHERE nickname = ?;",
            (nickname,),
        ).fetchone()
        return row


def record_game_results(
    placements: Iterable[dict[str, object]],
    *,
    rank_points: Optional[dict[int, int]] = None,
    game_label: str = "Game result",
) -> dict[str, list[str]]:
    """Apply a batch of ranking results and return summary log.

    Each placement item should include at minimum ``nickname`` and ``rank``.
    Optionally it can specify ``points`` to override the default award and
    ``slogan``/``avatar_url`` to build new player profiles on the fly.
    """

    points_map = rank_points or DEFAULT_RANK_POINTS
    applied, errors = [], []

    with connect() as conn:
        for item in placements:
            nickname = (str(item.get("nickname")) if item.get("nickname") is not None else "").strip()
            if not nickname:
                errors.append("Missing nickname in placement entry")
                continue

            try:
                rank = int(item.get("rank"))
            except (TypeError, ValueError):
                errors.append(f"Invalid rank for {nickname}")
                continue

            try:
                delta = int(item.get("points")) if item.get("points") is not None else points_map[rank]
            except (KeyError, TypeError, ValueError):
                errors.append(f"No point mapping for rank {rank} ({nickname})")
                continue

            row = conn.execute(
                "SELECT id FROM players WHERE nickname = ?;",
                (nickname,),
            ).fetchone()
            if row:
                player_id = row["id"]
            else:
                cursor = conn.execute(
                    "INSERT INTO players (nickname, notes, avatar_url) VALUES (?, ?, ?);",
                    (
                        nickname,
                        str(item.get("slogan") or item.get("notes") or "").strip(),
                        item.get("avatar_url"),
                    ),
                )
                player_id = cursor.lastrowid

            reason = item.get("reason")
            if not reason:
                reason = f"{game_label} – Rank {rank}"

            conn.execute(
                "INSERT INTO score_history (player_id, delta, reason) VALUES (?, ?, ?);",
                (player_id, delta, reason),
            )
            conn.execute(
                "UPDATE players SET total_points = total_points + ?, updated_at = datetime('now') WHERE id = ?;",
                (delta, player_id),
            )
            applied.append(f"{nickname} (+{delta})")

        conn.commit()

    return {"applied": applied, "errors": errors}


def update_player_profile(
    player_id: int,
    *,
    nickname: Optional[str] = None,
    slogan: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> bool:
    """Update profile fields for a player.

    Returns True if at least one column was updated.
    """

    fields: list[str] = []
    values: list[object] = []

    if nickname is not None:
        fields.append("nickname = ?")
        values.append(nickname)
    if slogan is not None:
        fields.append("notes = ?")
        values.append(slogan)
    if avatar_url is not None:
        fields.append("avatar_url = ?")
        values.append(avatar_url)

    if not fields:
        return False

    values.append(player_id)

    with connect() as conn:
        conn.execute(
            f"UPDATE players SET {', '.join(fields)}, updated_at = datetime('now') WHERE id = ?;",
            tuple(values),
        )
        conn.commit()

    return True
