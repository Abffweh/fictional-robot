from base import *
# ---------- 已出成片（本对话制作，文案齐全） ----------
dump("ep01-friendship-paradox", dict(
 title="你的朋友，比你受欢迎", episode=1, status="done", topic="友谊悖论", category="统计与概率", family="样本被筛过",
 oneLiner="觉得朋友都比你受欢迎，不是你差，是数学：人缘好的人会出现在很多人的朋友名单里。",
 style="3D 黏土微缩", repoPath="videos/friendship-paradox-3d/", branch="ccr-953622e0-82icck",
 caption=dict(title="你的朋友，真的比你更受欢迎吗？",
  body="刷朋友圈别人总在聚会，群里说话没人接，你是不是也觉得大家都比你受欢迎？\n其实大多数人都这么觉得——因为人缘好的人，会出现在很多人的朋友名单里，你数到的朋友，天然就偏受欢迎。\n你觉得你是图里的哪个点？评论区告诉我👇",
  hashtags=["vibe知识大赏","友谊悖论","冷知识","社交","心理","知识科普"],
  authorComment="本片由 AI 代码生成，无实拍素材；片中 8 人网络和千人网络为示意模型，数字由程序现场计算。\n参考：Feld (1991) AJS 96(6)；Christakis & Fowler (2010) PLoS ONE；Ugander et al. (2011) arXiv:1111.4503；Cohen, Havlin & ben-Avraham (2003) PRL 91",
  altTitles=["为什么你总觉得，自己朋友最少？","觉得朋友都比你受欢迎？这不是你的问题"]),
 sources=[dict(label="Feld 1991, AJS 96(6):1464–1477"),dict(label="Christakis & Fowler 2010, PLoS ONE"),dict(label="Ugander et al. 2011, arXiv:1111.4503")],
 risks=["Facebook“93%”只有课程博客转述，片中只写“绝大多数”"]))
dump("ep02-queue-paradox", dict(
 title="为什么旁边的队，总比你快？", episode=2, status="done", topic="排队错觉 / 墨菲定律", category="统计与概率", family="样本被筛过",
 oneLiner="三条队里你这条最快的机会本来只有三分之一；慢的地方人更多，你也更容易刚好待在慢的那边。",
 style="3D 黏土微缩", durationSec=112.5, sizeMB=28, repoPath="videos/queue-paradox-3d/", branch="ccr-953622e0-82icck",
 caption=dict(title="为什么旁边的队，总比你快？",
  body="超市结账，你排的这列总比旁边慢；堵车一变道，原来那条就动了。这甚至被写进了墨菲定律。\n其实不全是你运气差：三条队里，你这条最快的机会本来就只有三分之一；而慢的地方人更多，你也更容易刚好待在慢的那边。\n排队时你会换队吗？换，还是不换？评论区告诉我👇",
  hashtags=["你的错觉不是你的错","排队","墨菲定律","冷知识","概率","知识科普"],
  authorComment="本片由 AI 代码生成，无实拍素材；片中排队、车流均为示意模拟，数字由程序现场计算。\n参考：Redelmeier & Tibshirani, Nature 401:35 (1999)；Bostrom, Plus Magazine (2001)；排队论（Erlang）",
  altTitles=["你排的那一队，为什么总是最慢？","旁边的队总比你快？不全是你运气差"]),
 sources=[dict(label="Redelmeier & Tibshirani 1999, Nature 401:35"),dict(label="Bostrom 2001, Plus Magazine"),dict(label="排队论（Erlang）")],
 risks=["8.3 vs 4.6 分钟是构造的单个示例","Bostrom 只核到搜索摘要"],
 review="制作反馈已写进 skill：首个场景直接说现象；举例后点名；不提其他期；不用“我们”；不在一句里比较两个“……的……”。"))
