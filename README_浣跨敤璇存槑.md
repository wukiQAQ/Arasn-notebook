# Codex 视觉升级启动包

这是为“同一个工具中将 DeepSeek Harness 更换为 Codex Harness，希望同时改善前端 UI 与 PPT 的设计效果”准备的项目级启动配置。

## 1. 安装与放置

将 `AGENTS.md`、`.agents/skills/` 和 `prompts/` 复制到项目根目录。不要覆盖现有 `AGENTS.md`；如已有文件，将这些规则合并进去。

本包只包含自定义规则、质检 Skill 和任务提示词，并没有内置外部 Skills 的内容。

## 2. 安装推荐 Skills（在项目根目录运行）

需要可运行的 Node.js/npx 环境。下列命令使用技能安装器，按交互提示选择 Codex 和项目作用域；不同 Harness 的发现机制可能有所不同。

```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
npx skills add https://github.com/openai/skills --skill slides
npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
```

如你想要更多风格与配色检索，再安装可选技能：

```bash
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
```

安装前请检查每个仓库和 Skill 的实际内容、依赖及执行权限。第三方脚本不可盲目信任。

检查：
```bash
npx skills list
```

如你的工具使用的是自定义 Harness，项目根目录 `.agents/skills` 不一定会被自动扫描。请在工具界面确认已经发现 Skills，或将规则手动合并到该工具的 agent instructions。单纯放文件不代表一定生效。

## 3. 前端与 PPT 的操作步骤

- 前端：将 `prompts/frontend.md` 复制给 Codex，填好方括号变量。提供你喜欢的两张真实页面截图比空喊“高级感”更有效。
- PPT：将 `prompts/ppt.md` 复制给 Codex。优先提供现有内容、图片、品牌模板、图表数据和参考 PPT。
- 无论前端还是 PPT，观察它是否真的完成“设计方案 → 实现 → 截图/渲染 → 检查 → 修改 → 复核”；没有视觉反馈就不算完成设计闭环。

## 4. 公平比较 Harness/模型

取同一项任务，固定内容、技术栈、参考图、时间预算、允许工具、Skills 和视觉验收标准。各运行 2～3 次，比较：

1. 内容准确与交互可用。
2. 首屏/第一页的信息层次与视觉辨识度。
3. 字体、图片、间距与响应式/字号。
4. 截图验收过程中发现和修复的问题。
5. 人工还要修改多少处，耗费多少时间。

否则不同模板或不同上下文造成的差别，容易被误认作是换了模型的差别。

## 参考

- Codex skills: https://learn.chatgpt.com/docs/build-skills
- Anthropic frontend-design: https://www.skills.sh/anthropics/skills/frontend-design
- OpenAI slides: https://www.skills.sh/openai/skills/slides
- Vercel web-design-guidelines: https://github.com/vercel-labs/agent-skills
- UI/UX Pro Max (社区): https://www.skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max

以上是规则和示例配置，不保证所有宿主 Harness 都能自动调用本地 Skills、操作浏览器或运行 PPT 渲染器，需以当前环境实际提供的权限和工具为准。
