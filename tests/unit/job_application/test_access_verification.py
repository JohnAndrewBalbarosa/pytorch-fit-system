import json

from resume_builder.job_application import (
    AccessGateResult,
    AccessGateState,
    HumanVerificationQueue,
    VerificationQueueGroup,
    VerificationQueueState,
    sanitize_application_url,
)


def test_sanitize_application_url_removes_query_and_fragment():
    assert (
        sanitize_application_url(
            "https://apply.example.com/review?token=secret&email=a@example.com#submit"
        )
        == "https://apply.example.com/review"
    )


def test_queue_deduplicates_and_does_not_store_url_secrets(tmp_path):
    path = tmp_path / "verification.json"
    queue = HumanVerificationQueue(path)
    result = AccessGateResult(
        state=AccessGateState.HUMAN_REQUIRED,
        reason="captcha",
        evidence="visible incomplete reCAPTCHA",
    )

    first = queue.enqueue(
        application_reference="Backend Developer",
        url="https://apply.example.com/review?token=secret",
        result=result,
    )
    second = queue.enqueue(
        application_reference="Backend Developer",
        url="https://apply.example.com/review?token=another-secret",
        result=result,
    )

    assert first.id == second.id
    assert second.occurrences == 2
    assert second.status == VerificationQueueState.PENDING
    stored = path.read_text(encoding="utf-8")
    assert "secret" not in stored
    assert json.loads(stored)[first.id]["url"] == "https://apply.example.com/review"


def test_url_fallback_reference_does_not_store_query_values(tmp_path):
    path = tmp_path / "verification.json"
    queue = HumanVerificationQueue(path)
    url = "https://apply.example.com/review?token=private-session"

    queue.enqueue(
        application_reference=url,
        url=url,
        result=AccessGateResult(
            state=AccessGateState.HUMAN_REQUIRED,
            reason="captcha",
        ),
    )

    assert "private-session" not in path.read_text(encoding="utf-8")


def test_clear_recheck_resolves_matching_queue_item(tmp_path):
    queue = HumanVerificationQueue(tmp_path / "verification.json")
    blocked = AccessGateResult(
        state=AccessGateState.HUMAN_REQUIRED,
        reason="verification_required",
    )
    queue.enqueue(
        application_reference="AI Engineer",
        url="https://apply.example.com/review?session=private",
        result=blocked,
    )

    resolved = queue.resolve_if_clear(
        application_reference="AI Engineer",
        url="https://apply.example.com/review?session=private",
        result=AccessGateResult(state=AccessGateState.CLEAR),
    )

    assert resolved is not None
    assert resolved.status == VerificationQueueState.RESOLVED
    assert queue.pending() == []


def test_queue_preserves_browser_target_for_exact_human_resume(tmp_path):
    queue = HumanVerificationQueue(tmp_path / "verification.json")
    blocked = AccessGateResult(
        state=AccessGateState.HUMAN_REQUIRED,
        reason="captcha",
    )

    queued = queue.enqueue(
        application_reference="Company — Backend Engineer",
        url="https://smartapply.indeed.com/form?token=secret",
        result=blocked,
        browser_target_id="target-123",
    )

    assert queued.browser_target_id == "target-123"
    assert queue.pending()[0].browser_target_id == "target-123"
    assert "secret" not in queue.path.read_text(encoding="utf-8")


def test_queue_groups_company_site_apply_as_human_intervention(tmp_path):
    queue = HumanVerificationQueue(tmp_path / "verification.json")

    queued = queue.enqueue(
        application_reference="Company — Backend Engineer",
        url="https://careers.example.com/apply?token=secret",
        result=AccessGateResult(
            state=AccessGateState.HUMAN_REQUIRED,
            reason="apply_on_company_site",
        ),
        browser_target_id="company-site-target",
        group=VerificationQueueGroup.HUMAN_INTERVENTION,
    )

    assert queued.group == VerificationQueueGroup.HUMAN_INTERVENTION
    assert queue.pending()[0].reason == "apply_on_company_site"
    assert "secret" not in queue.path.read_text(encoding="utf-8")


def test_only_blocked_results_can_be_enqueued(tmp_path):
    queue = HumanVerificationQueue(tmp_path / "verification.json")

    try:
        queue.enqueue(
            application_reference="AI Engineer",
            url="https://apply.example.com/review",
            result=AccessGateResult(state=AccessGateState.CLEAR),
        )
    except ValueError as error:
        assert "human-required" in str(error)
    else:
        raise AssertionError("clear access result was queued")
