#!/usr/bin/env python3
"""Regression check for terminal rendering corruption.

Drives Hanlin inside a pseudo-terminal, replays its output through a terminal
emulator, and compares two runs that must agree:

    node dist/cli.mjs          (bundle; Bun.stringWidth is absent here)
    bun src/entrypoints/cli.tsx (source; uses Bun.stringWidth)

They diverged once: the JS width fallback gave text-presentation emoji like ✔
a width of 2 while terminals draw them in one column, so the cursor drifted a
column and later partial repaints left characters behind mid-word ("Custom
model" came out as "Cputom model"). Any future disagreement between the two
width paths shows up here as differing rows.

Setup (pyte is not a project dependency):

    python3 -m venv /tmp/pyte-venv && /tmp/pyte-venv/bin/pip install pyte

Usage:

    bun run build
    /tmp/pyte-venv/bin/python scripts/render-parity.py

Exits non-zero when the two runs disagree, printing the offending rows.
"""

import fcntl
import os
import pty
import select
import struct
import subprocess
import sys
import termios
import time

import pyte

COLS, ROWS = 120, 30
# Opening the model picker paints a long list, then scrolling it forces the
# partial repaints that expose a cursor drift.
KEYS = [(12, b"/model\r"), (6, b"\x1b[B" * 2), (4, b"")]


def capture(cmd: list[str]) -> list[str]:
    env = dict(os.environ, TERM="xterm-256color", COLUMNS=str(COLS), LINES=str(ROWS))
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
    with open(os.devnull, "wb") as devnull:
        proc = subprocess.Popen(
            cmd, stdin=slave, stdout=slave, stderr=devnull, env=env, start_new_session=True
        )
    os.close(slave)

    screen = pyte.Screen(COLS, ROWS)
    stream = pyte.ByteStream(screen)

    def pump(seconds: float) -> None:
        end = time.time() + seconds
        while time.time() < end:
            ready, _, _ = select.select([master], [], [], 0.2)
            if not ready:
                continue
            try:
                data = os.read(master, 65536)
            except OSError:
                return
            if not data:
                return
            stream.feed(data)

    try:
        for wait, keys in KEYS:
            pump(wait)
            if keys:
                os.write(master, keys)
    finally:
        proc.terminate()
        os.close(master)
    return [row.rstrip() for row in screen.display]


def duplicate_rows(rows: list[str]) -> list[tuple[int, str]]:
    """Adjacent list rows that differ only in the pointer column.

    The picker once drew the same option twice when two entries shared a value
    (a configured custom model that also appears in the catalog): rows were keyed
    by value, so duplicate React keys mis-reconciled as soon as the window
    scrolled, leaving a stale copy.
    """
    def body(row: str) -> str:
        # Drop the marker column (❯ focused, ↑/↓ more-above/below) so the same
        # option drawn twice compares equal even when only one copy is focused.
        return row.lstrip(" \u276f\u2191\u2193").strip()

    found = []
    for i in range(1, len(rows)):
        a, b = body(rows[i - 1]), body(rows[i])
        if a and a == b:
            found.append((i, rows[i].strip()))
    return found


def main() -> int:
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(repo)
    if not os.path.exists("dist/cli.mjs"):
        print("dist/cli.mjs missing — run `bun run build` first", file=sys.stderr)
        return 2

    node_rows = capture(["node", "dist/cli.mjs"])
    bun_rows = capture(["bun", "src/entrypoints/cli.tsx"])

    mismatches = [
        (i, n, b) for i, (n, b) in enumerate(zip(node_rows, bun_rows)) if n != b
    ]
    dupes = duplicate_rows(node_rows)
    if dupes:
        print(f"FAIL — {len(dupes)} duplicated row(s) in the rendered list:")
        for i, row in dupes:
            print(f"  row {i}: {row!r}")
        return 1

    if not mismatches:
        print(f"OK — {len(node_rows)} rows identical under node and bun, no duplicated rows")
        return 0

    print(f"FAIL — {len(mismatches)} row(s) differ between node and bun:\n")
    for i, n, b in mismatches[:8]:
        print(f"  row {i}\n    node: {n!r}\n    bun : {b!r}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
