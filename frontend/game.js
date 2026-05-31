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
let attackEffects = []; // { x1, y1, x2, y2, time, type }

// UI State
let isSelecting = false;
let selectionBox = null;
let selectedUnitIds = [];
let selectedBuilding = null; // { bx, by, tx, ty, type }
let isDraggingCamera = false;
let lastMouse = { x: 0, y: 0 };

function initGame() {
    if (!playerId) {
        playerId = localStorage.getItem('rts_player_id');
    }
    
    if (loginOverlay) loginOverlay.style.display = 'none';

    if (!playerId) {
        playerId = `guest_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('rts_player_id', playerId);
    }
    
    const playerDisplay = document.getElementById('player-display');
    if (playerDisplay) playerDisplay.innerText = `ID: ${playerId}`;
    
    if (statusEl) statusEl.innerText = "กำลังเชื่อมต่อ...";
    socket = new WebSocket(`${wsUrl}/ws/${playerId}`);
    
    socket.onopen = () => { 
        if (statusEl) {
            statusEl.innerText = "เชื่อมต่อแล้ว: " + playerId;
            statusEl.style.color = "#0f0";
        }
    };
    
    socket.onclose = () => {
        if (statusEl) {
            statusEl.innerText = "การเชื่อมต่อหลุด...";
            statusEl.style.color = "#f00";
        }
    };

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
        } else if (msg.type === "ATTACK_EVENT") {
            attackEffects.push({
                x1: msg.attacker.x, y1: msg.attacker.y,
                x2: msg.target.x, y2: msg.target.y,
                type: msg.attacker.type,
                time: Date.now()
            });
        } else if (msg.type === "ERROR") {
            showNotification(msg.message);
        }
        render();
    };

    if (window.initInput) window.initInput();
}

window.safeSend = function(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    } else {
        console.warn("WebSocket not ready. Message dropped:", data);
        showNotification("กำลังเชื่อมต่อเซิร์ฟเวอร์... กรุณารอสักครู่");
    }
};

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

function showActionPanel(type, bx, by, tx, ty) {
    const model = BUILDING_MODELS[type];
    if (!model) return;
    
    selectedBuilding = { bx, by, tx, ty, type };
    const block = worldBlocks.find(b => b.x === bx && b.y === by);
    const tile = block ? block.tiles[ty][tx] : null;
    if (!tile) return;

    const isEnemy = tile.owner !== playerId;
    const hpInfo = `<div style="background: #444; padding: 5px; margin-bottom: 10px; border-radius: 4px;">
        <span style="color: #aaa; font-size: 12px;">พลังชีวิต (HP):</span><br>
        <b style="color: ${isEnemy ? '#f22' : '#2f2'};">${Math.floor(tile.hp)}</b> / ${tile.max_hp}
        ${isEnemy ? `<br><small style="color: #f66;">(เจ้าของ: ${tile.owner || 'เป็นกลาง'})</small>` : ''}
    </div>`;

    panelTitle.innerText = model.title + (isEnemy ? " (ศัตรู)" : "");
    panelContent.innerHTML = hpInfo + `<p>${model.description}</p>`;
    
    if (!isEnemy) {
        model.actions.forEach(act => {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.innerHTML = `${act.label}<br><small>${act.sub}</small>`;
            btn.onclick = () => {
                let msgType = "PRODUCE_UNIT";
                if (act.action === "produceGatherer") msgType = "PRODUCE_GATHERER";
                else if (act.action === "produceArcher") msgType = "PRODUCE_ARCHER";
                
                window.safeSend({ type: msgType, bx, by, tx, ty });
            };
            panelContent.appendChild(btn);
        });

        const sellBtn = document.createElement('button');
        sellBtn.className = 'action-btn';
        sellBtn.style.marginTop = "10px";
        sellBtn.style.background = "#622";
        sellBtn.innerText = "ขายสิ่งก่อสร้าง (คืนทุน 100%)";
        sellBtn.onclick = () => {
            window.safeSend({ type: "SELL_BUILDING", bx, by, tx, ty });
            closeActionPanel();
        };
        panelContent.appendChild(sellBtn);
    }
    
    actionPanel.classList.add('active');
    closeUnitPanel();
}

window.showActionPanel = showActionPanel;

window.closeActionPanel = function() {
    actionPanel.classList.remove('active');
    selectedBuilding = null;
};

const unitStatusPanel = document.getElementById('unit-status-panel');
const unitStats = document.getElementById('unit-stats');

window.showUnitPanel = function(unit) {
    const isEnemy = unit.owner !== playerId;
    unitStats.innerHTML = `
        <div class="stat-row" style="color: ${isEnemy ? '#f66' : '#0cf'}; font-weight: bold;">
            <span>${isEnemy ? 'ยูนิตศัตรู' : 'ยูนิตของคุณ'}</span>
            <span>(${unit.owner})</span>
        </div>
        <hr style="border: 0; border-top: 1px solid #444;">
        <div class="stat-row"><span class="stat-label">ประเภท:</span> <span>${unit.type}</span></div>
        <div class="stat-row">
            <span class="stat-label">HP:</span> 
            <span style="color: ${isEnemy ? '#f22' : '#2f2'};">${Math.floor(unit.hp)}/${unit.max_hp}</span>
        </div>
        <div class="stat-row"><span class="stat-label">โจมตี:</span> <span>${unit.attack}</span></div>
        <div class="stat-row"><span class="stat-label">ระยะ:</span> <span>${unit.range}</span></div>
    `;
    unitStatusPanel.classList.add('active');
    closeActionPanel();
};

window.closeUnitPanel = function() {
    unitStatusPanel.classList.remove('active');
};

window.clearMap = function() {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการล้างแผนที่ทั้งหมด?")) {
        window.safeSend({ type: "CLEAR_MAP" });
    }
};

window.getValidExpansionSpots = function() {
    const spots = [];
    if (worldBlocks.length === 0) {
        spots.push({x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1});
        return spots;
    }

    worldBlocks.forEach(b => {
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => {
            const nx = b.x + dx;
            const ny = b.y + dy;
            if (!worldBlocks.find(ob => ob.x === nx && ob.y === ny)) {
                if (!spots.find(s => s.x === nx && s.y === ny)) {
                    spots.push({ x: nx, y: ny });
                }
            }
        });
    });
    return spots;
};


// Image Cache with Error Handling
const imageCache = {};
function getCachedImage(url) {
    if (!imageCache[url]) {
        const img = new Image();
        img.dataset.status = "loading";
        img.onload = () => { img.dataset.status = "loaded"; };
        img.onerror = () => {
            console.error(`Failed to load image: ${url}`);
            img.dataset.status = "error";
        };
        img.src = url;
        imageCache[url] = img;
    }
    return imageCache[url];
}

function drawImageDefensive(ctx, img, x, y, w, h, fallbackColor = "gray") {
    // Check status via dataset
    if (img && img.dataset.status === "loaded" && img.naturalWidth > 0) {
        try {
            ctx.drawImage(img, x, y, w, h);
        } catch (e) {
            console.warn("drawImage failed even with checks:", e);
            ctx.fillStyle = fallbackColor;
            ctx.fillRect(x, y, w, h);
        }
    } else {
        // Still loading, missing, or broken
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(x, y, w, h);
    }
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
            
            for (let ty = 0; ty < 30; ty++) {
                for (let tx = 0; tx < 30; tx++) {
                    const tile = block.tiles[ty][tx];
                    const tx_pix = bx + tx * GAME_CONFIG.tileSize;
                    const ty_pix = by + ty * GAME_CONFIG.tileSize;
                    
                    if (tile.type !== "empty") {
                        const assetUrl = ASSETS[tile.type];
                        const fallbackColor = COLORS[tile.type] || "gray";
                        
                        if (assetUrl) {
                            const img = getCachedImage(assetUrl);
                            const model = BUILDING_MODELS[tile.type] || { drawScale: 1, offset: 0 };
                            const size = GAME_CONFIG.tileSize * model.drawScale;
                            const offset = GAME_CONFIG.tileSize * model.offset;
                            
                            drawImageDefensive(ctx, img, tx_pix - offset, ty_pix - offset, size, size, fallbackColor);

                            if (selectedBuilding && selectedBuilding.bx === block.x && selectedBuilding.by === block.y && selectedBuilding.tx === tx && selectedBuilding.ty === ty) {
                                if (tile.type === "tower" || tile.type === "castle") {
                                    ctx.beginPath();
                                    ctx.arc(tx_pix + 10, ty_pix + 10, tile.type === "tower" ? 250 : 150, 0, Math.PI * 2);
                                    ctx.fillStyle = "rgba(0, 255, 255, 0.05)";
                                    ctx.fill();
                                    ctx.strokeStyle = "rgba(0, 255, 255, 0.3)";
                                    ctx.setLineDash([5, 5]);
                                    ctx.stroke();
                                    ctx.setLineDash([]);
                                }
                            }
                        } else {
                            ctx.fillStyle = fallbackColor;
                            ctx.fillRect(tx_pix, ty_pix, GAME_CONFIG.tileSize, GAME_CONFIG.tileSize);
                        }
                        
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

    const now = Date.now();
    attackEffects = attackEffects.filter(eff => now - eff.time < 200);
    attackEffects.forEach(eff => {
        ctx.beginPath();
        ctx.moveTo(eff.x1, eff.y1);
        ctx.lineTo(eff.x2, eff.y2);
        ctx.strokeStyle = eff.type === "tower" ? "#0ff" : "#ff0";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        ctx.stroke();
    });

    if (worldUnits) {
        worldUnits.forEach(u => {
            const assetUrl = ASSETS[u.type];
            const fallbackColor = u.owner === playerId ? "blue" : "red";
            
            if (assetUrl) {
                const img = getCachedImage(assetUrl);
                drawImageDefensive(ctx, img, u.x - 10, u.y - 10, 40, 40, fallbackColor);
            } else {
                ctx.fillStyle = fallbackColor;
                ctx.fillRect(u.x, u.y, 20, 20);
            }
            
            if (typeof selectedUnitIds !== 'undefined' && selectedUnitIds.includes(u.id)) {
                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;
                ctx.strokeRect(u.x - 2, u.y - 2, 24, 24);
            }

            ctx.fillStyle = "red";
            ctx.fillRect(u.x, u.y - 8, 20, 4);
            ctx.fillStyle = "green";
            ctx.fillRect(u.x, u.y - 8, 20 * (u.hp / u.max_hp), 4);
        });
    }

    if (typeof isSelecting !== 'undefined' && isSelecting && selectionBox) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(selectionBox.x1, selectionBox.y1, selectionBox.x2 - selectionBox.x1, selectionBox.y2 - selectionBox.y1);
        ctx.setLineDash([]);
    }

    if (currentMode === 'explore') {
        const spots = getValidExpansionSpots();
        ctx.fillStyle = "rgba(0, 255, 255, 0.2)";
        ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
        ctx.lineWidth = 2;
        spots.forEach(s => {
            const sx = s.x * GAME_CONFIG.blockSize;
            const sy = s.y * GAME_CONFIG.blockSize;
            ctx.fillRect(sx, sy, GAME_CONFIG.blockSize, GAME_CONFIG.blockSize);
            ctx.strokeRect(sx, sy, GAME_CONFIG.blockSize, GAME_CONFIG.blockSize);
        });
    }

    ctx.restore();
}

initGame();
setInterval(render, 100);
