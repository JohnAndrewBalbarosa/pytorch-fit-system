"""Deterministic access checks and a non-secret human-verification queue."""

from __future__ import annotations

import hashlib
import json
from threading import RLock
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, model_validator

from .privacy import redact
from .shared.access_gate import (
    AccessGateResult,
    AccessGateState,
    check_access_gate,
    sanitize_application_url,
)

__all__ = [
    "AccessGateResult",
    "AccessGateState",
    "HumanVerificationQueue",
    "InterventionAction",
    "VerificationQueueEntry",
    "VerificationQueueGroup",
    "VerificationQueueState",
    "check_access_gate",
    "sanitize_application_url",
]

_QUEUE_LOCK = RLock()


class VerificationQueueState(str, Enum):
    PENDING = "pending"
    RESOLVED = "resolved"


class VerificationQueueGroup(str, Enum):
    ACCESS_VERIFICATION = "access_verification"
    HUMAN_INTERVENTION = "human_intervention"


class InterventionAction(str, Enum):
    CAPTCHA = "captcha"
    HUMAN_VERIFICATION = "human_verification"
    UNKNOWN_QUESTION = "unknown_question"
    SIGN_IN = "sign_in"
    EXTERNAL_APPLICATION = "external_application"
    OTHER = "other"


class VerificationQueueEntry(BaseModel):
    id: str
    application_reference: str
    domain: str
    url: str
    reason: str
    status: VerificationQueueState
    created_at: str
    updated_at: str
    occurrences: int = 1
    browser_target_id: str = ""
    group: VerificationQueueGroup = VerificationQueueGroup.ACCESS_VERIFICATION
    action: InterventionAction = InterventionAction.OTHER
    question_labels: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def classify_legacy_entry(cls, value):
        if not isinstance(value, dict) or value.get("action"):
            return value
        payload = dict(value)
        payload["action"] = _action_for_reason(str(payload.get("reason", ""))).value
        return payload


def _action_for_reason(reason: str) -> InterventionAction:
    normalized = reason.casefold().strip()
    if "captcha" in normalized:
        return InterventionAction.CAPTCHA
    if normalized in {"verification_required", "human_verification"}:
        return InterventionAction.HUMAN_VERIFICATION
    if normalized in {"signed_out", "sign_in"}:
        return InterventionAction.SIGN_IN
    if normalized in {"unknown_question", "unanswered_question"}:
        return InterventionAction.UNKNOWN_QUESTION
    if normalized == "apply_on_company_site":
        return InterventionAction.EXTERNAL_APPLICATION
    return InterventionAction.OTHER


def _safe_application_reference(application_reference: str, safe_url: str) -> str:
    reference = application_reference.strip()
    parts = urlsplit(reference)
    if parts.scheme and parts.netloc:
        reference = sanitize_application_url(reference)
    return redact(reference, limit=200) or safe_url


