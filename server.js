"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { ApplicationStore } = require("./lib/store");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "applications.json");
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

async function body(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_000_000) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function staticFile(response, pathname, directory) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(directory, path.normalize(relative));
  if (!file.startsWith(path.resolve(directory) + path.sep)) {
    json(response, 403, { error: "Forbidden." });
    return;
  }
  try {
    const content = await fs.readFile(file);
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=3600"
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return json(response, 404, { error: "Not found." });
    throw error;
  }
}

function createServer(options = {}) {
  const store = options.store || new ApplicationStore(DATA_FILE);
  const publicDirectory = options.publicDirectory || PUBLIC_DIR;

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const match = url.pathname.match(/^\/api\/applications\/([^/]+)$/);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json(response, 200, { status: "ok" });
      }
      if (request.method === "GET" && url.pathname === "/api/stats") {
        return json(response, 200, { data: await store.stats() });
      }
      if (request.method === "GET" && url.pathname === "/api/applications") {
        const data = await store.list({
          query: url.searchParams.get("q") || "",
          status: url.searchParams.get("status") || "All",
          sort: url.searchParams.get("sort") || "updated"
        });
        return json(response, 200, { data });
      }
      if (request.method === "POST" && url.pathname === "/api/applications") {
        return json(response, 201, { data: await store.create(await body(request)) });
      }
      if (match && request.method === "PATCH") {
        return json(response, 200, {
          data: await store.update(decodeURIComponent(match[1]), await body(request))
        });
      }
      if (match && request.method === "DELETE") {
        await store.remove(decodeURIComponent(match[1]));
        response.writeHead(204);
        return response.end();
      }
      if (url.pathname.startsWith("/api/")) {
        return json(response, 404, { error: "API route not found." });
      }
      return staticFile(response, url.pathname, publicDirectory);
    } catch (error) {
      console.error(error);
      return json(response, error.statusCode || 500, {
        error: error.statusCode ? error.message : "An unexpected error occurred.",
        details: error.details
      });
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log("ApplyTrack running at http://localhost:" + PORT);
  });
}

module.exports = { createServer };
