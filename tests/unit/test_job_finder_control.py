from __future__ import annotations

import json

from fastapi.testclient import TestClient

from resume_builder.job_application import (
    HumanVerificationQueue,
    InterventionAction,
)
from resume_builder.web.app import app
from resume_builder.web import job_finder_control


def test_job_finder_control_page_is_standalone():
    response = TestClient(app).get("/job-finder-control")

    assert response.status_code == 200
    assert "Job Finder Control Center" in response.text
    assert "Automatic Work" in response.text
    assert "Needs Human Intervention" in response.text
    assert "/static/job_finder_control.js" in response.text


def test_control_state_combines_latest_run_and_groupable_interventions(
    tmp_path,
    monkeypatch,
):
    run_root = tmp_path / "runs"
    run_dir = run_root / "latest"
    run_dir.mkdir(parents=True)
    (run_dir / "run.json").write_text(
        json.dumps(
            {
                "status": "running",
                "confirmed_submissions": 1,
                "jobs": [
                    {
                        "task_id": "job-1",
                        "company": "Example Co",
                        "job_title": "Backend Engineer",
                        "domain": "au.indeed.com",
                    },
                    {
                        "task_id": "job-2",
                        "company": "Second Co",
                        "job_title": "Python Engineer",
                        "domain": "au.indeed.com",
                    },
                ],
                "outcomes": [
                    {
                        "task": {"task_id": "job-1"},
                        "status": "submitted",
                        "detail": "confirmed",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    queue_path = tmp_path / "queue.json"
    HumanVerificationQueue(queue_path).enqueue_handoff(
        application_reference="Second Co — Python Engineer",
        url="https://smartapply.indeed.com/questions-module?token=secret",
        reason="unknown_question",
        browser_target_id="target-2",
        action=InterventionAction.UNKNOWN_QUESTION,
        question_labels=["Are you available to work weekends?"],
    )
    monkeypatch.setattr(job_finder_control, "DEFAULT_RUN_ROOT", run_root)
    monkeypatch.setattr(job_finder_control, "DEFAULT_QUEUE_PATH", queue_path)
    monkeypatch.setattr(job_finder_control, "_targets", lambda: [])
    monkeypatch.setenv("RESUME_BUILDER_CACHE", str(tmp_path / "auth"))

    state = job_finder_control.control_state()

    assert state["run"]["status"] == "running"
    assert [item["status"] for item in state["automatic"]] == ["submitted", "queued"]
    assert state["interventions"][0]["action"] == "unknown_question"
    assert state["interventions"][0]["site"] == "indeed"
    assert state["interventions"][0]["question_labels"] == ["Are you available to work weekends?"]
    assert "secret" not in json.dumps(state)


def test_focus_target_uses_only_validated_cdp_target(monkeypatch):
    captured = {}

    class _Response:
        def raise_for_status(self):
            return None

    def fake_post(url, timeout):
        captured.update(url=url, timeout=timeout)
        return _Response()

    monkeypatch.setattr(job_finder_control.requests, "post", fake_post)

    job_finder_control.focus_target("ABC_123")

    assert captured["url"].endswith("/json/activate/ABC_123")


def test_unqueued_human_outcome_remains_visible_as_grouped_fallback():
    interventions = job_finder_control._run_interventions(
        {
            "started_at": "2026-08-02T00:00:00+00:00",
            "outcomes": [
                {
                    "status": "human_handoff",
                    "detail": "questionnaire requires an accepted evidence-grounded answer plan",
                    "task": {
                        "task_id": "job-3",
                        "company": "Example Co",
                        "job_title": "ML Engineer",
                        "domain": "smartapply.indeed.com",
                        "application_reference": "Example Co — ML Engineer",
                    },
                }
            ],
        },
        [],
    )

    assert interventions[0]["action"] == "unknown_question"
    assert interventions[0]["site"] == "indeed"
    assert interventions[0]["can_focus"] is False


def test_disconnect_can_clear_local_social_session_without_website_logout(
    monkeypatch,
):
    monkeypatch.setattr(job_finder_control, "clear_social_session", lambda provider: True)
    opened = []
    monkeypatch.setattr(job_finder_control, "open_browser_url", opened.append)

    result = job_finder_control.disconnect_provider("linkedin", website_logout=False)

    assert result == {"provider": "linkedin", "cleared": True, "website_logout": None}
    assert opened == []
