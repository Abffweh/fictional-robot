#!/usr/bin/env python3
"""script_lint.py — 检查知识视频字幕稿/口播稿是否"一看就懂、留得住人"。

只做机械可判定的检查，不替代人工判断。所有阈值都能用参数改。

输入格式（按扩展名或内容自动识别）：
  .srt                      标准字幕
  .json                     [[开始秒, 结束秒, "文本"], ...]
  .tsv / .txt（带时间）     每行  开始秒<TAB>结束秒<TAB>文本
  .txt（不带时间）          每行一句；按 --cps 估算时长（口播稿用）

用法：
  python3 script_lint.py subs.srt
  python3 script_lint.py script.txt --cps 4.5          # 口播稿，按每秒 4.5 字估算
  python3 script_lint.py subs.srt --jargon my_words.txt  # 追加自己的术语表
  python3 script_lint.py subs.srt --json                 # 机器可读输出

退出码：0 = 无 ERROR；1 = 有 ERROR（可接进渲染前的检查）。
"""
import argparse, json, re, sys

# 书面语/术语：出现了不一定错，但在字幕里要么换成大白话，要么紧跟一句解释。
DEFAULT_JARGON = """
悖论 方差 标准差 均值 中位数 显著性 置信 样本偏差 选择偏差 幸存者偏差 相关性 因果性 变量 参数 函数 期望值
机制 范式 维度 底层逻辑 本质上 赋能 抓手 闭环 颗粒度 认知 框架 模型 路径依赖 边际 博弈 熵 拓扑 网络效应
鉴于 由此可见 综上 即 亦 乃 之所以 系 予以 进而 从而 因而 故而 而言 所谓 某种程度上 换言之
""".split()

# 让人停下来想的句式：省略主语的祈使/判断、文言虚词、括号插入
OPAQUE_PATTERNS = [
    (r'[（(][^）)]{6,}[）)]', '括号里塞了解释，观众来不及读，拆成单独一句'),
    (r'^(而|且|故|则|即)', '以文言连接词开头，像书面语'),
    (r'[；;].*[；;]', '一句里有两个分号，太长，拆开'),
    (r'不是.{1,12}而是.{1,12}不是', '多重转折，读两遍才懂'),
]

def parse_srt(text):
    out = []
    for block in re.split(r'\n\s*\n', text.strip()):
        m = re.search(r'(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)', block)
        if not m: continue
        g = list(map(int, m.groups()))
        s = g[0]*3600 + g[1]*60 + g[2] + g[3]/1000
        e = g[4]*3600 + g[5]*60 + g[6] + g[7]/1000
        body = ' '.join(l for l in block[m.end():].strip().splitlines() if l.strip())
        out.append((s, e, body))
    return out

def parse(path, cps):
    raw = open(path, encoding='utf-8').read()
    if path.endswith('.srt') or '-->' in raw:
        return parse_srt(raw), True
    if path.endswith('.json'):
        return [(float(a), float(b), str(t)) for a, b, t in json.loads(raw)], True
    lines = [l.rstrip('\n') for l in raw.splitlines() if l.strip()]
    if lines and all(len(l.split('\t')) >= 3 for l in lines):
        return [(float(a), float(b), t) for a, b, t, *_ in (l.split('\t') for l in lines)], True
    out, t = [], 0.0
    for l in lines:
        d = max(1.2, han_len(l) / cps)
        out.append((t, t + d, l.strip())); t += d
    return out, False

def han_len(s):
    """可读字符数：汉字、字母数字串各算 1，标点不算。"""
    s = re.sub(r'[A-Za-z0-9.%]+', 'A', s)
    return len(re.sub(r'[\s，。、；：？！“”‘’「」《》（）—…,.;:?!"\'()\-]', '', s))

