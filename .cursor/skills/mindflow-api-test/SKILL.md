---
name: mindflow-api-test
description: Tests MindFlow HTTP APIs from Windows PowerShell using temp JSON files and curl.exe (avoids broken inline -d JSON). Covers POST /api/stages, ingest, DELETE, PDF multipart. Use when the user asks to test APIs, curl local endpoints, manual API verification, shell testing, or PowerShell Invalid JSON body on /api/stages.
---

# MindFlow 接口测试（PowerShell）

## 强制约定

在 **Windows PowerShell** 下测试本项目的 JSON 接口时：

1. **禁止**用 `curl.exe -d '{"..."}'` 或 `-d "{`"key`":...}"` 内联 JSON（会吃掉键名双引号，`Content-Length` 偏短，服务端返回 `Invalid JSON body`）。
2. **必须**用 **UTF-8 无 BOM 临时文件** + `curl.exe --data-binary "@path"`。
3. JSON 上传用 **`curl.exe`**（不是 PowerShell 的 `curl` 别名）。
4. PDF 用 **`multipart/form-data`** 的 `-F`（一般不受 JSON 引号问题影响）。
5. 默认 base：`http://localhost:3001`（`pnpm dev` → `next dev --port 3001`）。先确认 dev 已启动；端口占用时勿重复 `pnpm dev`，或结束占用进程后再启。

执行测试前向用户说明副作用（见下文「命令和临时文件 vs 接口调用」）；测完可选 `DELETE` 或清理 `%TEMP%\mindflow-api-test`。

## 公共 setup（每次会话先跑）

```powershell
$base = "http://localhost:3001"
$tmpdir = "$env:TEMP\mindflow-api-test"
New-Item -ItemType Directory -Force -Path $tmpdir | Out-Null

function Write-JsonBodyFile {
  param([string]$Name, [string]$Json)
  $path = Join-Path $tmpdir $Name
  [System.IO.File]::WriteAllText($path, $Json, (New-Object System.Text.UTF8Encoding $false))
  return $path
}
```

清理临时 JSON（可选）：

```powershell
Remove-Item -Recurse -Force "$env:TEMP\mindflow-api-test" -ErrorAction SilentlyContinue
```

## 端点速查

| 方法 | 路径 | Body | 成功码 |
|------|------|------|--------|
| POST | `/api/stages` | `application/json` 或 `multipart/form-data` | 201 |
| POST | `/api/stages/{id}/ingest` | 无 | 201 |
| DELETE | `/api/stages/{id}` | 无 | 200 |

实现位置：`app/api/stages/route.ts`、`app/api/stages/[id]/ingest/route.ts`、`app/api/stages/[id]/route.ts`。

### POST /api/stages（JSON）

- 字段：`requirement`（**必填**，trim 后 ≥10 字符）。
- 产品规格（PRD §1.6）：无 `requirement` 应 400。当前 `lib/services/stages.ts` 仍可能仅校验「无 PDF 时必填」，实现未完全对齐前以 PRD 为准。

```powershell
$path = Write-JsonBodyFile "create.json" '{"requirement":"设计一节关于光合作用的高中生物课，包含实验演示和小组讨论"}'
curl.exe -s -w "`nHTTP: %{http_code}`n" -X POST "$base/api/stages" `
  -H "Content-Type: application/json" `
  --data-binary "@$path"
```

### POST /api/stages（提示词 + PDF，multipart）

- 字段：`requirement`（**必填**文本）+ `pdf`（文件）。
- 仅上传，不 ingest；响应可含 `document`。

```powershell
curl.exe -s -w "`nHTTP: %{http_code}`n" -X POST "$base/api/stages" `
  -F "requirement=设计一节关于光合作用的高中生物课，结合上传讲义中的实验部分" `
  -F "pdf=@<绝对路径>\file.pdf;type=application/pdf"
```

### POST /api/stages/{id}/ingest

- 解析 `uploads/` 下已关联 PDF，写 `raw_text` 与 `chunks`；重复调用会覆盖该 stage 的 chunks。
- 需已存在 document；解析文本有效字符 ≥ 200。

```powershell
curl.exe -s -w "`nHTTP: %{http_code}`n" -X POST "$base/api/stages/<stageId>/ingest"
```