dump("ep03-curse-of-knowledge", dict(
 title="为什么你说得很清楚，别人还是听不懂？", episode=3, status="done", topic="知识的诅咒", category="认知与感知", family="以己度人",
 oneLiner="不是你说不清楚，是你忘了：别人没听过你脑子里那段旋律。",
 style="2D 纸黏土", durationSec=127, sizeMB=16.2, repoPath="videos/curse-of-knowledge/", branch="ccr-953622e0-82icck",
 caption=dict(title="为什么你说得很清楚，别人还是听不懂？",
  body="教爸妈用手机说了三遍还找不到；汇报讲完，老板问“所以你想说什么”。\n这在心理学里叫「知识的诅咒」：你脑子里有旋律，别人只听到咚咚咚。\n片中敲了一段节奏，你第一遍猜出来了吗？评论区说说👇",
  hashtags=["你的错觉不是你的错","知识的诅咒","沟通","心理学","冷知识","知识科普"],
  authorComment="本片由 AI 代码生成，无实拍素材；情景均为示意演绎，敲击与《生日快乐》旋律为程序合成（该曲为公有领域）。\n敲歌实验：E. L. Newton 1990 年斯坦福博士论文；数字（120 首猜中 3 首、敲的人估计 50%）引自 Heath & Heath，《哈佛商业评论》2006。这是单个实验，不是大规模复现的结论。\n消息语气：Kruger, Epley, Parker & Ng，《人格与社会心理学杂志》2005。\n“知识的诅咒”一词：Camerer, Loewenstein & Weber，《政治经济学杂志》1989。",
  altTitles=["你说的话，别人为什么总听不懂？","敲一首歌让人猜，猜中率只有 2.5%"]),
 sources=[dict(label="Heath & Heath 2006, HBR “The Curse of Knowledge”",url="https://hbr.org/2006/12/the-curse-of-knowledge"),dict(label="Newton 1990, Stanford PhD dissertation"),dict(label="Kruger et al. 2005, JPSP 89(6):925–936",url="https://pubmed.ncbi.nlm.nih.gov/16393025/"),dict(label="Camerer, Loewenstein & Weber 1989, JPE 97(5)")],
 risks=["2.5% 出自未正式发表的博士论文，经 HBR 转述","标题暗示了答案方向，观众可能第一遍就猜出《生日快乐》"]))
# ---------- 其他对话已做完（文案待各自对话登记） ----------
other = [
 ("spotlight-effect","为什么你总觉得，所有人都在看你？","聚光灯效应","社会心理","高估别人对你的关注","你是自己世界的主角，但在别人那里只是背景。",[dict(label="Gilovich, Medvec & Savitsky 2000, JPSP 78(2):211–222")]),
 ("regression-to-mean","为什么夸完就变差，骂完就变好？","回归均值","统计与概率","巧合被编成因果","特别好和特别差都难连续；“夸了变差、骂了变好”证明不了骂比夸有用。",[dict(label="Kahneman《思考，快与慢》第17章")]),
 ("peak-end-rule","为什么一次旅行，你只记得最好和最后？","峰终定律","认知与感知","记忆的捷径","记忆不是录像，它主要截取最强烈的一刻和结尾。",[dict(label="Kahneman et al. 1993, Psychological Science 4(6):401–405")]),
 ("berkson-paradox","为什么长得好看的，性格往往不好？","伯克森悖论","统计与概率","样本被筛过","你见过的人是被筛过的；筛的时候，“好看”和“性格好”会被你自己搞成反着来。",[dict(label="Berkson 1946, Biometrics Bulletin 2(3):47–53")]),
 ("false-consensus","为什么你总觉得，大家都和你想的一样？","虚假共识效应","社会心理","误读别人心里想什么","你拿自己当样本去猜所有人，所以总觉得自己是多数。",[dict(label="Ross, Greene & House 1977, JESP 13:279–301")]),
 ("liking-gap","为什么聊完天，你总觉得对方不太喜欢你？","喜欢差距","人际关系","高估别人对你的关注","聊完天，你多半低估了对方对你的好感。",[dict(label="Boothby et al. 2018, Psychological Science 29(11):1742–1756")]),
 ("pluralistic-ignorance","为什么课上没人提问？","多元无知","社会心理","误读别人心里想什么","每个人都看着别人的沉默，以为只有自己不懂；其实大家想的一样。",[dict(label="Prentice & Miller 1993, JPSP 64(2):243–256")]),
 ("asking-for-help","为什么你不好意思开口求人帮忙？","低估别人答应的可能","人际关系","低估别人的善意","开口求助，别人答应的可能比你想的大；但有时对方答应，只是因为拒绝太尴尬。",[dict(label="Flynn & Lake 2008, JPSP 95(1):128–143")]),
]
for did,t,tp,cat,fam,one,src in other:
    dump(did, dict(title=t, status="done", topic=tp, category=cat, family=fam, oneLiner=one, sources=src,
      notes="在其他对话中制作完成。文案、时长、源码路径待在那个对话里粘贴“登记指令”补登。"))
