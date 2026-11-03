#!/usr/bin/env python3
"""Build the raster images of the page. Run from anywhere; paths are repo-relative.

  python dev/scripts/images.py avatar     placeholder pixel-art avatar -> assets/img/avatar.png
  python dev/scripts/images.py kit        Kit d'urgence crop -> assets/img/kit-urgence-{380,760}.{avif,webp,jpg}
  python dev/scripts/images.py favicons   favicon.ico + apple-touch-icon.png (same geometry as favicon.svg)
  python dev/scripts/images.py all
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
IMG = ROOT / "assets" / "img"
KIT_SOURCE = Path(r"D:\kit_urgence\brag-output\brag.jpg")

# Palette (board mask, ENIG gold, silkscreen) and muted avatar tones.
GOLD = (0xC9, 0xA4, 0x5C)
BODY = (0x0C, 0x0D, 0x0F)
EDGE = (0x4A, 0x4E, 0x57)
SILK = (0xE8, 0xE4, 0xDA)

# Geometry shared with favicon.svg (32 x 32 viewBox, integer coordinates).
PIN_RECTS = [(4, 9, 8, 13), (4, 19, 8, 23), (24, 9, 28, 13), (24, 19, 28, 23),
             (9, 4, 13, 8), (19, 4, 23, 8), (9, 24, 13, 28), (19, 24, 23, 28)]
BODY_RECT = (8, 8, 24, 24)
DOT = (12, 12, 2)  # cx, cy, r


def avatar():
    """32 x 32 neutral head-and-shoulders, 5 colours, transparent background."""
    light, mid, dark = (0x5A, 0x5F, 0x69), (0x45, 0x49, 0x52), (0x31, 0x34, 0x3B)
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    px = im.load()

    def inside_ellipse(x, y, cx, cy, rx, ry):
        return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1

    for y in range(32):
        for x in range(32):
            c = None
            # shoulders: wide rounded block from y=22 down
            if y >= 22 and inside_ellipse(x, y, 16, 36, 14.5, 14.5):
                c = mid if x < 19 else dark
            # neck
            if 13 <= x <= 18 and 17 <= y <= 23:
                c = dark if x >= 16 else mid
            # head
            if inside_ellipse(x, y, 16, 11, 6.2, 7.6):
                c = light if x < 17 else mid
            if c:
                px[x, y] = (*c, 255)
    # single gold accent: a thin collar line on the shoulders
    for x in range(12, 21):
        if px[x, 25][3]:
            px[x, 25] = (*GOLD, 255)
    IMG.mkdir(parents=True, exist_ok=True)
    im.save(IMG / "avatar.png", optimize=True)
    return im


def render_chip(size):
    """Chip icon at `size` px, supersampled 16x from the favicon.svg geometry."""
    k = 16
    big = Image.new("RGBA", (32 * k, 32 * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    for x0, y0, x1, y1 in PIN_RECTS:
        d.rectangle((x0 * k, y0 * k, x1 * k - 1, y1 * k - 1), fill=GOLD)
    x0, y0, x1, y1 = BODY_RECT
    # stroke is centred on the rect edge, 1 unit wide, so it covers +-0.5
    d.rounded_rectangle(((x0 - 0.5) * k, (y0 - 0.5) * k, (x1 + 0.5) * k - 1, (y1 + 0.5) * k - 1),
                        radius=1.5 * k, fill=EDGE)
    d.rounded_rectangle(((x0 + 0.5) * k, (y0 + 0.5) * k, (x1 - 0.5) * k - 1, (y1 - 0.5) * k - 1),
                        radius=0.5 * k, fill=BODY)
    cx, cy, r = DOT
    d.ellipse(((cx - r) * k, (cy - r) * k, (cx + r) * k - 1, (cy + r) * k - 1), fill=SILK)
    return big.resize((size, size), Image.LANCZOS)


def favicons():
    render_chip(32).save(ROOT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32)],
                         append_images=[render_chip(16)])
    # iOS ignores transparency: sit the chip on the board colour.
    touch = Image.new("RGBA", (180, 180), BODY + (255,))
    chip = render_chip(180)
    touch.alpha_composite(chip)
    touch.convert("RGB").save(ROOT / "apple-touch-icon.png", optimize=True)


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def kit():
    """Crop 760x950 at (160, 470) = ffmpeg crop=760:950:160:470; JPEG via Pillow, WebP/AVIF via ffmpeg."""
    import tempfile
    IMG.mkdir(parents=True, exist_ok=True)
    crop = Image.open(KIT_SOURCE).convert("RGB").crop((160, 470, 160 + 760, 470 + 950))
    with tempfile.TemporaryDirectory() as tmp:
        for w in (380, 760):
            im = crop if w == 760 else crop.resize((w, w * 950 // 760), Image.LANCZOS)
            out = IMG / f"kit-urgence-{w}"
            im.save(str(out) + ".jpg", quality=82, progressive=True, optimize=True, subsampling="4:2:0")
            lossless = Path(tmp) / f"{w}.png"
            im.save(lossless)
            ffmpeg("-i", str(lossless), "-c:v", "libwebp", "-quality", "80", str(out) + ".webp")
            ffmpeg("-i", str(lossless), "-c:v", "libaom-av1", "-still-picture", "1", "-crf", "32",
                   "-b:v", "0", "-pix_fmt", "yuv420p", str(out) + ".avif")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    steps = {"avatar": avatar, "kit": kit, "favicons": favicons}
    if cmd == "all":
        for f in steps.values():
            f()
    elif cmd in steps:
        steps[cmd]()
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
