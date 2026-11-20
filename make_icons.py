"""Genera le icone dell'app (cartella icons/). Uso: python3 make_icons.py"""
from PIL import Image, ImageDraw

BG = (20, 22, 26)
PIN = (232, 89, 12)
CAL = (240, 242, 245)
ACC = (47, 158, 68)


def draw(size, maskable=False):
    s = size * 4  # supercampionamento
    im = Image.new('RGBA', (s, s), BG + (255,))
    d = ImageDraw.Draw(im)
    pad = int(s * (0.2 if maskable else 0.1))
    inner = s - 2 * pad
    # calendario
    x0, y0 = pad, pad + int(inner * 0.12)
    x1, y1 = s - pad, s - pad
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(inner * 0.1), fill=CAL)
    d.rounded_rectangle([x0, y0, x1, y0 + int(inner * 0.22)], radius=int(inner * 0.1), fill=ACC)
    d.rectangle([x0, y0 + int(inner * 0.12), x1, y0 + int(inner * 0.22)], fill=ACC)
    for fx in (0.28, 0.72):
        cx = x0 + int((x1 - x0) * fx)
        d.rounded_rectangle([cx - int(inner * 0.025), y0 - int(inner * 0.1), cx + int(inner * 0.025), y0 + int(inner * 0.06)], radius=int(inner * 0.02), fill=CAL)
    # segnaposto
    cx, cy = (x0 + x1) // 2, y0 + int((y1 - y0) * 0.62)
    r = int(inner * 0.2)
    d.polygon([(cx - int(r * 0.82), cy + int(r * 0.45)), (cx + int(r * 0.82), cy + int(r * 0.45)), (cx, cy + int(r * 1.9))], fill=PIN)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PIN)
    d.ellipse([cx - int(r * 0.42), cy - int(r * 0.42), cx + int(r * 0.42), cy + int(r * 0.42)], fill=CAL)
    return im.resize((size, size), Image.LANCZOS).convert('RGB')


for name, size, mask in (('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)):
    draw(size, mask).save(f'icons/{name}', optimize=True)
    print('creata', name)
