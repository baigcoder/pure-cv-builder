"""Run CPU-bound rendering off the event loop with bounded concurrency.

Rendering runs on a small dedicated thread pool (``RENDER_WORKERS``) so a burst
of previews cannot starve the default threadpool used by other routes, and each
call is bounded by ``RENDER_TIMEOUT_SECONDS``.
"""

import asyncio
import functools
import hashlib
import json
import logging
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, TypeVar

from core.config import get_settings
from core.errors import RenderTimeoutError

logger = logging.getLogger(__name__)

T = TypeVar("T")

_settings = get_settings()
_timeout_seconds: float = _settings.render_timeout_seconds
_executor: ThreadPoolExecutor | None = None
_executor_lock = threading.Lock()


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(
                max_workers=_settings.render_workers,
                thread_name_prefix="render",
            )
        return _executor


async def run_render(fn: Callable[..., T], /, **kwargs: Any) -> T:
    """Run a blocking render function on the render pool with a timeout."""
    loop = asyncio.get_running_loop()
    future = loop.run_in_executor(_get_executor(), functools.partial(fn, **kwargs))
    try:
        return await asyncio.wait_for(future, timeout=_timeout_seconds)
    except asyncio.TimeoutError as error:
        logger.error("Render timed out after %ss", _timeout_seconds)
        raise RenderTimeoutError("Rendering took too long. Try again, or shorten the CV.") from error


def shutdown_render_engine() -> None:
    global _executor
    with _executor_lock:
        if _executor is not None:
            _executor.shutdown(wait=False, cancel_futures=True)
            _executor = None


class RenderCache:
    """Thread-safe LRU cache keyed by a hash of the render input."""

    def __init__(self, max_entries: int):
        self.max_entries = max_entries
        self._data: OrderedDict[str, Any] = OrderedDict()
        self._lock = threading.Lock()

    @staticmethod
    def key_for(*parts: Any) -> str:
        # Key order is significant: RenderCV prints sections in dict order, so
        # two inputs that differ only in section order must not share a key.
        payload = json.dumps(parts, sort_keys=False, ensure_ascii=False, default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def get(self, key: str) -> Any | None:
        with self._lock:
            if key not in self._data:
                return None
            self._data.move_to_end(key)
            return self._data[key]

    def set(self, key: str, value: Any) -> None:
        if self.max_entries <= 0:
            return
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self.max_entries:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


render_cache = RenderCache(_settings.render_cache_size)