def lint(subs, timed, a):
    issues = []
    def add(level, i, msg):
        s, e, t = subs[i] if i is not None else (0, 0, '')
        issues.append({'level': level, 'index': i, 'start': round(s, 2), 'end': round(e, 2), 'text': t, 'msg': msg})

    if not subs:
        add('ERROR', None, '没有读到任何字幕'); return issues

    # 1. 开头：第一句必须在 hook 窗口内出现，且足够短
    s0, e0, t0 = subs[0]
    if timed and s0 > a.first_line_by:
        add('ERROR', 0, f'第一句字幕在 {s0:.1f}s 才出现；开头 {a.first_line_by}s 内必须有字/有钩子')
    if han_len(t0) > a.hook_max_chars:
        add('WARN', 0, f'第一句 {han_len(t0)} 字，超过 {a.hook_max_chars} 字；钩子要一眼读完')
    hook = [x for x in subs if x[0] < a.hook_window]
    if hook and not any(re.search(r'[？?]|你', x[2]) for x in hook):
        add('INFO', 0, f'前 {a.hook_window}s 没有问句也没有"你"；考虑用提问或第二人称把观众拉进来')

    jargon = set(DEFAULT_JARGON)
    if a.jargon:
        jargon |= set(open(a.jargon, encoding='utf-8').read().split())

    seen_terms = set()
    for i, (s, e, t) in enumerate(subs):
        n, dur = han_len(t), max(e - s, 1e-3)
        # 2. 句长
        if n > a.max_chars:
            add('WARN', i, f'{n} 字，超过 {a.max_chars} 字；拆成两句')
        # 3. 阅读速度（只对带时间的稿子）
        if timed:
            cps = n / dur
            if cps > a.max_cps:
                add('ERROR', i, f'每秒 {cps:.1f} 字，超过 {a.max_cps}；观众读不完，延长停留或删字')
            elif cps > a.warn_cps:
                add('WARN', i, f'每秒 {cps:.1f} 字，超过 {a.warn_cps}；读得完但记不住，重点句放慢')
            if dur < a.min_dur and n > 4:
                add('WARN', i, f'只停留 {dur:.1f}s（< {a.min_dur}s）')
        # 4. 术语：第一次出现时提醒
        for w in sorted(jargon, key=len, reverse=True):
            if w in t and w not in seen_terms:
                seen_terms.add(w)
                add('WARN', i, f'出现书面语/术语「{w}」；换成大白话，或紧跟一句解释')
        # 5. 难读句式
        for pat, why in OPAQUE_PATTERNS:
            if re.search(pat, t):
                add('WARN', i, why)
        # 6. 百分数：提示换成"每 N 个人里有 M 个"更直观（只提示，不强制）
        if re.search(r'\d+(\.\d+)?%', t):
            add('INFO', i, '有百分数；考虑同时说"每 10 个人里有几个"这类具体说法')

    # 7. 空档：两句之间长时间无字
    if timed:
        for i in range(1, len(subs)):
            gap = subs[i][0] - subs[i-1][1]
            if gap > a.max_gap:
                add('WARN', i, f'与上一句之间空了 {gap:.1f}s；确认这段画面本身足够吸引人')
    return issues

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('file')
    p.add_argument('--cps', type=float, default=4.5, help='无时间稿的估算语速（字/秒），默认 4.5')
    p.add_argument('--warn-cps', type=float, default=5.0, help='阅读速度提醒线（字/秒），默认 5；依据见 references/structure-by-duration.md 6.1')
    p.add_argument('--max-cps', type=float, default=7.0, help='阅读速度上限（字/秒），默认 7；超过记 ERROR')
    p.add_argument('--max-chars', type=int, default=20, help='单条字幕字数上限，默认 20（约两行，每行 ≤13 字时需要换行）')
    p.add_argument('--min-dur', type=float, default=1.2, help='单句最短停留（秒），默认 1.2')
    p.add_argument('--max-gap', type=float, default=3.0, help='两句间最长空档（秒），默认 3')
    p.add_argument('--first-line-by', type=float, default=1.0, help='第一句最晚出现时间（秒），默认 1')
    p.add_argument('--hook-window', type=float, default=3.0, help='钩子窗口（秒），默认 3')
    p.add_argument('--hook-max-chars', type=int, default=14, help='第一句字数上限，默认 14')
    p.add_argument('--jargon', help='追加术语表文件（空白分隔）')
    p.add_argument('--json', action='store_true')
    a = p.parse_args()

    subs, timed = parse(a.file, a.cps)
    issues = lint(subs, timed, a)
    if a.json:
        print(json.dumps(issues, ensure_ascii=False, indent=1))
    else:
        total = subs[-1][1] if subs else 0
        print(f'{len(subs)} 句，约 {total:.1f}s，{"带时间" if timed else f"按 {a.cps} 字/秒估算"}')
        for x in issues:
            where = f'#{x["index"]+1} {x["start"]:.1f}s' if x['index'] is not None else '-'
            print(f'[{x["level"]}] {where}  {x["msg"]}\n        「{x["text"]}」' if x['text'] else f'[{x["level"]}] {where}  {x["msg"]}')
        c = {k: sum(1 for x in issues if x['level'] == k) for k in ('ERROR', 'WARN', 'INFO')}
        print(f'\nERROR {c["ERROR"]} · WARN {c["WARN"]} · INFO {c["INFO"]}')
    sys.exit(1 if any(x['level'] == 'ERROR' for x in issues) else 0)

if __name__ == '__main__':
    main()
