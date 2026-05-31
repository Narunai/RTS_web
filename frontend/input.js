// input.js
window.initInput = function() {
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const worldX = (mx - canvas.width / 2) / camera.zoom + camera.x;
        const worldY = (my - canvas.height / 2) / camera.zoom + camera.y;

        if (e.button === 0) { // Left Click
            if (currentMode) {
                handleBuildModeInteraction(worldX, worldY);
                return;
            }
            selectUnitOrBuilding(worldX, worldY);
        } else if (e.button === 2) { // Right Click
            isDraggingCamera = true;
            lastMouse = { x: e.clientX, y: e.clientY };
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const worldX = (mx - canvas.width / 2) / camera.zoom + camera.x;
        const worldY = (my - canvas.height / 2) / camera.zoom + camera.y;

        if (isSelecting) {
            selectionBox.x2 = worldX;
            selectionBox.y2 = worldY;
        }
        if (isDraggingCamera) {
            camera.x -= (e.clientX - lastMouse.x) / camera.zoom;
            camera.y -= (e.clientY - lastMouse.y) / camera.zoom;
            lastMouse = { x: e.clientX, y: e.clientY };
        }
        render();
    });

    canvas.addEventListener('mouseup', (e) => {
        if (isSelecting) {
            performSelection();
        }
        isDraggingCamera = false;
        render();
    });

    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        handleRightClick(e);
    });

    canvas.addEventListener('wheel', (e) => {
        const zoomSpeed = 0.1;
        if (e.deltaY < 0) camera.zoom *= (1 + zoomSpeed);
        else camera.zoom /= (1 + zoomSpeed);
        render();
    });
};

function handleBuildModeInteraction(worldX, worldY) {
    const bx = Math.floor(worldX / GAME_CONFIG.blockSize);
    const by = Math.floor(worldY / GAME_CONFIG.blockSize);
    if (currentMode === 'explore') {
        const spots = getValidExpansionSpots();
        if (spots.some(s => s.x === bx && s.y === by)) window.safeSend({ type: "EXPLORE", x: bx, y: by });
    } else if (currentMode === 'build' && currentBuildType) {
        const tx = Math.floor((worldX % GAME_CONFIG.blockSize + (worldX < 0 ? GAME_CONFIG.blockSize : 0)) / GAME_CONFIG.tileSize) % 30;
        const ty = Math.floor((worldY % GAME_CONFIG.blockSize + (worldY < 0 ? GAME_CONFIG.blockSize : 0)) / GAME_CONFIG.tileSize) % 30;
        window.safeSend({ type: "BUILD", bx, by, tx, ty, building_type: currentBuildType });
    }
}

function selectUnitOrBuilding(worldX, worldY) {
    let clickedUnit = worldUnits.find(u => Math.abs(u.x - worldX) < 15 && Math.abs(u.y - worldY) < 15);
    if (clickedUnit) {
        // Now selecting both player and enemy units
        selectedUnitIds = [clickedUnit.id];
        showUnitPanel(clickedUnit);
        if (clickedUnit.owner !== playerId) {
            // If enemy unit, don't allow multi-selection with player units later
            // (Optional logic depending on game feel)
        }
    } else {
        const bx = Math.floor(worldX / GAME_CONFIG.blockSize);
        const by = Math.floor(worldY / GAME_CONFIG.blockSize);
        const tx = Math.floor((worldX % GAME_CONFIG.blockSize + (worldX < 0 ? GAME_CONFIG.blockSize : 0)) / GAME_CONFIG.tileSize) % 30;
        const ty = Math.floor((worldY % GAME_CONFIG.blockSize + (worldY < 0 ? GAME_CONFIG.blockSize : 0)) / GAME_CONFIG.tileSize) % 30;
        const block = worldBlocks.find(b => b.x === bx && b.y === by);
        
        if (block && block.tiles[ty][tx].type !== "empty" && ["barracks", "castle", "tower", "archery_range"].includes(block.tiles[ty][tx].type)) {
            // Show action panel for both player and enemy buildings
            showActionPanel(block.tiles[ty][tx].type, bx, by, tx, ty);
            selectedUnitIds = [];
        } else {
            isSelecting = true;
            selectionBox = { x1: worldX, y1: worldY, x2: worldX, y2: worldY };
            selectedUnitIds = [];
            closeActionPanel();
            closeUnitPanel();
        }
    }
}

function performSelection() {
    const xMin = Math.min(selectionBox.x1, selectionBox.x2);
    const xMax = Math.max(selectionBox.x1, selectionBox.x2);
    const yMin = Math.min(selectionBox.y1, selectionBox.y2);
    const yMax = Math.max(selectionBox.y1, selectionBox.y2);
    selectedUnitIds = worldUnits.filter(u => u.owner === playerId && u.x >= xMin && u.x <= xMax && u.y >= yMin && u.y <= yMax).map(u => u.id);
    
    if (selectedUnitIds.length === 1) {
        const unit = worldUnits.find(u => u.id === selectedUnitIds[0]);
        showUnitPanel(unit);
    } else if (selectedUnitIds.length > 1) {
        closeUnitPanel();
    }

    isSelecting = false;
    selectionBox = null;
}

function handleRightClick(e) {
    if (selectedUnitIds.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const worldX = (mx - canvas.width / 2) / camera.zoom + camera.x;
        const worldY = (my - canvas.height / 2) / camera.zoom + camera.y;
        window.safeSend({ type: "MOVE_UNITS", unit_ids: selectedUnitIds, x: worldX, y: worldY });
    }
}
