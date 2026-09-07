import { access, mkdir, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const outputDirectory = path.resolve("dist/client");
const nestedProjectDirectory = path.join(outputDirectory, "bitcoin-history");
const nestedAssets = path.join(nestedProjectDirectory, "_next");
const publishedAssets = path.join(outputDirectory, "_next");

try {
  await access(nestedAssets, constants.R_OK);
} catch {
  throw new Error(
    `Expected GitHub Pages assets at ${nestedAssets}, but the directory was not generated.`,
  );
}

// Vinext mirrors assetPrefix into the output tree. GitHub project Pages already
// mounts the artifact at /bitcoin-history, so leaving that directory in place
// would publish every stylesheet and script one project segment too deep.
await rm(publishedAssets, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await rename(nestedAssets, publishedAssets);
await rm(nestedProjectDirectory, { recursive: true, force: true });

console.log("Prepared GitHub Pages assets at dist/client/_next.");
