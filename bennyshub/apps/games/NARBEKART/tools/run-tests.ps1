param([ValidateSet('smoke', 'all')][string]$Suite = 'smoke')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../../..'))
$electronPath = Join-Path $projectRoot 'node_modules/electron/dist/electron.exe'
if (-not (Test-Path -LiteralPath $electronPath)) { throw 'Install the hub dependencies first (npm install in the project root).' }
$testRoot = Join-Path $projectRoot 'tmp/nk-tests'
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$oldElectronMode = $env:ELECTRON_RUN_AS_NODE
try {
  $env:ELECTRON_RUN_AS_NODE = $null
  Push-Location -LiteralPath $projectRoot
  try {
    foreach ($check in @('validate_tracks.js','items_ai_test.cjs','race_test.cjs')) {
      & node ('bennyshub/apps/games/NARBEKART/tools/' + $check)
      if ($LASTEXITCODE -ne 0) { throw ($check + ' failed.') }
    }
    $scenarios = @('game-smoke')
    if ($Suite -eq 'all') { $scenarios += @('game-progression','game-features','game-lifecycle','game-tracks','game-presentation','props-catalog','ui-menu-input','ui-race-input','ui-screens','mobile-ui','mobile-race','mobile-interruptions') }
    foreach ($scenario in $scenarios) {
      Write-Host ('Running ' + $scenario)
      $stdoutPath = Join-Path $testRoot ($scenario + '.stdout.log')
      $stderrPath = Join-Path $testRoot ($scenario + '.stderr.log')
      $argsForElectron = @('bennyshub/apps/games/NARBEKART/tools/harness/run.cjs',
        ('bennyshub/apps/games/NARBEKART/tools/harness/' + $scenario + '.cjs'), '--out', ('tmp/nk-tests/' + $scenario))
      $testProcess = Start-Process -FilePath $electronPath -ArgumentList $argsForElectron -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
      Get-Content -LiteralPath $stdoutPath
      if ($testProcess.ExitCode -ne 0) { Get-Content -LiteralPath $stderrPath; throw ($scenario + ' failed. See tmp/nk-tests for screenshots and results.') }
    }
  } finally { Pop-Location }
} finally { $env:ELECTRON_RUN_AS_NODE = $oldElectronMode }
Write-Host 'NARBE Racer checks passed.'
