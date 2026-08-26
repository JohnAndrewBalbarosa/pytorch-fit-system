import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { run, stopTogether, waitFor } from "./processes.mjs";
import { runtimePath, workspaceRoot as root } from "./runtime-paths.mjs";

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  throw new Error("The local workspace cannot run in production or Vercel.");
}

const python = runtimePath("environments", "process-lab", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const supabase = process.platform === "win32" ? "npx.cmd" : "npx";
const supabasePrefix = ["--yes", "supabase@latest"];
const manual = process.argv.includes("--manual-login");

execFileSync(supabase, [...supabasePrefix, "start"], { cwd: root, stdio: "inherit" });
const status = execFileSync(supabase, [...supabasePrefix, "status", "-o", "env"], { cwd: root, encoding: "utf8" });
const values = Object.fromEntries(status.split(/\r?\n/).filter((line) => line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
}));
const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY || "",
  PYTORCH_FIT_DATA_PROVIDER: "supabase",
  PYTORCH_FIT_MEMBER_HOSTS: "members.localhost:3000,localhost:3000,127.0.0.1:3000",
  PYTORCH_FIT_OFFICER_HOSTS: "officers.localhost:3000",
  PYTORCH_FIT_MEMBER_URL: "http://members.localhost:3000",
  PYTORCH_FIT_OFFICER_URL: "http://officers.localhost:3000",
  PYTORCH_FIT_NO_BROWSER: "1",
  PYTORCH_FIT_VAR_ROOT: runtimePath(),
  PYTORCH_FIT_ARTIFACT_ROOT: resolve(root, "out"),
  PREFECT_API_URL: "http://127.0.0.1:4200/api",
  PREFECT_HOME: runtimePath("state", "process-lab", "prefect"),
  PREFECT_UI_STATIC_DIRECTORY: runtimePath("cache", "process-lab", "prefect-ui"),
  PREFECT_SERVER_UI_V2_ENABLED: "true",
};

execFileSync("node", [resolve(root, "development/prefect-dashboard/build-dashboard.mjs")], {
  cwd: root,
  env: environment,
  stdio: "inherit",
});

const processes = [
  run("npm", ["run", "dev:portal"], { cwd: root, env: environment }),
  run(python, ["-m", "prefect", "server", "start", "--host", "127.0.0.1"], { cwd: root, env: environment }),
];
const stop = stopTogether(processes);
try {
  await Promise.all([
    waitFor("http://members.localhost:3000/login"),
    waitFor("http://127.0.0.1:4200/api/health"),
  ]);
  const lab = runtimePath("environments", "process-lab", process.platform === "win32" ? "Scripts/pytorch-fit-process-lab.exe" : "bin/pytorch-fit-process-lab");
  execFileSync(lab, ["configure"], { cwd: root, env: environment, stdio: "inherit" });
  execFileSync(lab, ["open", "--workflow", "member-experience"], { cwd: root, env: environment, stdio: "inherit" });
  if (!manual) processes.push(run("node", [resolve(root, "development/local-access/watch-login.mjs")], { cwd: root, env: environment }));
  await new Promise((resolvePromise) => processes[0].once("exit", resolvePromise));
} finally {
  stop();
}
