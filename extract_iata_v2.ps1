$raw_full = Get-Content 'D:/Data/Project/PilotMetrics/worker/seed_full.sql' -Raw
$matches_full = [regex]::Matches($raw_full, 'INSERT\s+(?:OR\s+REPLACE\s+|OR\s+IGNORE\s+)?INTO\s+events\s*\([^)]+\)\s*VALUES\s*\(([^)]+)\);', [System.Text.RegularExpressions.RegexOptions]::Singleline)

$excluded = New-Object System.Collections.Generic.HashSet[string]
$included = New-Object System.Collections.Generic.HashSet[string]

foreach ($m in $matches_full) {
    $valPart = $m.Groups[1].Value
    $parts = $valPart.Split(',')
    if ($parts.Count -gt 6) {
        $code = $parts[6].Trim().Trim("'")
        if ($code -ne "" -and $code -ne "NULL") {
            if ($code.Length -eq 3 -and $code -match "^[A-Z]{3}$") {
                [void]$included.Add($code)
            } else {
                [void]$excluded.Add($code)
            }
        }
    }
}
"Included:"
$included | Sort-Object
"Excluded:"
$excluded | Sort-Object
"Total Included: " + $included.Count
