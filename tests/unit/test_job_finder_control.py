from __future__ import annotations

import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from resume_builder.job_application import (
    ApplicationSubmissionHistory,
    ConfirmationSource,
    HumanVerificationQueue,
    InterventionAction,
)
from resume_builder.web.app import app
from resume_builder.web import app as web_app
from resume_builder.web import job_finder_control


def test_job_finder_control_page_is_standalone(monkeypatch):
    monkeypatch.setattr(
        web_app,
        "_onboarding_service",
        lambda: SimpleNamespace(state=lambda: {"ready": True}),
    )
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
                        "resume_file": "software-systems.pdf",
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
    monkeypatch.setattr(job_finder_control, "_goal_state", lambda: ({}, []))
    monkeypatch.setattr(job_finder_control, "_resume_catalog", lambda: [])
    monkeypatch.setenv("RESUME_BUILDER_CACHE", str(tmp_path / "auth"))

    state = job_finder_control.control_state()

    assert state["run"]["status"] == "running"
    assert [item["status"] for item in state["automatic"]] == ["submitted", "queued"]
    assert state["automatic"][0]["resume_file"] == "software-systems.pdf"
    assert state["interventions"][0]["action"] == "unknown_question"
    assert state["interventions"][0]["site"] == "indeed"
    assert state["interventions"][0]["question_labels"] == ["Are you available to work weekends?"]
    assert "secret" not in json.dumps(state)


def test_resume_catalog_inventories_generated_artifacts_and_routes(tmp_path, monkeypatch):
    artifact_dir = tmp_path / "outputs"
    artifact_dir.mkdir()
    (artifact_dir / "automation-data.pdf").write_bytes(b"%PDF")
    (artifact_dir / "automation-data.resume.json").write_text(
        json.dumps({"role": {"id": "automation-data", "label": "Automation Engineer"}}),
        encoding="utf-8",
    )
    database = tmp_path / "profile.sqlite3"
    store = job_finder_control.ApplicationProfileStore(database)
    store.replace_resume_route(
        filename="automation-data.pdf",
        terms=["automation", "data engineer"],
    )
    monkeypatch.setattr(job_finder_control, "DEFAULT_ARTIFACT_DIR", artifact_dir)
    monkeypatch.setattr(job_finder_control, "DEFAULT_DATABASE", database)

    catalog = job_finder_control._resume_catalog()

    assert catalog == [
        {
            "filename": "automation-data.pdf",
            "label": "Automation Engineer",
            "role_id": "automation-data",
            "terms": ["automation", "data engineer"],
            "is_default": False,
            "artifact_ready": True,
            "routing_ready": True,
        }
    ]


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


def test_open_browser_url_uses_shared_browser_tab(monkeypatch):
    monkeypatch.setattr(
        job_finder_control,
        "open_tab",
        lambda url: {"target_id": "SHARED_TAB", "url": url},
    )

    result = job_finder_control.open_browser_url("https://secure.indeed.com/auth")

    assert result == {
        "target_id": "SHARED_TAB",
        "url": "https://secure.indeed.com/auth",
    }


def test_live_pages_expose_safe_path_and_preview_without_query(monkeypatch):
    monkeypatch.setattr(
        job_finder_control,
        "_targets",
        lambda: [
            {
                "id": "TARGET_1",
                "type": "page",
                "title": "Backend Engineer",
                "url": "https://au.indeed.com/viewjob?jk=secret-token",
            },
            {
                "id": "OTHER",
                "type": "page",
                "title": "Unrelated",
                "url": "https://example.com/private?token=hidden",
            },
        ],
    )

    pages = job_finder_control._live_pages([])

    assert len(pages) == 1
    assert pages[0]["safe_path"] == "/viewjob"
    assert pages[0]["preview_url"].endswith("/TARGET_1/preview")
    assert "secret-token" not in json.dumps(pages)


