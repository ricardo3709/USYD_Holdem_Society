"""Minimal HTTP server exposing leaderboard APIs and serving the frontend."""
from __future__ import annotations

import base64
import json
import mimetypes
import os
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional

from db import (
    add_player,
    get_player,
    get_player_history,
    initialize_database,
    list_leaderboard,
    record_score_change,
    record_game_results,
    update_player_profile,
    seed_sample_data,
)

# --- configuration ---------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
STATIC_INDEX = FRONTEND_DIR / "index.html"
CONFIG_PATH = ROOT_DIR / "config.json"
ADMIN_REALM = "TexasHoldemClub"


def load_config() -> dict[str, str]:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Invalid config.json: {exc.msg}") from exc
    return {}


CONFIG = load_config()
ADMIN_USERNAME = CONFIG.get("admin_username") or os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = CONFIG.get("admin_password") or os.environ.get("ADMIN_PASSWORD", "clubsecret")


def json_response(handler: BaseHTTPRequestHandler, data: object, status: HTTPStatus = HTTPStatus.OK) -> None:
    payload = json.dumps(data).encode("utf-8")
    handler.send_response(status.value)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(payload)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(payload)


def read_request_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        handler.send_error(HTTPStatus.BAD_REQUEST, explain=f"Invalid JSON payload: {exc.msg}")
        return {}


