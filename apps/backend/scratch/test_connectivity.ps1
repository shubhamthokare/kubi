# ==============================================================================
# Kubi AI  Connectivity and SRE Verification Script
# ==============================================================================

$backendUrl = "http://localhost:8000"
$reportPath = "C:\Users\shubh\.gemini\antigravity\brain\07ef711a-f6eb-4ae3-a3d3-f32823a65231\connectivity_report.md"

# Initialize report file
$header = "# [Kubi] Kubi AI Connectivity & SRE Diagnostics Report`n`nGenerated on: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n`n---`n`n##  Validation Results"

$header | Out-File -FilePath $reportPath -Force

# Helper to format output
function Show-Result($methodName, $response) {
    $statusText = ""
    $color = "Cyan"
    if ($response.status -eq "success") {
        $statusText = "[OK] SUCCESS: $($response.message)"
        $color = "Green"
    } else {
        $statusText = "[FAIL] FAILED: $($response.message)"
        $color = "Red"
    }

    Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "Results for: $methodName" -ForegroundColor Yellow
    Write-Host $statusText -ForegroundColor $color

    # Write to report file
    "### $methodName" | Out-File -FilePath $reportPath -Append
    "* **Status**: $($response.status)" | Out-File -FilePath $reportPath -Append
    "* **Message**: $($response.message)" | Out-File -FilePath $reportPath -Append
    if ($response.detail) {
        "* **Details**:" | Out-File -FilePath $reportPath -Append
        '```json' | Out-File -FilePath $reportPath -Append
        ($response.detail | ConvertTo-Json -Depth 4) | Out-File -FilePath $reportPath -Append
        '```' | Out-File -FilePath $reportPath -Append
    }
    "" | Out-File -FilePath $reportPath -Append
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "[Kubi] STARTING KUBI AI CONNECTIVITY DIAGNOSTICS" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# [Gemini] CHECK GEMINI CONNECTIVITY
# ------------------------------------------------------------------------------
Write-Host "`n[1/5] Checking Gemini AI Connectivity..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$backendUrl/api/gemini/validate" -Method POST -ContentType "application/json" -Body "{}"
    Show-Result "Gemini AI (Default/DB config)" $response
} catch {
    $err = $_
    Write-Host "[FAIL] Request to backend failed: $err" -ForegroundColor Red
    "### Gemini AI (Default/DB config)" | Out-File -FilePath $reportPath -Append
    "* **Status**: failed" | Out-File -FilePath $reportPath -Append
    "* **Message**: Request to backend failed - $err" | Out-File -FilePath $reportPath -Append
    "" | Out-File -FilePath $reportPath -Append
}

# ------------------------------------------------------------------------------
# [Agent] METHOD 1: AGENT URL
# ------------------------------------------------------------------------------
Write-Host "`n[2/5] Testing Method 1: Agent URL..." -ForegroundColor Cyan
$agentPayload = @{
    auth_type = "agent"
    agent_url = "http://kubi-agent-service:8080"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$backendUrl/api/clusters/validate" -Method POST -ContentType "application/json" -Body $agentPayload
    Show-Result "Method 1 (Agent URL)" $response
} catch {
    $err = $_
    Write-Host "[FAIL] Request failed: $err" -ForegroundColor Red
    "### Method 1 (Agent URL)" | Out-File -FilePath $reportPath -Append
    "* **Status**: failed" | Out-File -FilePath $reportPath -Append
    "* **Message**: Request failed - $err" | Out-File -FilePath $reportPath -Append
    "" | Out-File -FilePath $reportPath -Append
}

# ------------------------------------------------------------------------------
# [Direct] METHOD 2: DIRECT CREDENTIALS
# ------------------------------------------------------------------------------
Write-Host "`n[3/5] Testing Method 2: Direct Credentials..." -ForegroundColor Cyan

$caPath = "C:\Users\shubh\.minikube\ca.crt"
$certPath = "C:\Users\shubh\.minikube\profiles\minikube\client.crt"
$keyPath = "C:\Users\shubh\.minikube\profiles\minikube\client.key"

if (-not (Test-Path $caPath) -or -not (Test-Path $certPath) -or -not (Test-Path $keyPath)) {
    Write-Host "[WARN] Warning: Minikube credential paths not found!" -ForegroundColor Yellow
    $caCert = ""
    $clientCert = ""
    $clientKey = ""
    $caB64 = ""
    $certB64 = ""
    $keyB64 = ""
} else {
    $caCert = [System.IO.File]::ReadAllText($caPath).Trim()
    $clientCert = [System.IO.File]::ReadAllText($certPath).Trim()
    $clientKey = [System.IO.File]::ReadAllText($keyPath).Trim()

    $caB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($caCert))
    $certB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($clientCert))
    $keyB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($clientKey))
}

