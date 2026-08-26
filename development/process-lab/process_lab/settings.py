from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class LabSettings:
    api_url: str = "http://127.0.0.1:8000"
    member_url: str = "http://members.localhost:3000"
    officer_url: str = "http://officers.localhost:3000"
    cdp_url: str = "http://127.0.0.1:9222"
    artifact_root: Path = REPO_ROOT / "out" / "process-lab"
    cache_root: Path = REPO_ROOT / ".cache" / "process-lab"

    @classmethod
    def from_env(cls) -> LabSettings:
        return cls(
            api_url=os.getenv("PROCESS_LAB_API_URL", cls.api_url).rstrip("/"),
            member_url=os.getenv("PROCESS_LAB_MEMBER_URL", cls.member_url).rstrip("/"),
            officer_url=os.getenv("PROCESS_LAB_OFFICER_URL", cls.officer_url).rstrip("/"),
            cdp_url=os.getenv("RESUME_BUILD_PLAYWRIGHT_CDP_URL", cls.cdp_url).rstrip("/"),
            artifact_root=Path(
                os.getenv("PROCESS_LAB_ARTIFACT_ROOT", str(REPO_ROOT / "out" / "process-lab"))
            ).resolve(),
            cache_root=Path(
                os.getenv("PROCESS_LAB_CACHE_ROOT", str(REPO_ROOT / ".cache" / "process-lab"))
            ).resolve(),
        )

    def ensure_local_dirs(self) -> None:
        self.artifact_root.mkdir(parents=True, exist_ok=True)
        self.cache_root.mkdir(parents=True, exist_ok=True)
