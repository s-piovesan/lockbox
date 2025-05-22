// Fonction corrigée pour la connexion WebSocket
function connectWebSocket() {
    try {
        // Debug logs
        addLogEntry('Tentative de connexion WebSocket...', 'info');
        console.log('Tentative de connexion WebSocket...');
        
        // Récupère l'hôte depuis l'URL ou utilise localhost
        const host = window.location.hostname || 'localhost';
        console.log('Hôte: ' + host);
        
        // Utilise un port spécifique
        const wsUrl = `ws://${host}:8765`;
        console.log('URL WebSocket: ' + wsUrl);
        
        // Affiche l'état de connexion
        wsStatus.textContent = 'Connexion en cours...';
        wsStatus.className = 'status';
        wsIndicator.className = 'status-indicator';
        document.querySelector('.status-container').classList.add('connecting');
        
        // Réinitialise l'état de l'Arduino
        updateArduinoStatus(null);
        
        // Crée une nouvelle connexion WebSocket
        websocket = new WebSocket(wsUrl);
        
        // Définit un timeout pour la connexion
        const connectionTimeout = setTimeout(() => {
            if (websocket.readyState !== WebSocket.OPEN) {
                addLogEntry('Timeout de connexion WebSocket', 'error');
                websocket.close();
            }
        }, 5000);
        
        // Gestionnaire d'événement d'ouverture de connexion
        websocket.onopen = function(event) {
            clearTimeout(connectionTimeout);
            wsStatus.textContent = 'Connecté';
            wsStatus.className = 'status connected';
            wsIndicator.className = 'status-indicator connected';
            document.querySelector('.status-container').classList.remove('connecting');
            addLogEntry('Connexion WebSocket établie', 'info');
            console.log('Connexion WebSocket établie');
            
            // Envoie un ping pour vérifier l'état du serveur
            sendMessage({
                type: 'ping'
            });
            
            // Demande l'état initial du serveur
            sendMessage({
                type: 'get_state'
            });
        };
        
        // Gestionnaire d'événement de fermeture de connexion
        websocket.onclose = function(event) {
            clearTimeout(connectionTimeout);
            wsStatus.textContent = 'Déconnecté';
            wsStatus.className = 'status disconnected';
            wsIndicator.className = 'status-indicator disconnected';
            arduinoStatus.textContent = 'Inconnu';
            arduinoStatus.className = 'status disconnected';
            arduinoIndicator.className = 'status-indicator disconnected';
            
            // Réinitialise l'état d'authentification
            isAuthenticated = false;
            isAdmin = false;
            resetUIState();
            
            addLogEntry('Connexion WebSocket fermée: ' + (event.reason || 'Raison inconnue'), 'error');
            console.log('Connexion WebSocket fermée: ' + (event.reason || 'Raison inconnue'));
            
            // Essaie de se reconnecter après un délai
            setTimeout(connectWebSocket, 3000);
        };
        
        // Gestionnaire d'événement d'erreur
        websocket.onerror = function(event) {
            console.error('Erreur WebSocket', event);
            addLogEntry('Erreur WebSocket', 'error');
        };
        
        // Gestionnaire d'événement de message
        websocket.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                console.log('Message reçu:', data);
                processWebSocketMessage(data);
            } catch (error) {
                console.error('Erreur de traitement du message:', error);
                addLogEntry(`Erreur de traitement du message: ${error}`, 'error');
            }
        };
    } catch (e) {
        console.error('Erreur lors de la création de la connexion WebSocket:', e);
        addLogEntry(`Erreur lors de la création de la connexion WebSocket: ${e}`, 'error');
        
        // Essaie de se reconnecter après un délai
        setTimeout(connectWebSocket, 5000);
    }
}

// Fonction améliorée pour envoyer des messages
function sendMessage(message) {
    if (!websocket) {
        console.error('Pas de connexion WebSocket disponible');
        return false;
    }
    
    if (websocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket non connecté. État:', websocket.readyState);
        return false;
    }
    
    try {
        console.log('Envoi du message:', message);
        websocket.send(JSON.stringify(message));
        return true;
    } catch (e) {
        console.error('Erreur lors de l\'envoi du message:', e);
        return false;
    }
}
