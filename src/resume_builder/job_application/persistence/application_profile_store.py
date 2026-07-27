"""SQLite-backed verified identity and resume-routing configuration."""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class VerifiedApplicationIdentity:
    first_name: str
    last_name: str
    country_name: str
    country_iso: str
    phone_calling_code: str
    verified_phone: str = ""

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


@dataclass(frozen=True)
class StoredResumeRoute:
    filename: str
    terms: tuple[str, ...]
    is_default: bool = False


class ApplicationProfileStore:
    """Persist structured user facts separately from resumes and browser state."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def save_verified_identity(
        self,
        *,
        first_name: str,
        last_name: str,
        country_name: str,
        country_iso: str,
        phone_calling_code: str,
        verified_phone: str = "",
    ) -> VerifiedApplicationIdentity:
        identity = self._validated_identity(
            first_name=first_name,
            last_name=last_name,
            country_name=country_name,
            country_iso=country_iso,
            phone_calling_code=phone_calling_code,
            verified_phone=verified_phone,
        )
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO verified_application_profile (
                    singleton_id, first_name, last_name, country_name, country_iso,
                    phone_calling_code, verified_phone, updated_at
                ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(singleton_id) DO UPDATE SET
                    first_name = excluded.first_name,
                    last_name = excluded.last_name,
                    country_name = excluded.country_name,
                    country_iso = excluded.country_iso,
                    phone_calling_code = excluded.phone_calling_code,
                    verified_phone = excluded.verified_phone,
                    updated_at = excluded.updated_at
                """,
                (
                    identity.first_name,
                    identity.last_name,
                    identity.country_name,
                    identity.country_iso,
                    identity.phone_calling_code,
                    identity.verified_phone,
                    now,
                ),
            )
        return identity

    def verified_identity(self) -> VerifiedApplicationIdentity | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT first_name, last_name, country_name, country_iso,
                       phone_calling_code, verified_phone
                FROM verified_application_profile
                WHERE singleton_id = 1
                """
            ).fetchone()
        if row is None:
            return None
        return VerifiedApplicationIdentity(
            first_name=row["first_name"],
            last_name=row["last_name"],
            country_name=row["country_name"],
            country_iso=row["country_iso"],
            phone_calling_code=row["phone_calling_code"],
            verified_phone=row["verified_phone"],
        )

    def replace_resume_route(
        self,
        *,
        filename: str,
        terms: list[str] | tuple[str, ...],
        is_default: bool = False,
    ) -> StoredResumeRoute:
        clean_filename = filename.strip()
        if (
            not clean_filename
            or Path(clean_filename).name != clean_filename
            or Path(clean_filename).suffix.casefold() != ".pdf"
        ):
            raise ValueError("resume filename must be one local PDF basename")
        clean_terms = tuple(
            dict.fromkeys(term.strip().casefold() for term in terms if term.strip())
        )
        if not clean_terms:
            raise ValueError("at least one nonempty resume-routing term is required")
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            if is_default:
                connection.execute("UPDATE resume_routes SET is_default = 0")
            connection.execute(
                """
                INSERT INTO resume_routes (
                    filename, terms_json, is_default, enabled, updated_at
                ) VALUES (?, ?, ?, 1, ?)
                ON CONFLICT(filename) DO UPDATE SET
                    terms_json = excluded.terms_json,
                    is_default = excluded.is_default,
                    enabled = 1,
                    updated_at = excluded.updated_at
                """,
                (
                    clean_filename,
                    json.dumps(clean_terms, ensure_ascii=False),
                    int(is_default),
                    now,
                ),
            )
        return StoredResumeRoute(clean_filename, clean_terms, is_default)

    def resume_routes(self) -> tuple[StoredResumeRoute, ...]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT filename, terms_json, is_default
                FROM resume_routes
                WHERE enabled = 1
                ORDER BY filename
                """
            ).fetchall()
        return tuple(
            StoredResumeRoute(
                filename=row["filename"],
                terms=tuple(json.loads(row["terms_json"])),
                is_default=bool(row["is_default"]),
            )
            for row in rows
        )

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS verified_application_profile (
                    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    country_name TEXT NOT NULL,
                    country_iso TEXT NOT NULL,
                    phone_calling_code TEXT NOT NULL,
                    verified_phone TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS resume_routes (
                    filename TEXT PRIMARY KEY,
                    terms_json TEXT NOT NULL,
                    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
                    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
                    updated_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_routes_one_default
                    ON resume_routes(is_default) WHERE is_default = 1 AND enabled = 1;
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _validated_identity(
        *,
        first_name: str,
        last_name: str,
        country_name: str,
        country_iso: str,
        phone_calling_code: str,
        verified_phone: str,
    ) -> VerifiedApplicationIdentity:
        values = {
            "first_name": first_name.strip(),
            "last_name": last_name.strip(),
            "country_name": country_name.strip(),
        }
        if any(not value for value in values.values()):
            raise ValueError("first name, last name, and country name are required")
        iso = country_iso.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", iso):
            raise ValueError("country ISO must contain exactly two letters")
        calling_code = phone_calling_code.strip()
        if not re.fullmatch(r"\+\d{1,4}", calling_code):
            raise ValueError("phone calling code must use + followed by 1-4 digits")
        phone = verified_phone.strip()
        if phone and not re.fullmatch(r"\+?[\d ()-]{7,24}", phone):
            raise ValueError("verified phone has an unsupported format")
        return VerifiedApplicationIdentity(
            first_name=values["first_name"],
            last_name=values["last_name"],
            country_name=values["country_name"],
            country_iso=iso,
            phone_calling_code=calling_code,
            verified_phone=phone,
        )
