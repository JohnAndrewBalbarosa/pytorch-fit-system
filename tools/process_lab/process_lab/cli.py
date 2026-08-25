from __future__ import annotations

import argparse
import json
import subprocess
import sys

from .artifact_guard import forbidden_artifacts
from .settings import LabSettings


def _flows():
    try:
        from .flows import FLOW_REGISTRY
    except ImportError as exc:
        raise SystemExit(
            "Process Lab dependencies are missing. Run: pip install -e tools/process_lab"
        ) from exc
    return FLOW_REGISTRY


def main() -> int:
    parser = argparse.ArgumentParser(description="Local-only PyTorch FIT process lab.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("list", help="List fixed Prefect workflows.")
    subparsers.add_parser("doctor", help="Report external Process Lab prerequisites.")
    subparsers.add_parser("up", help="Start local Supabase, product services, browser tabs, and Prefect UI.")
    server = subparsers.add_parser("server", help="Start Prefect's maintained local UI/API.")
    server.add_argument("--host", default="127.0.0.1")
    run = subparsers.add_parser("run", help="Run one fixed workflow.")
    run.add_argument("workflow", choices=["api-contracts", "browser-lifecycle", "scraper-economy", "evidence-compilation", "resume-build", "end-to-end"])
    run.add_argument("--seed-url", default="")
    run.add_argument("--crawl-artifact", default="")
    run.add_argument("--gh-user", default="")
    run.add_argument("--role", default="")
    run.add_argument("--include-login", action="store_true")
    run.add_argument("--property-checks", action="store_true")
    guard = subparsers.add_parser("guard-artifact", help="Assert a release artifact excludes the lab.")
    guard.add_argument("artifact")
    args = parser.parse_args()

    if args.command == "list":
        for name in _flows():
            print(name)
        return 0
    if args.command == "doctor":
        from .launcher import prerequisites

        values = prerequisites()
        print(json.dumps(values, indent=2))
        return 0 if all(values.values()) else 1
    if args.command == "up":
        from .launcher import run_local_stack

        return run_local_stack()
    if args.command == "server":
        return subprocess.call([sys.executable, "-m", "prefect", "server", "start", "--host", args.host])
    if args.command == "guard-artifact":
        matches = forbidden_artifacts(__import__("pathlib").Path(args.artifact).resolve())
        if matches:
            print(json.dumps({"ok": False, "matches": matches}, indent=2))
            return 1
        print(json.dumps({"ok": True, "artifact": args.artifact}, indent=2))
        return 0

    settings = LabSettings.from_env()
    settings.ensure_local_dirs()
    selected = _flows()[args.workflow]
    if args.workflow == "api-contracts":
        result = selected(run_property_checks=args.property_checks)
    elif args.workflow == "browser-lifecycle":
        result = selected(include_login=args.include_login)
    elif args.workflow == "scraper-economy":
        if not args.seed_url:
            parser.error("--seed-url is required for scraper-economy")
        result = selected(seed_url=args.seed_url)
    elif args.workflow == "evidence-compilation":
        if not args.crawl_artifact:
            parser.error("--crawl-artifact is required for evidence-compilation")
        result = selected(crawl_artifact=args.crawl_artifact)
    elif args.workflow == "resume-build":
        if not args.gh_user or not args.role:
            parser.error("--gh-user and --role are required for resume-build")
        result = selected(gh_user=args.gh_user, role=args.role)
    else:
        if not args.seed_url or not args.gh_user or not args.role:
            parser.error("--seed-url, --gh-user, and --role are required for end-to-end")
        result = selected(seed_url=args.seed_url, gh_user=args.gh_user, role=args.role)
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
