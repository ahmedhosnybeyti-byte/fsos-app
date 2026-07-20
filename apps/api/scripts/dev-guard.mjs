#!/usr/bin/env node
// Wraps `nest start --watch` so apps/api can never end up with two dev
// servers fighting over the same port (see apps/web/scripts/dev-guard.mjs —
// this is the same guard, ported to the API after a July 2026 incident
// where a leftover API process from an earlier crashed `pnpm dev` run kept
// port 4000 open without ever responding: new requests just sat at
// "Pending" forever, with no error and no way to tell from the browser
// alone that the process behind the port was dead weight).
//
// On every `pnpm dev`, this script:
//   1. Kills whatever dev server the lock file says is still running.
//   2. Kills anything else it finds bound to the target port, in case a
//      `nest start` was ever started outside this guard (untracked by the lock).
//   3. Spawns exactly one `nest start --watch` and force-kills whatever ends
//      up bound to the port on exit, so nothing orphans.
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK_FILE = join(API_ROOT, ".api-dev.lock");
const PORT = Number(process.env.PORT) || 4000;
const IS_WIN = process.platform === "win32";

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function killTree(pid) {
  if (!pid || !isAlive(pid)) return;
  try {
    if (IS_WIN) {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      try {
        process.kill(-pid, "SIGKILL"); // negative pid = whole process group
      } catch {
        process.kill(pid, "SIGKILL");
      }
    }
  } catch {
    // already gone by the time we got to it — fine
  }
}

function findPidsOnPort(port) {
  try {
    if (IS_WIN) {
      const out = execSync(`netstat -ano -p tcp`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
      return out
        .split("\n")
        .filter((line) => line.includes(`:${port} `) && /LISTENING/i.test(line))
        .map((line) => line.trim().split(/\s+/).pop())
        .filter(Boolean)
        .map(Number);
    }
    const out = execSync(`lsof -ti tcp:${port}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    return out.split("\n").map((s) => s.trim()).filter(Boolean).map(Number);
  } catch {
    return []; // command failing just means "nothing found"
  }
}

function reapStaleLock() {
  if (!existsSync(LOCK_FILE)) return;
  try {
    const { pid } = JSON.parse(readFileSync(LOCK_FILE, "utf8"));
    if (isAlive(pid)) {
      console.log(`[dev-guard] stopping stale API dev server from a previous session (PID ${pid})`);
      killTree(pid);
    }
  } catch {
    // corrupt/unreadable lock file — ignore its contents, it gets removed below
  }
  rmSync(LOCK_FILE, { force: true });
}

function reapPortSquatters(port) {
  for (const pid of findPidsOnPort(port)) {
    if (pid && isAlive(pid)) {
      console.log(`[dev-guard] port ${port} is held by an untracked process (PID ${pid}) — stopping it`);
      killTree(pid);
    }
  }
}

reapStaleLock();
reapPortSquatters(PORT);

// `nest start --watch` spawns a nested compiler/worker process — a PID
// captured at spawn time isn't reliable enough to guarantee cleanup. Port
// ownership is: whatever process the OS says is bound to PORT *is* the dev
// server, however deep it forked. Cleanup reaps by port, the same primitive
// already used at startup, instead of trusting a single remembered PID.
const child = IS_WIN
  ? spawn(`nest start --watch`, { cwd: API_ROOT, stdio: "inherit", env: process.env, shell: true })
  : spawn("nest", ["start", "--watch"], { cwd: API_ROOT, stdio: "inherit", env: process.env, detached: true });

writeFileSync(LOCK_FILE, JSON.stringify({ pid: child.pid, port: PORT, startedAt: new Date().toISOString() }));

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    const current = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, "utf8")) : null;
    if (current?.pid === child.pid) rmSync(LOCK_FILE, { force: true });
  } catch {
    // best effort
  }
  killTree(child.pid);
  reapPortSquatters(PORT); // ground truth: kill whatever ended up actually bound to PORT
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    cleanup();
    process.exit(0);
  });
}
child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
process.on("exit", cleanup);
