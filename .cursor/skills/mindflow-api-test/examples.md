# MindFlow API 测试示例

先执行 [SKILL.md](SKILL.md) 中的公共 setup（`$base`、`Write-JsonBodyFile`）。

## 错误用例

**requirement 太短（期望 400，非 Invalid JSON body）**

```powershell
$path = Write-JsonBodyFile "short.json" '{"requirement":"short"}'
curl.exe -s -w "`nHTTP: %{http_code}`n" -X POST "$base/api/stages" `
  -H "Content-Type: application/json" `
  --data-binary "@$path"
```

**非法 JSON 文件（期望 400 Invalid JSON body）**

```powershell
$path = Join-Path $tmpdir "bad.json"
[System.IO.File]::WriteAllText($path, "{not valid", (New-Object System.Text.UTF8Encoding $false))
curl.exe -s -w "`nHTTP: %{http_code}`n" -X POST "$base/api/stages" `
  -H "Content-Type: application/json" `
  --data-binary "@$path"
```

**ingest 无 document 的 stage（期望 400）**

对仅 JSON 创建的 stage 直接 ingest。

## 备用：PowerShell 原生（不用 curl JSON）

```powershell
$body = @{ requirement = "设计一节关于光合作用的高中生物课，包含实验演示和小组讨论" } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "$base/api/stages" -Method POST `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

## 备用：curl --%（单行 JSON，无临时文件）

```powershell
curl.exe --% -s -X POST http://localhost:3001/api/stages -H "Content-Type: application/json" -d "{\"requirement\":\"biology lesson about photosynthesis with lab and discussion\"}"
```
