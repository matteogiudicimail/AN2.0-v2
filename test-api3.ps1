$token = (Invoke-RestMethod -Uri "http://localhost:3000/api/auth/dev-token").token
$body = '{"filterState":{"entityIds":[100],"scopeId":1,"currencyId":1,"loadIds":[103,203]}}'
$h = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/report/query" -Method Post -Body $body -Headers $h
Write-Host "processColumns: $($r.processColumns.Count)"
$r.processColumns | Format-Table -AutoSize
Write-Host "`nrows: $($r.rows.Count)"
foreach ($row in $r.rows[0..4]) {
  Write-Host "  [$($row.level)] $($row.label) leaf=$($row.isLeaf) values=$($row.values | ConvertTo-Json -Compress)"
}
