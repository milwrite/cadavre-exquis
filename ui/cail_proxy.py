#!/usr/bin/env python3
"""Serve both play surfaces and relay model calls to the CAIL Gateway.

The CAIL Gateway (https://tools.ailab.gc.cuny.edu/v1) is CUNY AI Lab's front
door to Cloudflare AI Gateway. It wants a bearer key on every call and answers
no CORS preflight, so a browser page cannot reach it directly. This relay keeps
the key in the server process and exposes the same three same-origin routes the
published inference-arcade proxy does, so neither page needs new code paths:

  GET  /api/cail/models  -> gateway /v1/models, mapped to the page catalog shape
  POST /api/cail/ready   -> one tiny generation that verifies the chosen route
  POST /api/cail/chat    -> gateway /v1/chat/completions, never streamed

It also serves /ui/config.local.js itself, pointing both pages at those routes,
so running the relay is the whole configuration. Everything else is served from
the repo root, as ui/serve.sh does. The relay binds loopback only because it
holds a credential.

  CAIL_API_KEY=sk-cail-... python3 ui/cail_proxy.py [port]
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GATEWAY = os.environ.get("CAIL_API_BASE_URL", "https://tools.ailab.gc.cuny.edu/v1").rstrip("/")
DEFAULT_MODEL = os.environ.get("CAIL_DEFAULT_MODEL", "@cf/google/gemma-4-26b-a4b-it")
CATALOG_TTL = 300   # seconds before /v1/models is asked again
READY_TTL = 600     # seconds a verified route counts as warm
USER_AGENT = "cadavre-exquis-cail-relay/1.0 (+https://github.com/milwrite/cadavre-exquis)"

# Gateway "reasoning" models spend the whole turn budget thinking and return an
# empty message unless thinking is switched off. Each provider family has its
# own switch; both were verified to pass through the gateway (2026-09-02).
THINKING_OFF = {
    "workers-ai": {"chat_template_kwargs": {"enable_thinking": False}},
    "openrouter": {"reasoning": {"enabled": False}},
}


def select_models(models):
    """Choose which gateway models the game offers.

    Everything the gateway lists already runs through Cloudflare AI Gateway, so
    the default keeps every active text-generation model and lets the page group
    them by provider family. Narrow this predicate to shape the menu: for
    example `m.get("provider") == "workers-ai"` keeps only the @cf/ models, or a
    small allowlist of ids keeps the menu short for a classroom.
    """
    kept = []
    for m in models:
        if m.get("status", "active") != "active":
            continue
        if m.get("modality", "text") != "text":
            continue
        capabilities = m.get("capabilities") or ["text-generation"]
        if "text-generation" not in capabilities:
            continue
        kept.append(m)
    return kept


def route_label(model_id):
    return model_id[4:] if model_id.startswith("@cf/") else model_id


def to_catalog(models, default_model=DEFAULT_MODEL):
    """Map gateway /v1/models entries to { default, models: [route] }."""
    routes, seen = [], set()
    for m in select_models(models):
        model_id = str(m.get("id") or "").strip()
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        routes.append({
            "id": model_id,
            "label": route_label(model_id),
            "provider": m.get("provider") or "cloudflare-ai-gateway",
            "model": model_id,
            "available": True,
            "reasoning": "reasoning" in (m.get("capabilities") or []),
        })
    ids = [r["id"] for r in routes]
    default = default_model if default_model in ids else (ids[0] if ids else "")
    return {"default": default, "models": routes}


def prepare_chat_body(body, catalog):
    """Validate a page chat request against the catalog and shape it for the gateway."""
    if not isinstance(body, dict):
        raise ValueError("request body must be a JSON object")
    routes = {r["id"]: r for r in catalog.get("models", [])}
    model = str(body.get("model") or catalog.get("default") or "").strip()
    if model not in routes:
        raise ValueError("model %r is not offered by the CAIL Gateway catalog" % model)
    out = dict(body)
    out["model"] = model
    out["stream"] = False
    route = routes[model]
    if route.get("reasoning"):
        for key, value in THINKING_OFF.get(route["provider"], {}).items():
            out.setdefault(key, value)
    return out


def gateway(method, path, key, payload=None, timeout=90):
    """One gateway round trip. Returns (status, parsed_json)."""
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": "Bearer " + key,
        "Accept": "application/json",
        # Cloudflare's bot rules answer urllib's default User-Agent with a 403 (error 1010).
        "User-Agent": USER_AGENT,
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(GATEWAY + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw)
        except ValueError:
            parsed = None
        if isinstance(parsed, dict) and parsed.get("error"):
            return err.code, parsed
        return err.code, {"error": {"message": raw.strip()[:500] or err.reason}}


def config_js(default_model):
    return (
        "// Served by ui/cail_proxy.py while the CAIL Gateway relay runs.\n"
        "window.CORPSE_CONFIG = {\n"
        '  endpoint: "/api/cail/chat",\n'
        '  readyEndpoint: "/api/cail/ready",\n'
        '  modelsEndpoint: "/api/cail/models",\n'
        "  model: %s,\n"
        '  apiKey: "",\n'
        "};\n" % json.dumps(default_model)
    )


class Relay(SimpleHTTPRequestHandler):
    key = ""
    _catalog = None
    _catalog_at = 0.0
    _ready = {}

    # -- helpers ------------------------------------------------------------
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        return json.loads(raw or b"{}")

    def catalog(self, force=False):
        cls = type(self)
        if not force and cls._catalog and time.time() - cls._catalog_at < CATALOG_TTL:
            return cls._catalog
        status, data = gateway("GET", "/models", self.key, timeout=30)
        if status != 200:
            raise RuntimeError("gateway /models returned %s: %s" % (status, json.dumps(data.get("error"))))
        cls._catalog = to_catalog(data.get("data") or [], DEFAULT_MODEL)
        cls._catalog_at = time.time()
        return cls._catalog

    # -- routes -------------------------------------------------------------
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/cail/models":
            return self.send_models()
        if path == "/ui/config.local.js":
            body = config_js(DEFAULT_MODEL).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        try:
            if path == "/api/cail/chat":
                return self.send_chat()
            if path == "/api/cail/ready":
                return self.send_ready()
            return self.send_json(404, {"error": {"message": "no such route"}})
        except ValueError as err:
            return self.send_json(400, {"error": {"message": str(err)}})
        except (RuntimeError, urllib.error.URLError, TimeoutError, OSError) as err:
            return self.send_json(502, {"error": {"message": "CAIL Gateway unreachable: %s" % err}})

    def send_models(self):
        try:
            return self.send_json(200, self.catalog())
        except (RuntimeError, urllib.error.URLError, TimeoutError, OSError) as err:
            return self.send_json(502, {"error": {"message": "CAIL Gateway unreachable: %s" % err}})

    def send_chat(self):
        catalog = self.catalog()
        payload = prepare_chat_body(self.read_json(), catalog)
        status, data = gateway("POST", "/chat/completions", self.key, payload)
        if isinstance(data, dict) and status == 200:
            data.setdefault("provider", next(
                (r["provider"] for r in catalog["models"] if r["id"] == payload["model"]), ""))
        return self.send_json(status, data)

    def send_ready(self):
        catalog = self.catalog()
        body = self.read_json()
        model = str((body or {}).get("model") or catalog.get("default") or "").strip()
        routes = {r["id"]: r for r in catalog["models"]}
        if model not in routes:
            return self.send_json(404, {"ready": False, "model": model,
                                        "error": "not in the CAIL Gateway catalog"})
        cls = type(self)
        warm_since = cls._ready.get(model)
        if warm_since and time.time() - warm_since < READY_TTL:
            return self.send_json(200, {"ready": True, "model": model,
                                        "provider": routes[model]["provider"], "cached": True})
        probe = prepare_chat_body({
            "model": model,
            "messages": [{"role": "system", "content": "Reply with one word."},
                         {"role": "user", "content": "ready?"}],
            "max_tokens": 8, "temperature": 0,
        }, catalog)
        status, data = gateway("POST", "/chat/completions", self.key, probe, timeout=45)
        if status == 200 and isinstance(data, dict) and data.get("choices"):
            cls._ready[model] = time.time()
            return self.send_json(200, {"ready": True, "model": model,
                                        "provider": routes[model]["provider"]})
        error = data.get("error") if isinstance(data, dict) else None
        return self.send_json(503, {"ready": False, "model": model,
                                    "error": error or "gateway returned %s" % status})


def main(argv):
    sys.stdout.reconfigure(line_buffering=True)
    port = int(argv[1]) if len(argv) > 1 else 8800
    key = os.environ.get("CAIL_API_KEY", "").strip()
    if not key:
        sys.exit("set CAIL_API_KEY (a personal key from https://tools.ailab.gc.cuny.edu Model Access)")
    Relay.key = key
    if os.path.exists(os.path.join(ROOT, "ui", "config.local.js")):
        print("note: ui/config.local.js on disk is ignored while the relay runs")
    try:
        status, data = gateway("GET", "/models", key, timeout=30)
        if status == 200:
            catalog = to_catalog(data.get("data") or [], DEFAULT_MODEL)
            Relay._catalog, Relay._catalog_at = catalog, time.time()
            print("CAIL Gateway: %d models offered, default %s" % (len(catalog["models"]), catalog["default"]))
        else:
            print("CAIL Gateway /models returned %s: %s" % (status, data.get("error")))
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        print("CAIL Gateway unreachable at start (%s); will retry on demand" % err)
    handler = partial(Relay, directory=ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print("the parlor      ->  http://localhost:%d/" % port)
    print("the open sheet  ->  http://localhost:%d/ui/corpse.html" % port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main(sys.argv)
