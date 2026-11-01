# 提示词加载与模板

本目录保存当前大纲生成、场景内容与动作生成、课堂问答使用的提示词。模板由服务端从磁盘读取，不依赖旧整课生成流水线。

## 当前使用的模板

- `requirements-to-outlines`：流式课程大纲。
- `slide-content`、`quiz-content`：幻灯片与测验内容。
- `slide-actions`、`quiz-actions`：对应场景的讲稿与教学动作。
- `chat-router`：为本轮问答选择一位教师。
- `chat-teacher`：教师回复。
- `chat-memory`：历史选择与临时摘要。
- `chat-context-filter`：上下文与测验保护检查。

当前共 9 组模板、14 个中文 Markdown 文件。共享片段仅保留 `snippets/json-output-rules.md`，由测验内容模板引用。

## 文件与调用关系

- `index.ts`：公开加载接口与 `PROMPT_IDS`。
- `types.ts`：`PromptId`、`SnippetId` 与加载结果类型。
- `loader.ts`：磁盘读取、片段展开、条件块处理与变量插值。
- `build-outline-generation-prompt.ts`：构造正式大纲生成提示词。
- `build-chat-prompt.ts`：构造教师路由、回复和会话记忆所用的系统提示词。
- `templates/<prompt-id>/system.zh-CN.md`：必需的系统模板。
- `templates/<prompt-id>/user.zh-CN.md`：可选的用户模板。

加载器只读取上述中文文件，不回退到 `system.md` 或 `user.md`。中文文件名是模板资源约定，不替代调用方传入的授课语言指令。

## 模板语法

- `{{variableName}}`：替换调用方提供的变量；变量名使用 camelCase。
- `{{snippet:json-output-rules}}`：读取并插入共享片段。
- `{{#if conditionName}}...{{/if}}`：按同一份变量对象中的值决定是否保留内容；不支持嵌套条件块。

处理顺序为：先读取模板并展开片段，再处理条件块，最后插入变量。因此位于关闭条件块中的片段仍会在加载阶段被读取。

未知变量占位符保持原文，不会自动变成空字符串。缺失系统模板会使 `loadPrompt` 返回 `null`；用户模板可以省略。调用方需要检查加载或构建结果。

## 维护方式

修改现有模板时，应对照生成或问答调用方实际传入的变量，保留其输出格式与校验要求。

需要新增模板或片段时，先确认对应功能范围，再同步磁盘文件、`PROMPT_IDS`、`PromptId` 或 `SnippetId` 以及真实调用方。仅添加注册项不会让模板进入运行路径。

加载器通过 `process.cwd()/lib/prompts` 定位资源，每次调用都从磁盘读取，没有模板缓存。部署时需要保留当前模板目录与片段文件。

仓库目前没有 `pnpm test` 或白板评估脚本。静态检查使用现有 ESLint 与 TypeScript 命令；生成和问答行为的验证范围由对应功能计划及验收记录说明。
