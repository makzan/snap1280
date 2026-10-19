import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
const docs = join(root, "docs");

const html = await readFile(join(src, "index.html"), "utf8");
const css = await readFile(join(src, "styles.css"), "utf8");
let photo = await readFile(join(src, "photo.js"), "utf8");
let app = await readFile(join(src, "app.js"), "utf8");

photo = photo.replace(/^export /gm, "");
app = app.replace(/^import[\s\S]*?from "\.\/photo\.js";\n\n/, "");

const built = html
  .replace(
    '  <link rel="stylesheet" href="styles.css" />\n',
    `  <style>\n${css}\n  </style>\n`,
  )
  .replace(
    '  <script type="module" src="app.js"></script>\n',
    `  <script>\n${photo}\n${app}\n  </script>\n`,
  );

await mkdir(docs, { recursive: true });
await writeFile(join(docs, "index.html"), built);
await copyFile(join(src, "favicon.svg"), join(docs, "favicon.svg"));
console.log("wrote docs/index.html");
