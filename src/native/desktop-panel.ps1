$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'DesktopPanel.cs')
  [Console]::WriteLine('{"ready":true}')
} catch {
  [Console]::WriteLine((@{ready=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress))
  exit 1
}
while ($null -ne ($line = [Console]::ReadLine())) {
  $request = $null
  try {
    $request = $line | ConvertFrom-Json
    $mode = [DesktopPanel]::Apply([long]::Parse($request.hwnd),[bool]$request.pinned,[bool]$request.visible,[int]$request.x,[int]$request.y,[int]$request.width,[int]$request.height)
    [Console]::WriteLine((@{id=$request.id;ok=$true;mode=$mode} | ConvertTo-Json -Compress))
  } catch {
    [Console]::WriteLine((@{id=$request.id;ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress))
  }
}
