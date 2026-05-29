// game.js
// Core game logic (canvas/render/socket/init)
// UI elements are now accessed from global scope (via common.js)

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let worldBlocks = [];
let worldUnits = [];
let camera = { x: 0, y: 0, zoom: 0.5 };
let currentMode = null;
let currentBuildType = null;
let socket = null;
let playerId = null;

// UI State
let isSelecting = false;
let selectionBox = null;
let selectedUnitIds = [];
let isDraggingCamera = false;
let lastMouse = { x: 0, y: 0 };

function initGame() {
    if (!playerId) {
        playerId = localStorage.getItem('rts_player_id');
    }
    
    // Ensure login overlay is hidden when game starts
    if (loginOverlay) loginOverlay.style.display = 'none';

    // If still no ID (shouldn't happen with continueAsGuest, but safety first)
    if (!playerId) {
        playerId = `guest_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('rts_player_id', playerId);
    }
    
    const playerDisplay = document.getElementById('player-display');
    if (playerDisplay) playerDisplay.innerText = `ID: ${playerId}`;
    
    socket = new WebSocket(`ws://${window.location.hostname}:3000/ws/${playerId}`);
    socket.onopen = () => { if (statusEl) statusEl.innerText = "เชื่อมต่อแล้ว: " + playerId; };
    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "INIT") {
            worldBlocks = msg.data.blocks;
            worldUnits = msg.data.units || [];
            if (msg.player_data) updateUI(msg.player_data);
        } else if (msg.type === "UNIT_UPDATE") {
            worldUnits = msg.units;
        } else if (msg.type === "TILE_UPDATE") {
            msg.tiles.forEach(update => {
                const block = worldBlocks.find(b => b.x === update.bx && b.y === update.by);
                if (block) {
                    block.tiles[update.ty][update.tx] = update.tile;
                }
            });
        } else if (msg.type === "RES_UPDATE") {
            updateUI(msg.player_data);
        } else if (msg.type === "ERROR") {
            showNotification(msg.message);
        }
        render();
    };

    if (window.initInput) window.initInput();
}

function updateUI(data) {
    if (resGold) resGold.innerText = Math.floor(data.gold);
    if (resWood) resWood.innerText = Math.floor(data.wood);
    if (resFood) resFood.innerText = Math.floor(data.food);
}

function showNotification(text) {
    const container = document.getElementById('notifications');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'notification';
    div.innerText = text;
    container.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

window.setMode = function(mode) {
    if (currentMode === mode) {
        currentMode = null;
        exploreBtn.classList.remove('active');
        buildBtn.classList.remove('active');
        buildMenu.classList.remove('active');
    } else {
        currentMode = mode;
        exploreBtn.classList.toggle('active', mode === 'explore');
        buildBtn.classList.toggle('active', mode === 'build');
        buildMenu.classList.toggle('active', mode === 'build');
    }
    render();
};

window.setBuildType = function(type) {
    currentBuildType = type;
    ["castle", "tower", "barracks", "archery_range"].forEach(t => {
        const btn = document.getElementById(`btn-${t}`);
        if (btn) btn.classList.toggle('active', t === type);
    });
};

window.showActionPanel = function(type, bx, by, tx, ty) {
    const model = BUILDING_MODELS[type];
    if (!model) return;
    
    panelTitle.innerText = model.title;
    panelContent.innerHTML = `<p>${model.description}</p>`;
    
    model.actions.forEach(act => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.innerHTML = `${act.label}<br><small>${act.sub}</small>`;
        btn.onclick = () => {
            let msgType = "PRODUCE_UNIT";
            if (act.action === "produceGatherer") msgType = "PRODUCE_GATHERER";
            else if (act.action === "produceArcher") msgType = "PRODUCE_ARCHER";
            
            socket.send(JSON.stringify({ type: msgType, bx, by, tx, ty }));
        };
        panelContent.appendChild(btn);
    });

    const sellBtn = document.createElement('button');
    sellBtn.className = 'action-btn';
    sellBtn.style.marginTop = "10px";
    sellBtn.style.background = "#622";
    sellBtn.innerText = "ขายสิ่งก่อสร้าง (คืนทุน 100%)";
    sellBtn.onclick = () => {
        socket.send(JSON.stringify({ type: "SELL_BUILDING", bx, by, tx, ty }));
        closeActionPanel();
    };
    panelContent.appendChild(sellBtn);
    
    actionPanel.classList.add('active');
};

window.closeActionPanel = function() {
    actionPanel.classList.remove('active');
};

window.clearMap = function() {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการล้างแผนที่ทั้งหมด?")) {
        socket.send(JSON.stringify({ type: "CLEAR_MAP" }));
    }
};

