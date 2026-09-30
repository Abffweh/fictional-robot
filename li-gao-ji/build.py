"""李高记 logo generator: writes the emblem SVGs and a showcase page.

Each character keeps its skeleton, but its parts are swapped for pictures:
  李  木竖 → a pair of red chopsticks; 撇/点 → noodles hanging off them;
      子's 竖钩 → a noodle curl.
  高  dot → a green pea on the roof ridge; 亠 → an upturned Chongqing eave;
      top 口 → the red shop plaque; 冂 → the shop door; inner 口 → a bowl of
      noodles in red chili soup, with steam.
  记  讠's dot → a chili; 己 → one long pulled noodle.
Noodle strokes are drawn as golden strands; everything structural is solid.
A ribbon underneath carries 豌杂面 · 重庆小面.
"""
from pathlib import Path

OUT = Path(__file__).parent

INK = "#2B1B14"
CHILI = "#CE3620"
CHILI_DK = "#A02A17"
PEA = "#7FA83A"
CREAM = "#F5ECD8"
NOODLE = "#EDBE4E"

FONTS = ("https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@900"
         "&family=Jost:wght@500&display=swap")
CN = "font-family:'Noto Serif SC',serif;font-weight:900"
EN = "font-family:'Jost',sans-serif;font-weight:500"


class Pen:
    def __init__(self, ink, edge):
        self.ink, self.edge, self.out = ink, edge, []

    def solid(self, d, w=26, c=None):
        self.out.append(f'<path d="{d}" fill="none" stroke="{c or self.ink}" '
                        f'stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')

    def noodle(self, d, w=30):
        # outline, golden body, centre groove → reads as a pair of strands
        for sw, c in ((w, self.edge), (w - 10, NOODLE), (4, self.edge)):
            self.solid(d, sw, c)

    def fill(self, d, c=None):
        self.out.append(f'<path d="{d}" fill="{c or self.ink}"/>')

    def raw(self, s):
        self.out.append(s)


def chili(x, y, s, rot=-24):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">'
            f'<path d="M0,-22 C13,-22 17,-10 15,4 C13,19 4,32 -10,40 C-6,28 -6,14 -9,2 '
            f'C-11,-10 -9,-22 0,-22 Z" fill="{CHILI}"/>'
            f'<path d="M3,-17 C8,-15 10,-8 9,-1" fill="none" stroke="rgba(255,255,255,.35)" '
            f'stroke-width="3" stroke-linecap="round"/>'
            f'<path d="M0,-22 C0,-30 4,-34 10,-36" fill="none" stroke="{PEA}" '
            f'stroke-width="6" stroke-linecap="round"/></g>')


def pea(x, y, r):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="{PEA}"/>'
            f'<circle cx="{x - r * .35}" cy="{y - r * .35}" r="{r * .3}" '
            f'fill="rgba(255,255,255,.5)"/>')


def gao(p):
    """高 as a noodle shop front. Occupies x 332..668, y 60..540."""
    p.raw(pea(500, 80, 22))                                        # 点 → 豌豆
    p.fill("M440 104 H560 L584 150 H416 Z")                         # 屋脊
    p.fill("M332 132 Q362 152 408 150 L592 150 Q638 152 668 132 "
           "Q664 162 640 176 L360 176 Q336 162 332 132 Z")          # 亠 → 飞檐
    p.solid("M452 176 V198 M548 176 V198", 8)                       # 挂绳
    p.fill("M424 198 H576 V256 H424 Z", CHILI)                      # 口 → 招牌
    p.solid("M424 198 H576 V256 H424 Z", 12)
    p.solid("M372 540 V288 H628 V520 Q628 540 606 540")             # 冂 → 店门
    p.solid("M350 288 H650")
    for x in (468, 500, 532):                                       # 热气
        p.solid(f"M{x} 382 C{x - 14} 366 {x + 14} 352 {x} 336", 7)
    bowl = "M420 400 H580 C580 452 546 480 500 480 C454 480 420 452 420 400 Z"
    p.fill(bowl, CHILI)                                             # 内口 → 面碗
    p.noodle("M440 404 C460 388 480 420 500 404 C520 388 540 420 560 404", 18)
    p.solid(bowl, 14)
    p.solid("M470 504 H530", 14)


def li(p):
    """李: chopsticks lifting noodles over 子. Occupies x 60..320."""
    p.solid("M72 250 H308")                                         # 木横
    p.fill("M174 136 L186 136 L192 376 L186 376 Z", CHILI)          # 木竖 → 筷子
    p.fill("M200 136 L212 136 L200 376 L194 376 Z", CHILI)
    p.noodle("M188 266 C162 310 120 336 78 350")                    # 撇 → 面
    p.noodle("M196 266 C222 310 264 336 306 350")                   # 点 → 面
    p.solid("M96 404 H262 L196 442")                                # 乛
    p.solid("M66 476 H314")                                         # 横
    p.noodle("M196 442 V508 C196 542 176 548 150 538")              # 竖钩 → 面尾


def ji(p):
    """记: chili for the dot, one long noodle for 己. Occupies x 680..945."""
    p.raw(chili(724, 236, 1.5))                                     # 点 → 辣椒
    p.solid("M694 326 H732 V500 L764 474")                          # 讠
    p.noodle("M800 250 H924 V368 H812 V490 C812 530 830 536 860 536 "
             "H904 C934 536 940 520 940 490 V462", 32)              # 己 → 一根面


