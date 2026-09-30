# Zero-dependency static file server for local development.
# ES modules can't be loaded from file://, so the app needs to be served over http.
#   powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 5173] [-Root .] [-AllowSave]
#
# -AllowSave lets dev tools (e.g. tools/generate-daily.html) write their output:
#   POST /__save/<file-name>  →  tools/output/<file-name>
# Leave it off otherwise.
param(
  [int]$Port = 5173,
  [string]$Root = $PSScriptRoot,
  [switch]$AllowSave
)

$Root = (Resolve-Path $Root).Path
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
  '.md'   = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root at http://localhost:$Port/ (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($ctx.Request.HttpMethod -eq 'POST') {
        $name = $rel -replace '^__save/', ''
        if (-not $AllowSave -or $rel -notlike '__save/*' -or $name -notmatch '^[A-Za-z0-9._-]{1,100}$') {
          $res.StatusCode = 403
          $bytes = [Text.Encoding]::UTF8.GetBytes('Saving is disabled')
        } else {
          $outDir = Join-Path $Root 'tools\output'
          New-Item -ItemType Directory -Force $outDir | Out-Null
          $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
          [IO.File]::WriteAllText((Join-Path $outDir $name), $reader.ReadToEnd(), (New-Object Text.UTF8Encoding($false)))
          $bytes = [Text.Encoding]::UTF8.GetBytes('Saved tools/output/' + $name)
        }
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        Write-Host "$($res.StatusCode) POST /$rel"
        continue
      }
      if ($rel -eq '') { $rel = 'index.html' }
      $path = [IO.Path]::GetFullPath((Join-Path $Root $rel))
      if (Test-Path $path -PathType Container) { $path = Join-Path $path 'index.html' }
      if (-not $path.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $path -PathType Leaf)) {
        $res.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
      } else {
        $ext = [IO.Path]::GetExtension($path).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-store')
        $bytes = [IO.File]::ReadAllBytes($path)
      }
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host "$($res.StatusCode) /$rel"
    } catch {
      $res.StatusCode = 500
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
