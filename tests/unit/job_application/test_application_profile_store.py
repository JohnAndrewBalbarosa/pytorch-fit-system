from pathlib import Path

import pytest

from resume_builder.job_application.persistence import ApplicationProfileStore


def test_verified_identity_round_trips_normalized_structured_fields(tmp_path: Path):
    store = ApplicationProfileStore(tmp_path / "application.sqlite3")

    stored = store.save_verified_identity(
        first_name=" John Andrew ",
        last_name=" Balbarosa ",
        country_name=" Philippines ",
        country_iso="ph",
        phone_calling_code="+63",
    )

    assert stored.full_name == "John Andrew Balbarosa"
    assert store.verified_identity() == stored
    assert stored.country_iso == "PH"
    assert stored.verified_phone == ""


def test_resume_routes_are_replaceable_without_code_changes(tmp_path: Path):
    store = ApplicationProfileStore(tmp_path / "application.sqlite3")
    store.replace_resume_route(
        filename="software.pdf",
        terms=["backend", " API ", "backend"],
        is_default=True,
    )
    store.replace_resume_route(
        filename="data.pdf",
        terms=["warehouse", "analytics"],
    )
    store.replace_resume_route(
        filename="software.pdf",
        terms=["distributed systems"],
        is_default=True,
    )

    routes = store.resume_routes()

    assert [(route.filename, route.terms) for route in routes] == [
        ("data.pdf", ("warehouse", "analytics")),
        ("software.pdf", ("distributed systems",)),
    ]
    assert [route.filename for route in routes if route.is_default] == ["software.pdf"]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("country_iso", "PHL"),
        ("phone_calling_code", "63"),
        ("first_name", ""),
    ],
)
def test_verified_identity_rejects_invalid_required_fields(
    tmp_path: Path,
    field: str,
    value: str,
):
    store = ApplicationProfileStore(tmp_path / "application.sqlite3")
    values = {
        "first_name": "John Andrew",
        "last_name": "Balbarosa",
        "country_name": "Philippines",
        "country_iso": "PH",
        "phone_calling_code": "+63",
    }
    values[field] = value

    with pytest.raises(ValueError):
        store.save_verified_identity(**values)


def test_resume_route_rejects_paths_and_empty_terms(tmp_path: Path):
    store = ApplicationProfileStore(tmp_path / "application.sqlite3")

    with pytest.raises(ValueError):
        store.replace_resume_route(filename="../resume.pdf", terms=["backend"])
    with pytest.raises(ValueError):
        store.replace_resume_route(filename="resume.pdf", terms=[])
