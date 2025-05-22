# Démarrer le serveur Lockbox en mode simulation
Write-Host "Démarrage du serveur Lockbox en mode simulation..." -ForegroundColor Green

# Chemin de base
$basePath = $PSScriptRoot

# Chemin du serveur
$serverPath = Join-Path -Path $basePath -ChildPath "start_lockbox_sim.py"

# Démarrer le serveur en arrière-plan
$pythonProcess = Start-Process -FilePath "python" -ArgumentList $serverPath, "--host", "localhost" -PassThru -WindowStyle Normal

# Attendre que le serveur démarre
Write-Host "Attente du démarrage du serveur..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Ouvrir le navigateur avec la page HTML
$htmlPath = Join-Path -Path $basePath -ChildPath "templates\serrure.html"
$htmlUrl = "file:///" + $htmlPath.Replace("\", "/")

Write-Host "Ouverture de la page HTML: $htmlUrl" -ForegroundColor Cyan
Start-Process $htmlUrl

Write-Host "Lockbox démarré en mode simulation!" -ForegroundColor Green
Write-Host "Appuyez sur Ctrl+C pour arrêter le serveur..." -ForegroundColor Yellow

try {
    # Attendre que l'utilisateur appuie sur Ctrl+C
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    # Arrêter le serveur Python
    if ($null -ne $pythonProcess -and !$pythonProcess.HasExited) {
        Write-Host "Arrêt du serveur..." -ForegroundColor Yellow
        Stop-Process -Id $pythonProcess.Id -Force
    }
}
