import json
from types import SimpleNamespace

from tools.job_finder import run_application_goal


def test_retry_jobs_replays_observed_microtask_from_prior_manifest(tmp_path):
    manifest = tmp_path / "cycle-0001" / "manifest.json"
    manifest.parent.mkdir()
    manifest.write_text(
        json.dumps(
            {
                "jobs": [
                    {"task_id": "retry-me", "company": "Acme"},
                    {"task_id": "terminal", "company": "Done"},
                ]
            }
        ),
        encoding="utf-8",
    )
    items = [
        SimpleNamespace(task_id="retry-me", state=SimpleNamespace(value="observed")),
        SimpleNamespace(task_id="terminal", state=SimpleNamespace(value="skipped")),
    ]

    assert run_application_goal._retry_jobs(tmp_path, items) == [
        {"task_id": "retry-me", "company": "Acme"}
    ]


def test_retry_jobs_recovers_job_from_unattended_run_artifact(tmp_path):
    goal_root = tmp_path / "goals" / "goal-1"
    run_path = tmp_path / "indeed-unattended" / "run-1" / "run.json"
    run_path.parent.mkdir(parents=True)
    job = {"task_id": "retry-me", "company": "Acme"}
    run_path.write_text(json.dumps({"jobs": [job]}), encoding="utf-8")
    items = [SimpleNamespace(task_id="retry-me", state=SimpleNamespace(value="observed"))]

    assert run_application_goal._retry_jobs(
        goal_root, items, output_root=tmp_path
    ) == [job]


def test_next_cycle_number_does_not_overwrite_previous_runs(tmp_path):
    (tmp_path / "cycle-0002").mkdir()
    (tmp_path / "cycle-invalid").mkdir()

    assert run_application_goal._next_cycle_number(tmp_path) == 3
