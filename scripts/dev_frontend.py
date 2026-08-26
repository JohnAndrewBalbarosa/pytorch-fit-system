"""Launch the canonical Next.js UI and the local FastAPI service together."""

from __future__ import annotations

import os
import secrets
import signal
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    environment = os.environ.copy()
    environment.setdefault("PYTHONPATH", str(ROOT / "src"))
    environment.setdefault("PYTORCH_FIT_API_URL", "http://127.0.0.1:8000")
    environment.setdefault("PYTORCH_FIT_FRONTEND_URL", "http://members.localhost:3000")
    environment.setdefault("PYTORCH_FIT_MEMBER_URL", "http://members.localhost:3000")
    environment.setdefault("PYTORCH_FIT_OFFICER_URL", "http://officers.localhost:3000")
    environment.setdefault("PYTORCH_FIT_MEMBER_HOSTS", "members.localhost:3000,localhost:3000,127.0.0.1:3000")
    environment.setdefault("PYTORCH_FIT_OFFICER_HOSTS", "officers.localhost:3000")
    environment.setdefault(
        "PYTORCH_FIT_DEV_ACCESS",
        "0" if environment.get("PYTORCH_FIT_DATA_PROVIDER") == "supabase" else "1",
    )
    environment.setdefault("PYTORCH_FIT_DEV_API_TOKEN", secrets.token_urlsafe(32))
    npm = "npm.cmd" if os.name == "nt" else "npm"
    if environment.get("PYTORCH_FIT_DATA_PROVIDER", "local") == "local":
        subprocess.run(
            [npm, "run", "demo:ensure", "--", "--quiet"],
            cwd=ROOT,
            env=environment,
            check=True,
        )
    processes = [
        subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "resume_builder.web.app:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
            ],
            cwd=ROOT,
            env=environment,
        ),
        subprocess.Popen(
            [npm, "run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000"],
            cwd=ROOT / "apps" / "portal",
            env=environment,
        ),
    ]

    def stop(*_args: object) -> None:
        for process in processes:
            if process.poll() is None:
                process.terminate()

    signal.signal(signal.SIGINT, stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, stop)
    time.sleep(2)
    if environment.get("PYTORCH_FIT_NO_BROWSER") != "1":
        webbrowser.open("http://members.localhost:3000/dashboard")
        webbrowser.open("http://officers.localhost:3000/dashboard")
    try:
        return max(process.wait() for process in processes)
    finally:
        stop()


if __name__ == "__main__":
    raise SystemExit(main())
