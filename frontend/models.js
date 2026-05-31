// Centralized configuration and models for the game
// This makes it easy to change visuals, costs, and stats in one place.

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// --- CONFIGURATION ---
// 1. ถ้าคุณรันเครื่องตัวเอง (Local): จะใช้ localhost:3000
// 2. ถ้าคุณรันบน GitHub Pages: คุณต้องเอาโฟลเดอร์ backend ไปรันบน Render.com หรือ Railway.app ก่อน
//    แล้วเอา URL ที่ได้มาใส่แทนที่ 'YOUR_BACKEND_URL' ข้างล่างนี้ (ไม่ต้องมี http:// หรือ ws://)
const PRODUCTION_BACKEND_URL = 'rtsweb-production.up.railway.app'; // <--- เปลี่ยนเป็น URL ของคุณที่นี่

const backendHost = isLocal ? `${window.location.hostname}:3000` : PRODUCTION_BACKEND_URL;

// ตรวจสอบ Protocol (ถ้าอยู่บน GitHub Pages ซึ่งเป็น HTTPS ต้องใช้ wss:// และ https://)
const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

const backendUrl = `${protocol}://${backendHost}`;
const wsUrl = `${wsProtocol}://${backendHost}`;
// ---------------------

const GAME_CONFIG = {
    tileSize: 20,
    blockSizeInTiles: 30,
    blockSize: 30 * 20,
    defaultZoom: 0.5,
    renderInterval: 100
};

const ASSETS = {
    // Buildings
    castle: `${backendUrl}/assets/Model_on/LV000_STARTER/castle.png`,
    tower: `${backendUrl}/assets/Model_on/LV000_STARTER/tower.png`,
    barracks: `${backendUrl}/assets/Model_on/LV000_STARTER/barracks.png`,
    archery_range: `${backendUrl}/assets/Model_on/LV000_STARTER/barracks_archer.png`,
    
    // Units
    soldier: `${backendUrl}/assets/Model_on/LV000_STARTER/soldier.png`,
    gatherer: `${backendUrl}/assets/Model_on/LV000_STARTER/gatherer.png`,
    archer: `${backendUrl}/assets/Model_on/LV000_STARTER/archer.png`,
    
    // Resources
    resource_gold: `${backendUrl}/assets/Model_on/LV000_STARTER/gold.png`,
    resource_wood: `${backendUrl}/assets/Model_on/LV000_STARTER/tree.png`,
    resource_food: `${backendUrl}/assets/Model_on/LV000_STARTER/bush.png`
};

const COLORS = {
    empty: "transparent",
    river: "#3366ff",
    resource_gold: "#ffd700",
    resource_wood: "#8b4513",
    resource_food: "#32cd32",
    castle: "#ffffff",
    tower: "#ff4444",
    barracks: "#aaaaaa",
    archery_range: "#8b4513",
    soldier: "#ff00ff",
    gatherer: "#ffff00",
    archer: "#00ff00"
};

const BUILDING_MODELS = {
    castle: {
        title: "ปราสาท",
        description: "ศูนย์กลางอาณาจักรของคุณ",
        drawScale: 3,
        offset: 1, // tileSize units
        actions: [
            { label: "ผลิตหน่วยเก็บเสบียง", sub: "คนแรกฟรี (ต่อไป W:50, F:50)", action: "produceGatherer" }
        ]
    },
    barracks: {
        title: "ค่ายทหาร",
        description: "โรงฝึกทหารราบไวกิ้ง",
        drawScale: 3,
        offset: 1,
        actions: [
            { label: "ผลิตทหาร (Viking)", sub: "G:50, F:100", action: "produceSoldier" }
        ]
    },
    archery_range: {
        title: "โรงฝึกธนู",
        description: "โรงฝึกนักธนูระยะไกล",
        drawScale: 3,
        offset: 1,
        actions: [
            { label: "ผลิตนักธนู", sub: "G:120, F:80", action: "produceArcher" }
        ]
    },
    tower: {
        title: "ป้อมปราการ",
        description: "กำลังเฝ้าโหมดระวังภัย (ระยะ 5x5)",
        drawScale: 2,
        offset: 1,
        actions: []
    }
};

const UNIT_SIZE = {

    soldier: {
        width: 10,
        height: 10
    },

    gatherer: {
        width: 10,
        height: 10
    },

    archer: {
        width: 10,
        height: 10
    }
};
function drawUnit(ctx, unit) {

    const img = images[unit.type];

    const size = UNIT_SIZE[unit.type];

    const width = size.width;
    const height = size.height;

    ctx.drawImage(
        img,
        unit.x - width / 2,
        unit.y - height / 2,
        width,
        height
    );
}
