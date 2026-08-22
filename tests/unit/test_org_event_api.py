from __future__ import annotations

import socket

import pytest

from resume_builder.web.org_event_api import ExternalEventPackage, _assert_public_url


def test_event_package_requires_strict_grounded_shape():
    package = ExternalEventPackage.model_validate({
        "title": "Regional PyTorch Workshop",
        "organizer": "Example University",
        "summary": "A public workshop with a published program and registration page.",
        "category": "workshops",
        "scope": "external",
        "startAt": "2026-09-10T09:00:00+08:00",
        "endAt": None,
        "timezone": "Asia/Manila",
        "venue": "Innovation Hall",
        "registrationUrl": "https://events.example/register",
        "registrationDeadline": None,
        "fee": "Free",
        "eligibility": ["Students"],
        "requirements": [],
        "sourceUrl": "https://events.example/workshop",
        "scrapedAt": "2026-08-22T00:00:00Z",
        "contentHash": f"sha256:{'a' * 64}",
        "scraperVersion": "visible-browser-v1",
        "confidence": 0.9,
        "warnings": [],
    })
    assert package.scope == "external"


@pytest.mark.parametrize("url", ["file:///etc/passwd", "http://localhost/event", "ftp://example.com/event"])
def test_public_url_gate_rejects_unsupported_or_local_urls(url, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *_args: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0))])
    with pytest.raises(ValueError):
        _assert_public_url(url)


def test_public_url_gate_accepts_global_addresses(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *_args: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))])
    _assert_public_url("https://events.example/workshop")
