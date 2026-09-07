$seed = Get-Content 'D:/Data/Project/PilotMetrics/worker/seed.sql'
$seed_full = Get-Content 'D:/Data/Project/PilotMetrics/worker/seed_full.sql'

$codes = New-Object System.Collections.Generic.HashSet[string]

function Extract-Code($line, $index) {
    if ($line -match "VALUES \((.*)\);") {
        $valPart = $matches[1]
        $parts = $valPart.Split(',')
        if ($parts.Count -gt $index) {
            $code = $parts[$index].Trim().Trim("'")
            if ($code -ne "" -and $code -ne "NULL") {
                return $code
            }
        }
    }
    return $null
}

$allFound = New-Object System.Collections.Generic.List[string]

foreach ($line in $seed) {
    if ($line.StartsWith('INSERT OR REPLACE INTO events')) {
        $code = Extract-Code $line 5
        if ($code) { [void]$allFound.Add("seed: $code") }
    }
}

foreach ($line in $seed_full) {
    if ($line.StartsWith('INSERT OR REPLACE INTO events')) {
        $code = Extract-Code $line 6
        if ($code) { [void]$allFound.Add("seed_full: $code") }
    }
}

$allFound
$unique = $allFound | ForEach-Object { $_.Split(': ')[1] } | Select-Object -Unique
"Unique count: " + $unique.Count
$unique | Sort-Object
