"""李高记 logo generator: writes the SVG marks and a showcase page.

The three characters share strokes and together draw one noodle bowl:
  - the bowl rim is a single stroke that is 李's 木横, 高's 亠横 and 己's 横折;
  - the bowl body is a single stroke that is 李's 子竖钩 on the left and
    记's 竖弯钩 on the right, so 己 hooks up to close the bowl;
  - 高's dot is a green pea (豌杂面), 讠's dot is a chili (重庆小面),
    and 李's 木竖 pokes above the rim like a chopstick.
"""
from pathlib import Path

OUT = Path(__file__).parent

INK = "#2B1B14"
CHILI = "#D2371F"
PEA = "#7FA83A"
CREAM = "#F5ECD8"

SW = 20  # stroke width; the mark spans x 0..720, y 30..424

STROKES = [
    # shared: rim = 木横 + 亠横 + 己横折
    "M0 110 H720 V205 H574",
    # shared: bowl body = 子竖钩 ... 己竖弯钩
    "M2 262 C6 340 64 376 150 376 H570 C656 376 714 340 718 262",
    # bowl foot
    "M300 414 H420",
    # 李
    "M130 36 V206",
    "M122 124 Q100 170 42 196",
    "M138 124 Q160 170 218 196",
    "M58 232 H198 L138 264",
    "M40 300 H228",
    "M138 264 V376",
    # 高
    "M300 150 H420 V190 H300 Z",
    "M264 336 V224 H454 V322 Q454 336 440 336",
    "M308 254 H410 V302 H308 Z",
    # 讠
    "M484 160 H514 V304 L538 284",
    # 己竖
    "M574 205 V376",
]


def chili(x, y, s=1.0, rot=-28, fill=CHILI, stem=PEA):
    body = ("M0,-22 C13,-22 17,-10 15,4 C13,19 4,32 -10,40 "
            "C-6,28 -6,14 -9,2 C-11,-10 -9,-22 0,-22 Z")
    stem_d = "M0,-22 C0,-30 4,-34 10,-36"
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">'
            f'<path d="{body}" fill="{fill}"/>'
            f'<path d="{stem_d}" fill="none" stroke="{stem}" stroke-width="6" '
            f'stroke-linecap="round"/></g>')


def pea(x, y, r, fill=PEA):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'
            f'<circle cx="{x - r * .35}" cy="{y - r * .35}" r="{r * .28}" '
            f'fill="rgba(255,255,255,.45)"/>')


def mark(ink=INK, pea_c=PEA, chili_c=CHILI, stem_c=PEA):
    paths = "".join(f'<path d="{d}"/>' for d in STROKES)
    return (f'<g fill="none" stroke="{ink}" stroke-width="{SW}" '
            f'stroke-linecap="round" stroke-linejoin="round">{paths}</g>'
            + pea(360, 72, 18, pea_c) + chili(500, 52, 1.05, fill=chili_c, stem=stem_c))


MARK_W, MARK_H, MARK_TOP = 720, 394, 30   # visual bounds of mark()


def place(body, x, y, s=1.0):
    return f'<g transform="translate({x:.1f} {y:.1f}) scale({s})">{body}</g>'


def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'width="{w}" height="{h}">{rect}{body}</svg>')


FONTS = ("https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700;900"
         "&family=Jost:wght@400;500&display=swap")
CN = "font-family:'Noto Serif SC',serif;font-weight:900"
EN = "font-family:'Jost',sans-serif;font-weight:500"


def lockup(ink=INK, sub=INK, accent=CHILI, **kw):
    """Mark + tagline stacked. Returns (body, w, h)."""
    w = MARK_W
    y = MARK_H + MARK_TOP + 56
    body = [place(mark(ink, **kw), 0, -MARK_TOP),
            f'<text x="{w / 2}" y="{y + 16}" text-anchor="middle" fill="{sub}" '
            f'style="{CN};font-size:44px;letter-spacing:18px">豌杂面<tspan fill="{accent}"> · </tspan>重庆小面</text>',
            f'<text x="{w / 2}" y="{y + 70}" text-anchor="middle" fill="{sub}" '
            f'opacity=".65" style="{EN};font-size:20px;letter-spacing:12px">'
            f'LI GAO JI NOODLE HOUSE</text>']
    return "".join(body), w, y + 76


