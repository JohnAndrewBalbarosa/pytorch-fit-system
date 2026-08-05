"""Durable quota and reservation ledger for application goals."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from pydantic import BaseModel, Field, field_validator


class ApplicationGoalStatus(str, Enum):
    ACTIVE = "active"
    WAITING_FOR_HUMAN = "waiting_for_human"
    WAITING_FOR_CANDIDATES = "waiting_for_candidates"
    TARGET_REACHED = "target_reached"
    CANCELLED = "cancelled"


class GoalItemState(str, Enum):
    OBSERVED = "observed"
    RESERVED = "reserved"
    CONFIRMED = "confirmed"
    RELEASED = "released"
    SKIPPED = "skipped"
    FAILED = "failed"
    HUMAN_HANDOFF = "human_handoff"


class ApplicationGoal(BaseModel):
    id: str
    target: int
    confirmed: int = 0
    reserved: int = 0
    status: ApplicationGoalStatus = ApplicationGoalStatus.ACTIVE
    sites: list[str] = Field(default_factory=lambda: ["indeed"])
    target_countries: list[str] = Field(default_factory=lambda: ["Philippines"])
    work_mode: str = "remote"
    employment_type: str = "contract"
    created_at: str
    updated_at: str

    @property
    def remaining(self) -> int:
        return max(0, self.target - self.confirmed)

    @property
    def available(self) -> int:
        return max(0, self.target - self.confirmed - self.reserved)

    @field_validator("target")
    @classmethod
    def positive_target(cls, value: int) -> int:
        if value < 1:
            raise ValueError("target must be at least 1")
        return value


class GoalItem(BaseModel):
    goal_id: str
    task_id: str
    site: str
    company: str
    job_title: str
    state: GoalItemState
    counts_toward_target: bool = False
    detail: str = ""
    updated_at: str


class ApplicationGoalStore:
    """SQLite goal ledger with atomic reservation and confirmation accounting."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def create(
        self,
        *,
        target: int,
        sites: list[str] | None = None,
        target_countries: list[str] | None = None,
        work_mode: str = "remote",
        employment_type: str = "contract",
    ) -> ApplicationGoal:
        if target < 1:
            raise ValueError("target must be at least 1")
        now = _now()
        goal_id = uuid.uuid4().hex
        selected_sites = sites or ["indeed"]
        countries = target_countries or ["Philippines"]
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "UPDATE application_goals SET status = ?, updated_at = ? WHERE status IN (?, ?, ?)",
                (
                    ApplicationGoalStatus.CANCELLED.value,
                    now,
                    ApplicationGoalStatus.ACTIVE.value,
                    ApplicationGoalStatus.WAITING_FOR_HUMAN.value,
                    ApplicationGoalStatus.WAITING_FOR_CANDIDATES.value,
                ),
            )
            connection.execute(
                """
                INSERT INTO application_goals (
                    id, target, confirmed, reserved, status, sites, target_countries,
                    work_mode, employment_type, created_at, updated_at
                ) VALUES (?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    goal_id,
                    target,
                    ApplicationGoalStatus.ACTIVE.value,
                    _encode(selected_sites),
                    _encode(countries),
                    work_mode,
                    employment_type,
                    now,
                    now,
                ),
            )
        return self.get(goal_id)

    def active(self) -> ApplicationGoal | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM application_goals
                WHERE status IN (?, ?, ?)
                ORDER BY created_at DESC LIMIT 1
                """,
                (
                    ApplicationGoalStatus.ACTIVE.value,
                    ApplicationGoalStatus.WAITING_FOR_HUMAN.value,
                    ApplicationGoalStatus.WAITING_FOR_CANDIDATES.value,
                ),
            ).fetchone()
        return self._goal(row) if row else None

    def latest(self) -> ApplicationGoal | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM application_goals ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
        return self._goal(row) if row else None

    def get(self, goal_id: str) -> ApplicationGoal:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM application_goals WHERE id = ?", (goal_id,)
            ).fetchone()
        if row is None:
            raise KeyError(goal_id)
        return self._goal(row)

    def set_status(self, goal_id: str, status: ApplicationGoalStatus) -> ApplicationGoal:
        with self._connect() as connection:
            connection.execute(
                "UPDATE application_goals SET status = ?, updated_at = ? WHERE id = ?",
                (status.value, _now(), goal_id),
            )
            if connection.total_changes != 1:
                raise KeyError(goal_id)
        return self.get(goal_id)

    def observe(
        self,
        goal_id: str,
        *,
        task_id: str,
        site: str,
        company: str,
        job_title: str,
        state: GoalItemState = GoalItemState.OBSERVED,
        detail: str = "",
    ) -> GoalItem:
        now = _now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO application_goal_items (
                    goal_id, task_id, site, company, job_title, state,
                    counts_toward_target, detail, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
                ON CONFLICT(goal_id, task_id) DO UPDATE SET
                    site = excluded.site,
                    company = excluded.company,
                    job_title = excluded.job_title,
                    state = CASE
                        WHEN application_goal_items.state IN ('reserved', 'confirmed')
                        THEN application_goal_items.state ELSE excluded.state END,
                    detail = excluded.detail,
                    updated_at = excluded.updated_at
                """,
                (goal_id, task_id, site, company, job_title, state.value, detail[:500], now),
            )
        return self.item(goal_id, task_id)

    def reserve(self, goal_id: str, task_id: str) -> bool:
        """Reserve one still-available goal token exactly once."""
        now = _now()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            goal = connection.execute(
                "SELECT * FROM application_goals WHERE id = ?", (goal_id,)
            ).fetchone()
            item = connection.execute(
                "SELECT * FROM application_goal_items WHERE goal_id = ? AND task_id = ?",
                (goal_id, task_id),
            ).fetchone()
            if goal is None or item is None:
                raise KeyError(f"unknown goal item {goal_id}/{task_id}")
            if item["state"] in {GoalItemState.RESERVED.value, GoalItemState.CONFIRMED.value}:
                return True
            if goal["status"] == ApplicationGoalStatus.TARGET_REACHED.value:
                return False
            if int(goal["confirmed"]) + int(goal["reserved"]) >= int(goal["target"]):
                return False
            connection.execute(
                "UPDATE application_goal_items SET state = ?, updated_at = ? "
                "WHERE goal_id = ? AND task_id = ?",
                (GoalItemState.RESERVED.value, now, goal_id, task_id),
            )
            connection.execute(
                "UPDATE application_goals SET reserved = reserved + 1, updated_at = ? WHERE id = ?",
                (now, goal_id),
            )
        return True

    def confirm(self, goal_id: str, task_id: str, *, detail: str = "") -> ApplicationGoal:
        """Consume one token idempotently after deterministic/manual confirmation."""
        now = _now()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            goal = connection.execute(
                "SELECT * FROM application_goals WHERE id = ?", (goal_id,)
            ).fetchone()
            item = connection.execute(
                "SELECT * FROM application_goal_items WHERE goal_id = ? AND task_id = ?",
                (goal_id, task_id),
            ).fetchone()
            if goal is None or item is None:
                raise KeyError(f"unknown goal item {goal_id}/{task_id}")
            if item["state"] == GoalItemState.CONFIRMED.value:
                return self._goal(goal)
            if int(goal["confirmed"]) >= int(goal["target"]):
                raise ValueError("application goal is already satisfied")
            was_reserved = item["state"] == GoalItemState.RESERVED.value
            connection.execute(
                """
                UPDATE application_goal_items
                SET state = ?, counts_toward_target = 1, detail = ?, updated_at = ?
                WHERE goal_id = ? AND task_id = ?
                """,
                (GoalItemState.CONFIRMED.value, detail[:500], now, goal_id, task_id),
            )
            connection.execute(
                """
                UPDATE application_goals
                SET confirmed = confirmed + 1,
                    reserved = MAX(0, reserved - ?),
                    status = CASE WHEN confirmed + 1 >= target THEN ? ELSE ? END,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    int(was_reserved),
                    ApplicationGoalStatus.TARGET_REACHED.value,
                    ApplicationGoalStatus.ACTIVE.value,
                    now,
                    goal_id,
                ),
            )
        return self.get(goal_id)

    def release(
        self,
        goal_id: str,
        task_id: str,
        *,
        state: GoalItemState = GoalItemState.RELEASED,
        detail: str = "",
    ) -> ApplicationGoal:
        if state in {GoalItemState.RESERVED, GoalItemState.CONFIRMED}:
            raise ValueError("release state must not consume a goal token")
        now = _now()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            item = connection.execute(
                "SELECT state FROM application_goal_items WHERE goal_id = ? AND task_id = ?",
                (goal_id, task_id),
            ).fetchone()
            if item is None:
                raise KeyError(f"unknown goal item {goal_id}/{task_id}")
            was_reserved = item["state"] == GoalItemState.RESERVED.value
            if item["state"] == GoalItemState.CONFIRMED.value:
                goal = connection.execute(
                    "SELECT * FROM application_goals WHERE id = ?", (goal_id,)
                ).fetchone()
                if goal is None:
                    raise KeyError(goal_id)
                return self._goal(goal)
            connection.execute(
                """
                UPDATE application_goal_items
                SET state = ?, counts_toward_target = 0, detail = ?, updated_at = ?
                WHERE goal_id = ? AND task_id = ?
                """,
                (state.value, detail[:500], now, goal_id, task_id),
            )
            connection.execute(
                "UPDATE application_goals SET reserved = MAX(0, reserved - ?), "
                "status = CASE WHEN status = ? THEN status ELSE ? END, updated_at = ? WHERE id = ?",
                (
                    int(was_reserved),
                    ApplicationGoalStatus.TARGET_REACHED.value,
                    ApplicationGoalStatus.ACTIVE.value,
                    now,
                    goal_id,
                ),
            )
        return self.get(goal_id)

    def item(self, goal_id: str, task_id: str) -> GoalItem:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM application_goal_items WHERE goal_id = ? AND task_id = ?",
                (goal_id, task_id),
            ).fetchone()
        if row is None:
            raise KeyError(f"unknown goal item {goal_id}/{task_id}")
        return GoalItem.model_validate(dict(row))

    def items(self, goal_id: str) -> list[GoalItem]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM application_goal_items WHERE goal_id = ? ORDER BY updated_at DESC",
                (goal_id,),
            ).fetchall()
        return [GoalItem.model_validate(dict(row)) for row in rows]

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS application_goals (
                    id TEXT PRIMARY KEY,
                    target INTEGER NOT NULL CHECK(target > 0),
                    confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed >= 0),
                    reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0),
                    status TEXT NOT NULL,
                    sites TEXT NOT NULL,
                    target_countries TEXT NOT NULL,
                    work_mode TEXT NOT NULL,
                    employment_type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    CHECK(confirmed + reserved <= target)
                );
                CREATE TABLE IF NOT EXISTS application_goal_items (
                    goal_id TEXT NOT NULL REFERENCES application_goals(id) ON DELETE CASCADE,
                    task_id TEXT NOT NULL,
                    site TEXT NOT NULL,
                    company TEXT NOT NULL,
                    job_title TEXT NOT NULL,
                    state TEXT NOT NULL,
                    counts_toward_target INTEGER NOT NULL DEFAULT 0,
                    detail TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY(goal_id, task_id)
                );
                CREATE INDEX IF NOT EXISTS idx_goal_items_state
                    ON application_goal_items(goal_id, state, updated_at);
                """
            )

    @staticmethod
    def _goal(row: sqlite3.Row) -> ApplicationGoal:
        value = dict(row)
        value["sites"] = _decode(value["sites"])
        value["target_countries"] = _decode(value["target_countries"])
        return ApplicationGoal.model_validate(value)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _encode(values: list[str]) -> str:
    import json

    return json.dumps(values, separators=(",", ":"))


def _decode(value: str) -> list[str]:
    import json

    loaded = json.loads(value)
    return [str(item) for item in loaded]
