// Configuração do Firebase (firebase.js)
const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "SEU_PROJETO.firebaseapp.com",
    databaseURL: "https://SEU_PROJETO.firebaseio.com",
    projectId: "SEU_PROJETO",
    storageBucket: "SEU_PROJETO.appspot.com",
    messagingSenderId: "SEU_SENDER_ID",
    appId: "SEU_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// Variáveis globais
let playerId, roomId, playerName;
let players = {};
let powerups = {};
let isBridge = false;
let playerX = 0;
let playerY = 0;
let health = 100;
let xp = 0;
let level = 1;
let activePowerups = {};
let gameStarted = false;

// Elementos do DOM
const gameArea = document.getElementById('game-area');
const playerNameElement = document.getElementById('player-name');
const healthFill = document.getElementById('health-fill');
const levelElement = document.getElementById('level');
const xpFill = document.getElementById('xp-fill');
const moveLeftBtn = document.getElementById('move-left-btn');
const moveRightBtn = document.getElementById('move-right-btn');
const bridgeBtn = document.getElementById('bridge-btn');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const powerupsList = document.getElementById('powerups-list');
const gameOverModal = document.getElementById('game-over-modal');
const gameResult = document.getElementById('game-result');
const gameStats = document.getElementById('game-stats');
const returnBtn = document.getElementById('return-btn');

// Sons
const walkSound = document.getElementById('walk-sound');
const bridgeSound = document.getElementById('bridge-sound');
const winSound = document.getElementById('win-sound');
const powerupSound = document.getElementById('powerup-sound');

// Inicialização do jogo
document.addEventListener('DOMContentLoaded', () => {
    // Pegar parâmetros da URL
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('roomId');
    playerId = auth.currentUser?.uid;
    playerName = localStorage.getItem('playerName') || 'Jogador';
    
    if (!roomId || !playerId) {
        window.location.href = 'index.html';
        return;
    }
    
    playerNameElement.textContent = playerName;
    
    // Configurar controles
    setupControls();
    
    // Carregar emojis
    loadEmojis();
    
    // Iniciar listeners do Firebase
    setupFirebaseListeners();
    
    // Adicionar jogador ao jogo
    joinGame();
});

function setupControls() {
    // Controles de movimento
    moveLeftBtn.addEventListener('click', () => movePlayer(-20));
    moveRightBtn.addEventListener('click', () => movePlayer(20));
    
    // Teclado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') movePlayer(-20);
        if (e.key === 'ArrowRight') movePlayer(20);
    });
    
    // Botão de ponte
    bridgeBtn.addEventListener('click', toggleBridge);
    
    // Botão de emoji
    emojiBtn.addEventListener('click', () => {
        emojiPicker.classList.toggle('show');
    });
    
    // Botão de retorno
    returnBtn.addEventListener('click', () => {
        window.location.href = 'sala.html';
    });
}

function movePlayer(dx) {
    if (!gameStarted) return;
    
    const newX = playerX + dx;
    const gameWidth = gameArea.clientWidth;
    
    // Limitar movimento dentro da tela
    if (newX >= 0 && newX <= gameWidth - 50) {
        playerX = newX;
        updatePlayerPosition();
        walkSound.currentTime = 0;
        walkSound.play();
        
        // Atualizar no Firebase
        database.ref(`rooms/${roomId}/players/${playerId}`).update({
            x: playerX,
            isBridge: false
        });
        
        isBridge = false;
        bridgeBtn.textContent = 'Virar Ponte';
    }
}

function toggleBridge() {
    if (!gameStarted) return;
    
    isBridge = !isBridge;
    
    database.ref(`rooms/${roomId}/players/${playerId}`).update({
        isBridge: isBridge
    });
    
    bridgeBtn.textContent = isBridge ? 'Sair da Ponte' : 'Virar Ponte';
    bridgeSound.currentTime = 0;
    bridgeSound.play();
    
    if (isBridge) {
        // Quando vira ponte, para de se mover
        playerY = gameArea.clientHeight - 100;
        database.ref(`rooms/${roomId}/players/${playerId}`).update({
            y: playerY
        });
    }
}

function updatePlayerPosition() {
    const playerElement = document.getElementById(`player-${playerId}`);
    if (playerElement) {
        playerElement.style.left = `${playerX}px`;
        playerElement.style.top = `${playerY}px`;
    }
}

function joinGame() {
    const playerRef = database.ref(`rooms/${roomId}/players/${playerId}`);
    
    playerRef.once('value').then((snapshot) => {
        const playerData = snapshot.val();
        
        if (playerData) {
            // Jogador já existe na sala
            playerX = playerData.x || gameArea.clientWidth / 2;
            playerY = playerData.y || gameArea.clientHeight - 150;
            isBridge = playerData.isBridge || false;
            
            // Atualizar botão de ponte
            bridgeBtn.textContent = isBridge ? 'Sair da Ponte' : 'Virar Ponte';
        } else {
            // Novo jogador
            playerX = gameArea.clientWidth / 2;
            playerY = gameArea.clientHeight - 150;
            
            playerRef.set({
                id: playerId,
                name: playerName,
                x: playerX,
                y: playerY,
                isBridge: false,
                health: 100,
                level: 1,
                xp: 0,
                isConnected: true
            });
        }
        
        // Criar elemento do jogador
        createPlayerElement(playerId, playerName, playerX, playerY, isBridge, true);
    });
    
    // Listener para quando o jogo começar
    database.ref(`rooms/${roomId}/status`).on('value', (snapshot) => {
        const status = snapshot.val();
        if (status === 'playing' && !gameStarted) {
            startGame();
        } else if (status === 'finished') {
            endGame();
        }
    });
}

