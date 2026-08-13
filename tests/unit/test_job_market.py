from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from resume_builder.job_market import JobMarketQuery, JobMarketService
from resume_builder.job_market.models import MarketPosting
from resume_builder.job_market.providers import _degree, _experience
from resume_builder.web.job_market_api import router


def test_unmentioned_requirements_remain_unknown():
    assert _degree("Build Python APIs with a collaborative team.") == "unknown"
    assert _experience("Build Python APIs with a collaborative team.") is None
    assert _degree("Currently pursuing a computer science degree") == "in_progress_ok"
    assert _experience("Requires 2+ years of professional experience") == 2.0


def test_service_uses_explicit_synthetic_demo_when_providers_are_unavailable(
    tmp_path: Path,
    monkeypatch,
):
    from resume_builder.job_market import service as module

    monkeypatch.setattr(
        module.AdzunaProvider,
        "fetch",
        lambda *_: (_ for _ in ()).throw(module.ProviderUnavailable("offline")),
    )
    monkeypatch.setattr(
        module.RemotiveProvider,
        "fetch",
        lambda *_: (_ for _ in ()).throw(module.ProviderUnavailable("offline")),
    )
    result = JobMarketService(tmp_path / "market.sqlite3").summary(
        JobMarketQuery(countries=["Philippines", "Canada"])
    )
    assert result.snapshot_kind == "synthetic_demo"
    assert result.sample_size == 10
    assert result.unknown_degree_count == result.sample_size
    assert any("synthetic demo" in warning.lower() for warning in result.warnings)


def test_imported_snapshot_is_versioned_and_round_trips(tmp_path: Path):
    service = JobMarketService(tmp_path / "market.sqlite3")
    query = JobMarketQuery(countries=["Canada"])
    posting = MarketPosting(
        id="fixture:1",
        source="fixture",
        company="Example",
        title="Junior Developer",
        country="Canada",
        work_mode="remote",
        posted_at="2026-08-01",
    )
    assert service.import_snapshot(query, {"postings": [posting.model_dump(mode="json")]}) == 1
    loaded = service.store.load(key=module_query_key(query), source="import")
    assert loaded is not None
    assert loaded["payload"]["postings"][0]["id"] == "fixture:1"


def test_imported_snapshot_participates_in_summary(tmp_path: Path, monkeypatch):
    from resume_builder.job_market import service as module

    monkeypatch.setattr(
        module.AdzunaProvider,
        "fetch",
        lambda *_: (_ for _ in ()).throw(module.ProviderUnavailable("offline")),
    )
    monkeypatch.setattr(
        module.RemotiveProvider,
        "fetch",
        lambda *_: (_ for _ in ()).throw(module.ProviderUnavailable("offline")),
    )
    service = JobMarketService(tmp_path / "market.sqlite3")
    query = JobMarketQuery(countries=["Canada"])
    posting = MarketPosting(
        id="fixture:2",
        source="fixture",
        company="Example",
        title="Junior Developer",
        country="Canada",
        work_mode="remote",
        posted_at="2026-08-01",
    )
    service.import_snapshot(query, {"postings": [posting.model_dump(mode="json")]})
    result = service.summary(query)
    assert result.snapshot_kind == "cached"
    assert result.sample_size == 1


def module_query_key(query: JobMarketQuery) -> str:
    from resume_builder.job_market.service import _query_key

    return _query_key(query)


def test_refresh_requires_server_side_developer_token(monkeypatch, tmp_path: Path):
    from resume_builder.web import job_market_api

    monkeypatch.setenv("PYTORCH_FIT_DEV_API_TOKEN", "secret")
    monkeypatch.setattr(
        job_market_api, "_service", lambda: JobMarketService(tmp_path / "market.sqlite3")
    )
    app = FastAPI()
    app.include_router(router)
    response = TestClient(app).post("/api/job-market/refresh", json={"countries": ["Philippines"]})
    assert response.status_code == 403


def test_fastapi_legacy_entry_redirects_to_canonical_frontend(monkeypatch):
    from resume_builder.web.app import app

    monkeypatch.setenv("PYTORCH_FIT_FRONTEND_URL", "http://127.0.0.1:3000")
    response = TestClient(app).get("/prototype", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "http://127.0.0.1:3000/dashboard"


def test_csv_import_accepts_versioned_postings(monkeypatch, tmp_path: Path):
    from resume_builder.job_market import service as module
    from resume_builder.web import job_market_api

    service = JobMarketService(tmp_path / "market.sqlite3")
    monkeypatch.setattr(
        module.AdzunaProvider,
        "fetch",
        lambda *_: (_ for _ in ()).throw(module.ProviderUnavailable("offline")),
    )
    monkeypatch.setattr(
        module.RemotiveProvider,
        "fetch",
        lambda *_: (_ for _ in ()).throw(module.ProviderUnavailable("offline")),
    )
    monkeypatch.setenv("PYTORCH_FIT_DEV_API_TOKEN", "secret")
    monkeypatch.setattr(job_market_api, "_service", lambda: service)
    app = FastAPI()
    app.include_router(router)
    response = TestClient(app).post(
        "/api/job-market/import",
        headers={"X-Dev-Api-Token": "secret"},
        json={
            "query": {"countries": ["Canada"]},
            "source": "survey_fixture",
            "dataset_version": "2026-08",
            "geography": "Canada",
            "csv_text": (
                "id,company,title,country,work_mode,skills,degree_requirement,posted_at\n"
                "one,Example,Junior Developer,Canada,remote,Python;Git,unknown,2026-08-01\n"
            ),
        },
    )
    assert response.status_code == 200
    assert response.json() == {"imported": 1}
    postings = service.postings(JobMarketQuery(countries=["Canada"]))
    assert postings[0].skills == ["Python", "Git"]
