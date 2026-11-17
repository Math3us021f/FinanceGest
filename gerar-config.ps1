# Lê o .env e gera js/config.js (uso local). Rode: .\gerar-config.ps1
$v = @{}
Get-Content "$PSScriptRoot\.env" | Where-Object { $_ -match '^\s*[^#=]+=' } | ForEach-Object {
  $k, $val = $_ -split '=', 2; $v[$k.Trim()] = $val.Trim()
}
$conteudo = "export const SUPABASE_URL = '$($v.SUPABASE_URL)';`nexport const SUPABASE_ANON_KEY = '$($v.SUPABASE_ANON_KEY)';`n"
[IO.File]::WriteAllText("$PSScriptRoot\js\config.js", $conteudo, (New-Object Text.UTF8Encoding $false))
Write-Host 'js/config.js gerado.'