function startGame() {
    gameStarted = true;
    
    // Gerar power-ups aleatórios
    setInterval(() => {
        if (Math.random() < 0.1) { // 10% de chance de spawnar power-up
            spawnPowerUp();
        }
    }, 10000);
    
    // Verificar pontes e vitória
    setInterval(checkBridges, 1000);
}

function endGame() {
    gameStarted = false;
    
    // Pegar o vencedor
    database.ref(`rooms/${roomId}/winner`).once('value').then((snapshot) => {
        const winnerId = snapshot.val();
        const isWinner = winnerId === playerId;
        
        gameResult.textContent = isWinner ? 'Você Venceu! 🏆' : 'Fim de Jogo!';
        gameStats.textContent = `Nível: ${level} | XP: ${xp}`;
        
        if (isWinner) {
            winSound.play();
            // Dar XP ao vencedor
            xp += 50;
            if (xp >= level * 100) {
                level++;
                xp = 0;
            }
            
            // Atualizar no Firebase
            database.ref(`players/${playerId}`).update({
                level: level,
                xp: xp
            });
        }
        
        gameOverModal.classList.add('show');
    });
}

function createPlayerElement(id, name, x, y, isBridge, isMe = false) {
    let playerElement = document.getElementById(`player-${id}`);
    
    if (!playerElement) {
        playerElement = document.createElement('div');
        playerElement.id = `player-${id}`;
        playerElement.className = `player ${isMe ? 'me' : ''} ${isBridge ? 'bridge' : ''}`;
        playerElement.style.left = `${x}px`;
        playerElement.style.top = `${y}px`;
        
        const nameTag = document.createElement('div');
        nameTag.className = 'player-name';
        nameTag.textContent = name;
        playerElement.appendChild(nameTag);
        
        gameArea.appendChild(playerElement);
    } else {
        playerElement.className = `player ${isMe ? 'me' : ''} ${isBridge ? 'bridge' : ''}`;
        playerElement.style.left = `${x}px`;
        playerElement.style.top = `${y}px`;
    }
    
    return playerElement;
}

function spawnPowerUp() {
    const powerupTypes = ['speed', 'jump', 'shield'];
    const type = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
    const x = Math.random() * (gameArea.clientWidth - 40);
    const y = Math.random() * (gameArea.clientHeight - 200);
    const powerupId = `powerup-${Date.now()}`;
    
    const powerupElement = document.createElement('div');
    powerupElement.id = powerupId;
    powerupElement.className = 'powerup';
    powerupElement.style.left = `${x}px`;
    powerupElement.style.top = `${y}px`;
    powerupElement.style.backgroundImage = `url('../assets/sprites/powerup-${type}.png')`;
    
    powerupElement.addEventListener('click', () => {
        collectPowerUp(powerupId, type);
    });
    
    gameArea.appendChild(powerupElement);
    
    // Remover após 15 segundos se não coletado
    setTimeout(() => {
        if (document.getElementById(powerupId)) {
            gameArea.removeChild(powerupElement);
            delete powerups[powerupId];
        }
    }, 15000);
    
    powerups[powerupId] = { type, x, y, element: powerupElement };
}

function collectPowerUp(powerupId, type) {
    if (!powerups[powerupId]) return;
    
    powerupSound.play();
    gameArea.removeChild(powerups[powerupId].element);
    delete powerups[powerupId];
    
    // Aplicar efeito do power-up
    activePowerups[type] = Date.now() + 10000; // 10 segundos
    
    // Mostrar no HUD
    updatePowerupsList();
    
    // Atualizar no Firebase
    database.ref(`rooms/${roomId}/players/${playerId}/powerups/${type}`).set(
        Date.now() + 10000
    );
    
    // Remover após duração
    setTimeout(() => {
        delete activePowerups[type];
        updatePowerupsList();
        database.ref(`rooms/${roomId}/players/${playerId}/powerups/${type}`).remove();
    }, 10000);
}

function updatePowerupsList() {
    powerupsList.innerHTML = '';
    
    for (const [type, endTime] of Object.entries(activePowerups)) {
        const remaining = Math.ceil((endTime - Date.now()) / 1000);
        if (remaining > 0) {
            const item = document.createElement('div');
            item.className = 'powerup-item';
            
            const icon = document.createElement('div');
            icon.className = 'powerup-icon';
            icon.style.backgroundImage = `url('../assets/sprites/powerup-${type}.png')`;
            
            const text = document.createElement('span');
            text.textContent = `${type} (${remaining}s)`;
            
            item.appendChild(icon);
            item.appendChild(text);
            powerupsList.appendChild(item);
        }
    }
}

