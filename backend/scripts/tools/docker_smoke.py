"""
Docker smoke test (28 Oct 2026, system test TC-67): is SkillMap really running in the containers?

Run it from backend/ AFTER `docker compose up --build` has finished starting (the backend shows "healthy" in
`docker compose ps`). It talks to the running containers from outside, like a browser would, with Python's standard
library only (no packages needed), and removes the account it makes:

  python scripts/tools/docker_smoke.py            # defaults: API http://localhost:8000, web app http://localhost:5173
  python scripts/tools/docker_smoke.py --api http://localhost:8000 --web http://localhost:5173

What it checks, in this order (each prints PASS or FAIL; the exit code is 1 if any check fails):
  1. the API answers                                 6. a student can register and sign in
  2. the browser may call the API (CORS)             7. a signed-in call reads the database (/profile/skills)
  3. the web app is served, including a deep link    8. the student can delete their account again
  4. the built JavaScript file is served             9. idle connections stay open past 5 s (keep-alive 15 s;
  5. the database holds job data                        the load test's dropped connections came from the 5 s default)
Check 5 fails on an empty database: restore the dump (README, "Run with Docker") or load jobs first.
"""
import argparse
import http.client
import json
import re
import secrets
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""), flush=True)
    return ok


def call(method, url, body=None, headers=None, timeout=30):
    """-> (status, headers, body text); an HTTP error status is returned, not raised."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={**({"Content-Type": "application/json"} if data else {}), **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode("utf-8", "replace")


def keep_alive_check(api, idle_seconds):
    """Two calls on ONE connection with a pause between them: the second fails if the server closed the idle connection."""
    u = urlparse(api)
    conn = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=30)
    try:
        conn.request("GET", "/openapi.json")
        conn.getresponse().read()
        time.sleep(idle_seconds)
        conn.request("GET", "/openapi.json")
        return conn.getresponse().status == 200, ""
    except (http.client.HTTPException, ConnectionError, OSError) as e:
        return False, f"the server closed the connection after {idle_seconds} s idle: {type(e).__name__}"
    finally:
        conn.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--web", default="http://localhost:5173")
    ap.add_argument("--idle", type=float, default=7, help="seconds to leave a connection idle in check 9 (default 7, above uvicorn's 5 s default)")
    a = ap.parse_args()
    api, web = a.api.rstrip("/"), a.web.rstrip("/")

    try:
        status, _, _ = call("GET", api + "/openapi.json")
    except (urllib.error.URLError, OSError) as e:
        sys.exit(f"FAIL  the API does not answer at {api}: {e}\nIs `docker compose up` finished? Check `docker compose ps` and `docker compose logs backend`.")
    check("1. the API answers", status == 200, f"HTTP {status}")

    status, headers, _ = call("OPTIONS", api + "/auth/login", headers={"Origin": web, "Access-Control-Request-Method": "POST",
                                                                        "Access-Control-Request-Headers": "content-type"})
    check("2. the browser may call the API (CORS for " + web + ")", headers.get("access-control-allow-origin") == web,
          f"HTTP {status}, allow-origin: {headers.get('access-control-allow-origin')}")

    try:
        status, _, html = call("GET", web + "/")
        deep_status, _, deep_html = call("GET", web + "/login")
    except (urllib.error.URLError, OSError) as e:
        check("3. the web app is served", False, str(e))
        html = deep_html = ""
        status = deep_status = 0
    check("3. the web app is served, and a deep link (/login) gets the same page", status == 200 and 'id="root"' in html and
          deep_status == 200 and 'id="root"' in deep_html, f"/ HTTP {status}, /login HTTP {deep_status}")

    script = re.search(r'src="(/assets/[^"]+\.js)"', html)
    if script:
        s, h, _ = call("GET", web + script.group(1))
        check("4. the built JavaScript file is served", s == 200 and "javascript" in h.get("content-type", ""), f"{script.group(1)} HTTP {s}")
    else:
        check("4. the built JavaScript file is served", False, "no /assets/*.js in the page")

    s, _, body = call("GET", api + "/jobs/subcategories")
    try:
        n = len(json.loads(body)) if s == 200 else 0
    except ValueError:
        n = 0
    check("5. the database holds job data", n > 0, f"{n} job categories" if n else "none: restore docker/db/skillmap.dump or load jobs")

    tag = secrets.token_hex(3)
    user, password = f"dockersmoke{tag}", f"violet-harbour-lantern-{secrets.token_hex(4)}"
    s, _, body = call("POST", api + "/auth/register", {"username": user, "first_name": "Docker", "last_name": "Smoke", "email": f"{user}@example.com",
                                                        "password": password, "role": "student", "accept_privacy": True})
    registered = s == 201
    token = None
    if registered:
        s2, _, body2 = call("POST", api + "/auth/login", {"email": user, "password": password})
        if s2 == 200:
            token = json.loads(body2).get("access_token")
    check("6. a student can register and sign in", bool(token), f"register HTTP {s}" + ("" if registered else f": {body[:120]}"))

    auth = {"Authorization": f"Bearer {token}"} if token else {}
    s, _, _ = call("GET", api + "/profile/skills", headers=auth) if token else (0, None, "")
    check("7. a signed-in call reads the database (/profile/skills)", s == 200, f"HTTP {s}")

    if registered:
        s, _, _ = call("POST", api + "/auth/me/delete", {"password": password}, headers=auth)
        check("8. the student can delete their account again", s == 204, f"HTTP {s}")
    else:
        check("8. the student can delete their account again", False, "no account was made")

    ok, why = keep_alive_check(api, a.idle)
    check(f"9. an idle connection stays open for {a.idle:g} s (uvicorn --timeout-keep-alive 15)", ok, why)

    print(f"\n{sum(results)} of {len(results)} checks passed.")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