def badge(r=300, bg=CHILI, fg=CREAM):
    """Round emblem: mark in the middle, tagline running round the ring."""
    c = r
    s = 0.6
    mw, mh = MARK_W * s, MARK_H * s
    rt = r - 52  # text radius
    top = f"M{c - rt} {c} A{rt} {rt} 0 0 1 {c + rt} {c}"
    bot = f"M{c - rt - 22} {c} A{rt + 22} {rt + 22} 0 0 0 {c + rt + 22} {c}"
    return "".join([
        f'<circle cx="{c}" cy="{c}" r="{r}" fill="{bg}"/>',
        f'<circle cx="{c}" cy="{c}" r="{r - 16}" fill="none" stroke="{fg}" stroke-width="3"/>',
        f'<defs><path id="arcT" d="{top}"/><path id="arcB" d="{bot}"/></defs>',
        f'<text fill="{fg}" style="{CN};font-size:38px;letter-spacing:10px">'
        f'<textPath href="#arcT" startOffset="50%" text-anchor="middle">豌杂面 · 重庆小面</textPath></text>',
        f'<text fill="{fg}" style="{EN};font-size:20px;letter-spacing:10px">'
        f'<textPath href="#arcB" startOffset="50%" text-anchor="middle">LI GAO JI · NOODLE HOUSE</textPath></text>',
        f'<circle cx="{c - rt - 8}" cy="{c + 4}" r="5" fill="{fg}"/>',
        f'<circle cx="{c + rt + 8}" cy="{c + 4}" r="5" fill="{fg}"/>',
        place(mark(fg, pea_c="#A6CF55", chili_c=INK, stem_c="#A6CF55"),
              c - mw / 2, c - mh / 2 - MARK_TOP * s + 6, s),
    ])


def label(x, y, text, color=INK, op=".55"):
    return (f'<text x="{x}" y="{y}" fill="{color}" opacity="{op}" '
            f'style="{EN};font-size:17px;letter-spacing:6px">{text}</text>')


def sheet():
    W_, H_ = 1600, 2000
    p = []
    # 1 — primary logo on cream
    p.append(f'<rect width="{W_}" height="960" fill="{CREAM}"/>')
    lk, lw, lh = lockup()
    s = 1.12
    p.append(place(lk, (W_ - lw * s) / 2, (960 - lh * s) / 2 + 10, s))
    p.append(label(80, 90, "PRIMARY LOGO · 主标志"))
    # 2 — storefront (dark) + badge on cream
    y2 = 960
    p.append(f'<rect y="{y2}" width="1000" height="620" fill="{INK}"/>')
    dk, dw, dh = lockup(CREAM, CREAM)
    s2 = 0.72
    p.append(place(dk, (1000 - dw * s2) / 2, y2 + (620 - dh * s2) / 2 + 30, s2))
    p.append(label(80, y2 + 80, "STOREFRONT · 门头", CREAM, ".5"))
    p.append(f'<rect x="1000" y="{y2}" width="600" height="620" fill="#EFE3C8"/>')
    p.append(place(badge(), 1300 - 300 * .8, y2 + 310 - 300 * .8 + 20, .8))
    p.append(label(1060, y2 + 80, "BADGE · 圆标"))
    # 3 — small sizes + palette
    y3 = y2 + 620
    p.append(f'<rect y="{y3}" width="{W_}" height="{H_ - y3}" fill="{CREAM}"/>')
    p.append(label(80, y3 + 70, "SMALL SIZES · 小尺寸"))
    x = 80
    for sc in (.36, .22, .12):
        p.append(place(mark(), x, y3 + 130 + (1 - sc) * 60 - MARK_TOP * sc, sc))
        x += MARK_W * sc + 60
    p.append(label(1000, y3 + 70, "PALETTE · 色彩"))
    for k, (c, name, hexv) in enumerate([(INK, "酱色", INK), (CHILI, "红油", CHILI),
                                         (PEA, "豌豆", PEA), (CREAM, "面白", CREAM)]):
        xx = 1000 + k * 135
        p.append(f'<rect x="{xx}" y="{y3 + 115}" width="110" height="110" rx="55" '
                 f'fill="{c}" stroke="rgba(43,27,20,.2)"/>')
        p.append(f'<text x="{xx + 55}" y="{y3 + 262}" text-anchor="middle" fill="{INK}" '
                 f'style="{CN};font-size:20px">{name}</text>')
        p.append(f'<text x="{xx + 55}" y="{y3 + 290}" text-anchor="middle" fill="{INK}" '
                 f'opacity=".55" style="{EN};font-size:14px">{hexv}</text>')
    return svg(W_, H_, "".join(p))


def page(inner, bg=CREAM):
    return (f'<!doctype html><html><head><meta charset="utf-8">'
            f'<link rel="stylesheet" href="{FONTS}">'
            f'<style>html,body{{margin:0;background:{bg}}}svg{{display:block}}</style>'
            f'</head><body>{inner}</body></html>')


if __name__ == "__main__":
    pad = 70
    # pure vector mark (no fonts needed)
    (OUT / "mark.svg").write_text(svg(MARK_W + 2 * pad, MARK_H + 2 * pad,
        place(mark(), pad, pad - MARK_TOP)))
    (OUT / "mark-dark.svg").write_text(svg(MARK_W + 2 * pad, MARK_H + 2 * pad,
        place(mark(CREAM), pad, pad - MARK_TOP), INK))
    lk, lw, lh = lockup()
    (OUT / "logo.html").write_text(page(svg(lw + 240, lh + 200,
        place(lk, 120, 100), CREAM)))
    dk, dw, dh = lockup(CREAM, CREAM)
    (OUT / "logo-dark.html").write_text(page(svg(dw + 240, dh + 200,
        place(dk, 120, 100), INK), INK))
    (OUT / "badge.html").write_text(page(svg(640, 640, place(badge(), 20, 20))))
    (OUT / "sheet.html").write_text(page(sheet()))
