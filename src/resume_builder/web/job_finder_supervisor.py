"""Local-only owner for bounded application-goal process groups."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from ..job_application import (
    ApplicationGoal,
    ApplicationGoalStatus,
    ApplicationGoalStore,
    ApplicationSubmissionHistory,
    ConfirmationSource,
    GoalItemState,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATABASE = REPO_ROOT / ".cache" / "application-submissions.sqlite3"
DEFAULT_QUEUE = REPO_ROOT / ".cache" / "application-verification-queue.json"
DEFAULT_OUTPUT = REPO_ROOT / "out"
DEFAULT_ARTIFACT_DIR = Path(
    os.environ.get(
        "JOB_FINDER_ARTIFACT_DIR",
        "/home/xy/Desktop/resume-industry-run/outputs",
    )
)

_LOCK = RLock()
_PROCESSES: dict[str, subprocess.Popen] = {}


def _pid_is_running(pid: int, process: subprocess.Popen | None) -> bool:
    if process is not None and process.poll() is not None:
        return False
    try:
        state = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8").split()[2]
    except (OSError, IndexError):
        return False
    return state != "Z"


def goal_store() -> ApplicationGoalStore:
    return ApplicationGoalStore(DEFAULT_DATABASE)


def start_goal(
    *,
    target: int,
    target_countries: list[str],
    work_mode: str,
    employment_type: str,
) -> ApplicationGoal:
    if work_mode != "remote":
        raise ValueError("Indeed v1 requires work_mode=remote")
    if employment_type != "contract":
        raise ValueError("Indeed v1 requires employment_type=contract")
    if not target_countries or any(country not in {"Australia", "Canada"} for country in target_countries):
        raise ValueError("Indeed v1 countries must be Australia and/or Canada")
    store = goal_store()
    previous = store.active()
    if previous is not None:
        stop_goal(previous.id)
    goal = store.create(
        target=target,
        sites=["indeed"],
        target_countries=target_countries,
        work_mode=work_mode,
        employment_type=employment_type,
    )
    launch_goal(goal.id)
    return goal


def launch_goal(goal_id: str) -> dict[str, object]:
    store = goal_store()
    goal = store.get(goal_id)
    if goal.status in {ApplicationGoalStatus.TARGET_REACHED, ApplicationGoalStatus.CANCELLED}:
        raise ValueError(f"goal cannot resume from {goal.status.value}")
    if not DEFAULT_ARTIFACT_DIR.is_dir():
        raise ValueError(f"resume artifact directory is unavailable: {DEFAULT_ARTIFACT_DIR}")
    with _LOCK:
        existing = _PROCESSES.get(goal_id)
        if existing is not None and existing.poll() is None:
            return {"goal_id": goal_id, "pid": existing.pid, "running": True}
        log_path = DEFAULT_OUTPUT / "goals" / goal_id / "launcher.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log = log_path.open("a", encoding="utf-8")
        command = [
            sys.executable,
            str(REPO_ROOT / "tools/job_finder/run_application_goal.py"),
            "--goal-id",
            goal_id,
            "--artifact-dir",
            str(DEFAULT_ARTIFACT_DIR),
            "--database",
            str(DEFAULT_DATABASE),
            "--queue",
            str(DEFAULT_QUEUE),
            "--output",
            str(DEFAULT_OUTPUT),
        ]
        process = subprocess.Popen(
            command,
            cwd=REPO_ROOT,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        log.close()
        _PROCESSES[goal_id] = process
    return {"goal_id": goal_id, "pid": process.pid, "running": True}


def process_status(goal_id: str) -> dict[str, object]:
    with _LOCK:
        process = _PROCESSES.get(goal_id)
        if process is not None:
            code = process.poll()
            if code is not None:
                _PROCESSES.pop(goal_id, None)
            return {
                "running": code is None,
                "pid": process.pid,
                "exit_code": code,
            }
    metadata = DEFAULT_OUTPUT / "goals" / goal_id / "process.json"
    if not metadata.is_file():
        return {"running": False, "pid": None, "exit_code": None}
    try:
        import json

        value = json.loads(metadata.read_text(encoding="utf-8"))
        pid = int(value.get("pid", 0))
        expected_ticks = str(value.get("start_ticks", ""))
        actual_ticks = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8").split()[21]
        return {"running": bool(pid and expected_ticks == actual_ticks), "pid": pid, "exit_code": None}
    except (OSError, ValueError, IndexError, TypeError):
        return {"running": False, "pid": None, "exit_code": None}


def stop_goal(goal_id: str, *, cancel: bool = True, timeout: float = 5.0) -> dict[str, object]:
    status = process_status(goal_id)
    pid = status.get("pid")
    with _LOCK:
        owned_process = _PROCESSES.get(goal_id)
    if pid and status.get("running"):
        try:
            pgid = os.getpgid(int(pid))
        except ProcessLookupError:
            pgid = 0
        if not pgid:
            status["running"] = False
        elif pgid != int(pid):
            raise RuntimeError("refusing to terminate a process group not owned by this goal")
        if pgid:
            os.killpg(pgid, signal.SIGTERM)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if not _pid_is_running(int(pid), owned_process):
                break
            time.sleep(0.05)
        if pgid and _pid_is_running(int(pid), owned_process):
            os.killpg(pgid, signal.SIGKILL)
    with _LOCK:
        process = _PROCESSES.pop(goal_id, None)
        if process is not None:
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
    if cancel:
        goal_store().set_status(goal_id, ApplicationGoalStatus.CANCELLED)
    return {"goal_id": goal_id, "running": False, "cancelled": cancel}


def confirm_item(goal_id: str, task_id: str) -> ApplicationGoal:
    store = goal_store()
    item = store.item(goal_id, task_id)
    ApplicationSubmissionHistory(DEFAULT_DATABASE).record_existing_submission(
        company=item.company,
        job_title=item.job_title,
        applied_at=datetime.now(timezone.utc),
        confirmation="explicit manual confirmation from local control center",
        confirmation_source=ConfirmationSource.MANUAL,
    )
    goal = store.confirm(goal_id, task_id, detail="explicit manual confirmation")
    if goal.status == ApplicationGoalStatus.TARGET_REACHED:
        stop_goal(goal_id, cancel=False)
    elif goal.available > 0 and not process_status(goal_id)["running"]:
        launch_goal(goal_id)
    return goal


def release_item(goal_id: str, task_id: str) -> ApplicationGoal:
    goal = goal_store().release(goal_id, task_id, detail="released from local control center")
    if goal.available > 0 and not process_status(goal_id)["running"]:
        launch_goal(goal_id)
    return goal


def retry_resolved_intervention(application_reference: str) -> str:
    """Return one cleared human-gated goal item to the deterministic replay queue."""
    store = goal_store()
    goal = store.active()
    if goal is None:
        return ""
    normalized_reference = " ".join(application_reference.casefold().split())
    for item in store.items(goal.id):
        item_reference = " ".join(
            f"{item.company} — {item.job_title}".casefold().split()
        )
        if item_reference != normalized_reference or item.state != GoalItemState.HUMAN_HANDOFF:
            continue
        store.observe(
            goal.id,
            task_id=item.task_id,
            site=item.site,
            company=item.company,
            job_title=item.job_title,
            state=GoalItemState.OBSERVED,
            detail="human verification resolved; deterministic replay queued",
        )
        return item.task_id
    return ""
