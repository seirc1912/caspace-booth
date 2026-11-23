# Gỡ app gửi ảnh phòng chụp (rollback): dừng tác vụ tự chạy, giữ nguyên ảnh trong Pictures.
$ErrorActionPreference = "SilentlyContinue"
Stop-ScheduledTask -TaskName "Caspace Booth Agent"
Unregister-ScheduledTask -TaskName "Caspace Booth Agent" -Confirm:$false
Remove-Item "$([Environment]::GetFolderPath('Desktop'))\Gửi ảnh Caspace.url" -Force
Write-Host "Đã gỡ tác vụ tự chạy. Có thể xoá thư mục C:\CaspaceBooth nếu không dùng nữa."
