$ErrorActionPreference = 'Stop'

function Resolve-JavaHome {
  $candidates = @(
    'C:\Program Files\Eclipse Adoptium',
    'C:\Program Files\Java',
    'C:\Program Files (x86)\Eclipse Adoptium',
    'C:\Program Files (x86)\Java',
    (Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Java')
  )

  foreach ($root in $candidates) {
    if (-not (Test-Path $root)) { continue }
    $javaExe = Get-ChildItem -Path $root -Recurse -Filter java.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '\\bin\\java\.exe$' } |
      Select-Object -First 1
    if ($javaExe) {
      return Split-Path (Split-Path $javaExe.FullName -Parent) -Parent
    }
  }

  throw 'No Java 17 installation found. Install JDK 17 first.'
}

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
  throw "adb.exe not found at $adb"
}

$env:JAVA_HOME = Resolve-JavaHome
$env:PATH = "$(Split-Path $adb -Parent);$env:JAVA_HOME\bin;$env:PATH"

Write-Host "JAVA_HOME=$env:JAVA_HOME"

& $adb start-server | Out-Null
Write-Host (& $adb devices -l)

npx react-native run-android