def test_stale_queue_target_is_not_focusable():
    entry = SimpleNamespace(
        model_dump=lambda **_kwargs: {
            "browser_target_id": "CLOSED",
            "action": "captcha",
        },
        browser_target_id="CLOSED",
        domain="au.indeed.com",
        action=job_finder_control.InterventionAction.CAPTCHA,
    )

    payload = job_finder_control._entry_payload(entry, live_target_ids={"LIVE"})

    assert payload["can_focus"] is False
    assert payload["preview_url"] == ""


def test_external_application_can_be_explicitly_confirmed_and_resolved(
    tmp_path,
    monkeypatch,
):
    queue_path = tmp_path / "queue.json"
    database = tmp_path / "applications.sqlite3"
    queued = HumanVerificationQueue(queue_path).enqueue_handoff(
        application_reference="Example Co — Backend Engineer",
        url="https://careers.example.com/apply?token=secret",
        reason="apply_on_company_site",
        browser_target_id="external-target",
        task_id="job-1",
        company="Example Co",
        job_title="Backend Engineer",
        resume_file="software-systems.pdf",
    )
    monkeypatch.setattr(job_finder_control, "DEFAULT_QUEUE_PATH", queue_path)
    monkeypatch.setattr(job_finder_control, "DEFAULT_DATABASE", database)
    monkeypatch.setattr(job_finder_control, "_goal_state", lambda: ({}, []))

    result = job_finder_control.confirm_external_intervention(queued.id)

    assert result == {
        "confirmed": True,
        "entry_id": queued.id,
        "goal_id": "",
        "task_id": "job-1",
    }
    assert HumanVerificationQueue(queue_path).pending() == []
    submissions = ApplicationSubmissionHistory(database).recent_submissions(within_days=30)
    assert len(submissions) == 1
    assert submissions[0].company == "Example Co"
    assert submissions[0].job_title == "Backend Engineer"
    assert submissions[0].confirmation_source == ConfirmationSource.MANUAL
    assert submissions[0].source_url == "https://careers.example.com/apply"

    repeated = job_finder_control.confirm_external_intervention(queued.id)
    assert repeated["confirmed"] is True
    assert len(
        ApplicationSubmissionHistory(database).recent_submissions(within_days=30)
    ) == 1


def test_external_confirmation_requires_structured_identity(tmp_path, monkeypatch):
    queue_path = tmp_path / "queue.json"
    queued = HumanVerificationQueue(queue_path).enqueue_handoff(
        application_reference="Legacy external application",
        url="https://careers.example.com/apply",
        reason="apply_on_company_site",
    )
    monkeypatch.setattr(job_finder_control, "DEFAULT_QUEUE_PATH", queue_path)

    try:
        job_finder_control.confirm_external_intervention(queued.id)
    except ValueError as error:
        assert "structured company/job-title" in str(error)
    else:
        raise AssertionError("legacy handoff must not infer submission identity")


def test_control_frontend_exposes_external_confirmation_action():
    response = TestClient(app).get("/static/job_finder_control.js")

    assert response.status_code == 200
    assert "Confirm submitted" in response.text
    assert "confirm-submitted" in response.text


def test_unqueued_human_outcome_remains_visible_as_grouped_fallback():
    interventions = job_finder_control._run_interventions(
        {
            "started_at": "2026-08-02T00:00:00+00:00",
            "jobs": [{"task_id": "job-3", "resume_file": "ai-ml-research.pdf"}],
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
    assert interventions[0]["resume_file"] == "ai-ml-research.pdf"


def test_disconnect_can_clear_local_social_session_without_website_logout(
    monkeypatch,
):
    monkeypatch.setattr(job_finder_control, "clear_social_session", lambda provider: True)
    opened = []
    monkeypatch.setattr(job_finder_control, "open_browser_url", opened.append)

    result = job_finder_control.disconnect_provider("linkedin", website_logout=False)

    assert result == {"provider": "linkedin", "cleared": True, "website_logout": None}
    assert opened == []
