"""Fetch a job posting from a URL and pull out its title, company and description.

The server fetches user-supplied URLs, so every hop is checked against
server-side request forgery: http(s) only, standard ports, and the host must
resolve to public addresses. The address actually connected to is checked
again before the body is read, which also defeats DNS rebinding.
"""

import html
import ipaddress
import json
import re
import socket
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

from core.errors import AppError

MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 4
TIMEOUT = httpx.Timeout(8.0, connect=4.0)
USER_AGENT = "Mozilla/5.0 (compatible; FolioJobFetcher/1.0; +https://folio.app)"


class JobFetchError(AppError):
    status_code = 422
    code = "job_fetch_failed"


@dataclass
class FetchedJob:
    url: str
    title: str
    company: str
    location: str
    description: str


def _is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%")[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def _check_url(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise JobFetchError("Use a full job link starting with http:// or https://.")
    if parts.port not in (None, 80, 443):
        raise JobFetchError("That link uses an unusual port, so it can't be fetched.")
    if parts.username or parts.password:
        raise JobFetchError("Links with a username or password can't be fetched.")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80))
    except socket.gaierror as error:
        raise JobFetchError("We couldn't find that website. Check the link.") from error
    if not infos or not all(_is_public(info[4][0]) for info in infos):
        raise JobFetchError("That link points to a private address, so it can't be fetched.")


class _TextExtractor(HTMLParser):
    """Visible text with block boundaries kept as newlines; scripts and chrome dropped."""

    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form", "button", "iframe"}
    BLOCK = {"p", "div", "li", "br", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "tr", "ul", "ol"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0
        self.title = ""
        self._in_title = False
        self.json_ld: list[str] = []
        self._in_json_ld = False

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("type", "").lower() == "application/ld+json":
            self._in_json_ld = True
            return
        if tag in self.SKIP:
            self.skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag in self.BLOCK:
            self.parts.append("\n")
        if tag == "li" and not self.skip_depth:
            self.parts.append("• ")

    def handle_endtag(self, tag):
        if tag == "script" and self._in_json_ld:
            self._in_json_ld = False
            return
        if tag in self.SKIP and self.skip_depth:
            self.skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_json_ld:
            self.json_ld.append(data)
        elif self._in_title:
            self.title += data
        elif not self.skip_depth:
            self.parts.append(data)

    def text(self) -> str:
        raw = "".join(self.parts)
        lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in raw.splitlines()]
        return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def html_to_text(markup: str) -> str:
    parser = _TextExtractor()
    parser.feed(markup)
    return parser.text()


def _find_job_posting(blobs: list[str]) -> dict | None:
    for blob in blobs:
        try:
            data = json.loads(blob)
        except ValueError:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                kind = node.get("@type")
                if kind == "JobPosting" or (isinstance(kind, list) and "JobPosting" in kind):
                    return node
                stack.extend(node.get("@graph", []) if isinstance(node.get("@graph"), list) else [])
            elif isinstance(node, list):
                stack.extend(node)
    return None


def parse_job_page(url: str, markup: str) -> FetchedJob:
    parser = _TextExtractor()
    parser.feed(markup)
    posting = _find_job_posting(parser.json_ld)
    if posting:
        org = posting.get("hiringOrganization") or {}
        place = posting.get("jobLocation") or {}
        if isinstance(place, list):
            place = place[0] if place else {}
        address = place.get("address", {}) if isinstance(place, dict) else {}
        location = ", ".join(
            str(address.get(key)) for key in ("addressLocality", "addressRegion", "addressCountry")
            if isinstance(address, dict) and address.get(key) and isinstance(address.get(key), str)
        )
        description = html_to_text(html.unescape(str(posting.get("description") or "")))
        if len(description) >= 80:
            return FetchedJob(
                url=url,
                title=str(posting.get("title") or "").strip()[:120],
                company=str(org.get("name") if isinstance(org, dict) else org or "").strip()[:120],
                location=location[:120],
                description=description[:20000],
            )

    text = parser.text()
    if len(text) < 200:
        raise JobFetchError("We couldn't read a job description on that page. Paste the text instead.")
    title = re.split(r"\s[|–—-]\s", html.unescape(parser.title).strip())[0][:120]
    return FetchedJob(url=url, title=title, company="", location="", description=text[:20000])


def fetch_job(url: str) -> FetchedJob:
    url = url.strip()
    with httpx.Client(timeout=TIMEOUT, follow_redirects=False, headers={"User-Agent": USER_AGENT}) as client:
        for _ in range(MAX_REDIRECTS + 1):
            _check_url(url)
            try:
                with client.stream("GET", url) as response:
                    stream = response.extensions.get("network_stream")
                    peer = stream.get_extra_info("server_addr") if stream else None
                    if peer and not _is_public(peer[0]):
                        raise JobFetchError("That link points to a private address, so it can't be fetched.")
                    if response.is_redirect:
                        url = urljoin(url, response.headers.get("location", ""))
                        continue
                    if response.status_code >= 400:
                        raise JobFetchError(f"The job site returned an error ({response.status_code}). Paste the text instead.")
                    if "html" not in response.headers.get("content-type", "html"):
                        raise JobFetchError("That link isn't a web page. Paste the job description instead.")
                    body = bytearray()
                    for chunk in response.iter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_BYTES:
                            raise JobFetchError("That page is too large to read. Paste the job description instead.")
                    markup = body.decode(response.encoding or "utf-8", errors="replace")
                    return parse_job_page(url, markup)
            except httpx.HTTPError as error:
                raise JobFetchError("We couldn't reach that job page. Check the link or paste the text.") from error
    raise JobFetchError("That link redirected too many times.")
