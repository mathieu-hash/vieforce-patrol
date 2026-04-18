"""
Regenerate VieForce Patrol logo assets from a new source image.

- Flood-fills the white background to transparent (preserves interior metallic shine)
- Trims whitespace
- Produces: patrol-logo.png (kept as HD), icon-192.png, icon-512.png
- All output has an alpha channel (no white box on Android home screen / iOS)

Usage:
  python scripts/regenerate-logo.py <source.png>
"""

import os, sys
from PIL import Image, ImageDraw

SRC = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\Mathi\Downloads\ChatGPT Image Apr 17, 2026, 01_26_58 PM.png'
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')

def strip_white_bg(img: Image.Image, thresh: int = 40) -> Image.Image:
    """Flood-fill white background to transparent from every edge pixel.
    Threshold controls how much anti-aliased halo we also eat.
    Walking every edge pixel (not just corners) handles concave edges
    where the bg touches the boundary without reaching a corner."""
    img = img.convert('RGBA')
    w, h = img.size
    transparent = (255, 255, 255, 0)

    # Corners first (cheap)
    for start in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(img, start, transparent, thresh=thresh)

    # Walk top/bottom edges every 8 px — catches any bg patch not corner-connected
    for x in range(0, w, 8):
        for y in (0, h - 1):
            r, g, b, a = img.getpixel((x, y))
            if a > 0 and r > 230 and g > 230 and b > 230:
                ImageDraw.floodfill(img, (x, y), transparent, thresh=thresh)

    # Same for left/right edges
    for y in range(0, h, 8):
        for x in (0, w - 1):
            r, g, b, a = img.getpixel((x, y))
            if a > 0 and r > 230 and g > 230 and b > 230:
                ImageDraw.floodfill(img, (x, y), transparent, thresh=thresh)

    return img


def trim_alpha(img: Image.Image, pad: int = 8) -> Image.Image:
    """Crop to the non-transparent bounding box, then add small padding."""
    bbox = img.getbbox()
    if not bbox:
        return img
    img = img.crop(bbox)
    w, h = img.size
    out = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    out.paste(img, (pad, pad), img)
    return out


def square_pad(img: Image.Image, pad_pct: float = 0.04) -> Image.Image:
    """Pad to square aspect ratio with a small margin so icon isn't edge-to-edge."""
    w, h = img.size
    side = max(w, h)
    pad = int(side * pad_pct)
    side += pad * 2
    out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    out.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return out


def main():
    if not os.path.exists(SRC):
        sys.exit(f'[!] Source not found: {SRC}')
    print(f'[+] Source: {SRC}')
    src = Image.open(SRC)
    print(f'    Original size: {src.size}, mode: {src.mode}')

    stripped = strip_white_bg(src)
    trimmed = trim_alpha(stripped)
    print(f'    After bg-strip + trim: {trimmed.size}')

    squared = square_pad(trimmed)
    print(f'    After square pad:     {squared.size}')

    os.makedirs(OUT_DIR, exist_ok=True)

    # HD logo for login page (1024 max side, keeps aspect)
    hd = trimmed.copy()
    if max(hd.size) > 1024:
        scale = 1024 / max(hd.size)
        hd = hd.resize((int(hd.size[0] * scale), int(hd.size[1] * scale)), Image.LANCZOS)
    hd_path = os.path.join(OUT_DIR, 'patrol-logo.png')
    hd.save(hd_path, 'PNG', optimize=True)
    print(f'[+] Wrote {hd_path} ({hd.size[0]}x{hd.size[1]}, {os.path.getsize(hd_path)//1024} KB)')

    # 512 and 192 square PWA icons
    for size in (512, 192):
        icon = squared.resize((size, size), Image.LANCZOS)
        p = os.path.join(OUT_DIR, f'icon-{size}.png')
        icon.save(p, 'PNG', optimize=True)
        print(f'[+] Wrote {p} ({size}x{size}, {os.path.getsize(p)//1024} KB)')

    # Maskable variants — full-bleed, 20% safe-zone padding for Android adaptive icons
    for size in (512, 192):
        safe = int(size * 0.8)
        mask = trimmed.copy()
        scale = safe / max(mask.size)
        mask = mask.resize((max(1, int(mask.size[0] * scale)), max(1, int(mask.size[1] * scale))), Image.LANCZOS)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(mask, ((size - mask.size[0]) // 2, (size - mask.size[1]) // 2), mask)
        p = os.path.join(OUT_DIR, f'icon-{size}-maskable.png')
        out.save(p, 'PNG', optimize=True)
        print(f'[+] Wrote {p} ({size}x{size} maskable, {os.path.getsize(p)//1024} KB)')

    print('[OK] Done.')


if __name__ == '__main__':
    main()
