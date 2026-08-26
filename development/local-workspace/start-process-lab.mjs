import { resolve } from "node:path";
import { run } from "./processes.mjs";

const root = resolve(import.meta.dirname, "../..");
const lab = resolve(root, `.cache/process-lab/venv/${process.platform === "win32" ? "Scripts/pytorch-fit-process-lab.exe" : "bin/pytorch-fit-process-lab"}`);
const child = run(lab, ["up"], { cwd: root, env: process.env });
child.once("exit", (code) => process.exit(code || 0));