$directPayload = @{
    auth_type = "direct"
    api_endpoint = "https://kubernetes.default.svc"
    ca_cert = $caCert
    client_cert = $clientCert
    client_key = $clientKey
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$backendUrl/api/clusters/validate" -Method POST -ContentType "application/json" -Body $directPayload
    Show-Result "Method 2 (Direct Credentials)" $response
} catch {
    $err = $_
    Write-Host "[FAIL] Request failed: $err" -ForegroundColor Red
    "### Method 2 (Direct Credentials)" | Out-File -FilePath $reportPath -Append
    "* **Status**: failed" | Out-File -FilePath $reportPath -Append
    "* **Message**: Request failed - $err" | Out-File -FilePath $reportPath -Append
    "" | Out-File -FilePath $reportPath -Append
}

# ------------------------------------------------------------------------------
# [Kubeconfig] METHOD 3: KUBECONFIG UPLOAD
# ------------------------------------------------------------------------------
Write-Host "`n[4/5] Testing Method 3: Kubeconfig Upload..." -ForegroundColor Cyan

$kubeconfigStr = "apiVersion: v1`nkind: Config`nclusters:`n- cluster:`n    server: https://kubernetes.default.svc`n    certificate-authority-data: $caB64`n  name: dynamic-cluster`ncontexts:`n- context:`n    cluster: dynamic-cluster`n    user: dynamic-user`n    namespace: default`n  name: dynamic-context`ncurrent-context: dynamic-context`nusers:`n- name: dynamic-user`n  user:`n    client-certificate-data: $certB64`n    client-key-data: $keyB64"

$kubeconfigPayload = @{
    auth_type = "kubeconfig"
    kubeconfig = $kubeconfigStr
    ca_cert = $caCert
    client_cert = $clientCert
    client_key = $clientKey
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$backendUrl/api/clusters/validate" -Method POST -ContentType "application/json" -Body $kubeconfigPayload
    Show-Result "Method 3 (Kubeconfig Upload)" $response
} catch {
    $err = $_
    Write-Host "[FAIL] Request failed: $err" -ForegroundColor Red
    "### Method 3 (Kubeconfig Upload)" | Out-File -FilePath $reportPath -Append
    "* **Status**: failed" | Out-File -FilePath $reportPath -Append
    "* **Message**: Request failed - $err" | Out-File -FilePath $reportPath -Append
    "" | Out-File -FilePath $reportPath -Append
}

# ------------------------------------------------------------------------------
# [Logs] COLLECT SERVICE LOGS
# ------------------------------------------------------------------------------
Write-Host "`n[5/5] Fetching Logs from Core Services..." -ForegroundColor Cyan

"## [Logs] Service Logs Summary" | Out-File -FilePath $reportPath -Append

$services = @("kubi-backend", "kubi-agent", "kubi-frontend", "elasticsearch", "mongodb")
foreach ($svc in $services) {
    Write-Host "`n--- Logs for: $svc ---" -ForegroundColor Blue
    "### Logs: $svc" | Out-File -FilePath $reportPath -Append
    try {
        $podName = (kubectl get pods -n kubi -l "app=$svc" -o jsonpath="{.items[0].metadata.name}" 2>$null)
        if (-not $podName) {
            $podName = (kubectl get pods -n kubi -l "common.k8s.elastic.co/type=elasticsearch" -o jsonpath="{.items[0].metadata.name}" 2>$null)
        }
        if (-not $podName) {
            $podName = (kubectl get pods -n kubi -l "app.kubernetes.io/name=$svc" -o jsonpath="{.items[0].metadata.name}" 2>$null)
        }

        if ($podName) {
            Write-Host "Found pod: $podName" -ForegroundColor DarkGray
            $logs = (kubectl logs $podName -n kubi --tail=25 2>&1 | Out-String)
            '```' | Out-File -FilePath $reportPath -Append
            $logs | Out-File -FilePath $reportPath -Append
            '```' | Out-File -FilePath $reportPath -Append
        } else {
            Write-Host "Could not locate pod for service: $svc" -ForegroundColor Yellow
            "* *Could not locate pod for service: $svc*" | Out-File -FilePath $reportPath -Append
        }
    } catch {
        $err = $_
        Write-Host "[FAIL] Failed to fetch logs for ${svc} - $err" -ForegroundColor Red
        "* *Failed to fetch logs for ${svc}: $err*" | Out-File -FilePath $reportPath -Append
    }
    "" | Out-File -FilePath $reportPath -Append
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "[Kubi] DIAGNOSTICS COMPLETED!" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
