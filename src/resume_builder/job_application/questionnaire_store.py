"""MongoDB document storage for exact, user-approved questionnaire profiles."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .indeed_questionnaire import (
    ApprovedIndeedQuestionAnswerSet,
    ApprovedIndeedQuestionAnswers,
)

DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/?directConnection=true"
DEFAULT_MONGODB_DATABASE = "pytorch_fit"
QUESTIONNAIRE_COLLECTION = "indeed_question_sets"
SCHEMA_VERSION = 1


class MongoQuestionnaireRepository:
    """Persist variable questionnaire documents while retaining exact fingerprints."""

    def __init__(
        self,
        uri: str = DEFAULT_MONGODB_URI,
        *,
        database: str = DEFAULT_MONGODB_DATABASE,
        client: Any | None = None,
        server_selection_timeout_ms: int = 5_000,
    ) -> None:
        if not uri.strip():
            raise ValueError("MongoDB URI is required")
        if not database.strip():
            raise ValueError("MongoDB database name is required")
        if client is None:
            try:
                from pymongo import MongoClient
                from pymongo.server_api import ServerApi
            except ImportError as exc:
                raise RuntimeError(
                    "PyMongo is required for MongoDB questionnaire storage"
                ) from exc
            client = MongoClient(
                uri,
                server_api=ServerApi("1"),
                serverSelectionTimeoutMS=server_selection_timeout_ms,
            )
        self.client = client
        self.database = client[database]
        self.collection = self.database[QUESTIONNAIRE_COLLECTION]
        self._ensure_indexes()

    def close(self) -> None:
        self.client.close()

    def ping(self) -> bool:
        return bool(self.database.command("ping").get("ok"))

    def save(
        self,
        answer_set: ApprovedIndeedQuestionAnswerSet,
        *,
        source: str = "user-approved migration",
        observed_at: datetime | None = None,
    ) -> int:
        """Upsert one document per exact question-set fingerprint."""
        timestamp = (observed_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
        updated = 0
        for page in answer_set.pages:
            document = {
                "schema_version": SCHEMA_VERSION,
                "provider": "indeed",
                "domain": page.domain,
                "question_set_fingerprint": page.question_set_fingerprint,
                "answers": [
                    {"label": label, "value": value}
                    for label, value in page.answers.items()
                ],
                "source": source,
                "updated_at": timestamp,
            }
            result = self.collection.update_one(
                {
                    "domain": page.domain,
                    "question_set_fingerprint": page.question_set_fingerprint,
                },
                {
                    "$set": document,
                    "$setOnInsert": {"created_at": timestamp},
                },
                upsert=True,
            )
            updated += int(bool(result.upserted_id) or result.modified_count > 0)
        return updated

    def load(self, *, domain: str) -> ApprovedIndeedQuestionAnswerSet | None:
        documents = list(
            self.collection.find(
                {"domain": domain, "schema_version": SCHEMA_VERSION},
                {
                    "_id": 0,
                    "domain": 1,
                    "question_set_fingerprint": 1,
                    "answers": 1,
                },
            ).sort("question_set_fingerprint", 1)
        )
        if not documents:
            return None
        pages = []
        for document in documents:
            answers = {
                str(item["label"]): str(item["value"])
                for item in document.get("answers", [])
                if item.get("label") and item.get("value")
            }
            pages.append(
                ApprovedIndeedQuestionAnswers(
                    domain=document["domain"],
                    question_set_fingerprint=document["question_set_fingerprint"],
                    answers=answers,
                )
            )
        return ApprovedIndeedQuestionAnswerSet(domain=domain, pages=pages)

    def count(self, *, domain: str | None = None) -> int:
        query = {"domain": domain} if domain else {}
        return int(self.collection.count_documents(query))

    def _ensure_indexes(self) -> None:
        self.collection.create_index(
            [("domain", 1), ("question_set_fingerprint", 1)],
            unique=True,
            name="unique_domain_fingerprint",
        )
        self.collection.create_index(
            [("provider", 1), ("updated_at", -1)],
            name="provider_updated",
        )
