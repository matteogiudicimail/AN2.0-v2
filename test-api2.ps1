$token = (Invoke-RestMethod -Uri "http://localhost:3000/api/auth/dev-token").token
$h = @{ Authorization = "Bearer $token" }

Write-Host "=== Entities ==="
(Invoke-RestMethod -Uri "http://localhost:3000/api/dimensions/entities" -Headers $h) | Format-Table -AutoSize

Write-Host "`n=== Scopes ==="
(Invoke-RestMethod -Uri "http://localhost:3000/api/dimensions/scopes" -Headers $h) | Format-Table -AutoSize

Write-Host "`n=== Currencies ==="
(Invoke-RestMethod -Uri "http://localhost:3000/api/dimensions/currencies" -Headers $h) | Format-Table -AutoSize

Write-Host "`n=== Processes ==="
(Invoke-RestMethod -Uri "http://localhost:3000/api/dimensions/processes" -Headers $h) | Format-Table -AutoSize
