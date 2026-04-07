$token = (Invoke-RestMethod -Uri "http://localhost:3000/api/auth/dev-token").token
$body = '{"filterState":{"entityIds":[1],"scopeId":1,"currencyId":1,"loadIds":[1,2]}}'
$headers = @{
  Authorization = "Bearer $token"
  "Content-Type" = "application/json"
}
try {
  $r = Invoke-RestMethod -Uri "http://localhost:3000/api/report/query" -Method Post -Body $body -Headers $headers
  Write-Host "=== processColumns ==="
  Write-Host "count: $($r.processColumns.Count)"
  $r.processColumns | Format-Table -AutoSize
  Write-Host "`n=== rows ==="
  Write-Host "count: $($r.rows.Count)"
  if ($r.rows.Count -gt 0) {
    Write-Host "First row:"
    Write-Host "  label: $($r.rows[0].label)"
    Write-Host "  dataPath: $($r.rows[0].dataPath -join ' > ')"
    Write-Host "  isLeaf: $($r.rows[0].isLeaf)"
    Write-Host "  values: $($r.rows[0].values | ConvertTo-Json -Compress)"
  }
} catch {
  Write-Host "Error: $($_.Exception.Message)"
  Write-Host "Response: $($_.ErrorDetails.Message)"
}
