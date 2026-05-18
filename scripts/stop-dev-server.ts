import { execFileSync } from "node:child_process";

const projectPath = process.cwd();
const output = execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });

for (const line of output.split("\n")) {
  const trimmed = line.trim();
  const match = trimmed.match(/^(\d+)\s+(.*)$/);
  if (!match) continue;
  const [, pid, args] = match;
  if (args.includes("/node_modules/.bin/next dev") && args.includes(projectPath)) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // Process already exited.
    }
  }
}
