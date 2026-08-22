"""Local-only external-event extraction and JSON validation API."""

from __future__ import annotations

import hashlib
import ipaddress
import socket
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlparse

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from ..llm import get_provider

router = APIRouter(prefix="/api/org-events", tags=["org-events"])


class EventUrlRequest(BaseModel):
    url: HttpUrl


class ExternalEventPackage(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    title: str = Field(min_length=3, max_length=200)
    organizer: str = Field(min_length=2, max_length=200)
    summary: str = Field(min_length=10, max_length=3000)
    category: Literal["events", "workshops", "hackathons", "competitive-programming"]
    scope: Literal["external"] = "external"
    start_at: str = Field(alias="startAt")
    end_at: str | None = Field(default=None, alias="endAt")
    timezone_name: str = Field(alias="timezone", max_length=80)
    venue: str = Field(max_length=300)
    registration_url: HttpUrl | None = Field(default=None, alias="registrationUrl")
    registration_deadline: str | None = Field(default=None, alias="registrationDeadline")
    fee: str = Field(default="Not stated", max_length=120)
    eligibility: list[str] = Field(default_factory=list, max_length=20)
    requirements: list[str] = Field(default_factory=list, max_length=30)
    source_url: HttpUrl = Field(alias="sourceUrl")
    scraped_at: str = Field(alias="scrapedAt")
    content_hash: str = Field(alias="contentHash", pattern=r"^sha256:[0-9a-f]{64}$")
    scraper_version: str = Field(alias="scraperVersion", max_length=80)
    confidence: float = Field(ge=0, le=1)
    warnings: list[str] = Field(default_factory=list, max_length=20)


class ExtractedFacts(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")
    title: str = Field(min_length=3, max_length=200)
    organizer: str = Field(min_length=2, max_length=200)
    summary: str = Field(min_length=10, max_length=3000)
    category: Literal["events", "workshops", "hackathons", "competitive-programming"]
    start_at: str = Field(alias="startAt")
    end_at: str | None = Field(default=None, alias="endAt")
    timezone_name: str = Field(alias="timezone", max_length=80)
    venue: str = Field(max_length=300)
    registration_url: HttpUrl | None = Field(default=None, alias="registrationUrl")
    registration_deadline: str | None = Field(default=None, alias="registrationDeadline")
    fee: str = Field(default="Not stated", max_length=120)
    eligibility: list[str] = Field(default_factory=list, max_length=20)
    requirements: list[str] = Field(default_factory=list, max_length=30)
    confidence: float = Field(ge=0, le=1)
    warnings: list[str] = Field(default_factory=list, max_length=20)


def _assert_public_url(raw: str) -> None:
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only public HTTP(S) event URLs are supported.")
    for address in socket.getaddrinfo(parsed.hostname, None):
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("Private, loopback, and local-network event URLs are blocked.")


def _visible_page_text(url: str) -> tuple[str, str]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError("Playwright is required for the normal visible-browser access gate.") from exc
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        page = browser.new_page()
        def guard_navigation(route):
            request = route.request
            parsed = urlparse(request.url)
            if parsed.scheme in {"http", "https"}:
                try:
                    _assert_public_url(request.url)
                except (ValueError, OSError):
                    route.abort("blockedbyclient")
                    return
            elif parsed.scheme not in {"about", "blob", "data"}:
                route.abort("blockedbyclient")
                return
            route.continue_()
        page.route("**/*", guard_navigation)
        response = page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_timeout(1200)
        final_url = page.url
        _assert_public_url(final_url)
        title = page.title()
        body = page.locator("body").inner_text(timeout=5_000)[:30_000]
        status = response.status if response else 0
        blocked = status in {401, 403, 429} or any(marker in f"{title}\n{body[:2000]}".lower() for marker in ("captcha", "cloudflare", "verify you are human", "sign in to continue", "access denied"))
        browser.close()
    if blocked:
        raise PermissionError("Access verification or login is required; complete it in a normal browser and retry without bypassing it.")
    if status >= 400 or len(body.strip()) < 80:
        raise RuntimeError(f"The event page could not be read safely (HTTP {status}).")
    return final_url, f"{title}\n{body}"


@router.post("/extract")
def extract_event(request: EventUrlRequest):
    try:
        requested_url = str(request.url)
        _assert_public_url(requested_url)
        final_url, visible_text = _visible_page_text(requested_url)
        cleaned = "\n".join(line.strip() for line in visible_text.splitlines() if line.strip())[:24_000]
        provider = get_provider()
        facts = provider.structured(
            "Extract only facts explicitly present in this rendered external-event page. "
            "Use ISO-8601 dates with timezone when present. Put missing or ambiguous facts in warnings; never invent them.\n\n"
            + cleaned,
            schema=ExtractedFacts,
            system="You are an event-page extraction stage, not an approval or verification authority.",
            max_tokens=2200,
        )
        digest = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
        package = ExternalEventPackage(
            **facts.model_dump(by_alias=True), sourceUrl=final_url,
            scrapedAt=datetime.now(timezone.utc).isoformat(), contentHash=f"sha256:{digest}",
            scraperVersion="local-visible-playwright-v1",
        )
        return package.model_dump(mode="json", by_alias=True)
    except PermissionError as exc:
        return JSONResponse({"error": str(exc)}, status_code=409)
    except Exception as exc:  # bounded local API: report, never retry with disguise
        return JSONResponse({"error": str(exc)}, status_code=422)


@router.post("/validate")
def validate_event(payload: dict):
    try:
        value = ExternalEventPackage.model_validate(payload)
        return {"valid": True, "normalized": value.model_dump(mode="json", by_alias=True), "errors": []}
    except Exception as exc:
        return JSONResponse({"valid": False, "errors": [str(exc)]}, status_code=422)