function checkBridges() {
    if (!gameStarted) return;
    
    database.ref(`rooms/${roomId}/players`).once('value').then((snapshot) => {
        const playersData = snapshot.val();
        const bridgePlayers = [];
        
        for (const [id, player] of Object.entries(playersData)) {
            if (player.isBridge && player.isConnected) {
                bridgePlayers.push({
                    id,
                    x: player.x
                });
            }
        }
        
        // Ordenar por posição X
        bridgePlayers.sort((a, b) => a.x - b.x);
        
        // Verificar se há uma ponte contínua
        let bridgeStart = null;
        let bridgeEnd = null;
        let prevX = null;
        
        for (const player of bridgePlayers) {
            if (prevX === null) {
                bridgeStart = player.x;
                prevX = player.x;
            } else if (player.x - prevX <= 80) { // Distância máxima entre pontes
                prevX = player.x;
            } else {
                // Quebra na ponte
                bridgeStart = null;
                break;
            }
            
            bridgeEnd = player.x;
        }
        
        // Se há uma ponte válida
        if (bridgeStart !== null && bridgeEnd !== null) {
            database.ref(`rooms/${roomId}`).update({
                bridgeStart,
                bridgeEnd
            });
            
            // Verificar se alguém atravessou
            checkCrossing(bridgeStart, bridgeEnd);
        }
    });
}

function checkCrossing(start, end) {
    database.ref(`rooms/${roomId}/players`).once('value').then((snapshot) => {
        const playersData = snapshot.val();
        
        for (const [id, player] of Object.entries(playersData)) {
            if (!player.isBridge && player.isConnected) {
                // Verificar se o jogador está sobre a ponte
                if (player.x >= start && player.x <= end && player.y >= gameArea.clientHeight - 120) {
                    // Jogador atravessou!
                    database.ref(`rooms/${roomId}`).update({
                        status: 'finished',
                        winner: id
                    });
                    break;
                }
            }
        }
    });
}

function loadEmojis() {
    fetch('emojis.json')
        .then(response => response.json())
        .then(emojis => {
            emojiPicker.innerHTML = '';
            
            emojis.forEach(emoji => {
                const emojiElement = document.createElement('div');
                emojiElement.className = 'emoji';
                emojiElement.textContent = emoji;
                
                emojiElement.addEventListener('click', () => {
                    sendEmoji(emoji);
                    emojiPicker.classList.remove('show');
                });
                
                emojiPicker.appendChild(emojiElement);
            });
        });
}

function sendEmoji(emoji) {
    database.ref(`rooms/${roomId}/players/${playerId}`).update({
        emoji,
        emojiTimestamp: Date.now()
    });
}

function setupFirebaseListeners() {
    // Ouvir atualizações de outros jogadores
    database.ref(`rooms/${roomId}/players`).on('child_changed', (snapshot) => {
        const playerData = snapshot.val();
        const id = snapshot.key;
        
        if (id !== playerId) {
            // Atualizar jogador na tela
            createPlayerElement(
                id, 
                playerData.name, 
                playerData.x, 
                playerData.y, 
                playerData.isBridge
            );
            
            // Mostrar emoji
            if (playerData.emoji && playerData.emojiTimestamp > Date.now() - 1000) {
                showEmoji(id, playerData.emoji);
            }
        }
    });
    
    // Ouvir novos jogadores
    database.ref(`rooms/${roomId}/players`).on('child_added', (snapshot) => {
        const playerData = snapshot.val();
        const id = snapshot.key;
        
        if (id !== playerId) {
            createPlayerElement(
                id, 
                playerData.name, 
                playerData.x, 
                playerData.y, 
                playerData.isBridge
            );
        }
    });
    
    // Ouvir jogadores desconectados
    database.ref(`rooms/${roomId}/players`).on('child_removed', (snapshot) => {
        const id = snapshot.key;
        const playerElement = document.getElementById(`player-${id}`);
        if (playerElement) {
            gameArea.removeChild(playerElement);
        }
    });
}

function showEmoji(playerId, emoji) {
    const playerElement = document.getElementById(`player-${playerId}`);
    if (playerElement) {
        const emojiElement = document.createElement('div');
        emojiElement.className = 'emoji-bubble';
        emojiElement.textContent = emoji;
        
        playerElement.appendChild(emojiElement);
        
        // Animação
        emojiElement.style.animation = 'emojiFloat 2s forwards';
        
        // Remover após animação
        setTimeout(() => {
            if (playerElement.contains(emojiElement)) {
                playerElement.removeChild(emojiElement);
            }
        }, 2000);
    }
}

// Atualizar status quando a janela é fechada
window.addEventListener('beforeunload', () => {
    database.ref(`rooms/${roomId}/players/${playerId}/isConnected`).set(false);
});