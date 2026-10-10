const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "src");
const templatePath = path.join(sourceRoot, "index.template.html");
const outputPath = path.join(projectRoot, "index.html");
const includePattern = /^[ \t]*<!-- @include ([^\s]+) -->[ \t]*(?:\r?\n|$)/gm;

function countLines(source) {
  const lines = source.split(/\r\n|\n|\r/);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

function resolveSource(filePath) {
  const resolved = path.resolve(filePath);
  const relative = path.relative(sourceRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`El include sale de src/: ${filePath}`);
  }
  if (path.extname(resolved).toLowerCase() !== ".html") {
    throw new Error(`Los includes deben apuntar a archivos HTML: ${filePath}`);
  }
  return resolved;
}

function validateSourceLineCounts(directory = sourceRoot) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      validateSourceLineCounts(filePath);
    } else if (path.extname(entry.name).toLowerCase() === ".html") {
      const lines = countLines(fs.readFileSync(filePath, "utf8"));
      if (lines >= 300) {
        throw new Error(`${path.relative(projectRoot, filePath)} tiene ${lines} líneas; los fuentes HTML deben tener menos de 300.`);
      }
    }
  }
}

function expandHtml(filePath, stack, sources) {
  const resolved = resolveSource(filePath);
  if (stack.includes(resolved)) {
    throw new Error(`Ciclo de includes HTML: ${[...stack, resolved].join(" -> ")}`);
  }

  const source = fs.readFileSync(resolved, "utf8");
  const lines = countLines(source);
  if (lines >= 300) {
    throw new Error(`${path.relative(projectRoot, resolved)} tiene ${lines} líneas; los fuentes HTML deben tener menos de 300.`);
  }
  sources.add(resolved);

  const expanded = source.replace(includePattern, (_include, relativePath) => {
    const includedPath = path.resolve(path.dirname(resolved), relativePath);
    return expandHtml(includedPath, [...stack, resolved], sources);
  });
  if (/<!--[ \t]*@include\b/.test(expanded)) {
    throw new Error(`Quedó un include sin resolver en ${path.relative(projectRoot, resolved)}.`);
  }
  return expanded;
}

function buildHtml({ check = false } = {}) {
  validateSourceLineCounts();
  const sources = new Set();
  const html = expandHtml(templatePath, [], sources);
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : null;
  const changed = current !== html;

  if (check) return { changed, lines: countLines(html), sources: [...sources] };
  if (changed) fs.writeFileSync(outputPath, html, "utf8");
  return { changed, lines: countLines(html), sources: [...sources] };
}

if (require.main === module) {
  try {
    const check = process.argv.includes("--check");
    const result = buildHtml({ check });
    if (check && result.changed) {
      console.error("index.html está desactualizado; ejecuta node scripts/build-html.js.");
      process.exitCode = 1;
    } else if (check) {
      console.log(`index.html coincide con ${result.sources.length} fuentes (${result.lines} líneas).`);
    } else {
      console.log(`index.html ${result.changed ? "generado" : "actualizado"}: ${result.lines} líneas, ${result.sources.length} fuentes.`);
    }
  } catch (error) {
    console.error(`No se pudo ensamblar el HTML: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildHtml, sourceRoot };
