# MongoDB questionnaire store

SQLite remains the authoritative ledger for companies, job postings, applications, and submission
confirmations. MongoDB stores variable employer-question documents that do not fit a fixed SQL
shape.

Each `indeed_question_sets` document contains:

- `domain` and the exact `question_set_fingerprint`;
- an ordered array of exact question-label and approved-value pairs;
- provider, schema version, source, and timestamps.

The unique `(domain, question_set_fingerprint)` index makes migrations and repeated writes
idempotent. Runtime matching remains fail-closed: MongoDB does not make semantic guesses and an
answer is used only when the observed fingerprint, label, and rendered option match exactly.

## Local service

The user service runs the official MongoDB Community Server 7.0 image through rootless Podman. The
7.0 line is pinned because MongoDB 8.x is incompatible with this machine's Linux 7.1 kernel due to
the upstream TCMalloc/kernel 6.19+ issue. MongoDB 7.0 remains supported through August 2027. The
service binds only to `127.0.0.1:27017` and persists data in the
`pytorch-fit-mongodb-data` Podman volume.

MongoDB currently ships the same kernel guard in the 7.0 container entrypoint even though the
announced incompatibility applies to 8.x. The unit therefore starts the supported 7.0 `mongod`
binary directly and keeps its normal database configuration, container user, and storage path.

```bash
podman pull docker.io/mongodb/mongodb-community-server:7.0-ubi9
mkdir -p ~/.config/systemd/user
cp config/systemd/mongodb-questionnaire.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mongodb-questionnaire.service
```

Default application settings:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/?directConnection=true
MONGODB_DATABASE=pytorch_fit
```

Migrate an approved local profile:

```bash
.venv/bin/python tools/job_finder/migrate_questionnaire_to_mongodb.py \
  --source .cache/binance-bap-approved-answers.json
```

The source JSON remains a recoverable migration input. Once read-after-write verification succeeds,
the unattended runner can load the same exact answer set from MongoDB with
`--questionnaire-store mongodb`.
