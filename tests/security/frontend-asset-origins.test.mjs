import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexHtml = () =>
  readFile(new URL("../../index.html", import.meta.url), "utf8");

test("the app shell executes no third-party script", async () => {
  const html = await indexHtml();

  // Every executable script must be same-origin. A remote <script> runs with
  // full page privileges — it can read the Supabase session and anything the
  // user types — and it is the thing that makes a restrictive CSP impossible.
  const remoteScripts = [...html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map(([, src]) => src)
    .filter((src) => /^(https?:)?\/\//i.test(src));

  assert.deepEqual(remoteScripts, [], "index.html must not load remote scripts");

  // Both were present historically: the Tailwind play CDN, and the AI Studio
  // scaffold import map pointing React and friends at aistudiocdn.com.
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(html, /aistudiocdn\.com/);
  assert.doesNotMatch(html, /<script\s+type=["']importmap["']/i);
});

test("styling is built from source rather than configured at runtime", async () => {
  const [html, entry, config] = await Promise.all([
    indexHtml(),
    readFile(new URL("../../index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../tailwind.config.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(html, /tailwind\.config\s*=/, "no runtime Tailwind config");
  assert.match(entry, /import ['"]\.\/index\.css['"]/, "the stylesheet must be bundled");

  // The palette the CDN config used to define at runtime now has to live here,
  // or dark mode and the brand colors silently stop resolving.
  assert.match(config, /darkMode:\s*['"]class['"]/);
  assert.match(config, /esg:/);
  assert.match(config, /brand:/);
  assert.match(config, /Noto Sans Thai/);
});

test("remote origins in the shell are limited to fonts", async () => {
  const html = await indexHtml();

  const remoteHosts = new Set(
    [...html.matchAll(/\b(?:href|src)=["']https?:\/\/([^/"']+)/gi)].map(([, host]) => host),
  );

  assert.deepEqual(
    [...remoteHosts].sort(),
    ["fonts.googleapis.com", "fonts.gstatic.com"],
    "only the font stylesheet may be remote; add a CSP entry before adding more",
  );
});
