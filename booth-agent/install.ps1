# Cài app gửi ảnh phòng chụp Caspace (chạy bằng PowerShell "Run as Administrator").
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
param(
  [string]$InstallDir = "C:\CaspaceBooth",
  [string]$ApiBaseUrl = "https://caspace.vn",
  [string]$WatchRoot = "C:\Users\ADMIN\Pictures"
)
$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Chưa có Node.js. Đang cài Node.js LTS bằng winget..."
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}
$nodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) { throw "Cần Node.js 22 trở lên (đang có $(node --version))." }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path "$PSScriptRoot\package.json", "$PSScriptRoot\tsconfig.json", "$PSScriptRoot\README.md" -Destination $InstallDir -Force
Copy-Item -Path "$PSScriptRoot\src" -Destination $InstallDir -Recurse -Force
Push-Location $InstallDir
npm install --omit=dev --no-audit --no-fund
Pop-Location

$configPath = Join-Path $InstallDir "config.json"
if (-not (Test-Path $configPath)) {
  $boothId = Read-Host "Mã phòng (ví dụ booth-1)"
  $boothKey = Read-Host "Mã bí mật của máy này (chủ quán cung cấp)"
  $config = [ordered]@{ apiBaseUrl = $ApiBaseUrl; boothId = $boothId; boothKey = $boothKey; watchRoot = $WatchRoot; concurrency = 1; statusPort = 47821 }
  $config | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8
  # Chỉ tài khoản đang đăng nhập và Administrators đọc được file chứa mã bí mật.
  icacls $configPath /inheritance:r /grant:r "$($env:USERNAME):(R,W)" "Administrators:(F)" | Out-Null
}

# Tự chạy khi đăng nhập Windows, chạy nền, tự khởi động lại nếu bị tắt.
$taskName = "Caspace Booth Agent"
$node = (Get-Command node).Source
$tsx = Join-Path $InstallDir "node_modules\tsx\dist\esm\index.mjs"
$action = New-ScheduledTaskAction -Execute $node -Argument "--import `"file:///$($tsx -replace '\\','/')`" src\main.ts config.json" -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -Priority 7
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

# Lối tắt trên màn hình để nhân viên xem trạng thái.
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\Gửi ảnh Caspace.url")
$shortcut.TargetPath = "http://127.0.0.1:47821/"
$shortcut.Save()

Write-Host "Đã cài xong. Mở lối tắt 'Gửi ảnh Caspace' trên màn hình để xem trạng thái."
