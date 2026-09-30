以下是你当前会话里可用的 **Skills**、**Agent/Subagent** 和 **动态工具** 清单。

---

## 一、Skills（技能）

共 **28 个**，按来源分组：

### Cursor 内置技能（`~/.cursor/skills-cursor/`）

| 技能 | 用途 |
|------|------|
| `automate` | 创建 Cursor Automations |
| `autopilot` | PR 评论、冲突、CI 循环修复 |
| `canvas` | 生成可交互 Canvas 页面（图表、分析等） |
| `create-hook` | 创建 Cursor hooks |
| `create-rule` | 创建 Cursor Rules |
| `create-skill` | 编写 Agent Skills |
| `loop` | 定时/循环执行 prompt |
| `new-repo` | 在 Cursor 上创建并推送仓库 |
| `origin` | 安装/配置 origin CLI |
| `review-bugbot` | 用 Bugbot 子代理做代码审查 |
| `review-security` | 用 Security Review 子代理做安全审查 |
| `sdk` | Cursor SDK（`@cursor/sdk`）开发指南 |
| `share` | 备份/分享项目到 Cursor |
| `split-to-prs` | 把改动拆成多个 PR |
| `statusline` | 配置 CLI 状态栏 |
| `update-cursor-settings` | 修改 Cursor/VSCode 设置 |

### 用户自定义技能（`~/.claude/skills/`）

| 技能 | 用途 |
|------|------|
| `mock-interview` | 模拟技术面试（中文） |
| `resume-optimizer` | 简历/项目经历优化（中文） |
| `skill-creator` | 创建、测试、优化 Skills |

### Superpowers 插件技能

| 技能 | 用途 |
|------|------|
| `brainstorming` | 创意/功能实现前先探索需求与设计 |
| `dispatching-parallel-agents` | 并行派发多个独立任务 |
| `executing-plans` | 执行已写好的实施计划 |
| `finishing-a-development-branch` | 开发完成后的合并/PR/清理 |
| `receiving-code-review` | 处理代码审查反馈 |
| `requesting-code-review` | 完成功能后请求代码审查 |
| `subagent-driven-development` | 用子代理执行计划任务 |
| `systematic-debugging` | 系统化排查 bug |
| `test-driven-development` | TDD 实现 |
| `using-git-worktrees` | 用 git worktree 隔离开发 |
| `using-superpowers` | Superpowers 使用入口 |
| `verification-before-completion` | 完成前验证（跑测试等） |
| `writing-plans` | 多步骤任务前写计划 |
| `writing-skills` | 编写/验证 Skills |

---

## 二、Agent / Subagent（子代理）

可通过 `Task` 工具启动：

| 类型 | 用途 |
|------|------|
| `generalPurpose` | 通用：研究、搜索、多步任务 |
| `explore` | 快速探索代码库（按模式/关键词搜索） |
| `cursor-guide` | 回答 Cursor 产品使用问题 |
| `ci-investigator` | 调查 PR 上失败的 CI |
| `bugbot` | 代码审查（需你明确要求） |
| `security-review` | 安全审查（需你明确要求） |
| `best-of-n-runner` | 在独立 worktree 里并行多次尝试 |

**可选子代理模型**：`inherit`（默认）、`composer-2.5`、`composer-2.5-fast`、`cursor-grok-4.6-high`

---

## 三、动态工具 / MCP

### `cursor` 命名空间

| 工具 | 用途 |
|------|------|
| `CreateGoal` | 创建长期目标（仅在你明确要求时用） |
| `GenerateImage` | 根据文字生成图片 |
| `UpdateGoal` | 更新目标状态 |

### `cursor-app-control` 命名空间

| 工具 | 用途 |
|------|------|
| `create_project` | 创建新项目并初始化 git |
| `cursor_dialog` | 用户规则增删改查 |
| `install_plugin` | 安装 Cursor 市场插件 |
| `move_agent_to_cloned_root` | 切换到克隆的工作区 |
| `move_agent_to_root` | 切换到新根工作区 |
| `open_automation` | 打开 Automations UI |
| `open_resource` | 打开文件/终端/URL |
| `rename_chat` | 重命名当前对话标题 |

### `cursor-ide-browser` 命名空间（浏览器自动化）

| 工具 | 用途 |
|------|------|
| `browser_navigate` | 打开/跳转 URL |
| `browser_snapshot` | 页面可访问性快照 |
| `browser_click` / `browser_type` / `browser_fill` | 点击、输入、填表 |
| `browser_scroll` / `browser_drag` | 滚动、拖拽 |
| `browser_select_option` / `browser_press_key` | 下拉选择、按键 |
| `browser_tabs` | 管理浏览器标签页 |
| `browser_lock` / `browser_unlock` | 锁定/解锁浏览器操作 |
| `browser_take_screenshot` | 截图 |
| `browser_highlight` / `browser_get_bounding_box` | 高亮元素、获取位置 |
| `browser_cdp` | Chrome DevTools Protocol 命令 |

---

## 四、我本体会直接用的常规能力（非 Skill 名）

这些不算独立 Skill，但一直在用：

- 读/写/搜索代码、运行终端命令
- Git 操作（按你的规则，提交需你明确要求）
- `gh` 创建 PR
- 读 linter、编辑 notebook
- 网页搜索、抓取 URL

---

如果你想针对 **MindFlow 开发** 看「哪些最有用」，可以说一下你当前阶段（例如 M0 建表、写 API），我可以帮你标出 3～5 个最相关的技能和子代理。