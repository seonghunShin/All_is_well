param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4000
)

$ErrorActionPreference = 'Stop'
$base = "http://127.0.0.1:$Port/api/reservations"
$queue = Invoke-RestMethod -Method Post -Uri "$base/queue" -TimeoutSec 8
$headers = @{ 'X-Queue-Token' = $queue.token }
$admission = Invoke-RestMethod -Uri "$base/queue" -Headers $headers -TimeoutSec 8
if ($admission.state -ine 'ADMITTED') {
    throw "The demo session is waiting at position $($admission.position). Run again when an admission slot is available."
}

$flight = "GMP-CJU-DEMO-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$body = @{ flightKey = $flight; seats = @('13A') } | ConvertTo-Json -Compress
$hold = Invoke-RestMethod -Method Post -Uri "$base/holds" -Headers $headers `
    -Body $body -ContentType 'application/json' -TimeoutSec 8
$confirmUri = "$base/holds/$($hold.holdId)/confirm"
$receipt = Invoke-RestMethod -Method Post -Uri $confirmUri -Headers $headers -TimeoutSec 8
$retry = Invoke-RestMethod -Method Post -Uri $confirmUri -Headers $headers -TimeoutSec 8
if (-not $receipt.reservationId -or $receipt.reservationId -ne $retry.reservationId) {
    throw 'Confirmation retry did not return the original reservation.'
}

[pscustomobject]@{
    Admission = $admission.state
    Flight = $receipt.flightKey
    Seats = $receipt.seats -join ', '
    Reservation = $receipt.reservationId
    RetryReturnedSameReservation = $true
}
