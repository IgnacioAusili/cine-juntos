const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const portArgIndex = process.argv.indexOf("--port");
const port = Number(process.env.PORT || (portArgIndex >= 0 ? process.argv[portArgIndex + 1] : 8080));

const csp = [
  "default-src 'self'",
  "script-src 'self' https://unpkg.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' http: https: blob: data:",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
};

function setSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", () => resolve(""));
  });
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);

  if (req.method === "POST" && req.url === "/__client-log") {
    const body = await readBody(req);
    try {
      const log = JSON.parse(body);
      const room = log.room ? ` room=${log.room}` : "";
      console.log(`[client:${log.client || "unknown"}] [${log.kind}]${room} ${log.message}`);
    } catch {
      console.log(`[client] ${body}`);
    }
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/__client-log-ready") {
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/dev-runtime.js") {
    res.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end("window.CINE_JUNTOS_TERMINAL_LOGS = true;\n");
    return;
  }

  const safePath = path
    .normalize(decodeURIComponent(url.pathname))
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]/, "");
  const filePath = path.join(root, safePath || "index.html");
  const resolved = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
    ? path.join(filePath, "index.html")
    : filePath;

  if (!resolved.startsWith(root) || !fs.existsSync(resolved)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(resolved).pipe(res);
});

server.listen(port, () => {
  console.log(`Cine Juntos dev server: http://localhost:${port}`);
  console.log("Client logs enabled in this terminal.");
});
