// Centralized configuration and models for the game
// This makes it easy to change visuals, costs, and stats in one place.

const backendHost = window.location.hostname;
const backendUrl = `http://${backendHost}:3000`;

const GAME_CONFIG = {
    tileSize: 20,
    blockSizeInTiles: 30,
    blockSize: 30 * 20,
    defaultZoom: 0.5,
    renderInterval: 100
};

const ASSETS = {
    // Buildings
    castle: `${backendUrl}/assets/PNG/Top-Down Simple Summer_Prop - Castle Round.png`,
    tower: `${backendUrl}/assets/PNG/Top-Down Simple Summer_Prop - Watchtower Tall.png`,
    barracks: `${backendUrl}/assets/PNG/Top-Down Simple Summer_Prop - House.png`,
    archery_range: `${backendUrl}/assets/PNG/Top-Down Simple Summer_Prop - Tent.png`,
    
    // Units
    soldier: `${backendUrl}/assets/Viking Leader/PNG/PNG Sequences/Front - Idle/Front - Idle_000.png`,
    gatherer: `${backendUrl}/assets/Robber/PNG/PNG Sequences/Front - Idle/Front - Idle_000.png`,
    archer: `${backendUrl}/assets/Thug/PNG/PNG Sequences/Front - Idle/Front - Idle_000.png`,
    
    // Resources
    resource_gold: `${backendUrl}/assets/PNG/Top-Down Simple Summer_Prop - Rock 01.png`,
    resource_wood: `${backendUrl}/assets/PNG/Top-Down Simple Summer_prop - Tree Large.png`,
    resource_food: `${backendUrl}/assets/PNG/Top-Down Simple Summer_Prop - Bushes Large.png`
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
        drawScale: 2,
        offset: 0.5,
        actions: [
            { label: "ผลิตทหาร (Viking)", sub: "G:50, F:100", action: "produceSoldier" }
        ]
    },
    archery_range: {
        title: "โรงฝึกธนู",
        description: "โรงฝึกนักธนูระยะไกล",
        drawScale: 2,
        offset: 0.5,
        actions: [
            { label: "ผลิตนักธนู", sub: "G:120, F:80", action: "produceArcher" }
        ]
    },
    tower: {
        title: "ป้อมปราการ",
        description: "กำลังเฝ้าโหมดระวังภัย (ระยะ 5x5)",
        drawScale: 2,
        offset: 0.5,
        actions: []
    }
};
