#!/usr/bin/env node
// Screenshots a page at one or more ?stage= values using headless Chrome and
// the DevTools protocol. Needs Node 22+ (global WebSocket) and the dev server:
//   python3 -m http.server 8765 --bind 127.0.0.1   (from the repo root)
//
// Usage: node dev/particles/shoot.mjs <page path> <out dir> <W,H> <stage> [<stage> ...]
//   (dev/particles/shoot.sh is a thin wrapper around this.)
// Example: dev/particles/shoot.sh dev/index_v5.html /tmp/shots 1280,800 0 1 4
//
// Env:
//   CHROME_FLAGS  extra Chrome flags, e.g. --force-prefers-reduced-motion
//                 or "--disable-webgl --disable-3d-apis"
//   SHOOT_BASE    base URL (default http://127.0.0.1:8765)
// Notes:
//   - The pages carry production analytics; PostHog and Google requests are
//     blocked so screenshot runs don't send pageviews.
//   - Capture goes through Page.captureScreenshot with a device-metrics override.
//     (Chrome's --screenshot flag renders scrolled pages wrongly.)
//   - Waits for the load intro to finish, then a beat for the scene to settle.
//   - Exits non-zero if any stage failed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [page, outBase, size, ...stages] = process.argv.slice(2);
if (!page || !outBase || !size || !stages.length) {
  console.error("usage: shoot.mjs <page path> <out dir> <W,H> <stage> [<stage> ...]");
  process.exit(2);
}
const [W, H] = size.split(",").map(Number);
if (!(W > 0 && H > 0)) {
  console.error(`bad size "${size}", expected W,H`);
  process.exit(2);
}
const base = (process.env.SHOOT_BASE || "http://127.0.0.1:8765").replace(/\/$/, "");
const chromeBin = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const out = path.join(outBase, String(Math.floor(Date.now() / 1000)));
fs.mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "particles-shoot-"));
let chrome = null;
let chromeExited = Promise.resolve();
let ws = null;
let cleaned = false;

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws?.close(); } catch {}
  try { chrome?.kill("SIGKILL"); } catch {}
}
function removeProfile() {
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on("exit", () => { cleanup(); removeProfile(); });
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { cleanup(); process.exit(130); });
}

async function main() {
  chrome = spawn(chromeBin, [
    "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--no-first-run", "--disable-background-networking", "--disable-component-update",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    `--window-size=${W},${H + 100}`,
    ...(process.env.CHROME_FLAGS || "").split(/\s+/).filter(Boolean),
    "about:blank",
  ], { stdio: "ignore" });
  const exited = new Promise((r) => chrome.once("exit", r));
  chromeExited = exited;
  let chromeDead = false;
  exited.then(() => { chromeDead = true; });

  // Chrome writes the chosen port to <profile>/DevToolsActivePort.
  let port = null;
  for (let i = 0; i < 100 && !chromeDead; i++) {
    try {
      const [p] = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n");
      if (p) { port = Number(p); break; }
    } catch {}
    await sleep(100);
  }
  if (!port) throw new Error("Chrome did not report a DevTools port");

  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === "page");
    } catch {}
    if (!target) await sleep(100);
  }
  if (!target) throw new Error("no page target");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("websocket error")); });

  let id = 0;
  const pending = new Map();
  let logs = [];
  ws.onclose = () => {
    for (const { reject } of pending.values()) reject(new Error("connection closed"));
    pending.clear();
  };
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const { resolve, reject, timer } = pending.get(d.id);
      clearTimeout(timer);
      pending.delete(d.id);
      d.error ? reject(new Error(`${d.error.message}`)) : resolve(d.result);
    } else if (d.method === "Runtime.consoleAPICalled") {
      logs.push(`${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (d.method === "Runtime.exceptionThrown") {
      const e = d.params.exceptionDetails;
      logs.push(`exception: ${e.exception?.description || e.text}`);
    } else if (d.method === "Log.entryAdded") {
      logs.push(`log ${d.params.entry.level}: ${d.params.entry.text}`);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      const timer = setTimeout(() => {
        pending.delete(i);
        reject(new Error(`CDP ${method} timed out`));
      }, 15000);
      pending.set(i, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;

  await send("Network.enable");
  await send("Network.setBlockedURLs", {
    urls: ["*posthog.com*", "*googletagmanager.com*", "*google-analytics.com*"],
  });
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  let failed = 0;
  for (const st of stages) {
    try {
      logs = [];
      await send("Page.navigate", { url: `${base}/${page}?birth=0&stage=${st}` });
      await sleep(2500);
      // The load intro is skipped by the stage scroll; wait in case it isn't.
      for (let i = 0; i < 30; i++) {
        if (await evaluate('!document.documentElement.classList.contains("intro")')) break;
        await sleep(500);
      }
      await sleep(2500);
      const info = await evaluate("JSON.stringify({ scrollY: Math.round(scrollY), cls: document.documentElement.className })");
      const shot = await send("Page.captureScreenshot", { format: "png" });
      const file = path.join(out, `stage-${st}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
      console.log(file, info);
      const noteworthy = logs.filter((l) => !/GPU stall|tailwind/i.test(l));
      if (noteworthy.length) console.log("  console:", noteworthy.join(" | "));
    } catch (err) {
      failed = 1;
      console.error(`stage ${st}: ${err.message}`);
    }
  }
  return failed;
}

let code = 1;
try {
  code = await main();
} catch (err) {
  console.error(err.message);
} finally {
  cleanup();
  await Promise.race([chromeExited, sleep(3000)]);
}
process.exit(code);
