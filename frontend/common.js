// common.js - Shared DOM elements and configuration
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const loginOverlay = document.getElementById('login-overlay');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const statusEl = document.getElementById('status');
const exploreBtn = document.getElementById('explore-btn');
const buildBtn = document.getElementById('build-btn');
const buildMenu = document.getElementById('build-menu');
const resGold = document.getElementById('res-gold');
const resWood = document.getElementById('res-wood');
const resFood = document.getElementById('res-food');
const actionPanel = document.getElementById('action-panel');
const panelTitle = document.getElementById('panel-title');
const panelContent = document.getElementById('panel-content');

// Helper to access common elements easily if needed in other files
