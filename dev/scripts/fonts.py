#!/usr/bin/env python3
"""Build the self-hosted subset fonts and check that pages are covered by them.

  python dev/scripts/fonts.py build          sources in dev/fonts-src -> assets/fonts/*.woff2
  python dev/scripts/fonts.py verify         built woff2: axis ranges and key glyphs
  python dev/scripts/fonts.py check a.html   exit 1 if a character has no glyph
"""
import io
import sys
from html.parser import HTMLParser
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "dev" / "fonts-src"
OUT = ROOT / "assets" / "fonts"

UNICODES = (
    "U+0020-007E,U+00A0-00FF,U+0152-0153,U+0178,U+2009,U+2010-2014,U+2018-201E,"
    "U+2022,U+2026,U+202F,U+2039-203A,U+2190-2193,U+2197"
)
FEATURES = ["kern", "liga", "calt", "tnum"]

# family key -> source, output, wght range, fallback face name, local() fonts
FONTS = {
    "hanken": dict(src="HankenGrotesk[wght].ttf", out="hanken-grotesk.woff2", wght=(200, 500),
                   name="Hanken Fallback", local=["Arial"]),
    "mono": dict(src="JetBrainsMono[wght].ttf", out="jetbrains-mono.woff2", wght=(400, 500),
                 name="Mono Fallback", local=["Consolas", "Courier New"]),
}

# Average advance per em of the system fonts the fallbacks stand in for, measured with the
# same letter-frequency weighting as below (Arial 2.x and Consolas, from the Windows fonts).
REFERENCE_ADVANCE = {"Arial": 0.4417, "Consolas": 0.5498}

# a-z relative frequencies in English text, plus the space (about 18 % of characters).
FREQ = {
    " ": 18.0, "e": 10.4, "t": 7.4, "a": 6.7, "o": 6.1, "i": 5.7, "n": 5.5, "s": 5.2, "h": 5.0,
    "r": 4.9, "d": 3.5, "l": 3.3, "c": 2.3, "u": 2.3, "m": 2.0, "w": 1.9, "f": 1.8, "g": 1.7,
    "y": 1.6, "p": 1.6, "b": 1.2, "v": 0.8, "k": 0.6, "j": 0.1, "x": 0.1, "q": 0.1, "z": 0.1,
}


def build_one(spec):
    font = TTFont(SRC / spec["src"])
    lo, hi = spec["wght"]
    font = instancer.instantiateVariableFont(font, {"wght": (lo, hi)})
    # Round-trip through memory: subsetting a freshly limited gvar fails on lazy glyph data.
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    font = TTFont(buf)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = FEATURES
    opts.notdef_outline = True
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    opts.hinting = False
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / spec["out"]
    font.flavor = "woff2"
    font.save(target)
    return target


def weighted_advance(path):
    font = TTFont(path)
    cmap, hmtx, upm = font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm
    total = sum(FREQ.values())
    return sum(w * hmtx[cmap[ord(c)]][0] for c, w in FREQ.items()) / total / upm


def fallback_block(spec, target):
    font = TTFont(target)
    upm = font["head"].unitsPerEm
    hhea = font["hhea"]
    ref_avg = REFERENCE_ADVANCE[spec["local"][0]]
    avg = weighted_advance(target)
    adjust = avg / ref_avg
    asc = hhea.ascent / upm / adjust
    desc = abs(hhea.descent) / upm / adjust
    gap = hhea.lineGap / upm / adjust
    src = ", ".join(f'local("{n}")' for n in spec["local"])
    return (
        "@font-face {\n"
        f'  font-family: "{spec["name"]}";\n'
        f"  src: {src};\n"
        f"  size-adjust: {adjust * 100:.2f}%;\n"
        f"  ascent-override: {asc * 100:.2f}%;\n"
        f"  descent-override: {desc * 100:.2f}%;\n"
        f"  line-gap-override: {gap * 100:.2f}%;\n"
        "}"
    )


def cmd_build():
    blocks = []
    for spec in FONTS.values():
        target = build_one(spec)
        print(f"/* {target.name}: {target.stat().st_size} bytes */")
        blocks.append(fallback_block(spec, target))
    print("\n\n".join(blocks))


class TextCollector(HTMLParser):
    SKIP = {"script", "style"}
    ATTRS = {"alt", "aria-label", "content"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chars, self._skip = set(), 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        for name, value in attrs:
            if name in self.ATTRS and value:
                self.chars.update(value)

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.chars.update(data)


def cmd_check(files):
    cover = {k: set(TTFont(OUT / s["out"]).getBestCmap()) for k, s in FONTS.items()}
    mono_only = {"↗", "·"}
    # Neither font has these two spaces. The CSS stack falls back to the metric-matched
    # "Hanken Fallback" face (local Arial, which contains them), so they keep Hanken metrics.
    fallback_ok = {0x2009, 0x202F}
    failed = False
    for name in files:
        parser = TextCollector()
        parser.feed(Path(name).read_text(encoding="utf-8"))
        missing = sorted(
            c for c in parser.chars
            if ord(c) >= 0x20 and ord(c) not in cover["hanken"] and ord(c) not in fallback_ok
            and not (c in mono_only and ord(c) in cover["mono"])
        )
        if missing:
            failed = True
            print(f"{name}: missing glyphs: " + " ".join(f"{c} (U+{ord(c):04X})" for c in missing))
    return 1 if failed else 0


def cmd_verify():
    errors = []
    for key, want in (("hanken", (200, 500)), ("mono", (400, 500))):
        spec = FONTS[key]
        font = TTFont(OUT / spec["out"])
        axis = next((a for a in font["fvar"].axes if a.axisTag == "wght"), None) if "fvar" in font else None
        got = (axis.minValue, axis.maxValue) if axis else None
        if got != want:
            errors.append(f'{spec["out"]}: wght range is {got}, expected {want}')
        cmap = font.getBestCmap()
        if key == "hanken":
            need = set("àâäçéèêëîïôöùûüÿœæÀÂÇÉÈÊËÎÏÔÙÛÜŒ«»’‘“”–—…·")
            need |= set(range(0x20, 0x7F)) | {0xA0}
        else:
            need = set("↗·")
        need = {ord(c) if isinstance(c, str) else c for c in need}
        gone = sorted(need - set(cmap))
        if gone:
            errors.append(f'{spec["out"]}: missing glyphs ' + " ".join(f"U+{c:04X}" for c in gone))
    for e in errors:
        print(e)
    if not errors:
        print("fonts verified")
    return 1 if errors else 0


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if argv[:1] == ["build"]:
        cmd_build()
        return 0
    if argv[:1] == ["verify"]:
        return cmd_verify()
    if argv[:1] == ["check"] and len(argv) > 1:
        return cmd_check(argv[1:])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
