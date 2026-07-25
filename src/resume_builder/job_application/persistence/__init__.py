"""Durable job-application knowledge and idempotency boundaries.

Persistence modules store validated facts and observations. They do not decide
answers or perform browser actions.
"""

from .questionnaire_store import (
    DEFAULT_MONGODB_DATABASE,
    DEFAULT_MONGODB_URI,
    MongoQuestionnaireRepository,
)

__all__ = [
    "DEFAULT_MONGODB_DATABASE",
    "DEFAULT_MONGODB_URI",
    "MongoQuestionnaireRepository",
]