class HumanVerificationQueue:
    """JSON-backed queue containing no cookies, credentials, or URL query values."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def enqueue(
        self,
        *,
        application_reference: str,
        url: str,
        result: AccessGateResult,
        browser_target_id: str = "",
        group: VerificationQueueGroup = VerificationQueueGroup.ACCESS_VERIFICATION,
    ) -> VerificationQueueEntry:
        if not result.blocked:
            raise ValueError("only human-required access results may be queued")
        return self.enqueue_handoff(
            application_reference=application_reference,
            url=url,
            reason=result.reason,
            browser_target_id=browser_target_id,
            group=group,
        )

    def enqueue_handoff(
        self,
        *,
        application_reference: str,
        url: str,
        reason: str,
        browser_target_id: str = "",
        group: VerificationQueueGroup = VerificationQueueGroup.HUMAN_INTERVENTION,
        action: InterventionAction | None = None,
        question_labels: list[str] | None = None,
    ) -> VerificationQueueEntry:
        """Queue a non-access human handoff without pretending it is an access blocker."""
        with _QUEUE_LOCK:
            safe_url = sanitize_application_url(url)
            domain = (urlsplit(safe_url).hostname or "").lower()
            reference = _safe_application_reference(application_reference, safe_url)
            resolved_action = action or _action_for_reason(reason)
            entry_id = self._entry_id(domain, reference, resolved_action)
            payload = self._load()
            existing = payload.get(entry_id)
            legacy_id = self._legacy_entry_id(domain, reference)
            legacy = payload.get(legacy_id)
            if (
                existing is None
                and legacy is not None
                and _action_for_reason(str(legacy.get("reason", ""))) == resolved_action
            ):
                entry_id = legacy_id
                existing = legacy
            now = datetime.now(timezone.utc).isoformat()
            entry = VerificationQueueEntry(
                id=entry_id,
                application_reference=reference,
                domain=domain,
                url=safe_url,
                reason=redact(reason, limit=80),
                status=VerificationQueueState.PENDING,
                created_at=existing.get("created_at", now) if existing else now,
                updated_at=now,
                occurrences=int(existing.get("occurrences", 1)) + 1 if existing else 1,
                browser_target_id=browser_target_id
                or (str(existing.get("browser_target_id", "")) if existing else ""),
                group=group,
                action=resolved_action,
                question_labels=[
                    redact(label, limit=240)
                    for label in (question_labels or [])[:12]
                    if redact(label, limit=240)
                ],
            )
            payload[entry_id] = entry.model_dump(mode="json")
            self._save(payload)
        return entry

    def resolve_if_clear(
        self,
        *,
        application_reference: str,
        url: str,
        result: AccessGateResult,
    ) -> VerificationQueueEntry | None:
        if result.blocked:
            return None
        with _QUEUE_LOCK:
            safe_url = sanitize_application_url(url)
            domain = (urlsplit(safe_url).hostname or "").lower()
            reference = _safe_application_reference(application_reference, safe_url)
            payload = self._load()
            entry_id = next(
                (
                    key
                    for key, value in payload.items()
                    if value.get("status") == VerificationQueueState.PENDING.value
                    and str(value.get("domain", "")) == domain
                    and str(value.get("application_reference", "")) == reference
                    and _action_for_reason(str(value.get("reason", "")))
                    in {
                        InterventionAction.CAPTCHA,
                        InterventionAction.HUMAN_VERIFICATION,
                        InterventionAction.SIGN_IN,
                    }
                ),
                "",
            )
            existing = payload.get(entry_id)
            if not existing:
                return None
            existing["status"] = VerificationQueueState.RESOLVED.value
            existing["updated_at"] = datetime.now(timezone.utc).isoformat()
            payload[entry_id] = existing
            self._save(payload)
        return VerificationQueueEntry.model_validate(existing)

    def pending(self) -> list[VerificationQueueEntry]:
        with _QUEUE_LOCK:
            return sorted(
                (
                    VerificationQueueEntry.model_validate(value)
                    for value in self._load().values()
                    if value.get("status") == VerificationQueueState.PENDING.value
                ),
                key=lambda item: item.updated_at,
            )

    @staticmethod
    def _entry_id(
        domain: str,
        application_reference: str,
        action: InterventionAction = InterventionAction.OTHER,
    ) -> str:
        value = f"{domain}\n{application_reference}\n{action.value}".encode()
        return hashlib.sha256(value).hexdigest()[:20]

    @staticmethod
    def _legacy_entry_id(domain: str, application_reference: str) -> str:
        value = f"{domain}\n{application_reference}".encode()
        return hashlib.sha256(value).hexdigest()[:20]

    def resolve(self, entry_id: str) -> VerificationQueueEntry | None:
        """Resolve one exact intervention after its page state has been proven clear."""
        with _QUEUE_LOCK:
            payload = self._load()
            existing = payload.get(entry_id)
            if not existing:
                return None
            existing["status"] = VerificationQueueState.RESOLVED.value
            existing["updated_at"] = datetime.now(timezone.utc).isoformat()
            payload[entry_id] = existing
            self._save(payload)
        return VerificationQueueEntry.model_validate(existing)

    def resolve_matching(
        self,
        *,
        application_reference: str,
        action: InterventionAction,
    ) -> list[VerificationQueueEntry]:
        """Resolve pending entries for one application and one exact action kind."""
        reference = _safe_application_reference(application_reference, "")
        resolved: list[VerificationQueueEntry] = []
        with _QUEUE_LOCK:
            payload = self._load()
            now = datetime.now(timezone.utc).isoformat()
            for entry_id, existing in payload.items():
                entry = VerificationQueueEntry.model_validate(existing)
                if (
                    entry.status == VerificationQueueState.PENDING
                    and entry.application_reference == reference
                    and entry.action == action
                ):
                    existing["status"] = VerificationQueueState.RESOLVED.value
                    existing["updated_at"] = now
                    payload[entry_id] = existing
                    resolved.append(VerificationQueueEntry.model_validate(existing))
            if resolved:
                self._save(payload)
        return resolved

    def _load(self) -> dict[str, dict]:
        if not self.path.exists():
            return {}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _save(self, payload: dict[str, dict]) -> None:
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        temporary.replace(self.path)
