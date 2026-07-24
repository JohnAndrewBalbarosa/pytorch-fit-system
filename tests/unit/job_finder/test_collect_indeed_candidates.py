import importlib.util
from pathlib import Path

from resume_builder.job_finder import JobListing


_SCRIPT = Path(__file__).parents[3] / "tools" / "job_finder" / "collect_indeed_candidates.py"
_SPEC = importlib.util.spec_from_file_location("collect_indeed_candidates", _SCRIPT)
assert _SPEC and _SPEC.loader
collector = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(collector)


def _listing(
    title: str,
    *,
    company: str = "Example",
    detail_url: str = "https://au.indeed.com/rc/clk?jk=abc123&tracking=removed",
) -> JobListing:
    return JobListing(
        title=title,
        company=company,
        detail_url=detail_url,
        source_url="https://au.indeed.com/jobs?q=software&l=remote",
    )


def test_candidate_canonicalizes_url_and_selects_intern_resume():
    candidate = collector.candidate_from_listing(
        _listing("Backend Software Engineer Intern"),
        target_country="Australia",
    )

    assert candidate is not None
    assert candidate.listing_url == "https://au.indeed.com/viewjob?jk=abc123"
    assert candidate.work_mode == "remote"
    assert candidate.resume_file == "software-systems.pdf"
    assert any("internship" in group for group in candidate.required_any_groups)
    assert "3+ years" in candidate.blocked_terms


def test_candidate_routes_ai_and_data_resumes():
    ai = collector.candidate_from_listing(
        _listing("AI Agent Engineer", detail_url="https://ca.indeed.com/rc/clk?jk=ai123"),
        target_country="Canada",
    )
    data = collector.candidate_from_listing(
        _listing("Data Automation Analyst", detail_url="https://ca.indeed.com/rc/clk?jk=data123"),
        target_country="Canada",
    )
    ml = collector.candidate_from_listing(
        _listing(
            "Software Engineer, ML Infrastructure",
            detail_url="https://ca.indeed.com/rc/clk?jk=ml123",
        ),
        target_country="Canada",
    )

    assert ai is not None and ai.resume_file == "ai-ml-research.pdf"
    assert ai.listing_url == "https://ca.indeed.com/viewjob?jk=ai123"
    assert data is not None and data.resume_file == "automation-data.pdf"
    assert ml is not None and ml.resume_file == "ai-ml-research.pdf"


def test_candidate_rejects_senior_mismatch_and_missing_identity():
    assert (
        collector.candidate_from_listing(
            _listing("Senior Software Engineer"),
            target_country="Australia",
        )
        is None
    )
    assert (
        collector.candidate_from_listing(
            _listing("Customer Support Specialist"),
            target_country="Australia",
        )
        is None
    )
    assert (
        collector.candidate_from_listing(
            _listing("Business Development, AI Platform"),
            target_country="Australia",
        )
        is None
    )
    assert (
        collector.candidate_from_listing(
            _listing("Software Engineer", detail_url="https://au.indeed.com/viewjob"),
            target_country="Australia",
        )
        is None
    )
