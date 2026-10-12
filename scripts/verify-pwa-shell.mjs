import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../dist/sw.js", import.meta.url), "utf8");
assert.match(worker, /precacheAndRoute\(/, "PWA precache route is missing");
assert.equal(
  /\{url:"index\.html",revision:/.test(worker),
  false,
  "index.html must not be precached; it would intercept the PWA start URL",
);
assert.match(
  worker,
  /registerRoute\([^;]+"navigate"[^;]+NetworkFirst/,
  "PWA navigations must use the network-first shell route",
);
process.stdout.write("PWA shell cache policy verified\n");