window.getValidExpansionSpots = function() {
    const spots = [];
    const ownedBlocks = worldBlocks.filter(b => b.owner === playerId);
    if (ownedBlocks.length === 0) {
        // Find any neutral block that isn't occupied
        worldBlocks.forEach(b => {
            if (!b.owner) spots.push({ x: b.x, y: b.y });
        });
        // If no neutral blocks, allow expanding adjacent to origin
        if (spots.length === 0) spots.push({x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1});
    } else {
        ownedBlocks.forEach(b => {
            [[-1,0], [1,0], [0,-1], [0,1]].forEach(([dx, dy]) => {
                const nx = b.x + dx;
                const ny = b.y + dy;
                if (!worldBlocks.find(ob => ob.x === nx && ob.y === ny)) {
                    if (!spots.find(s => s.x === nx && s.y === ny)) spots.push({ x: nx, y: ny });
                }
            });
        });
    }
    return spots;
};


// Image Cache
const imageCache = {};
function getCachedImage(url) {
    if (!imageCache[url]) {
        const img = new Image();
        img.src = url;
        imageCache[url] = img;
    }
    return imageCache[url];
}

function render() {
    if (!ctx) return;
    ctx.fillStyle = "#4a7c44";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    if (worldBlocks) {
        worldBlocks.forEach(block => {
            const bx = block.x * GAME_CONFIG.blockSize;
            const by = block.y * GAME_CONFIG.blockSize;
            
            // Draw tiles
            for (let ty = 0; ty < 30; ty++) {
                for (let tx = 0; tx < 30; tx++) {
                    const tile = block.tiles[ty][tx];
                    const tx_pix = bx + tx * GAME_CONFIG.tileSize;
                    const ty_pix = by + ty * GAME_CONFIG.tileSize;
                    
                    if (tile.type !== "empty") {
                        const assetUrl = ASSETS[tile.type];
                        if (assetUrl) {
                            const img = getCachedImage(assetUrl);
                            if (img.complete) {
                                // Calculate scale and offset for buildings
                                const model = BUILDING_MODELS[tile.type] || { drawScale: 1, offset: 0 };
                                const size = GAME_CONFIG.tileSize * model.drawScale;
                                const offset = GAME_CONFIG.tileSize * model.offset;
                                ctx.drawImage(img, tx_pix - offset, ty_pix - offset, size, size);
                            } else {
                                ctx.fillStyle = COLORS[tile.type] || "gray";
                                ctx.fillRect(tx_pix, ty_pix, GAME_CONFIG.tileSize, GAME_CONFIG.tileSize);
                            }
                        } else {
                            ctx.fillStyle = COLORS[tile.type] || "gray";
                            ctx.fillRect(tx_pix, ty_pix, GAME_CONFIG.tileSize, GAME_CONFIG.tileSize);
                        }
                        
                        // Health bar
                        if (tile.hp < tile.max_hp) {
                            ctx.fillStyle = "red";
                            ctx.fillRect(tx_pix, ty_pix - 5, GAME_CONFIG.tileSize, 3);
                            ctx.fillStyle = "green";
                            ctx.fillRect(tx_pix, ty_pix - 5, GAME_CONFIG.tileSize * (tile.hp / tile.max_hp), 3);
                        }
                    }
                }
            }
            
            ctx.strokeStyle = "rgba(0,0,0,0.1)";
            ctx.strokeRect(bx, by, GAME_CONFIG.blockSize, GAME_CONFIG.blockSize);
        });
    }

    if (worldUnits) {
        worldUnits.forEach(u => {
            const assetUrl = ASSETS[u.type];
            if (assetUrl) {
                const img = getCachedImage(assetUrl);
                if (img.complete) {
                    ctx.drawImage(img, u.x - 10, u.y - 10, 40, 40);
                } else {
                    ctx.fillStyle = u.owner === playerId ? "blue" : "red";
                    ctx.fillRect(u.x, u.y, 20, 20);
                }
            } else {
                ctx.fillStyle = u.owner === playerId ? "blue" : "red";
                ctx.fillRect(u.x, u.y, 20, 20);
            }
            
            // Selection indicator
            if (typeof selectedUnitIds !== 'undefined' && selectedUnitIds.includes(u.id)) {
                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;
                ctx.strokeRect(u.x - 2, u.y - 2, 24, 24);
            }

            // HP bar
            ctx.fillStyle = "red";
            ctx.fillRect(u.x, u.y - 8, 20, 4);
            ctx.fillStyle = "green";
            ctx.fillRect(u.x, u.y - 8, 20 * (u.hp / u.max_hp), 4);
        });
    }

    // Selection Box
    if (typeof isSelecting !== 'undefined' && isSelecting && selectionBox) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(selectionBox.x1, selectionBox.y1, selectionBox.x2 - selectionBox.x1, selectionBox.y2 - selectionBox.y1);
        ctx.setLineDash([]);
    }

    ctx.restore();
}

initGame();
setInterval(render, 100);
