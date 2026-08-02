import pytest

from resume_builder.job_application import ApplicationGoalStore, GoalItemState
from resume_builder.web import job_finder_supervisor


def test_stop_refuses_process_group_not_owned_by_goal(monkeypatch):
    monkeypatch.setattr(
        job_finder_supervisor,
        "process_status",
        lambda _goal_id: {"running": True, "pid": 123, "exit_code": None},
    )
    monkeypatch.setattr(job_finder_supervisor.os, "getpgid", lambda _pid: 999)
    killed = []
    monkeypatch.setattr(job_finder_supervisor.os, "killpg", lambda *args: killed.append(args))

    with pytest.raises(RuntimeError, match="not owned"):
        job_finder_supervisor.stop_goal("goal-1")

    assert killed == []


def test_resolved_intervention_returns_exact_goal_item_to_replay(monkeypatch, tmp_path):
    store = ApplicationGoalStore(tmp_path / "history.sqlite3")
    goal = store.create(target=1)
    store.observe(
        goal.id,
        task_id="job-1",
        site="indeed",
        company="Acme",
        job_title="Engineer",
        state=GoalItemState.HUMAN_HANDOFF,
    )
    monkeypatch.setattr(job_finder_supervisor, "goal_store", lambda: store)

    task_id = job_finder_supervisor.retry_resolved_intervention("Acme — Engineer")

    assert task_id == "job-1"
    assert store.item(goal.id, task_id).state == GoalItemState.OBSERVED
