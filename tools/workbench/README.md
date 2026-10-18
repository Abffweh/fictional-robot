# 创作工作台

页面：https://claude.ai/artifact/21e1AzpwAH9TgoTqdJ6LLk （仅本人可见；数据存在页面自带的数据库里，collection `videos` 和 `meta/info`）

- `index.html`：页面源码（Artifact 发布时声明 `capabilities: {db: {rules:[{path:"",read:"view",write:"admin"}]}, user: {}}`）。
- `seed.py` / `seed2.py`：首次灌入的数据（前 3 期完整文案、其他对话已完成的 8 期、8 个提示词就绪的选题），生成 JSON 后用 ArtifactData batch 写入。
- 各制作对话的登记方法见页面“登记指令”页，或 `.claude/skills/knowledge-video-playbook/SKILL.md`「做完一期：登记到创作工作台」。
