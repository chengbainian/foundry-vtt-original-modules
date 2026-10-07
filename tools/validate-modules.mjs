import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulesRoot = path.join(root, "modules");
const releaseFolders = [
  "la-hd-lock",
  "madness-fx",
  "private-parchment",
  "scene-warp-transitions",
  "battle-transitions-scene-warp",
];
const errors = [];

for (const folder of releaseFolders) {
  const directory = path.join(modulesRoot, folder);
  const manifestPath = path.join(directory, "module.json");
  if (!fs.existsSync(manifestPath)) {
    errors.push(`${folder}: module.json missing`);
    continue;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    errors.push(`${folder}: module.json invalid (${error.message})`);
    continue;
  }
  if (!manifest.id || !manifest.version) errors.push(`${folder}: id/version required`);
  for (const file of ["README.md", "AI_ASSISTED.md"]) {
    if (!fs.existsSync(path.join(directory, file))) errors.push(`${folder}: ${file} missing`);
  }
  if (!fs.existsSync(path.join(directory, "LICENSE")) && !fs.existsSync(path.join(directory, "RIGHTS_AND_ATTRIBUTION.md"))) {
    errors.push(`${folder}: LICENSE or RIGHTS_AND_ATTRIBUTION.md required`);
  }
  for (const declared of [manifest.readme, manifest.license]) {
    if (declared && !fs.existsSync(path.join(directory, declared))) {
      errors.push(`${folder}: manifest refers to missing file ${declared}`);
    }
  }

  const targets = [
    ...(manifest.esmodules ?? []),
    ...(manifest.scripts ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map(({ path: file }) => file),
    ...(manifest.packs ?? []).map(({ path: pack }) => pack),
  ];
  for (const relative of targets) {
    const absolute = path.resolve(directory, relative);
    if (!absolute.startsWith(`${directory}${path.sep}`) && absolute !== directory) {
      errors.push(`${folder}: path escapes module directory: ${relative}`);
    } else if (!fs.existsSync(absolute)) {
      errors.push(`${folder}: manifest target missing: ${relative}`);
    }
  }
  console.log(`${manifest.id}@${manifest.version}: manifest paths checked`);
}

for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !releaseFolders.includes(entry.name)) {
    console.log(`Not on public release allowlist: ${entry.name}`);
  }
}
if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("All original-module release candidates passed manifest validation.");
}
