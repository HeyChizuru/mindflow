# 补充用例

先跑 [SKILL.md](SKILL.md) 的 setup。响应一律 `-o` 再用 `Read-Utf8File`，不要 `$r = curl.exe`。

**提示词太短 → 400**

```powershell
$path = Write-JsonBodyFile "short.json" '{"requirements":{"requirement":"太短"}}'
curl.exe -s -o "$tmpdir\short-res.json" -w "`nHTTP:%{http_code}`n" -X POST "$base/api/stages" -H "Content-Type: application/json" --data-binary "@$path"
Read-Utf8File "$tmpdir\short-res.json"
```

**只传 PDF → 400，`requirements is required`**

```powershell
curl.exe -s -o "$tmpdir\pdf-only.json" -w "`nHTTP:%{http_code}`n" -X POST "$base/api/stages" -F "pdf=@C:\path\to\file.pdf;type=application/pdf"
Read-Utf8File "$tmpdir\pdf-only.json"
```

**空白昵称与背景 → 201，响应里没有这两个键**

```powershell
$path = Write-JsonBodyFile "blank.json" '{"requirements":{"requirement":"设计一节关于光合作用的高中生物课，包含实验演示和小组讨论","userNickname":"  ","userBio":""}}'
curl.exe -s -o "$tmpdir\blank-res.json" -X POST "$base/api/stages" -H "Content-Type: application/json" --data-binary "@$path"
Read-Utf8File "$tmpdir\blank-res.json"
```
