"""
One-shot generator for the placeholder PWA icon set + iOS splash.

Produces solid #0a0e1a backgrounds with a white "." + "H" monogram.
Run only when you need to regenerate the assets — the PNGs are committed
and the build does not depend on this script.

    python apps/web-dashboard/public/generate-icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BG = (10, 14, 26, 255)        # #0a0e1a
FG = (255, 255, 255, 255)
ACCENT = (94, 160, 255, 255)  # #5ea0ff — same blue used in icon.svg

OUT = Path(__file__).parent

ICON_SIZES = [180, 192, 256, 384, 512]
SPLASH_SIZE = (1170, 2532)  # iPhone 13 Pro / 14 / 15


def _load_font(px: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Pick the heaviest sans-serif font available on Windows; fall back to default."""
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf",  # Segoe UI Bold
        "C:/Windows/Fonts/arialbd.ttf",   # Arial Bold
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, px)
    return ImageFont.load_default()


def _draw_monogram(img: Image.Image) -> None:
    """Render the leading-dot ".H" mark, centred."""
    w, h = img.size
    draw = ImageDraw.Draw(img)

    # The "H" — bold, centred.
    h_font = _load_font(int(h * 0.55))
    text = "H"
    bbox = draw.textbbox((0, 0), text, font=h_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (w - tw) // 2 - bbox[0]
    ty = (h - th) // 2 - bbox[1]
    draw.text((tx, ty), text, font=h_font, fill=FG)

    # The leading "." — small, accent-coloured, just to the left of the H.
    dot_r = max(2, int(h * 0.045))
    dot_cx = tx - dot_r * 2
    dot_cy = ty + th - dot_r
    draw.ellipse(
        (dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r),
        fill=ACCENT,
    )


def make_icon(size: int) -> None:
    img = Image.new("RGBA", (size, size), BG)
    _draw_monogram(img)
    img.save(OUT / f"icon-{size}.png", "PNG", optimize=True)


def make_apple_touch() -> None:
    img = Image.new("RGBA", (180, 180), BG)
    _draw_monogram(img)
    img.save(OUT / "apple-touch-icon-180x180.png", "PNG", optimize=True)


def make_splash() -> None:
    w, h = SPLASH_SIZE
    img = Image.new("RGBA", (w, h), BG)
    # Centre the monogram in a 512px square so it reads at launch.
    mono = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    _draw_monogram(mono)
    img.paste(mono, ((w - 512) // 2, (h - 512) // 2), mono)
    img.save(OUT / "splash-1170x2532.png", "PNG", optimize=True)


def main() -> None:
    for size in ICON_SIZES:
        make_icon(size)
        print(f"wrote icon-{size}.png")
    make_apple_touch()
    print("wrote apple-touch-icon-180x180.png")
    make_splash()
    print("wrote splash-1170x2532.png")


if __name__ == "__main__":
    main()
