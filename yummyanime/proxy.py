#!/usr/bin/env python3
"""Micro-proxy for YummyAnime.tv parsing via curl + residential proxy."""

import json
import re
import subprocess
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

PROXY_URL = "http://e59af03de5924efe5221__cr.nl;anon.1:7777bba731f2950a@74.81.81.81:823"
BASE = "https://yummyanime.tv"


def curl_post(url, data, extra_headers=None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": BASE + "/",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    if extra_headers:
        headers.update(extra_headers)

    cmd = [
        "curl", "-s", "-L", "--compressed", "--connect-timeout", "15", "--max-time", "60",
        "-x", PROXY_URL,
        "-X", "POST",
        "-d", data,
        "-H", "User-Agent: " + headers["User-Agent"],
        "-H", "Referer: " + headers["Referer"],
        "-H", "Content-Type: " + headers["Content-Type"],
        "-H", "Accept: " + headers["Accept"],
        "-H", "Accept-Language: " + headers["Accept-Language"],
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=65)
    return result.stdout


def curl_get(url, extra_headers=None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": BASE + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    if extra_headers:
        headers.update(extra_headers)

    cmd = [
        "curl", "-s", "-L", "--compressed", "--connect-timeout", "15", "--max-time", "60",
        "-x", PROXY_URL,
        "-H", "User-Agent: " + headers["User-Agent"],
        "-H", "Referer: " + headers["Referer"],
        "-H", "Accept: " + headers["Accept"],
        "-H", "Accept-Language: " + headers["Accept-Language"],
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=65)
    return result.stdout


def parse_search(html):
    results = []
    items = html.split('class="movie-item"')
    for item in items[1:]:
        href_match = re.search(r'href="([^"]+)"', item)
        title_match = re.search(r'class="movie-item__title">([^<]+)<', item)
        if href_match and title_match:
            href = href_match.group(1)
            title = title_match.group(1).strip()
            aid = href
            if aid.startswith("/"):
                aid = aid[1:]
            url = href if href.startswith("http") else BASE + ("" if href.startswith("/") else "/") + href
            results.append({"id": aid, "title": title, "url": url, "subOrDub": "sub"})
    return results


def parse_anime_page(html):
    match = re.search(r'data-params="mod=kodik-player[^"]*id=(\d+)"', html)
    if not match:
        return None
    return match.group(1)


def get_iframe_url(anime_id):
    url = BASE + "/engine/ajax/controller.php?mod=kodik-player&url=1&action=iframe&id=" + anime_id
    html = curl_get(url, {"X-Requested-With": "XMLHttpRequest"})
    try:
        data = json.loads(html)
        if data.get("success") and data.get("data"):
            return data["data"]
    except Exception:
        pass
    return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/search":
            q = query.get("q", [""])[0]
            body = "do=search&subaction=search&story=" + urllib.parse.quote(q)
            html = curl_post(BASE + "/search/", body)
            results = parse_search(html)
            self._json_response(results)

        elif parsed.path == "/episodes":
            anime_id = query.get("id", [""])[0]
            url = anime_id if anime_id.startswith("http") else BASE + "/" + anime_id
            html = curl_get(url)
            kodik_id = parse_anime_page(html)
            if not kodik_id:
                self._json_response({"error": "No Kodik player found"}, 404)
                return
            iframe = get_iframe_url(kodik_id)
            if not iframe:
                self._json_response({"error": "Failed to get iframe URL"}, 404)
                return
            self._json_response([{
                "id": "kodik$" + iframe + "$" + anime_id,
                "number": 1,
                "title": "Episode 1",
                "url": iframe,
            }])

        elif parsed.path == "/health":
            self._json_response({"status": "ok"})

        else:
            self._json_response({"error": "Not found"}, 404)

    def _json_response(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8765), Handler)
    print("YummyAnime proxy listening on http://127.0.0.1:8765")
    server.serve_forever()
