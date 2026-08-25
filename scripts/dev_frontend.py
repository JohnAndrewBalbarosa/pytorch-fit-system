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
    environment.setdefault("PYTORCH_FIT_FRONTEND_URL", "http://127.0.0.1:3000")
    environment.setdefault("PYTORCH_FIT_MEMBER_URL", "http://127.0.0.1:3000")
    environment.setdefault("PYTORCH_FIT_OFFICER_URL", "http://127.0.0.1:3001")
    environment.setdefault("PYTORCH_FIT_DEV_ACCESS", "1")
    environment.setdefault("PYTORCH_FIT_DEV_API_TOKEN", secrets.token_urlsafe(32))
    npm = "npm.cmd" if os.name == "nt" else "npm"
    subprocess.run(
        [npm, "run", "demo:ensure", "--", "--quiet"],
        cwd=ROOT / "platform" / "web",
        env=environment,
        check=True,
    )
    member_environment = environment.copy()
    member_environment.update({
        "PYTORCH_FIT_PORTAL_AUDIENCE": "member",
        "PYTORCH_FIT_DEV_USER_ID": "00000000-0000-4000-8000-000000000001",
        "PYTORCH_FIT_NEXT_DIST_DIR": ".next-member",
    })
    officer_environment = environment.copy()
    officer_environment.update({
        "PYTORCH_FIT_PORTAL_AUDIENCE": "officer",
        "PYTORCH_FIT_DEV_USER_ID": "00000000-0000-4000-8000-000000000002",
        "PYTORCH_FIT_NEXT_DIST_DIR": ".next-officer",
    })
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
            cwd=ROOT / "platform" / "web",
            env=member_environment,
        ),
        subprocess.Popen(
            [npm, "run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3001"],
            cwd=ROOT / "platform" / "web",
            env=officer_environment,
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
        webbrowser.open("http://127.0.0.1:3000/dashboard")
        webbrowser.open("http://127.0.0.1:3001/dashboard")
    try:
        return max(process.wait() for process in processes)
    finally:
        stop()


if __name__ == "__main__":
    raise SystemExit(main())
