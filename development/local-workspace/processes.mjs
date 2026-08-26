import { spawn } from "node:child_process";

export function run(command, args, options = {}) {
  return spawn(command, args, { stdio: "inherit", ...options });
}

export function stopTogether(processes) {
  const stop = () => {
    for (const child of processes) {
      if (!child.killed) child.kill("SIGTERM");
    }
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  return stop;
}

export async function waitFor(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 307) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${url} did not become ready within ${timeoutMs / 1000} seconds.`);
}
