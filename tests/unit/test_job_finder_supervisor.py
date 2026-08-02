import pytest

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
