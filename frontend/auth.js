// auth.js
window.handleRegister = async function() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) { alert("กรุณากรอกชื่อและรหัสผ่าน"); return; }
    
    // Using backendUrl from models.js
    const resp = await fetch(`${backendUrl}/register`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username, password })
    });
    const data = await resp.json();
    if (data.success) {
        alert("ลงทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบ");
        location.reload();
    } else {
        alert(data.message);
    }
};

window.handleLogin = async function() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) { alert("กรุณากรอกชื่อและรหัสผ่าน"); return; }
    
    const resp = await fetch(`${backendUrl}/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username, password })
    });
    const data = await resp.json();
    if (data.success) {
        localStorage.setItem('rts_player_id', data.username);
        location.reload();
    } else {
        alert(data.message);
    }
};

window.handleLogout = function() {
    localStorage.removeItem('rts_player_id');
    location.reload();
};

window.continueAsGuest = function() {
    const existingId = localStorage.getItem('rts_player_id');
    // If we have an ID but it's not a guest ID (meaning they were logged in), we clear it
    if (existingId && !existingId.startsWith('guest_')) {
        localStorage.removeItem('rts_player_id');
    }
    
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (typeof initGame === 'function') initGame();
};
