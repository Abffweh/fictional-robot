"""李高记 logo generator: writes the SVG marks and a showcase page.

The three characters are hand-built from single rounded strokes, like pulled
noodles. Two details carry the menu: the dot of 高 is a green pea (豌杂面),
the dot of 讠 is a chili (重庆小面), and the inner 口 of 高 is a noodle bowl.
"""
from pathlib import Path

OUT = Path(__file__).parent

INK = "#2B1B14"
CHILI = "#D2371F"
PEA = "#7FA83A"
CREAM = "#F5ECD8"

W = 17  # stroke width inside a 200 x 200 glyph box


def strokes(d):
    return f'<path d="{d}"/>'


def chili(x, y, s=1.0, rot=-28, fill=CHILI, stem=PEA):
    # a plump chili pepper, tip curling down-left
    body = ("M0,-22 C13,-22 17,-10 15,4 C13,19 4,32 -10,40 "
            "C-6,28 -6,14 -9,2 C-11,-10 -9,-22 0,-22 Z")
    stem_d = "M0,-22 C0,-30 4,-34 10,-36"
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">'
            f'<path d="{body}" fill="{fill}" stroke="none"/>'
            f'<path d="{stem_d}" fill="none" stroke="{stem}" stroke-width="6" '
            f'stroke-linecap="round"/></g>')


def pea(x, y, r=13, fill=PEA, shine="rgba(255,255,255,.45)"):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="none"/>'
            f'<circle cx="{x - r * .35}" cy="{y - r * .35}" r="{r * .28}" '
            f'fill="{shine}" stroke="none"/>')


def glyph_li():
    return "".join([
        strokes("M28 42 H172"),                       # 木 横
        strokes("M100 10 V96"),                       # 木 竖
        strokes("M94 50 Q72 82 26 96"),               # 木 撇
        strokes("M106 50 Q128 82 174 96"),            # 木 点
        strokes("M44 124 H150 L104 150"),             # 子 横撇
        strokes("M104 150 V178 Q104 194 88 194 H76"), # 子 竖钩
        strokes("M20 162 H180"),                      # 子 横
    ])


def glyph_gao(accent=True, ink=INK):
    bowl = ("M58 142 H142 M132 142 "                   # 碗沿 (rim, slight lip)
            "Q132 178 100 178 Q68 178 68 142")         # 碗身
    parts = [
        strokes("M18 40 H182"),                       # 横
        strokes("M60 64 H140 V94 H60 Z"),             # 口
        strokes("M28 196 V118 H172 V184 Q172 196 160 196"),  # 冂
        strokes(bowl),                                # 口 → 面碗
    ]
    if accent:
        parts.append(pea(100, 13, 13))
    else:
        parts.append(strokes("M100 6 V20"))
    return "".join(parts)


def glyph_ji(accent=True):
    parts = [
        strokes("M14 82 H42 V176 L68 154"),            # 讠 横折提
        strokes("M96 36 H172 V106 H108 V170 Q108 192 130 192 "
                "H168 Q186 192 186 174 V160"),         # 己
    ]
    if accent:
        parts.append(chili(30, 40, 0.86))
    else:
        parts.append(strokes("M26 22 L40 40"))
    return "".join(parts)


def wordmark(ink=INK, gap=36):
    """Three glyphs side by side; returns (svg_group, width, height)."""
    g = []
    for i, body in enumerate([glyph_li(), glyph_gao(), glyph_ji()]):
        g.append(f'<g transform="translate({i * (200 + gap)} 0)">{body}</g>')
    grp = (f'<g fill="none" stroke="{ink}" stroke-width="{W}" '
           f'stroke-linecap="round" stroke-linejoin="round">{"".join(g)}</g>')
    return grp, 3 * 200 + 2 * gap, 200


def noodle(x0, x1, y, amp=6, period=38, width=5, color=INK):
    """A pulled-noodle wave between x0 and x1."""
    n = max(2, round((x1 - x0) / period))
    step = (x1 - x0) / n
    d = f"M{x0:.1f} {y}"
    for k in range(n):
        a = x0 + k * step
        sgn = -1 if k % 2 == 0 else 1
        d += f" Q{a + step / 2:.1f} {y + sgn * amp * 2} {a + step:.1f} {y}"
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" '
            f'stroke-linecap="round"/>')


def single(body, ink=INK):
    return (f'<g fill="none" stroke="{ink}" stroke-width="{W}" '
            f'stroke-linecap="round" stroke-linejoin="round">{body}</g>')


def svg(w, h, body, bg=None, extra=""):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'width="{w}" height="{h}" {extra}>{rect}{body}</svg>')


FONTS = ("https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;700"
         "&family=Jost:wght@400;500&display=swap")
CN = "font-family:'Noto Serif SC',serif"
EN = "font-family:'Jost',sans-serif"


