"""Forgiving name lookup, so an assistant can say "shopping" or "Shopping List"
and still hit the right workspace or list."""

import re
from typing import Iterable, Optional, TypeVar

T = TypeVar("T")


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _loose(text: str) -> str:
    # "Shopping List", "shopping-lists", "the shopping list" -> "shopping"
    words = [w for w in slugify(text).split("-") if w not in {"the", "my", "list", "lists"}]
    return "".join(w[:-1] if w.endswith("s") and len(w) > 3 else w for w in words)


def best_match(query: str, items: Iterable[T], key=lambda x: x.name) -> Optional[T]:
    items = list(items)
    q_slug, q_loose = slugify(query), _loose(query)
    for item in items:
        if slugify(key(item)) == q_slug:
            return item
    for item in items:
        if _loose(key(item)) == q_loose:
            return item
    if q_loose:
        for item in items:
            name = _loose(key(item))
            if name and (name.startswith(q_loose) or q_loose.startswith(name)):
                return item
    return None
