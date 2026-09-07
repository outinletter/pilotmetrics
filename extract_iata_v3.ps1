$allFoundValues = New-Object System.Collections.Generic.HashSet[string]

function Process-File($path, $index) {
    $raw = Get-Content $path -Raw
    $options = [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    $matches = [regex]::Matches($raw, 'INSERT\s+(?:OR\s+REPLACE\s+|OR\s+IGNORE\s+)?INTO\s+events.*?VALUES\s*\((.*?)\);', $options)
    foreach ($m in $matches) {
        $valPart = $m.Groups[1].Value

        $parts = New-Object System.Collections.Generic.List[string]
        $current = ""
        $inQuotes = $false
        for ($i = 0; $i -lt $valPart.Length; $i++) {
            $char = $valPart[$i]
            if ($char -eq "'" -and ($i -eq 0 -or $valPart[$i-1] -ne "\")) {
                $inQuotes = -not $inQuotes
            }
            if ($char -eq "," -and -not $inQuotes) {
                [void]$parts.Add($current.Trim())
                $current = ""
            } else {
                $current += $char
            }
        }
        [void]$parts.Add($current.Trim())

        if ($parts.Count -gt $index) {
            $code = $parts[$index].Trim().Trim("'")
            if ($code -ne "" -and $code -ne "NULL") {
                [void]$allFoundValues.Add($code)
            }
        }
    }
}

Process-File 'D:/Data/Project/PilotMetrics/worker/seed.sql' 5
Process-File 'D:/Data/Project/PilotMetrics/worker/seed_full.sql' 6

$allFoundValues | Sort-Object
"Unique non-empty count: " + $allFoundValues.Count
