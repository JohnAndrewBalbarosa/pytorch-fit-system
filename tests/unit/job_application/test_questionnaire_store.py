from copy import deepcopy

from resume_builder.job_application import (
    ApprovedIndeedQuestionAnswerSet,
    ApprovedIndeedQuestionAnswers,
    MongoQuestionnaireRepository,
)


class _Result:
    def __init__(self, *, inserted: bool, modified: bool):
        self.upserted_id = "new" if inserted else None
        self.modified_count = int(modified)


class _Cursor(list):
    def sort(self, field, direction):
        reverse = direction < 0
        return _Cursor(sorted(self, key=lambda item: item[field], reverse=reverse))


class _Collection:
    def __init__(self):
        self.documents = []
        self.indexes = []

    def create_index(self, keys, **kwargs):
        self.indexes.append((keys, kwargs))

    def update_one(self, selector, update, *, upsert):
        existing = next(
            (
                item
                for item in self.documents
                if all(item.get(key) == value for key, value in selector.items())
            ),
            None,
        )
        if existing is None:
            assert upsert is True
            document = deepcopy(update["$setOnInsert"])
            document.update(deepcopy(update["$set"]))
            self.documents.append(document)
            return _Result(inserted=True, modified=False)
        changed = any(existing.get(key) != value for key, value in update["$set"].items())
        existing.update(deepcopy(update["$set"]))
        return _Result(inserted=False, modified=changed)

    def find(self, query, projection):
        documents = []
        for item in self.documents:
            if all(item.get(key) == value for key, value in query.items()):
                documents.append(
                    {
                        key: deepcopy(value)
                        for key, value in item.items()
                        if key != "_id" and projection.get(key)
                    }
                )
        return _Cursor(documents)

    def count_documents(self, query):
        return sum(
            all(item.get(key) == value for key, value in query.items())
            for item in self.documents
        )


class _Database:
    def __init__(self):
        self.collection = _Collection()

    def __getitem__(self, name):
        assert name == "indeed_question_sets"
        return self.collection

    def command(self, name):
        assert name == "ping"
        return {"ok": 1}


class _Client:
    def __init__(self):
        self.database = _Database()
        self.closed = False

    def __getitem__(self, name):
        assert name == "pytorch_fit"
        return self.database

    def close(self):
        self.closed = True


def _answer_set():
    return ApprovedIndeedQuestionAnswerSet(
        pages=[
            ApprovedIndeedQuestionAnswers(
                question_set_fingerprint="a" * 40,
                answers={
                    "Where do you currently live?": "Philippines",
                    "Language 1": "Filipino",
                },
            ),
            ApprovedIndeedQuestionAnswers(
                question_set_fingerprint="b" * 40,
                answers={"Which location are you applying for?": "Australia, Sydney"},
            ),
        ]
    )


def test_mongodb_repository_round_trips_and_upserts_exact_profiles():
    client = _Client()
    repository = MongoQuestionnaireRepository(client=client)

    assert repository.ping() is True
    assert repository.save(_answer_set(), source="unit test") == 2
    assert repository.save(_answer_set(), source="unit test") == 2
    assert repository.count(domain="smartapply.indeed.com") == 2
    assert repository.load(domain="smartapply.indeed.com") == _answer_set()
    assert any(
        options.get("unique") is True
        for _, options in client.database.collection.indexes
    )

    repository.close()
    assert client.closed is True


def test_mongodb_repository_returns_none_for_unknown_domain():
    repository = MongoQuestionnaireRepository(client=_Client())

    assert repository.load(domain="apply.example.com") is None
