#!/usr/bin/env python3
"""Split BanqueV2/index.monolith.html into css/ + js/ (no behaviour change)."""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEV = ROOT / "dev"
MONOLITH = DEV / "index.monolith.html"
INDEX = ROOT / "index.html"

STYLE_START = re.compile(r"^<style>\s*$")
STYLE_END = re.compile(r"^</style>\s*$")
MAIN_SCRIPT_MARKER = re.compile(r"^\s*const cfg = window\.SUPABASE_CONFIG;")

# 1-based inclusive line ranges inside the BH object (index.html)
CORE_BH = [(1519, 1619), (1620, 1622), (1891, 1930)]
MODULES: list[tuple[str, list[tuple[int, int]]]] = [
    ("js/stats.js", [(1624, 1889), (6925, 7515)]),
    ("js/today.js", [(1932, 2436)]),
    ("js/accounts.js", [(2438, 2915)]),
    ("js/wallets.js", [(2917, 3114)]),
    ("js/entries.js", [(3116, 3932), (8055, 8532)]),
    ("js/verif.js", [(3934, 6923)]),
    ("js/print.js", [(7517, 8053)]),
    ("js/settings.js", [(8534, 8678)]),
]

SCRIPT_ORDER = [
    "js/core.js",
    *[name for name, _ in MODULES],
]


def read_lines(path: Path) -> list[str]:
    with path.open(encoding="utf-8") as f:
        return f.readlines()


def slice_lines(lines: list[str], ranges: list[tuple[int, int]]) -> list[str]:
    out: list[str] = []
    for start, end in ranges:
        out.extend(lines[start - 1 : end])
    return out


def ensure_monolith() -> None:
    if not MONOLITH.exists():
        shutil.copy2(INDEX, MONOLITH)
        print(f"Created {MONOLITH}")


def extract_style_block(lines: list[str]) -> tuple[int, int, str]:
    """First large <style> block in <head> (not the tiny body{display:none})."""
    in_head = False
    for i, line in enumerate(lines):
        if line.strip() == "<head>":
            in_head = True
        if in_head and STYLE_START.match(line):
            start = i
            for j in range(i + 1, len(lines)):
                if STYLE_END.match(lines[j]):
                    inner = "".join(lines[i + 1 : j])
                    return start, j, inner
            raise SystemExit("Unclosed <style> block")
    raise SystemExit("No <style> block found")


def extract_main_script(lines: list[str]) -> tuple[int, int, str]:
    """Main inline script starting with const cfg = window.SUPABASE_CONFIG."""
    start = None
    for i, line in enumerate(lines):
        if line.strip() == "<script>" and i + 1 < len(lines) and MAIN_SCRIPT_MARKER.match(lines[i + 1]):
            start = i
            break
    if start is None:
        raise SystemExit("Main script block not found")
    for j in range(start + 1, len(lines)):
        if lines[j].strip() == "</script>":
            body = "".join(lines[start + 1 : j])
            return start, j, body
    raise SystemExit("Main script not closed")


def build_core_js(lines: list[str], script_body_lines: list[str]) -> str:
    # Pre-BH: from script start through line before "const BH = {"
    pre: list[str] = []
    for line in script_body_lines:
        if line.startswith("  const BH = {"):
            break
        pre.append(line)
    bh_inner = slice_lines(lines, CORE_BH)
    parts = pre + ["  const BH = {\n"] + bh_inner + ["  };\n"]
    return "".join(parts)


def build_module_js(lines: list[str], ranges: list[tuple[int, int]]) -> str:
    inner = slice_lines(lines, ranges)
    if not inner:
        return ""
    return "Object.assign(BH, {\n" + "".join(inner) + "});\n"


def rewrite_index(lines: list[str], style_start: int, style_end: int, script_start: int, script_end: int) -> list[str]:
    link_line = '<link rel="stylesheet" href="css/app.css">\n'
    script_tag_lines = [f'<script src="{src}"></script>\n' for src in SCRIPT_ORDER]
    merged = (
        lines[:style_start]
        + [link_line]
        + lines[style_end + 1 : script_start]
        + script_tag_lines
        + lines[script_end + 1 :]
    )
    return merged


def non_blank_multiset(text: str) -> Counter:
    return Counter(line for line in (ln.rstrip("\n") for ln in text.splitlines()) if line.strip())


def multiset_check(orig_script: str, js_paths: list[Path]) -> tuple[bool, str]:
    orig = non_blank_multiset(orig_script)
    gen = Counter()
    for p in js_paths:
        gen.update(non_blank_multiset(p.read_text(encoding="utf-8")))
    ignore = Counter(
        {
            "Object.assign(BH, {": len(MODULES),
            "});": len(MODULES),
        }
    )
    gen -= ignore
    if orig != gen:
        diff_orig = orig - gen
        diff_gen = gen - orig
        parts = ["FAIL: line multiset mismatch"]
        if diff_orig:
            sample = list(diff_orig.items())[:8]
            parts.append(f"  only in original ({sum(diff_orig.values())} lines): {sample}")
        if diff_gen:
            sample = list(diff_gen.items())[:8]
            parts.append(f"  only in generated ({sum(diff_gen.values())} lines): {sample}")
        return False, "\n".join(parts)
    return True, "PASS: script line multiset matches (ignoring Object.assign wrappers)"


