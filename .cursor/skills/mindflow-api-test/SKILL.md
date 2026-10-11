---
name: mindflow-api-test
description: Tests MindFlow HTTP APIs from Windows PowerShell using temp JSON files and curl.exe (avoids broken inline -d JSON and GBK-garbled curl output). Covers POST /api/stages, GET by id, ingest, DELETE, PDF multipart. Use when the user asks to test APIs, curl local endpoints, manual API verification, shell testing, or PowerShell Invalid JSON body on /api/stages.
---

# MindFlow 接口测试（PowerShell）

测的是本机 `http://localhost:3001`（`pnpm dev`）。会写入开发库和 `uploads/`。测完对不需要的课堂 `DELETE /api/stages/{id}`。

## 约定

1. JSON 用 **`curl.exe`**，不用 PowerShell 的 `curl`。
2. 请求体写入 **UTF-8 无 BOM** 文件，用 `--data-binary "@path"`。禁止 `curl.exe -d '{"..."}'`（引号被吃掉，返回 `Invalid JSON body`）。
3. 响应用 `-o` 落盘，再用 `Read-Utf8File` 读取。禁止 `$r = curl.exe`：GBK 会把中文解成乱码，`ConvertFrom-Json` 失败后 id 为空，接着打到 `/api/stages/` 得到 **308**。

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

function Read-Utf8File {
  param([string]$Path)
  return [System.IO.File]::ReadAllText($Path, (New-Object System.Text.UTF8Encoding $false))
}
```

## 创建课堂

`POST /api/stages` → 201。不调用模型，不 ingest。`hasKnowledgeBase` 为 `false`。

JSON 体：

```json
{ "requirements": { "requirement": "至少 10 字", "userNickname": "可选", "userBio": "可选" } }
```

`requirement` 去空白后 10～10000 字。昵称、背景可省略；空白不当字段返回。

```powershell
$path = Write-JsonBodyFile "create.json" '{"requirements":{"requirement":"设计一节关于光合作用的高中生物课，包含实验演示和小组讨论","userNickname":"小明","userBio":"高一学生"}}'
curl.exe -s -o "$tmpdir\create-res.json" -X POST "$base/api/stages" -H "Content-Type: application/json" --data-binary "@$path"
$stage = Read-Utf8File "$tmpdir\create-res.json" | ConvertFrom-Json
$stageId = $stage.id
```

带 PDF 时用两个表单字段：`requirements` 是上面对象的 JSON 文件内容，`pdf` 是文件。只存档。

```powershell
$req = Write-JsonBodyFile "req.json" '{"requirement":"设计一节关于光合作用的高中生物课，结合上传讲义","userNickname":"小明"}'
curl.exe -s -o "$tmpdir\create-res.json" -X POST "$base/api/stages" -F "requirements=<$req" -F "pdf=@C:\path\to\file.pdf;type=application/pdf"
```

## 读取与删除

- `GET /api/stages/{id}` → 200，同一份 `requirements`；有 PDF 时带 `document`（文件名与路径，无全文）。不存在 404。
- `DELETE /api/stages/{id}` → 200，并清 `uploads/{id}`。
- `POST /api/stages/{id}/ingest` 才解析 PDF。创建课堂的测试不要调用它。

```powershell
curl.exe -s -o "$tmpdir\get-res.json" -w "`nHTTP:%{http_code}`n" "$base/api/stages/$stageId"
Read-Utf8File "$tmpdir\get-res.json"
curl.exe -s -o "$tmpdir\del-res.json" -w "`nHTTP:%{http_code}`n" -X DELETE "$base/api/stages/$stageId"
```

## 模型请求头（ingest / 流式大纲）

服务端**不**读 `.env` 里的 Key。本地测时从仓库根 `.env` 用 `Get-EnvVal` 读出再塞进请求头；不要把密钥写进 skill 或提交到 git。

对话与向量是**两套**头，可指向不同厂商（ADR-003）：

| 链路 | 请求头 |
|------|--------|
| 对话 | `x-mindflow-llm-chat-api-key`、`x-mindflow-llm-chat-base-url`、`x-mindflow-llm-chat-model` |
| 向量 | `x-mindflow-llm-embedding-api-key`、`x-mindflow-llm-embedding-base-url`、`x-mindflow-llm-embedding-model` |

```powershell
function Get-EnvVal([string]$name) {
  $text = [System.IO.File]::ReadAllText(".env", [System.Text.UTF8Encoding]::new($false))
  if ($text -match "(?m)^$name=(.*)$") { return $Matches[1].Trim().Trim('"') }
  throw "missing $name"
}

$chatKey = Get-EnvVal "DEEPSEEK_API_KEY"
$chatBase = Get-EnvVal "DEEPSEEK_BASE_URL"
$chatModel = Get-EnvVal "DEEPSEEK_MODEL"
$embedKey = Get-EnvVal "OPENAI_API_KEY"
$embedBase = Get-EnvVal "OPENAI_BASE_URL"
$embedModel = Get-EnvVal "EMBEDDING_MODEL"

$chatHeaders = @(
  "-H", "x-mindflow-llm-chat-api-key: $chatKey",
  "-H", "x-mindflow-llm-chat-base-url: $chatBase",
  "-H", "x-mindflow-llm-chat-model: $chatModel"
)
$embedHeaders = @(
  "-H", "x-mindflow-llm-embedding-api-key: $embedKey",
  "-H", "x-mindflow-llm-embedding-base-url: $embedBase",
  "-H", "x-mindflow-llm-embedding-model: $embedModel"
)
```

**`POST /api/stages/{id}/ingest`**：仅向量三头 → 201，`hasKnowledgeBase` 为 true。

```powershell
curl.exe -s -o "$tmpdir\ingest.json" -w "`nHTTP:%{http_code}`n" -X POST "$base/api/stages/$stageId/ingest" @embedHeaders
Read-Utf8File "$tmpdir\ingest.json"
```

**`POST /api/generate/scene-outlines-stream`**：body `{"stageId":"<uuid>"}`，SSE 响应。

- 无知识库：只带 `$chatHeaders`。
- 知识库已就绪：同一次 POST 带 `$chatHeaders` + `$embedHeaders`（共 6 头）。

```powershell
$body = Write-JsonBodyFile "stream.json" "{`"stageId`":`"$stageId`"}"
curl.exe -s -N -o "$tmpdir\stream.txt" -w "`nHTTP:%{http_code}`n" -X POST "$base/api/generate/scene-outlines-stream" -H "Content-Type: application/json" --data-binary "@$body" @chatHeaders @embedHeaders
```

## 期望失败（400，且不新建课堂）

| 情况 | 要点 |
|---|---|
| 提示词不足 10 字 | `requirement must be at least 10 characters` |
| 请求体或 multipart 的 `requirements` 不是合法 JSON | `Invalid JSON body` |
| 只传 `pdf`、没有 `requirements` | `requirements is required` |
| 非 PDF、空文件、超过 50MB | 对应 `pdf must ...` |

Content-Type 不对 → 415。端口占用 → 已有 dev，不要再开一个。