### DELETE /api/stages/{id}

```powershell
curl.exe -s -w "`nHTTP: %{http_code}`n" -X DELETE "$base/api/stages/<stageId>"
```

## 推荐流程（PDF → ingest）

```powershell
$r = curl.exe -s -X POST "$base/api/stages" -F "pdf=@<绝对路径>\file.pdf;type=application/pdf"
$stageId = ($r | ConvertFrom-Json).id
curl.exe -s -w "`nHTTP: %{http_code}`n" -X POST "$base/api/stages/$stageId/ingest"
```

## 排错

| 响应 | 含义 |
|------|------|
| `Invalid JSON body` | `request.json()` 失败；检查是否仍用内联 `-d`，或改用 `--data-binary` |
| `Content-Type must be application/json or multipart/form-data` | 415，缺/错 Content-Type |
| `requirement must be at least 10 characters...` | JSON 已解析成功，业务校验失败 |
| `EADDRINUSE :3001` | 已有 dev 进程；直接用 3001 或结束占用 PID |

内联 JSON 坏掉时，`-v` 里 `Content-Length` 常比合法 JSON 少约 4 字节（键名 `"` 被吃掉）。

## 命令和临时文件 vs 接口调用

分两部分说：**命令和临时文件** vs **接口调用本身**。

---

### 临时的、基本不影响「系统/代码」的

| 内容 | 说明 |
|------|------|
| `$env:TEMP\mindflow-api-test` 里的 JSON | 只是本机临时文件，删目录即可，**不改项目代码、不装软件** |
| `Write-JsonBodyFile` / `curl.exe` | 只是发 HTTP 请求的工具，**不会改仓库里的文件** |
| `pnpm dev` | 本地开发进程，关掉终端就停（端口会释放） |

每次都按照这样的方式测试接口，以适配powershell问题

这些可以当成「一次性测试手段」，用完想清理就删 `%TEMP%\mindflow-api-test`。

---

### 不是「无影响」的：接口会动真实数据

你测的是**真接口**，连的是本地 **数据库 + `uploads/` 目录**（开发环境），会有持久化副作用：

| 操作 | 实际影响 |
|------|----------|
| `POST /api/stages`（JSON） | **数据库**里多一条 `Stage` |
| `POST /api/stages`（带 PDF） | 多一条 `Stage` + `Document`，磁盘 **`uploads/{stageId}/`** 下有 PDF |
| `POST .../ingest` | 写 **`raw_text`、`chunks`**，可能覆盖该 stage 已有 chunks |
| `DELETE /api/stages/{id}` | 删 stage、相关文档/chunks，并清 **`uploads/{id}`** |

所以：**测试数据会留在本机 DB 和 uploads 里**，直到你删库记录、删目录，或用 DELETE 接口清掉。这不是「只在内存里试一下」。

---

### 和「生产环境」的关系

- 默认是 **`localhost:3001` + 你 `.env` 里的库**，一般是**本机开发库**，**不会**因为你在自己电脑 curl 就改线上生产（除非你故意把 `base` 指到生产 URL）。
- 若 `.env` 连的是共享/生产库，那每次 POST 都会影响那个库——需要自己确认 `DATABASE_URL`。

---

### 想「测完尽量干净」可以怎么做

1. 测完对不需要的 stage 调 **`DELETE /api/stages/{id}`**（项目里已实现）。  
2. 用 **Prisma Studio**（`pnpm db:studio`）看并删测试数据。  
3. 临时 JSON 目录：`Remove-Item -Recurse -Force "$env:TEMP\mindflow-api-test"`。

---

**一句话：** 临时文件和 curl 写法对系统是安全的；**但创建课堂 / 上传 / ingest 会在本机开发库里留下数据**，需要的话手动 DELETE 或清库，不是完全零副作用的「干跑」。

## Agent 行为

- 用户要求「测接口」时：在 shell 中用本 skill 的 setup + `--data-binary`，不要用内联 `-d` JSON。
- 需要代跑测试时：说明会写入 DB/uploads；完成后给出 `stageId` 与 HTTP 结果，并提示可选 `DELETE`。
- 更多可复制用例见 [examples.md](examples.md)。
