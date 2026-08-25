from __future__ import annotations

import os
import shlex
import shutil
import signal
import subprocess
import sys
import time
from urllib.parse import quote

import requests

from .settings import REPO_ROOT, LabSettings


def prerequisites() -> dict[str, str | None]:
    docker = shutil.which("docker")
    docker_daemon: str | None = None
    if docker:
        try:
            probe = subprocess.run(
                [docker, "info", "--format", "{{.ServerVersion}}"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            if probe.returncode == 0:
                docker_daemon = probe.stdout.strip() or "ready"
        except (OSError, subprocess.TimeoutExpired):
            pass
    npm = shutil.which("npm")
    supabase = shutil.which("supabase")
    prefect = shutil.which("prefect")
    venv_prefect = os.path.join(os.path.dirname(sys.executable), "prefect")
    if prefect is None and os.path.isfile(venv_prefect):
        prefect = venv_prefect
    if supabase is None and npm is not None:
        supabase = f"{shutil.which('npx') or 'npx'} --yes supabase@latest"
    return {
        "docker": docker,
        "docker_daemon": docker_daemon,
        "npm": npm,
        "prefect": prefect,
        "supabase": supabase,
    }


def require_prerequisites() -> None:
    missing = [name for name, path in prerequisites().items() if path is None]
    if missing:
        raise RuntimeError(
            "Missing Process Lab prerequisites: "
            + ", ".join(missing)
            + ". Install them before starting the local lab."
        )


def _supabase_command() -> list[str]:
    installed = shutil.which("supabase")
    if installed:
        return [installed]
    npx = shutil.which("npx")
    if npx:
        return [npx, "--yes", "supabase@latest"]
    raise RuntimeError("Supabase CLI requires either supabase or npx.")


def _supabase_environment() -> dict[str, str]:
    command = _supabase_command()
    subprocess.run([*command, "start"], cwd=REPO_ROOT, check=True)
    completed = subprocess.run(
        [*command, "status", "-o", "env"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    values: dict[str, str] = {}
    for line in completed.stdout.splitlines():
        if "=" not in line:
            continue
        key, raw = line.split("=", 1)
        parsed = shlex.split(raw.strip())
        if parsed:
            values[key.strip()] = parsed[0]
    if not values.get("API_URL") or not values.get("ANON_KEY"):
        raise RuntimeError("Supabase did not report API_URL and ANON_KEY.")
    return values


def _open_cdp_tab(cdp_url: str, url: str) -> None:
    requests.put(f"{cdp_url}/json/new?{quote(url, safe=':/')}", timeout=5).raise_for_status()


def run_local_stack() -> int:
    require_prerequisites()
    settings = LabSettings.from_env()
    settings.ensure_local_dirs()
    supabase = _supabase_environment()
    environment = os.environ.copy()
    environment.update(
        {
            "NEXT_PUBLIC_SUPABASE_URL": supabase["API_URL"],
            "NEXT_PUBLIC_SUPABASE_ANON_KEY": supabase["ANON_KEY"],
            "SUPABASE_SERVICE_ROLE_KEY": supabase.get("SERVICE_ROLE_KEY", ""),
            "PYTORCH_FIT_DATA_PROVIDER": "supabase",
            "PYTORCH_FIT_DEV_ACCESS": "0",
            "PYTHONPATH": str(REPO_ROOT / "src"),
            "PREFECT_API_URL": "http://127.0.0.1:4200/api",
        }
    )
    processes = [
        subprocess.Popen(
            [sys.executable, "scripts/dev_frontend.py"], cwd=REPO_ROOT, env=environment
        ),
        subprocess.Popen(
            [sys.executable, "-m", "prefect", "server", "start", "--host", "127.0.0.1"],
            cwd=REPO_ROOT,
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
    try:
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            try:
                if requests.get(f"{settings.api_url}/healthz", timeout=1).ok:
                    break
            except requests.RequestException:
                pass
            time.sleep(0.25)
        else:
            raise RuntimeError("Local product services did not become ready within 45 seconds.")
        from resume_builder.web.shared_browser import ensure_shared_browser

        ensure_shared_browser()
        _open_cdp_tab(settings.cdp_url, f"{settings.member_url}/")
        _open_cdp_tab(settings.cdp_url, f"{settings.api_url}/docs")
        _open_cdp_tab(settings.cdp_url, "http://127.0.0.1:4200")
        return max(process.wait() for process in processes)
    finally:
        stop()
