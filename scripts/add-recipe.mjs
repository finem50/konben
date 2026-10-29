#!/usr/bin/env node
/**
 * Add a recipe to a running Konben.
 *
 *   node scripts/add-recipe.mjs recipe.json
 *   cat recipe.json | node scripts/add-recipe.mjs
 *   node scripts/add-recipe.mjs recipe.json --url http://konben.example:3000
 *
 * Accepts one recipe object or an array of them. The `id` is generated here if
 * absent. Validation lives in the API route, so this stays dependency-free and
 * just reports what the server says.
 */

const args = process.argv.slice(2);
const urlFlag = args.indexOf("--url");
const baseUrl =
  (urlFlag !== -1 ? args[urlFlag + 1] : null) ??
  process.env.KONBEN_URL ??
  "http://localhost:3000";
// Everything that isn't the --url flag or its value is the input file.
const urlValueIndex = urlFlag === -1 ? -1 : urlFlag + 1;
const file = args.find((arg, i) => !arg.startsWith("--") && i !== urlValueIndex);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function readInput() {
  if (file) {
    const { readFile } = await import("node:fs/promises");
    return readFile(file, "utf8").catch(() => fail(`Can't read ${file}`));
  }
  if (process.stdin.isTTY) {
    fail("Give me a recipe: a JSON file argument, or JSON on stdin.");
  }
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

const raw = await readInput();

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (error) {
  fail(`That isn't valid JSON — ${error.message}`);
}

const recipes = Array.isArray(parsed) ? parsed : [parsed];
if (recipes.length === 0) fail("No recipes in there.");

let added = 0;
for (const [index, recipe] of recipes.entries()) {
  const withId = {
    ...recipe,
    id: recipe.id ?? `c${Date.now()}${index > 0 ? `-${index}` : ""}`,
  };

  let response;
  try {
    response = await fetch(`${baseUrl}/api/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "recipe.add", recipe: withId }),
    });
  } catch {
    fail(`Couldn't reach Konben at ${baseUrl}. Is it running?`);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail ? `\n  ${body.detail.replace(/\n/g, "\n  ")}` : "";
    fail(`${withId.name ?? "That recipe"} was rejected — ${body?.error ?? response.status}${detail}`);
  }

  console.log(`✓ ${withId.name}  (${withId.id})`);
  added += 1;
}

console.log(
  `\n${added} recipe${added === 1 ? "" : "s"} added. Refresh Konben to see ${
    added === 1 ? "it" : "them"
  } under Recipes.`
);