def serve_static(handler: BaseHTTPRequestHandler, path: str) -> None:
    relative = path.lstrip("/") or "index.html"
    candidate = FRONTEND_DIR / relative
    candidate = candidate.resolve()
    try:
        candidate.relative_to(FRONTEND_DIR)
    except ValueError:
        handler.send_error(HTTPStatus.NOT_FOUND)
        return

    if not candidate.exists() or candidate.is_dir():
        handler.send_error(HTTPStatus.NOT_FOUND)
        return

    mime, _ = mimetypes.guess_type(str(candidate))
    payload = candidate.read_bytes()

    handler.send_response(HTTPStatus.OK.value)
    handler.send_header("Content-Type", mime or "application/octet-stream")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class LeaderboardHandler(BaseHTTPRequestHandler):
    # --- auth helpers -------------------------------------------------
    def ensure_admin(self) -> bool:
        if not ADMIN_PASSWORD:
            return True

        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            self.send_auth_challenge()
            return False

        try:
            decoded = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
        except Exception:
            self.send_auth_challenge()
            return False

        username, _, password = decoded.partition(":")
        if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
            self.send_auth_challenge()
            return False

        return True

    def send_auth_challenge(self) -> None:
        self.send_response(HTTPStatus.UNAUTHORIZED.value)
        self.send_header("WWW-Authenticate", f'Basic realm="{ADMIN_REALM}"')
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"Authentication required")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT.value)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/api/leaderboard"):
            self.handle_leaderboard()
        elif self.path.startswith("/api/players/"):
            self.handle_player_detail()
        elif self.path in {"/admin.html", "/admin.js"}:
            if not self.ensure_admin():
                return
            serve_static(self, urllib.parse.urlparse(self.path).path)
        else:
            serve_static(self, urllib.parse.urlparse(self.path).path)

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/api/players":
            self.handle_create_player()
        elif self.path.startswith("/api/players/") and self.path.endswith("/scores"):
            self.handle_record_score()
        elif self.path.startswith("/api/players/") and self.path.endswith("/profile"):
            if not self.ensure_admin():
                return
            self.handle_update_profile()
        elif self.path == "/api/games":
            if not self.ensure_admin():
                return
            self.handle_submit_game()
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    # --- API handlers -------------------------------------------------
    def handle_leaderboard(self) -> None:
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        try:
            limit = int(params.get("limit", [50])[0])
        except ValueError:
            json_response(self, {"error": "limit must be an integer"}, HTTPStatus.BAD_REQUEST)
            return

        rows = list_leaderboard(limit=limit)
        payload = [
            {
                "id": row["id"],
                "nickname": row["nickname"],
                "total_points": row["total_points"],
                "slogan": row["slogan"],
                "avatar_url": row["avatar_url"],
                "finals_played": row["finals_played"],
            }
            for row in rows
        ]
        json_response(self, {"players": payload})

    def handle_player_detail(self) -> None:
        try:
            player_id = int(self.path.split("/")[3])
        except (IndexError, ValueError):
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        player = get_player(player_id)
        if not player:
            json_response(self, {"error": "Player not found"}, HTTPStatus.NOT_FOUND)
            return

        history = get_player_history(player_id)
        payload = {
            "player": {
                "id": player["id"],
                "nickname": player["nickname"],
                "total_points": player["total_points"],
                "slogan": player["slogan"],
                "avatar_url": player["avatar_url"],
                "created_at": player["created_at"],
                "updated_at": player["updated_at"],
                "finals_played": player["finals_played"],
            },
            "history": [
                {
                    "delta": row["delta"],
                    "reason": row["reason"],
                    "created_at": row["created_at"],
                }
                for row in history
            ],
        }
        json_response(self, payload)

    def handle_create_player(self) -> None:
        payload = read_request_json(self)
        nickname = (payload.get("nickname") or "").strip()
        slogan = (payload.get("slogan") or "").strip()
        avatar_url = (payload.get("avatar_url") or "").strip() or None

        if not nickname:
            json_response(self, {"error": "nickname is required"}, HTTPStatus.BAD_REQUEST)
            return

        try:
            player_id = add_player(nickname=nickname, slogan=slogan, avatar_url=avatar_url)
        except Exception as exc:  # sqlite constraint violation etc.
            json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        json_response(self, {"player_id": player_id}, HTTPStatus.CREATED)

    def handle_record_score(self) -> None:
        parts = self.path.strip("/").split("/")
        if len(parts) < 3:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            player_id = int(parts[1])
        except ValueError:
            json_response(self, {"error": "Invalid player id"}, HTTPStatus.BAD_REQUEST)
            return

        payload = read_request_json(self)
        try:
            delta = int(payload.get("delta"))
        except (TypeError, ValueError):
            json_response(self, {"error": "delta must be an integer"}, HTTPStatus.BAD_REQUEST)
            return
        reason = (payload.get("reason") or "").strip()

        record_score_change(player_id=player_id, delta=delta, reason=reason)
        json_response(self, {"status": "ok"}, HTTPStatus.CREATED)

    def handle_submit_game(self) -> None:
        payload = read_request_json(self)
        placements = payload.get("placements")
        if not isinstance(placements, list) or not placements:
            json_response(self, {"error": "placements must be a non-empty list"}, HTTPStatus.BAD_REQUEST)
            return

        label = (payload.get("label") or "").strip() or "Game result"

        summary = record_game_results(placements, game_label=label)
        status = HTTPStatus.CREATED if summary["applied"] else HTTPStatus.BAD_REQUEST
        json_response(self, summary, status=status)

    def handle_update_profile(self) -> None:
        parts = self.path.strip("/").split("/")
        if len(parts) < 3:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        try:
            player_id = int(parts[1])
        except ValueError:
            json_response(self, {"error": "Invalid player id"}, HTTPStatus.BAD_REQUEST)
            return

        payload = read_request_json(self)
        updates: dict[str, Optional[str]] = {}

        if "nickname" in payload:
            nickname = (payload.get("nickname") or "").strip()
            if not nickname:
                json_response(self, {"error": "nickname cannot be empty"}, HTTPStatus.BAD_REQUEST)
                return
            updates["nickname"] = nickname

        if "slogan" in payload:
            slogan = (payload.get("slogan") or "").strip()
            updates["slogan"] = slogan

        if "avatar_url" in payload:
            avatar_url = (payload.get("avatar_url") or "").strip()
            updates["avatar_url"] = avatar_url or None

        if not updates:
            json_response(self, {"error": "No fields to update"}, HTTPStatus.BAD_REQUEST)
            return

        update_player_profile(player_id, **updates)
        json_response(self, {"status": "updated"})

    # --- logging ------------------------------------------------------
    def log_message(self, fmt: str, *args: object) -> None:  # noqa: D401
        # Suppress default noisy logging. Uncomment for debugging.
        return


def run_server(port: int = 8000) -> None:
    initialize_database()
    seed_sample_data()
    server = ThreadingHTTPServer(("0.0.0.0", port), LeaderboardHandler)
    print(f"Serving leaderboard on http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run the local leaderboard server")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on")
    args = parser.parse_args()
    run_server(port=args.port)
