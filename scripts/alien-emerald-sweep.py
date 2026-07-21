#!/usr/bin/env python3
"""Sweep leftover sapphire/blue accents → Dark Alien Emerald."""
from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path("src")
EXTS = {".tsx", ".ts", ".css", ".jsx", ".js"}

LITERALS = [
    ("#0066FF", "#059669"),
    ("#0066ff", "#059669"),
    ("#3B82F6", "#10B981"),
    ("#3b82f6", "#10B981"),
    ("#0052CC", "#047857"),
    ("#0052cc", "#047857"),
    ("#93C5FD", "#6EE7B7"),
    ("#93c5fd", "#6EE7B7"),
    ("#60A5FA", "#34D399"),
    ("#60a5fa", "#34D399"),
    ("#2563EB", "#059669"),
    ("#2563eb", "#059669"),
    ("#1D4ED8", "#047857"),
    ("#1d4ed8", "#047857"),
    ("#0A0F1D", "#050b08"),
    ("#0a0f1d", "#050b08"),
    ("#060810", "#040907"),
    ("#05110d", "#040907"),
    ("#09090B", "#040907"),
    ("#09090b", "#040907"),
]

REGEXES = [
    (re.compile(r"rgba\(\s*0\s*,\s*102\s*,\s*255"), "rgba(16, 185, 129"),
    (re.compile(r"rgba\(\s*59\s*,\s*130\s*,\s*246"), "rgba(16, 185, 129"),
    (re.compile(r"rgba\(\s*37\s*,\s*99\s*,\s*235"), "rgba(5, 150, 105"),
    (re.compile(r"rgba\(\s*96\s*,\s*165\s*,\s*250"), "rgba(52, 211, 153"),
    (re.compile(r"rgba\(\s*147\s*,\s*197\s*,\s*253"), "rgba(110, 231, 183"),
    (re.compile(r"\btext-blue-"), "text-emerald-"),
    (re.compile(r"\bbg-blue-"), "bg-emerald-"),
    (re.compile(r"\bborder-blue-"), "border-emerald-"),
    (re.compile(r"\bring-blue-"), "ring-emerald-"),
    (re.compile(r"\bfrom-blue-"), "from-emerald-"),
    (re.compile(r"\bto-blue-"), "to-emerald-"),
    (re.compile(r"\bvia-blue-"), "via-emerald-"),
    (re.compile(r"\bshadow-blue-"), "shadow-emerald-"),
    (re.compile(r"\boutline-blue-"), "outline-emerald-"),
    (re.compile(r"\bfill-blue-"), "fill-emerald-"),
    (re.compile(r"\bstroke-blue-"), "stroke-emerald-"),
    (re.compile(r"\baccent-blue-"), "accent-emerald-"),
    (re.compile(r"\bdecoration-blue-"), "decoration-emerald-"),
    (re.compile(r"\bhover:bg-blue-"), "hover:bg-emerald-"),
    (re.compile(r"\bhover:text-blue-"), "hover:text-emerald-"),
    (re.compile(r"\bhover:border-blue-"), "hover:border-emerald-"),
    (re.compile(r"\bfocus:border-blue-"), "focus:border-emerald-"),
    (re.compile(r"\bfocus:ring-blue-"), "focus:ring-emerald-"),
    (re.compile(r"\bfocus-within:border-blue-"), "focus-within:border-emerald-"),
    (re.compile(r"\bfocus-within:ring-blue-"), "focus-within:ring-emerald-"),
]


def transform(text: str) -> str:
    n = text
    for a, b in LITERALS:
        n = n.replace(a, b)
    for rx, b in REGEXES:
        n = rx.sub(b, n)
    return n


def main() -> None:
    updated = []
    for path in ROOT.rglob("*"):
        if path.suffix.lower() not in EXTS or not path.is_file():
            continue
        if "node_modules" in path.parts or ".next" in path.parts:
            continue
        raw = path.read_text(encoding="utf-8")
        nxt = transform(raw)
        if nxt != raw:
            path.write_text(nxt, encoding="utf-8")
            updated.append(str(path).replace("\\", "/"))
    print(f"updated {len(updated)} files")
    for u in updated[:40]:
        print(u)
    if len(updated) > 40:
        print(f"... +{len(updated) - 40} more")


if __name__ == "__main__":
    main()
