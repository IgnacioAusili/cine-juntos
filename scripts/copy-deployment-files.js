const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "dist");

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

copyFile(
  path.join(projectRoot, "public", "dev-runtime.js"),
  path.join(outputRoot, "public", "dev-runtime.js"),
);
copyDirectory(
  path.join(projectRoot, "public", "vendor", "lucide-0.468.0"),
  path.join(outputRoot, "public", "vendor", "lucide-0.468.0"),
);
copyDirectory(path.join(projectRoot, "console"), path.join(outputRoot, "console"));

const favicon = path.join(projectRoot, "favicon.ico");
if (fs.existsSync(favicon)) {
  copyFile(favicon, path.join(outputRoot, "favicon.ico"));
}

console.log("Recursos estáticos y consola copiados a dist/.");
