import json
D = "2026-10-18"
RULES = """【字幕铁律】（skill 里已写，必须遵守，写完跑 scripts/script_lint.py，0 ERROR）
- 每条片子自成一体，不提"上一期""下一期"。
- 不用"我们／我／咱们"，写成无主语的句子；对观众说话用"你"。
- 不写需要停下来想的句子（如一句里比较两个"……的……"）。拆成2–3句，每句只多给一个新信息；不解释常识，不把观众当傻子；3句还说不清就交给画面。"""
DELIV = """【交付】
只要成片：一个高清版（≤30MB）。另附抖音标题、正文、话题和作者自评论（出处与AI声明），发布时提醒勾选AI内容声明。
源文件（不含mp4和帧）提交并推送到本对话指定的分支，不建PR。
做完后，按工作台 https://claude.ai/artifact/21e1AzpwAH9TgoTqdJ6LLk 「登记指令」页的格式，把本期登记到工作台（collection "videos"，doc_id 用本条给定的 id）。
中间不用问我，做完再给我看。"""
FORM2D = """【形式】
2D 纸黏土风，复用仓库 videos/curse-of-knowledge/ 的页面结构、人物画法、render.py、sfx.py、compose.sh。
1920×1080，24fps，时长约90–110秒。只用音效，不要背景音乐。
大标题从模糊渐变到清晰后常驻顶部；左上角是要点清单（互动时换成倒计时），右上角是年代/出处卡；字幕用大号衬线字体。节奏快，不要PPT感。
互动环节按 skill 结构 4.8：不让观众干等，第5秒内开始，静止画面不超过约2秒。"""
HEAD = "/knowledge-video-playbook 做一条抖音横屏知识视频，系列「你的错觉，不是你的错」，署名 @Leo。\n\n"
def P(body, form=FORM2D): return HEAD + body.strip() + "\n\n" + form + "\n\n" + RULES + "\n\n" + DELIV
def dump(name, d):
    d.setdefault("updatedAt", D)
    json.dump(d, open(name + ".json", "w"), ensure_ascii=False, indent=1)
