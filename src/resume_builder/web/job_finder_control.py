"""Read-only control state and explicit human handoffs for the local job finder UI."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from threading import RLock
from typing import Any
from urllib.parse import quote, urlsplit

import requests

from ..job_application import (
    ApplicationProfileStore,
    ApplicationSubmissionHistory,
    ConfirmationSource,
    DevelopmentQuestionBridge,
    HumanVerificationQueue,
    InterventionAction,
    VerificationQueueEntry,
    check_access_gate,
)
from .auth import IdentityStore, auth_status, clear_social_session, provider_configuration_status
from .job_finder_supervisor import DEFAULT_ARTIFACT_DIR, DEFAULT_DATABASE
from .shared_browser import cdp_url, open_tab

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_QUEUE_PATH = REPO_ROOT / ".cache" / "application-verification-queue.json"
DEFAULT_RUN_ROOT = REPO_ROOT / "out" / "indeed-unattended"
DEFAULT_DEVELOPMENT_BRIDGE_ROOT = REPO_ROOT / "out" / "development-question-bridge"

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
_PREVIEW_LOCK = RLock()
_PREVIEW_CACHE: dict[str, tuple[float, bytes]] = {}


def _cdp_url() -> str:
    return cdp_url()


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


def _resume_catalog() -> list[dict[str, Any]]:
    """Inventory generated PDFs and their deterministic job-search routes."""
    routes = {
        route.filename: route for route in ApplicationProfileStore(DEFAULT_DATABASE).resume_routes()
    }
    filenames = set(routes)
    if DEFAULT_ARTIFACT_DIR.is_dir():
        filenames.update(path.name for path in DEFAULT_ARTIFACT_DIR.glob("*.pdf"))
    items: list[dict[str, Any]] = []
    for filename in sorted(filenames):
        pdf_path = DEFAULT_ARTIFACT_DIR / filename
        metadata_path = pdf_path.with_suffix(".resume.json")
        label = pdf_path.stem.replace("-", " ").title()
        role_id = ""
        if metadata_path.is_file():
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                role = metadata.get("role", {}) if isinstance(metadata, dict) else {}
                if isinstance(role, dict):
                    label = str(role.get("label") or label)[:160]
                    role_id = str(role.get("id") or "")[:120]
            except (OSError, json.JSONDecodeError):
                pass
        route = routes.get(filename)
        items.append(
            {
                "filename": filename,
                "label": label,
                "role_id": role_id,
                "terms": list(route.terms) if route else [],
                "is_default": bool(route and route.is_default),
                "artifact_ready": pdf_path.is_file() and metadata_path.is_file(),
                "routing_ready": route is not None,
            }
        )
    return items


def _resume_lookup() -> tuple[dict[str, str], dict[str, str]]:
    """Recover resume labels for current and historical queue microtasks."""
    by_task: dict[str, str] = {}
    by_reference: dict[str, str] = {}
    candidates = sorted(
        DEFAULT_RUN_ROOT.glob("**/run.json") if DEFAULT_RUN_ROOT.exists() else (),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for path in candidates:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for job in payload.get("jobs", []) if isinstance(payload, dict) else []:
            if not isinstance(job, dict):
                continue
            resume_file = str(job.get("resume_file", "")).strip()
            if not resume_file:
                continue
            task_id = str(job.get("task_id", "")).strip()
            reference = (
                f"{str(job.get('company', '')).strip()} — {str(job.get('job_title', '')).strip()}"
            ).strip(" —")
            if task_id:
                by_task.setdefault(task_id, resume_file)
            if reference:
                by_reference.setdefault(reference, resume_file)
    return by_task, by_reference


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


def _entry_payload(
    entry: VerificationQueueEntry,
    *,
    live_target_ids: set[str] | None = None,
) -> dict[str, Any]:
    target_is_live = bool(entry.browser_target_id) and (
        live_target_ids is None or entry.browser_target_id in live_target_ids
    )
    return {
        **entry.model_dump(mode="json"),
        "site": _site_for_domain(entry.domain),
        "instruction": _instruction(entry.action),
        "can_focus": target_is_live,
        "preview_url": (
            f"/api/job-finder/targets/{entry.browser_target_id}/preview" if target_is_live else ""
        ),
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
                "resume_file": str(job.get("resume_file", ""))[:160],
                "detail": str(outcome.get("detail", "Waiting for an available worker."))[:300],
            }
        )
    return items


def _live_pages(
    pending: list[VerificationQueueEntry],
    targets: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    by_target = {entry.browser_target_id: entry for entry in pending if entry.browser_target_id}
    pages: list[dict[str, Any]] = []
    for target in targets if targets is not None else _targets():
        target_id = str(target.get("id", ""))
        url = str(target.get("url", ""))
        parts = urlsplit(url)
        site = _site_for_domain(parts.hostname or "")
        if site != "indeed":
            continue
        entry = by_target.get(target_id)
        pages.append(
            {
                "target_id": target_id,
                "site": site,
                "title": str(target.get("title", "Indeed"))[:200],
                "safe_path": parts.path or "/",
                "group": "human_intervention" if entry else "automatic",
                "action": entry.action.value if entry else "working",
                "status": entry.status.value if entry else "browser_open",
                "application_reference": entry.application_reference if entry else "",
                "question_labels": entry.question_labels if entry else [],
                "preview_url": f"/api/job-finder/targets/{target_id}/preview",
                "can_focus": True,
            }
        )
    return pages


def _goal_state() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    from .job_finder_supervisor import goal_store, process_status

    store = goal_store()
    goal = store.active() or store.latest()
    if goal is None:
        return {}, []
    items = store.items(goal.id)
    site_counts: dict[str, dict[str, int]] = {}
    salary_counts: dict[str, dict[str, int]] = {
        band.value: {"discovered": 0, "reserved": 0, "confirmed": 0} for band in goal.salary_targets
    }
    salary_counts["unknown"] = {"discovered": 0, "reserved": 0, "confirmed": 0}
    level_counts = {"junior": 0, "intern": 0, "unknown": 0}
    for item in items:
        counts = site_counts.setdefault(
            item.site,
            {"total": 0, "confirmed": 0, "reserved": 0, "human": 0, "skipped": 0},
        )
        counts["total"] += 1
        if item.state.value == "confirmed":
            counts["confirmed"] += 1
        elif item.state.value == "reserved":
            counts["reserved"] += 1
        elif item.state.value == "human_handoff":
            counts["human"] += 1
        elif item.state.value in {"skipped", "failed", "released"}:
            counts["skipped"] += 1
        band = item.salary_band.value
        if band == "legacy_unclassified":
            band = "unknown"
        salary = salary_counts.setdefault(band, {"discovered": 0, "reserved": 0, "confirmed": 0})
        salary["discovered"] += 1
        if item.state.value == "reserved":
            salary["reserved"] += 1
        elif item.state.value == "confirmed":
            salary["confirmed"] += 1
        level_counts[item.job_level.value] = level_counts.get(item.job_level.value, 0) + 1
    salary_analytics = []
    labels = {
        "below_20k": "Below ₱20k",
        "php_20k_40k": "₱20k–₱40k",
        "php_40k_80k": "₱40k–₱80k",
        "php_80k_plus": "₱80k+",
        "unknown": "Unknown salary",
    }
    for band in (*goal.salary_targets, "unknown"):
        key = band.value if hasattr(band, "value") else str(band)
        values = salary_counts.get(key, {})
        target = int(goal.salary_targets.get(band, 0)) if key != "unknown" else 0
        salary_analytics.append(
            {
                "band": key,
                "label": labels[key],
                "target": target,
                "mix_percent": int(goal.salary_target_mix.get(band, 0)) if key != "unknown" else 0,
                "discovered": int(values.get("discovered", 0)),
                "reserved": int(values.get("reserved", 0)),
                "confirmed": int(values.get("confirmed", 0)),
                "remaining": max(
                    0, target - int(values.get("confirmed", 0)) - int(values.get("reserved", 0))
                ),
            }
        )
    return (
        {
            **goal.model_dump(mode="json"),
            "remaining": goal.remaining,
            "available": goal.available,
            "process": process_status(goal.id),
            "site_counts": site_counts,
            "salary_analytics": salary_analytics,
            "job_level_counts": level_counts,
        },
        [item.model_dump(mode="json") for item in items],
    )


def _run_interventions(
    run: dict[str, Any],
    queued: list[dict[str, Any]],
    suppressed_references: set[str] | None = None,
) -> list[dict[str, Any]]:
    jobs = {
        str(item.get("task_id", "")): item
        for item in run.get("jobs", [])
        if isinstance(item, dict) and item.get("task_id")
    }
    queued_references = {str(item.get("application_reference", "")) for item in queued}
    suppressed = suppressed_references or set()
    items: list[dict[str, Any]] = []
    for outcome in run.get("outcomes", []):
        if not isinstance(outcome, dict) or outcome.get("status") not in {
            "verification_pending",
            "human_handoff",
        }:
            continue
        task = outcome.get("task") if isinstance(outcome.get("task"), dict) else {}
        job = jobs.get(str(task.get("task_id", "")), {})
        reference = str(task.get("application_reference", "")).strip() or (
            f"{str(task.get('company', '')).strip()} — {str(task.get('job_title', '')).strip()}"
        ).strip(" —")
        if reference in queued_references or reference in suppressed:
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
                "resume_file": str(job.get("resume_file", ""))[:160],
            }
        )
    return items


def _session_state(targets: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    state = auth_status()
    state["oauth_setup"] = provider_configuration_status()
    browser_targets = targets if targets is not None else _targets()
    indeed_targets = [
        target
        for target in browser_targets
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
    targets = _targets()
    live_target_ids = {str(target.get("id", "")) for target in targets}
    pending_entries = _queue().pending()
    pending = [_entry_payload(entry, live_target_ids=live_target_ids) for entry in pending_entries]
    goal_payload, goal_items = _goal_state()
    resume_by_task, resume_by_reference = _resume_lookup()
    for item in pending:
        item["resume_file"] = resume_by_reference.get(
            str(item.get("application_reference", "")),
            str(item.get("resume_file", "")),
        )
    for item in goal_items:
        reference = f"{item.get('company', '')} — {item.get('job_title', '')}"
        item["resume_file"] = resume_by_task.get(
            str(item.get("task_id", "")), resume_by_reference.get(reference, "")
        )
    suppressed_references = {
        f"{item.get('company', '')} — {item.get('job_title', '')}"
        for item in goal_items
        if item.get("state") not in {"human_handoff", "reserved"}
    }
    interventions = [
        *pending,
        *_run_interventions(run, pending, suppressed_references),
    ]
    automatic = _automatic_work(run)
    development_requests = DevelopmentQuestionBridge(DEFAULT_DEVELOPMENT_BRIDGE_ROOT).pending()
    automatic.extend(
        {
            "task_id": f"ai-{request.request_id}",
            "company": request.company,
            "job_title": request.job_title,
            "site": _site_for_domain(request.domain),
            "status": "ai_answering",
            "detail": "Current-session development answer requested: "
            + " · ".join(question.label for question in request.questions),
            "request_id": request.request_id,
        }
        for request in development_requests
    )
    return {
        "sessions": _session_state(targets),
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
        "live_pages": _live_pages(pending_entries, targets),
        "goal": goal_payload,
        "goal_items": goal_items,
        "resume_catalog": _resume_catalog(),
        "resume_artifact_directory": str(DEFAULT_ARTIFACT_DIR),
        "development_questions": [
            {
                "request_id": request.request_id,
                "site": _site_for_domain(request.domain),
                "company": request.company,
                "job_title": request.job_title,
                "questions": [
                    {
                        "question_id": question.question_id,
                        "label": question.label,
                        "kind": question.kind,
                        "options": question.options,
                        "max_length": question.max_length,
                        "evidence": request.evidence.get(question.question_id, []),
                    }
                    for question in request.questions
                ],
            }
            for request in development_requests
        ],
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


def capture_target_preview(target_id: str) -> bytes:
    safe_id = "".join(
        character for character in target_id if character.isalnum() or character in "-_"
    )
    targets = {str(target.get("id", "")): target for target in _targets()}
    target = targets.get(safe_id)
    if not safe_id or target is None:
        raise KeyError(target_id)
    if _site_for_domain(urlsplit(str(target.get("url", ""))).hostname or "") != "indeed":
        raise ValueError("preview is limited to registered job-site targets")

    with _PREVIEW_LOCK:
        cached = _PREVIEW_CACHE.get(safe_id)
        if cached is not None and time.monotonic() - cached[0] < 12:
            return cached[1]

        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.connect_over_cdp(_cdp_url(), timeout=5_000)
            for context in browser.contexts:
                for page in context.pages:
                    session = context.new_cdp_session(page)
                    try:
                        info = session.send("Target.getTargetInfo")
                        if str(info.get("targetInfo", {}).get("targetId", "")) == safe_id:
                            image = page.screenshot(type="jpeg", quality=45, animations="disabled")
                            _PREVIEW_CACHE[safe_id] = (time.monotonic(), image)
                            return image
                    finally:
                        session.detach()
    raise KeyError(target_id)


def focus_intervention(entry_id: str) -> None:
    entry = next((item for item in _queue().pending() if item.id == entry_id), None)
    if entry is None:
        raise KeyError(entry_id)
    if not entry.browser_target_id:
        raise ValueError("intervention has no live browser target")
    focus_target(entry.browser_target_id)


def confirm_external_intervention(entry_id: str) -> dict[str, Any]:
    """Persist one explicit human confirmation and resolve its exact external handoff."""
    queue = _queue()
    entry = queue.get(entry_id)
    if entry is None:
        raise KeyError(entry_id)
    if entry.action != InterventionAction.EXTERNAL_APPLICATION:
        raise ValueError("only external applications can be manually confirmed here")
    if not entry.company or not entry.job_title:
        raise ValueError("external handoff has no structured company/job-title identity")

    goal_id = entry.goal_id
    if not goal_id and entry.task_id:
        goal, items = _goal_state()
        if any(str(item.get("task_id", "")) == entry.task_id for item in items):
            goal_id = str(goal.get("id", ""))

    if goal_id and entry.task_id:
        from .job_finder_supervisor import confirm_item

        confirm_item(goal_id, entry.task_id, source_url=entry.url)
    else:
        from datetime import datetime, timezone

        ApplicationSubmissionHistory(DEFAULT_DATABASE).record_existing_submission(
            company=entry.company,
            job_title=entry.job_title,
            applied_at=datetime.now(timezone.utc),
            confirmation="explicit manual confirmation from local control center",
            confirmation_source=ConfirmationSource.MANUAL,
            source_url=entry.url,
        )
    resolved = queue.resolve(entry.id)
    if resolved is None:
        raise RuntimeError("submission was recorded but the intervention could not be resolved")
    return {
        "confirmed": True,
        "entry_id": entry.id,
        "goal_id": goal_id,
        "task_id": entry.task_id,
    }


def open_browser_url(url: str) -> dict[str, str]:
    return open_tab(url)


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
        browser = playwright.chromium.connect_over_cdp(_cdp_url(), timeout=5_000)
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
    return {
        "resolved": clear,
        "reason": reason,
        "application_reference": entry.application_reference,
    }