def css_check(style_inner: str, css_path: Path) -> tuple[bool, str]:
    css = css_path.read_text(encoding="utf-8")
    if css == style_inner:
        return True, "PASS: css/app.css equals original <style> inner content"
    if css.rstrip("\n") == style_inner.rstrip("\n"):
        return True, "PASS: css/app.css equals original (trailing newline only)"
    return False, f"FAIL: css mismatch (orig {len(style_inner)} bytes, file {len(css)} bytes)"


def find_split_script_start(lines: list[str]) -> int:
    for i, line in enumerate(lines):
        if line.strip() == '<script src="js/core.js"></script>':
            return i
    raise SystemExit("Split script tags not found in index.html")


def markup_check(monolith_lines: list[str], new_lines: list[str], style_start: int, style_end: int, script_start: int, script_end: int) -> tuple[bool, str]:
    new_script_start = find_split_script_start(new_lines)
    head_ok = monolith_lines[:style_start] == new_lines[:style_start]
    mid_ok = monolith_lines[style_end + 1 : script_start] == new_lines[style_start + 1 : new_script_start]
    tail_ok = monolith_lines[script_end + 1 :] == new_lines[new_script_start + len(SCRIPT_ORDER) :]
    if head_ok and mid_ok and tail_ok:
        return True, "PASS: index markup unchanged except style + main script blocks"
    parts = []
    if not head_ok:
        parts.append("head before stylesheet")
    if not mid_ok:
        parts.append("between stylesheet and main script")
    if not tail_ok:
        parts.append("after main script")
    return False, "FAIL: markup differs in " + ", ".join(parts)


def node_check(paths: list[Path]) -> list[tuple[str, bool, str]]:
    results = []
    for p in paths:
        proc = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
        ok = proc.returncode == 0
        msg = "PASS" if ok else (proc.stderr.strip() or proc.stdout.strip() or "syntax error")
        results.append((str(p.relative_to(ROOT)), ok, msg))
    concat = Path("/tmp/bh-concat.js")
    concat.write_text("".join(p.read_text(encoding="utf-8") for p in paths), encoding="utf-8")
    proc = subprocess.run(["node", "--check", str(concat)], capture_output=True, text=True)
    ok = proc.returncode == 0
    msg = "PASS" if ok else (proc.stderr.strip() or "syntax error")
    results.append((str(concat), ok, msg))
    return results


def curl_check() -> tuple[bool, str]:
    import urllib.error
    import urllib.request

    urls = [
        "http://localhost:8765/BanqueV2/js/core.js",
        "http://localhost:8765/BanqueV2/css/app.css",
    ]
    details = []
    ok_all = True
    for url in urls:
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                code = resp.getcode()
                details.append(f"{url} -> {code}")
                if code != 200:
                    ok_all = False
        except Exception as e:
            ok_all = False
            details.append(f"{url} -> error: {e}")
    status = "PASS" if ok_all else "FAIL"
    return ok_all, f"{status}: " + "; ".join(details)


def main() -> int:
    ensure_monolith()
    lines = read_lines(MONOLITH)

    style_start, style_end, style_inner = extract_style_block(lines)
    script_start, script_end, script_body = extract_main_script(lines)
    script_body_lines = script_body.splitlines(keepends=True)

    css_dir = ROOT / "css"
    js_dir = ROOT / "js"
    css_dir.mkdir(exist_ok=True)
    js_dir.mkdir(exist_ok=True)

    (css_dir / "app.css").write_text(style_inner, encoding="utf-8")

    core_path = js_dir / "core.js"
    core_path.write_text(build_core_js(lines, script_body_lines), encoding="utf-8")

    generated: list[Path] = [core_path]
    for rel, ranges in MODULES:
        content = build_module_js(lines, ranges)
        path = ROOT / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        generated.append(path)

    new_index = rewrite_index(lines, style_start, style_end, script_start, script_end)
    INDEX.write_text("".join(new_index), encoding="utf-8")

    js_paths = [ROOT / rel for rel in SCRIPT_ORDER]
    validations: list[tuple[str, bool, str]] = []

    ok, msg = css_check(style_inner, css_dir / "app.css")
    validations.append(("CSS content", ok, msg))

    ok, msg = multiset_check(script_body, js_paths)
    validations.append(("JS multiset", ok, msg))

    ok, msg = markup_check(lines, new_index, style_start, style_end, script_start, script_end)
    validations.append(("index markup", ok, msg))

    for rel, ok, msg in node_check(js_paths):
        validations.append((f"node --check {rel}", ok, msg))

    ok, msg = curl_check()
    validations.append(("HTTP static assets", ok, msg))

    print("Generated files (line counts):")
    for rel in ["css/app.css", *SCRIPT_ORDER]:
        p = ROOT / rel
        n = sum(1 for _ in p.open(encoding="utf-8"))
        print(f"  {rel}: {n} lines")

    print("\nScript tag order:")
    for src in SCRIPT_ORDER:
        print(f"  <script src=\"{src}\"></script>")

    print("\nValidation:")
    all_ok = True
    for name, ok, msg in validations:
        print(f"  [{('PASS' if ok else 'FAIL')}] {name}: {msg}")
        all_ok = all_ok and ok

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
