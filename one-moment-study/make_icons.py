#!/usr/bin/env python3
"""Generate opaque PNG icons for iOS home screen / favicon.

iOS ignores data: and SVG for apple-touch-icon, which is why Add to Home
Screen showed a gray dash. These files must be real PNGs with an opaque
background (iOS applies its own rounded-rect mask).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent


def _ellipse(draw, cx, cy, rx, ry, fill):
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill)


def render_tomato(size: int) -> Image.Image:
    s = size / 1024
    img = Image.new("RGB", (size, size), "#F3E6D8")
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    _ellipse(sd, 512 * s, 780 * s, 250 * s, 48 * s, (90, 40, 28, 48))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(2, int(28 * s))))
    layer = Image.alpha_composite(layer, shadow)

    body = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    # slightly darker underside
    _ellipse(bd, 512 * s, 590 * s, 318 * s, 268 * s, (196, 46, 36, 255))
    _ellipse(bd, 512 * s, 560 * s, 310 * s, 258 * s, (226, 67, 52, 255))
    # left / right lobes
    _ellipse(bd, 360 * s, 560 * s, 168 * s, 230 * s, (232, 78, 58, 255))
    _ellipse(bd, 664 * s, 560 * s, 168 * s, 230 * s, (214, 58, 46, 255))
    _ellipse(bd, 512 * s, 548 * s, 236 * s, 236 * s, (230, 74, 56, 255))
    body = Image.alpha_composite(Image.new("RGBA", (size, size), (0, 0, 0, 0)), body)
    layer = Image.alpha_composite(layer, body)

    # highlight
    hi = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    _ellipse(hd, 390 * s, 470 * s, 90 * s, 70 * s, (255, 255, 255, 70))
    _ellipse(hd, 360 * s, 450 * s, 36 * s, 28 * s, (255, 255, 255, 110))
    hi = hi.filter(ImageFilter.GaussianBlur(radius=max(1, int(10 * s))))
    layer = Image.alpha_composite(layer, hi)

    # sepals + stem
    leaf = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ld = ImageDraw.Draw(leaf)
    cx, cy = 512 * s, 300 * s
    greens = [(67, 122, 58, 255), (86, 148, 70, 255), (55, 108, 50, 255)]
    petals = [
        (cx, cy, 48 * s, 110 * s, -38, greens[0]),
        (cx, cy, 48 * s, 110 * s, 38, greens[1]),
        (cx, cy, 42 * s, 96 * s, -78, greens[2]),
        (cx, cy, 42 * s, 96 * s, 78, greens[0]),
        (cx, cy, 36 * s, 86 * s, 0, greens[1]),
    ]
    for px, py, rx, ry, ang, color in petals:
        petal = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        pd = ImageDraw.Draw(petal)
        _ellipse(pd, px, py - ry * 0.15, rx, ry, color)
        petal = petal.rotate(ang, resample=Image.BICUBIC, center=(px, py))
        leaf = Image.alpha_composite(leaf, petal)
    # stem
    stem = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    st = ImageDraw.Draw(stem)
    st.rounded_rectangle(
        [500 * s, 168 * s, 528 * s, 310 * s],
        radius=max(2, int(12 * s)),
        fill=(62, 112, 52, 255),
    )
    st.pieslice(
        [520 * s, 148 * s, 610 * s, 250 * s],
        start=200,
        end=320,
        fill=(62, 112, 52, 255),
    )
    layer = Image.alpha_composite(layer, leaf)
    layer = Image.alpha_composite(layer, stem)

    out = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    return out


def save_resized(src: Image.Image, path: Path, size: int):
    im = src.resize((size, size), Image.Resampling.LANCZOS)
    im.save(path, "PNG", optimize=True)
    print(f"wrote {path.name} {size}x{size} {path.stat().st_size} bytes")


def main():
    master = render_tomato(1024)
    save_resized(master, OUT / "apple-touch-icon.png", 180)
    save_resized(master, OUT / "icon-192.png", 192)
    save_resized(master, OUT / "icon-512.png", 512)
    save_resized(master, OUT / "favicon-32.png", 32)
    preview = OUT / "icon-preview.png"
    save_resized(master, preview, 512)


if __name__ == "__main__":
    main()
