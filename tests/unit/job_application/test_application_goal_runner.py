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


def test_next_cycle_number_does_not_overwrite_previous_runs(tmp_path):
    (tmp_path / "cycle-0002").mkdir()
    (tmp_path / "cycle-invalid").mkdir()

    assert run_application_goal._next_cycle_number(tmp_path) == 3
