# PowerShell script to start the Lockbox Simulator components
# This script launches the WebSocket server for the Arduino connection

# Define color constants
$Red = "Red"
$Green = "Green" 
$Yellow = "Yellow"
$White = "White"

# Setup paths
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Join-Path -Path $ProjectRoot -ChildPath "server"
$TemplatesDir = Join-Path -Path $ProjectRoot -ChildPath "templates"

# Function to display messages with colors
function Write-ColoredMessage {
    param (
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host "`n[$([DateTime]::Now.ToString('HH:mm:ss'))] " -NoNewline
    Write-Host $Message -ForegroundColor $Color
}

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-ColoredMessage "Using Python: $pythonVersion" $Green
}
catch {
    Write-ColoredMessage "Python is not installed or not in PATH. Please install Python 3.6+ to run this server." $Red
    exit 1
}

# Check if pip requirements are installed
if (-not (Test-Path -Path "$ServerDir\requirements.txt")) {
    Write-ColoredMessage "requirements.txt not found in the server directory" $Red
    exit 1
}

# Install Python requirements if needed
Write-ColoredMessage "Checking Python dependencies..." $Yellow
Push-Location $ServerDir
python -m pip install -r requirements.txt
Pop-Location

# Function to apply JavaScript fixes to HTML file
function Apply-JsFixes {
    $htmlFile = Join-Path -Path $TemplatesDir -ChildPath "serrure.html"
    $jsFixFile = Join-Path -Path $TemplatesDir -ChildPath "fixed_joystick.js"
    $backupFile = "$htmlFile.backup"
    
    # If fixed_joystick.js doesn't exist, try fix_joystick.js
    if (-not (Test-Path -Path $jsFixFile)) {
        $jsFixFile = Join-Path -Path $TemplatesDir -ChildPath "fix_joystick.js"
        if (-not (Test-Path -Path $jsFixFile)) {
            Write-ColoredMessage "JavaScript fix file not found. HTML interface may not work correctly." $Red
            return $false
        }
    }
    
    # Create backup if it doesn't exist
    if (-not (Test-Path -Path $backupFile)) {
        Copy-Item -Path $htmlFile -Destination $backupFile
        Write-ColoredMessage "Created backup of HTML file at $backupFile" $Green
    }
    
    # Check if fix is already applied
    $htmlContent = Get-Content -Path $htmlFile -Raw
    if ($htmlContent -match "fixed_joystick.js" -or $htmlContent -match "fix_joystick.js") {
        Write-ColoredMessage "JavaScript fix already applied to HTML file." $Green
        return $true
    }
    
    # Read the JS fix
    $jsContent = Get-Content -Path $jsFixFile -Raw
    
    # Find the closing body tag
    if ($htmlContent -match "</body>") {
        # Insert the script before the closing body tag
        $scriptTag = "`n<script>`n// Fixed joystick handlers`n$jsContent`n</script>`n"
        $newHtmlContent = $htmlContent -replace "</body>", "$scriptTag</body>"
        
        # Write the modified HTML
        Set-Content -Path $htmlFile -Value $newHtmlContent
        Write-ColoredMessage "Successfully applied JavaScript fix to HTML file." $Green
        return $true
    } else {
        Write-ColoredMessage "Could not find </body> tag in HTML file." $Red
        return $false
    }
}

# Function to open a file in the default browser
function Open-InBrowser {
    param (
        [string]$FilePath
    )
    
    Start-Process $FilePath
    Write-ColoredMessage "Opening $FilePath in browser" $Green
}

# Function to start the WebSocket server
function Start-WebSocketServer {
    Write-ColoredMessage "Starting WebSocket server..." $Yellow
    Push-Location $ServerDir
    python ws_server.py
    Pop-Location
}

# Function to start the Lockbox with all fixes applied
function Start-FixedLockbox {
    # Apply JS fixes to HTML file
    $fixesApplied = Apply-JsFixes
    if (-not $fixesApplied) {
        Write-ColoredMessage "Warning: Not all fixes could be applied." $Yellow
    }
    
    # Open browser to HTML interface
    $htmlPath = Join-Path -Path $TemplatesDir -ChildPath "serrure.html"
    Open-InBrowser $htmlPath
    
    # Start WebSocket server
    Start-WebSocketServer
}

# Display menu options
function Show-Menu {
    Write-Host "`n================ Lockbox Simulator ================" -ForegroundColor Cyan
    Write-Host "1. Start WebSocket Server"
    Write-Host "2. Open HTML Interface"
    Write-Host "3. Test Arduino Connection"
    Write-Host "4. Start Server & Open HTML Interface"
    Write-Host "5. Start Server with All Fixes Applied"
    Write-Host "Q. Quit"
    Write-Host "=================================================" -ForegroundColor Cyan
    
    $choice = Read-Host "`nSelect an option"
    
    switch ($choice) {
        "1" {
            Start-WebSocketServer
        }
        "2" {
            $htmlPath = Join-Path -Path $TemplatesDir -ChildPath "serrure.html"
            Open-InBrowser $htmlPath
            Show-Menu
        }
        "3" {
            Write-ColoredMessage "Testing Arduino connection..." $Yellow
            Push-Location $ServerDir
            python app_game_control.py
            Pop-Location
            Show-Menu
        }
        "4" {
            # Open browser to HTML interface
            $htmlPath = Join-Path -Path $TemplatesDir -ChildPath "serrure.html"
            Open-InBrowser $htmlPath
            
            # Start WebSocket server
            Start-WebSocketServer
        }
        "5" {
            Start-FixedLockbox
        }
        "Q" {
            Write-ColoredMessage "Exiting..." $Yellow
            exit 0
        }
        "q" {
            Write-ColoredMessage "Exiting..." $Yellow
            exit 0
        }
        default {
            Write-ColoredMessage "Invalid option. Please try again." $Red
            Show-Menu
        }
    }
}

# Display project banner
Write-Host "`n==============================================" -ForegroundColor Cyan
Write-Host "    Lockbox Simulator for Roleplaying Games    " -ForegroundColor Green
Write-Host "    Arduino-based Lockpicking Simulation       " -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan

# Start the menu
Show-Menu
