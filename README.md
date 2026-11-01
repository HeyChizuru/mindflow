# MindFlow

MindFlow 是一个面向自学与课程演示的 AI 互动课堂项目。输入课程需求，可选上传 PDF，编辑并确认生成的大纲后，即可观看带讲稿的幻灯片、完成测验，并围绕当前课程问答。

## 当前功能

- **建课与大纲**：必填课程需求，可选昵称、学习背景和 PDF；大纲流式生成，确认前可以手动编辑。
- **分步生成**：先生成首个场景并进入课堂，其余场景在播放页依次生成，保存生成进度与结果。
- **课堂播放与测验**：支持文本、形状、线条、图表和公式，以及选择题和简答题；讲稿以字幕呈现，简答题由模型批改。
- **课程问答**：每轮从三名固定教师中选择一名回应，结合当前场景、会话上下文及可用资料回答；使用 PDF 检索结果时显示引用。
- **历史与恢复**：课堂、大纲定稿、场景、聊天和测验数据保存在 PostgreSQL；首页可查找、重命名、删除或继续已有课堂。
- **模型设置**：在页面顶栏分别配置 OpenAI 兼容的对话模型与向量模型。

当前不提供语音合成、幻灯片编辑器、AI 图片 / 视频生成、白板或 PPTX 导出。教师选择是每轮一位教师回复，不包含同轮多教师协作或委派。

## 来源与项目工作

本项目复用了 [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) 的部分提示词、生成工具、幻灯片渲染器、播放 / 动作引擎及界面样式，并对其作了裁剪、中文化和适配。复用范围不限于提示词和样式。

MindFlow 在此基础上实现了 PostgreSQL / Prisma 数据保存、PDF 文本入库与 pgvector 检索、生成状态与恢复、分步续生成、服务端测验保存与批改、LangGraph 课堂问答、历史课堂管理，以及浏览器模型配置等业务流程。

具体来源、固定版本、路径对应和第三方许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 环境要求

- Node.js **22.21 或更高的 22.x 版本，或 24.x**。现有启动脚本使用 `--use-system-ca`，不能只按 Next.js 的最低 Node 版本选择环境。
- pnpm **10.22.0**，与 `packageManager` 字段一致。
- PostgreSQL，并已安装可用的 **pgvector** 扩展；应用角色需要迁移和读写业务表的权限。
- 可写的本地上传目录，以及可用的 OpenAI 兼容模型服务。

主要技术：Next.js 16 / React 19、TypeScript、Tailwind CSS、Prisma 7、PostgreSQL / pgvector、AI SDK 和 LangGraph。

## 本地启动

### 1. 获取代码与配置

~~~bash
git clone https://github.com/HeyChizuru/mindflow.git
cd mindflow
~~~

将 `.env.example` 复制为 `.env`，然后编辑数据库连接。PowerShell：

~~~powershell
Copy-Item .env.example .env
~~~

macOS / Linux：

~~~bash
cp .env.example .env
~~~

### 2. 准备数据库

在已安装 pgvector 的 PostgreSQL 上，使用管理员在 **psql** 中为全新本地环境执行以下示例，并替换示例密码：

~~~sql
CREATE USER mindflow WITH PASSWORD 'change-me';
CREATE DATABASE mindflow OWNER mindflow;
\connect mindflow
CREATE EXTENSION IF NOT EXISTS vector;
~~~

在 `.env` 中填写对应地址：

~~~dotenv
DATABASE_URL="postgresql://mindflow:change-me@localhost:5432/mindflow"
UPLOAD_DIR=./uploads
~~~

这些命令用于创建新环境；已有数据库请使用现有连接信息。数据库密码含特殊字符时，需要在连接 URL 中进行百分号编码。pgvector 必须先安装到 PostgreSQL 服务端，仅安装前端或 Node 依赖不能提供该扩展。

### 3. 安装依赖与应用迁移

确保 pnpm 10.22.0 已可用，在仓库根目录运行：

~~~bash
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy
pnpm dev
~~~

安装后的 `postinstall` 会运行 `prisma generate`；需要手动重新生成客户端时执行 `pnpm db:generate`。数据库结构使用仓库中的迁移初始化，不以 `db push` 代替 pgvector 相关迁移。

打开 [http://localhost:3001](http://localhost:3001)。

### 4. 配置模型并创建课堂

在页面顶栏打开模型设置，填写 **API 地址、API Key、模型名称**：

- **对话模型**：用于大纲、内容、讲稿、批改与问答。可先用“测试连接”检查，兼容端点仍需实际支持项目使用的生成和工具调用协议。
- **向量模型**：上传 PDF 或检索知识库时需要，输出必须为 **1024 维**。应保持同一知识库写入和检索所用的模型一致；切换向量模型不会自动重建已有向量。
- API 地址填写 OpenAI 兼容 API 的根地址，不填写 `/chat/completions` 等具体接口路径；服务端会补齐末尾 `/v1`。

配置及 Key 保存在当前浏览器的 localStorage，并随相关请求发送给本项目服务端；服务端再调用配置的模型服务。不要将真实 Key 写入仓库。模型凭据没有服务端环境变量兜底，无 PDF 的课堂不要求配置向量模型。

随后输入至少 10 个字符的课程需求，可选上传不超过 **50 MiB** 的 PDF，生成并确认大纲，再进入课堂。

## 存储与运行边界

- PostgreSQL 保存业务数据；`UPLOAD_DIR` 保存 PDF 原件，默认 `./uploads`，由应用在上传时创建。迁移部署或备份时应同时考虑数据库和上传目录。
- 模型配置属于浏览器本地数据；更换浏览器或清除站点存储后需要重新填写。
- PDF 目前处理可提取的文本，不包含 OCR 或扫描件识别。
- 当前版本面向本地使用和演示，**没有用户登录或按用户隔离课堂数据**；首页历史列表对应当前部署中的全部课堂。需要公网多用户服务时，应先补充访问控制与部署保护。
- 模型请求会产生服务商费用；生成质量、耗时和工具调用兼容性取决于所配置的模型。
- 生产模式限制模型 API 地址指向本机或内网，开发模式允许本地模型服务。

## 常用命令

- `pnpm dev`：开发服务，端口 3001。
- `pnpm lint`：ESLint。
- `pnpm db:generate`：生成 Prisma Client。
- `pnpm db:migrate`：开发环境创建 / 应用迁移，可能要求 shadow database 权限。
- `pnpm exec prisma migrate deploy`：应用已提交的迁移。
- `pnpm db:studio`：查看数据库。
- `pnpm build`：生成 Prisma Client 并构建。
- `pnpm start`：启动已构建版本，默认端口 3000；需要 3001 时可用 `pnpm start --port 3001`。

本轮开源整理核对了说明、配置、迁移和来源文件，没有重新执行全新环境安装、构建或端到端运行验收。

## 许可证

当前版本采用 [MIT License](./LICENSE)。第三方代码、字体与依赖保留各自许可，详见 [第三方声明](./THIRD_PARTY_NOTICES.md)。