def lockup(ink=INK, sub=INK, line=CHILI):
    """Wordmark + noodle rule + tagline. Returns (svg body, w, h)."""
    wm, ww, wh = wordmark(ink)
    y = wh + 58
    body = [wm,
            noodle(150, ww - 150, y, color=line),
            f'<circle cx="112" cy="{y}" r="5" fill="{line}"/>',
            f'<circle cx="{ww - 112}" cy="{y}" r="5" fill="{line}"/>',
            f'<text x="{ww / 2}" y="{y + 72}" text-anchor="middle" fill="{sub}" '
            f'style="{CN};font-weight:700;font-size:38px;letter-spacing:14px">'
            f'豌杂面 · 重庆小面</text>',
            f'<text x="{ww / 2}" y="{y + 118}" text-anchor="middle" fill="{sub}" '
            f'opacity=".7" style="{EN};font-weight:500;font-size:19px;'
            f'letter-spacing:9px">LI GAO JI  NOODLE HOUSE</text>']
    return "".join(body), ww, y + 124


def place(body, x, y, s=1.0):
    return f'<g transform="translate({x} {y}) scale({s})">{body}</g>'


def sheet():
    W_, H_ = 1600, 1900
    parts = []

    # 1 — primary lockup on cream
    lk, lw, lh = lockup()
    s = 1.18
    parts.append(f'<rect width="{W_}" height="900" fill="{CREAM}"/>')
    parts.append(place(lk, (W_ - lw * s) / 2, 215, s))
    parts.append(f'<text x="80" y="96" fill="{INK}" opacity=".55" '
                 f'style="{EN};font-size:18px;letter-spacing:6px">PRIMARY LOGO · 主标志</text>')

    # 2 — storefront sign (dark)
    y2 = 900
    parts.append(f'<rect y="{y2}" width="{W_}" height="560" fill="{INK}"/>')
    dk, dw, dh = lockup(ink=CREAM, sub=CREAM, line=CHILI)
    s2 = 0.86
    parts.append(place(dk, (W_ - dw * s2) / 2, y2 + 150, s2))
    parts.append(f'<text x="80" y="{y2 + 90}" fill="{CREAM}" opacity=".5" '
                 f'style="{EN};font-size:18px;letter-spacing:6px">STOREFRONT · 门头</text>')

    # 3 — bottom row: icon, one-colour, palette
    y3 = y2 + 560
    parts.append(f'<rect y="{y3}" width="{W_}" height="{H_ - y3}" fill="#EFE3C8"/>')
    # icon: 高 in a chili-red circle
    cx, cy, r = 240, y3 + 220, 150
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{CHILI}"/>')
    ic = single(glyph_gao(), CREAM).replace(PEA, "#A6CF55")
    parts.append(place(ic, cx - 100 * .88, cy - 104 * .88, .88))
    # one-colour version (for stamps / packaging)
    mono = wordmark(CHILI)[0]
    mono = mono.replace(PEA, CHILI)
    parts.append(place(mono, 520, y3 + 150, 0.62))
    parts.append(noodle(560, 922, y3 + 305, amp=4, period=30, width=4, color=CHILI))
    # palette
    sw = [(INK, "酱色", "#2B1B14"), (CHILI, "红油", "#D2371F"),
          (PEA, "豌豆", "#7FA83A"), (CREAM, "面白", "#F5ECD8")]
    for k, (c, name, hexv) in enumerate(sw):
        x = 1100 + (k % 2) * 210
        yy = y3 + 90 + (k // 2) * 170
        parts.append(f'<rect x="{x}" y="{yy}" width="170" height="100" rx="14" '
                     f'fill="{c}" stroke="rgba(43,27,20,.18)"/>')
        parts.append(f'<text x="{x}" y="{yy + 132}" fill="{INK}" '
                     f'style="{CN};font-weight:700;font-size:20px">{name}</text>')
        parts.append(f'<text x="{x + 170}" y="{yy + 132}" text-anchor="end" fill="{INK}" '
                     f'opacity=".6" style="{EN};font-size:16px">{hexv}</text>')
    for x, label in [(80, "ICON · 头像"), (520, "ONE COLOUR · 单色"),
                     (1100, "PALETTE · 色彩")]:
        parts.append(f'<text x="{x}" y="{y3 + 50}" fill="{INK}" opacity=".55" '
                     f'style="{EN};font-size:16px;letter-spacing:5px">{label}</text>')

    return svg(W_, H_, "".join(parts))


def page(inner):
    return (f'<!doctype html><html><head><meta charset="utf-8">'
            f'<link rel="stylesheet" href="{FONTS}">'
            f'<style>html,body{{margin:0;background:{CREAM}}}svg{{display:block}}</style>'
            f'</head><body>{inner}</body></html>')


if __name__ == "__main__":
    # vector wordmark (no text, portable)
    wm, ww, wh = wordmark()
    pad = 60
    (OUT / "wordmark.svg").write_text(
        svg(ww + 2 * pad, wh + 2 * pad, place(wm, pad, pad)))
    # icon
    ic = single(glyph_gao(), CREAM).replace(PEA, "#A6CF55")
    (OUT / "icon.svg").write_text(svg(320, 320,
        f'<circle cx="160" cy="160" r="160" fill="{CHILI}"/>' + place(ic, 72, 68, .88)))
    # full lockups (text uses web fonts → rendered via HTML)
    lk, lw, lh = lockup()
    (OUT / "logo.html").write_text(page(svg(lw + 160, lh + 150,
        place(lk, 80, 75), CREAM)))
    dk, dw, dh = lockup(ink=CREAM, sub=CREAM)
    (OUT / "logo-dark.html").write_text(page(svg(dw + 160, dh + 150,
        place(dk, 80, 75), INK)))
    (OUT / "sheet.html").write_text(page(sheet()))
