"""Render the ServisGo installable-app icons (shield + wrench + gold gear).

The PNGs in public/icons are committed — this script only needs re-running when
the brand mark changes:  python3 scripts/generate-icons.py  (needs Pillow).
"""
import math
import os
from PIL import Image, ImageDraw

NAVY = (30, 58, 138, 255)
NAVY_DARK = (15, 33, 87, 255)
SKY = (14, 165, 233, 255)
GOLD = (245, 158, 11, 255)
GOLD_DARK = (146, 64, 14, 255)
WHITE = (255, 255, 255, 255)

SS = 4  # supersample factor
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)


def shield_points(cx, cy, w, h, steps=48):
    """Shield outline: flat shoulders, curved sides meeting at a bottom point."""
    left, right = cx - w / 2, cx + w / 2
    top, bottom = cy - h / 2, cy + h / 2
    shoulder = top + h * 0.22
    pts = [(cx, top), (right, shoulder)]
    # right side curves into the bottom tip
    for i in range(1, steps + 1):
        t = i / steps
        # quadratic bezier: shoulder -> control (right, bottom*0.72) -> tip
        p0 = (right, shoulder)
        p1 = (right, top + h * 0.80)
        p2 = (cx, bottom)
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    # mirror for the left side
    for i in range(steps, -1, -1):
        t = i / steps
        p0 = (left, shoulder)
        p1 = (left, top + h * 0.80)
        p2 = (cx, bottom)
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    pts.append((left, shoulder))
    return pts


def wrench(size, length, thickness, color):
    """A wrench glyph on its own transparent layer, drawn horizontally."""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = cy = size / 2
    x0, x1 = cx - length / 2, cx + length / 2
    d.rounded_rectangle(
        [x0, cy - thickness / 2, x1, cy + thickness / 2],
        radius=thickness / 2, fill=color,
    )
    head = thickness * 1.25
    for hx in (x0, x1):
        d.ellipse([hx - head, cy - head, hx + head, cy + head], fill=color)
    # notch each head open, outwards, so it reads as a spanner
    bite = thickness * 0.62
    for hx, direction in ((x0, -1), (x1, 1)):
        bx = hx + direction * head * 0.72
        d.ellipse([bx - bite, cy - bite, bx + bite, cy + bite], fill=(0, 0, 0, 0))
    return layer


def gear(size, radius, color, hub_color, teeth=8):
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = size / 2
    tooth_w = radius * 0.38
    tooth_h = radius * 0.34
    for i in range(teeth):
        angle = 2 * math.pi * i / teeth
        tx, ty = c + math.cos(angle) * radius, c + math.sin(angle) * radius
        tooth = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(tooth).rounded_rectangle(
            [c - tooth_w / 2, c - radius - tooth_h * 0.55,
             c + tooth_w / 2, c - radius + tooth_h * 0.55],
            radius=tooth_w * 0.3, fill=color,
        )
        layer.alpha_composite(tooth.rotate(-math.degrees(angle) - 90, resample=Image.BICUBIC, center=(c, c)))
        del tx, ty
    d.ellipse([c - radius, c - radius, c + radius, c + radius], fill=color)
    hub = radius * 0.36
    d.ellipse([c - hub, c - hub, c + hub, c + hub], fill=hub_color)
    return layer


def render(size, maskable=False, transparent_bg=False):
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if not transparent_bg:
        if maskable:
            d.rectangle([0, 0, s, s], fill=NAVY_DARK)
        else:
            d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=NAVY_DARK)

    # content is pulled in on maskable icons so it survives the safe-zone crop
    scale = 0.62 if maskable else 0.80
    cx = cy = s / 2
    sw, sh = s * 0.60 * scale / 0.80, s * 0.68 * scale / 0.80

    # shield: sky halo then the white body
    d.polygon(shield_points(cx, cy - s * 0.01, sw * 1.06, sh * 1.05), fill=SKY)
    d.polygon(shield_points(cx, cy - s * 0.01, sw, sh), fill=WHITE)

    img.alpha_composite(
        wrench(s, length=sw * 0.46, thickness=sw * 0.115, color=NAVY)
        .rotate(45, resample=Image.BICUBIC, center=(cx, cy))
        .transform(img.size, Image.AFFINE, (1, 0, 0, 0, 1, s * 0.02))
    )

    g = gear(s, radius=s * 0.115 * scale / 0.80, color=GOLD, hub_color=GOLD_DARK)
    offset_x = sw * 0.46
    offset_y = sh * 0.34
    img.alpha_composite(g.transform(img.size, Image.AFFINE, (1, 0, -offset_x, 0, 1, -offset_y)))

    out = img.resize((size, size), Image.LANCZOS)
    if transparent_bg:
        return out
    flat = Image.new('RGB', (size, size), NAVY_DARK[:3])
    flat.paste(out, (0, 0), out)
    return flat


render(192).save(f'{OUT}/icon-192.png')
render(512).save(f'{OUT}/icon-512.png')
render(512, maskable=True).save(f'{OUT}/icon-maskable-512.png')
render(192, maskable=True).save(f'{OUT}/icon-maskable-192.png')
render(180).save(f'{OUT}/apple-touch-icon.png')
print('written to', OUT, os.listdir(OUT))