def ribbon(y=572, text_c=CREAM):
    return "".join([
        f'<path d="M40 {y + 28} L90 {y + 8} V{y + 80} L40 {y + 100} L62 {y + 64} Z" fill="{CHILI_DK}"/>',
        f'<path d="M960 {y + 28} L910 {y + 8} V{y + 80} L960 {y + 100} L938 {y + 64} Z" fill="{CHILI_DK}"/>',
        f'<rect x="90" y="{y}" width="820" height="72" fill="{CHILI}"/>',
        f'<text x="500" y="{y + 50}" text-anchor="middle" fill="{text_c}" '
        f'style="{CN};font-size:36px;letter-spacing:18px">豌杂面 · 重庆小面</text>',
    ])


EW, EH = 1000, 690   # emblem box


def emblem(ink=INK, bg=CREAM, halo="#EBDDBD", with_ribbon=True):
    p = Pen(ink, INK if ink == INK else bg)
    p.raw(f'<circle cx="500" cy="330" r="300" fill="{halo}"/>')
    li(p); gao(p); ji(p)
    if with_ribbon:
        p.raw(ribbon())
    return "".join(p.out)


def icon(r=300):
    """Round avatar: the 高 shop front alone."""
    p = Pen(CREAM, INK)
    gao(p)
    s = 0.8
    return (f'<circle cx="{r}" cy="{r}" r="{r}" fill="{INK}"/>'
            f'<circle cx="{r}" cy="{r}" r="{r - 18}" fill="none" stroke="{CHILI}" stroke-width="6"/>'
            f'<g transform="translate({r - 500 * s} {r - 300 * s}) scale({s})">{"".join(p.out)}</g>')


def place(body, x, y, s=1.0):
    return f'<g transform="translate({x:.1f} {y:.1f}) scale({s})">{body}</g>'


def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'width="{w}" height="{h}">{rect}{body}</svg>')


def label(x, y, text, color=INK, op=".55"):
    return (f'<text x="{x}" y="{y}" fill="{color}" opacity="{op}" '
            f'style="{EN};font-size:17px;letter-spacing:6px">{text}</text>')


def sheet():
    W_, H_ = 1600, 2040
    p = [f'<rect width="{W_}" height="1080" fill="{CREAM}"/>',
         label(80, 90, "PRIMARY LOGO · 主标志")]
    s = 1.3
    p.append(place(emblem(), (W_ - EW * s) / 2, 110, s))
    y2 = 1080
    p.append(f'<rect y="{y2}" width="1000" height="600" fill="{INK}"/>')
    p.append(label(80, y2 + 76, "STOREFRONT · 门头", CREAM, ".5"))
    s2 = 0.72
    p.append(place(emblem(CREAM, INK, "#3A2A21"), (1000 - EW * s2) / 2, y2 + 70, s2))
    p.append(f'<rect x="1000" y="{y2}" width="600" height="600" fill="#EFE3C8"/>')
    p.append(label(1060, y2 + 76, "ICON · 头像"))
    p.append(place(icon(), 1300 - 210, y2 + 330 - 210, .7))
    y3 = y2 + 600
    p.append(f'<rect y="{y3}" width="{W_}" height="{H_ - y3}" fill="{CREAM}"/>')
    p.append(label(80, y3 + 70, "PALETTE · 色彩"))
    for k, (c, name) in enumerate([(INK, "酱色"), (CHILI, "红油"), (NOODLE, "面黄"),
                                   (PEA, "豌豆"), (CREAM, "面白")]):
        x = 80 + k * 300
        p.append(f'<rect x="{x}" y="{y3 + 110}" width="250" height="120" rx="16" '
                 f'fill="{c}" stroke="rgba(43,27,20,.18)"/>')
        p.append(f'<text x="{x}" y="{y3 + 272}" fill="{INK}" style="{CN};font-size:22px">{name}</text>')
        p.append(f'<text x="{x + 250}" y="{y3 + 272}" text-anchor="end" fill="{INK}" '
                 f'opacity=".55" style="{EN};font-size:16px">{c}</text>')
    return svg(W_, H_, "".join(p))


def page(inner, bg=CREAM):
    return (f'<!doctype html><html><head><meta charset="utf-8">'
            f'<link rel="stylesheet" href="{FONTS}">'
            f'<style>html,body{{margin:0;background:{bg}}}svg{{display:block}}</style>'
            f'</head><body>{inner}</body></html>')


if __name__ == "__main__":
    pad = 50
    # vector emblem without the ribbon text, so it needs no fonts
    (OUT / "mark.svg").write_text(svg(EW, 600, emblem(with_ribbon=False), CREAM))
    (OUT / "icon.svg").write_text(svg(600, 600, icon()))
    (OUT / "logo.html").write_text(page(svg(EW + 2 * pad, EH + 2 * pad,
        place(emblem(), pad, pad), CREAM)))
    (OUT / "logo-dark.html").write_text(page(svg(EW + 2 * pad, EH + 2 * pad,
        place(emblem(CREAM, INK, "#3A2A21"), pad, pad), INK), INK))
    (OUT / "sheet.html").write_text(page(sheet()))
