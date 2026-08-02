"""Read-only control state and explicit human handoffs for the local job finder UI."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit

import requests

from ..job_application import (
    HumanVerificationQueue,
    InterventionAction,
    VerificationQueueEntry,
    check_access_gate,
)
from .auth import IdentityStore, auth_status, clear_social_session, provider_configuration_status

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_QUEUE_PATH = REPO_ROOT / ".cache" / "application-verification-queue.json"
DEFAULT_RUN_ROOT = REPO_ROOT / "out" / "indeed-unattended"

_PROVIDERS = {"github", "google", "microsoft", "facebook", "linkedin", "indeed"}
_SOCIAL_PROVIDERS = {"facebook", "linkedin"}
_WEBSITE_LOGOUT_URLS = {
    "github": "https://github.com/logout",
    "google": "https://accounts.google.com/Logout",
    "microsoft": "https://login.microsoftonline.com/common/oauth2/v2.0/logout",
    "facebook": "https://www.facebook.com/settings?tab=security",
    "linkedin": "https://www.linkedin.com/m/logout/",
    "indeed": "https://secure.indeed.com/account/logout",
}
_SIGN_IN_URLS = {"indeed": "https://secure.indeed.com/auth"}


def _cdp_url() -> str:
    return os.environ.get("RESUME_BUILD_PLAYWRIGHT_CDP_URL", "http://127.0.0.1:9222").rstrip("/")


def _queue() -> HumanVerificationQueue:
    configured = os.environ.get("JOB_FINDER_VERIFICATION_QUEUE", "").strip()
    return HumanVerificationQueue(Path(configured) if configured else DEFAULT_QUEUE_PATH)


def _targets() -> list[dict[str, Any]]:
    try:
        response = requests.get(f"{_cdp_url()}/json", timeout=2)
        response.raise_for_status()
        value = response.json()
    except (requests.RequestException, ValueError):
        return []
    return [item for item in value if isinstance(item, dict) and item.get("type") == "page"]


def _latest_run() -> dict[str, Any]:
    candidates = list(DEFAULT_RUN_ROOT.glob("**/run.json")) if DEFAULT_RUN_ROOT.exists() else []
    if not candidates:
        return {}
    path = max(candidates, key=lambda candidate: candidate.stat().st_mtime)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"status": "unavailable", "error": "latest run artifact is unreadable"}
    if not isinstance(value, dict):
        return {"status": "unavailable", "error": "latest run artifact is invalid"}
    try:
        value["artifact"] = str(path.relative_to(REPO_ROOT))
    except ValueError:
        value["artifact"] = path.name
    return value


def _site_for_domain(domain: str) -> str:
    normalized = domain.casefold()
    if "linkedin" in normalized:
        return "linkedin"
    if "indeed" in normalized:
        return "indeed"
    if "facebook" in normalized:
        return "facebook"
    return normalized or "other"


def _instruction(action: InterventionAction) -> str:
    return {
        InterventionAction.CAPTCHA: "Complete the CAPTCHA in the open browser tab.",
        InterventionAction.HUMAN_VERIFICATION: "Complete the visible human verification check.",
        InterventionAction.UNKNOWN_QUESTION: (
            "Answer the listed fields in the browser, then use the site's Continue control."
        ),
        InterventionAction.SIGN_IN: "Sign in in the visible browser and complete any 2FA prompt.",
        InterventionAction.EXTERNAL_APPLICATION: "Complete this company-site application manually.",
        InterventionAction.OTHER: "Review the browser page and complete the requested action.",
    }[action]


def _entry_payload(entry: VerificationQueueEntry) -> dict[str, Any]:
    return {
        **entry.model_dump(mode="json"),
        "site": _site_for_domain(entry.domain),
        "instruction": _instruction(entry.action),
        "can_focus": bool(entry.browser_target_id),
    }


def _automatic_work(run: dict[str, Any]) -> list[dict[str, Any]]:
    jobs = {
        str(item.get("task_id", "")): item
        for item in run.get("jobs", [])
        if isinstance(item, dict) and item.get("task_id")
    }
    outcomes = {
        str(item.get("task", {}).get("task_id", "")): item
        for item in run.get("outcomes", [])
        if isinstance(item, dict) and isinstance(item.get("task"), dict)
    }
    items: list[dict[str, Any]] = []
    for task_id, job in jobs.items():
        outcome = outcomes.get(task_id, {})
        status = str(outcome.get("status") or "queued")
        if status in {"verification_pending", "human_handoff"}:
            continue
        items.append(
            {
                "task_id": task_id,
                "company": str(job.get("company", ""))[:160],
                "job_title": str(job.get("job_title", ""))[:200],
                "site": _site_for_domain(str(job.get("domain", "indeed"))),
                "status": status,
                "detail": str(outcome.get("detail", "Waiting for an available worker."))[:300],
            }
        )
    return items


def _run_interventions(
    run: dict[str, Any],
    queued: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    queued_references = {str(item.get("application_reference", "")) for item in queued}
    items: list[dict[str, Any]] = []
    for outcome in run.get("outcomes", []):
        if not isinstance(outcome, dict) or outcome.get("status") not in {
            "verification_pending",
            "human_handoff",
        }:
            continue
        task = outcome.get("task") if isinstance(outcome.get("task"), dict) else {}
        reference = str(task.get("application_reference", "")).strip() or (
            f"{str(task.get('company', '')).strip()} — {str(task.get('job_title', '')).strip()}"
        ).strip(" —")
        if reference in queued_references:
            continue
        detail = str(outcome.get("detail", "human review required"))[:300]
        lowered = detail.casefold()
        if "captcha" in lowered:
            action = InterventionAction.CAPTCHA
        elif "verification" in lowered or "are you human" in lowered:
            action = InterventionAction.HUMAN_VERIFICATION
        elif "questionnaire" in lowered or "question" in lowered:
            action = InterventionAction.UNKNOWN_QUESTION
        elif "sign in" in lowered or "signed out" in lowered:
            action = InterventionAction.SIGN_IN
        elif "company site" in lowered or "external" in lowered:
            action = InterventionAction.EXTERNAL_APPLICATION
        else:
            action = InterventionAction.OTHER
        domain = str(task.get("domain", ""))
        items.append(
            {
                "id": f"run-{str(task.get('task_id', 'unknown'))[:80]}",
                "application_reference": reference or "Application",
                "domain": domain,
                "url": "",
                "reason": detail,
                "status": "pending",
                "created_at": "",
                "updated_at": run.get("finished_at") or run.get("started_at", ""),
                "occurrences": 1,
                "browser_target_id": "",
                "group": "human_intervention",
                "action": action.value,
                "question_labels": [],
                "site": _site_for_domain(domain),
                "instruction": _instruction(action),
                "can_focus": False,
            }
        )
    return items


def _session_state() -> dict[str, Any]:
    state = auth_status()
    state["oauth_setup"] = provider_configuration_status()
    indeed_targets = [
        target
        for target in _targets()
        if "indeed.com" in (urlsplit(str(target.get("url", ""))).hostname or "").lower()
    ]
    signed_in_target = next(
        (
            target
            for target in indeed_targets
            if "/myjobs" in urlsplit(str(target.get("url", ""))).path.casefold()
            or "my jobs" in str(target.get("title", "")).casefold()
        ),
        None,
    )
    state.setdefault("job_sites", {})["indeed"] = {
        "connected": signed_in_target is not None,
        "browser_open": bool(indeed_targets),
        "status": (
            "signed-in account evidence visible"
            if signed_in_target
            else "Indeed tab open; sign-in unverified"
            if indeed_targets
            else "No Indeed browser tab"
        ),
    }
    return state


def control_state() -> dict[str, Any]:
    run = _latest_run()
    pending = [_entry_payload(entry) for entry in _queue().pending()]
    interventions = [*pending, *_run_interventions(run, pending)]
    automatic = _automatic_work(run)
    return {
        "sessions": _session_state(),
        "run": {
            "status": run.get("status", "not_started"),
            "started_at": run.get("started_at", ""),
            "finished_at": run.get("finished_at", ""),
            "artifact": run.get("artifact", ""),
            "confirmed_submissions": run.get("confirmed_submissions", 0),
            "error": run.get("error", ""),
        },
        "automatic": automatic,
        "interventions": interventions,
        "counts": {
            "automatic": len(automatic),
            "interventions": len(interventions),
        },
    }


def focus_target(target_id: str) -> None:
    safe_id = "".join(
        character for character in target_id if character.isalnum() or character in "-_"
    )
    if not safe_id or safe_id != target_id:
        raise ValueError("invalid browser target")
    response = requests.post(f"{_cdp_url()}/json/activate/{quote(safe_id)}", timeout=3)
    response.raise_for_status()


def focus_intervention(entry_id: str) -> None:
    entry = next((item for item in _queue().pending() if item.id == entry_id), None)
    if entry is None:
        raise KeyError(entry_id)
    if not entry.browser_target_id:
        raise ValueError("intervention has no live browser target")
    focus_target(entry.browser_target_id)


def open_browser_url(url: str) -> dict[str, str]:
    response = requests.put(f"{_cdp_url()}/json/new?{quote(url, safe=':/')}", timeout=4)
    response.raise_for_status()
    payload = response.json()
    return {"target_id": str(payload.get("id", "")), "url": str(payload.get("url", url))}


def start_session(provider: str) -> dict[str, str]:
    if provider not in _SIGN_IN_URLS:
        raise KeyError(provider)
    return open_browser_url(_SIGN_IN_URLS[provider])


def disconnect_provider(provider: str, *, website_logout: bool) -> dict[str, Any]:
    if provider not in _PROVIDERS:
        raise KeyError(provider)
    cleared = False
    if provider in {"github", "google", "microsoft"}:
        cleared = IdentityStore().clear_profile(provider)
    elif provider in _SOCIAL_PROVIDERS:
        cleared = clear_social_session(provider)
    opened = None
    if website_logout:
        opened = open_browser_url(_WEBSITE_LOGOUT_URLS[provider])
    return {"provider": provider, "cleared": cleared, "website_logout": opened}


def recheck_intervention(entry_id: str) -> dict[str, Any]:
    queue = _queue()
    entry = next((item for item in queue.pending() if item.id == entry_id), None)
    if entry is None:
        raise KeyError(entry_id)
    if not entry.browser_target_id:
        return {"resolved": False, "reason": "No live browser target is attached."}

    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp(_cdp_url())
        page = None
        for context in browser.contexts:
            for candidate in context.pages:
                session = context.new_cdp_session(candidate)
                try:
                    info = session.send("Target.getTargetInfo")
                    if (
                        str(info.get("targetInfo", {}).get("targetId", ""))
                        == entry.browser_target_id
                    ):
                        page = candidate
                        break
                finally:
                    session.detach()
            if page is not None:
                break
        if page is None:
            return {"resolved": False, "reason": "The saved browser tab is no longer open."}
        if entry.action == InterventionAction.UNKNOWN_QUESTION:
            clear = "/questions-module" not in urlsplit(str(page.url)).path
            reason = "questionnaire page advanced" if clear else "questionnaire still open"
        elif entry.action in {
            InterventionAction.CAPTCHA,
            InterventionAction.HUMAN_VERIFICATION,
            InterventionAction.SIGN_IN,
        }:
            access = check_access_gate(page)
            clear = not access.blocked
            reason = "access gate clear" if clear else access.reason
        else:
            return {"resolved": False, "reason": "This task requires explicit manual completion."}
    if clear:
        queue.resolve(entry.id)
    return {"resolved": clear, "reason": reason}
