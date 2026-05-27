let isMenuOpen = false;
const audio = new Audio();
const API = "https://itunes.apple.com/";
let selectedArtist = { id: -1, name: "", img: "" };
let gameQueue = [], currentRound = 0, score = 0;
let visualizerInterval = null;

// טיימר וניהול זמן כללי
let gameStartTime = 0;
let timerInterval = null;
let finalTimeStr = "00:00";

// מערכת טיימר לסיבוב בודד ומצב משחק
let gameMode = 'normal'; 
let roundTimeLeft = 15; 
let roundTimerInterval = null;
const SECONDS_PER_ROUND = 15;

// משתנה בוליאני שיוודא שהמשחק אכן הגיע לסיומו המלא
let isGameFullyCompleted = false;

// משתנה למעקב אחר הטאב המוצג כרגע בטבלת המובילים
let currentLeaderboardTab = 'normal';

let allArtistSongs = [];
let playedCorrectSongIds = new Set();

// טעינת הגדרות
const savedTheme = localStorage.getItem('quiz_theme') || 'dark-mode';
const savedVolume = localStorage.getItem('quiz_volume') || '0.5';
document.body.className = savedTheme;
audio.volume = parseFloat(savedVolume);

window.addEventListener('DOMContentLoaded', () => {
    const volSlider = document.getElementById('volumeSlider');
    if (volSlider) volSlider.value = savedVolume;
});

async function fetchJSONP(url) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
        window[callbackName] = (data) => {
            delete window[callbackName];
            const oldScript = document.getElementById(callbackName);
            if (oldScript) document.body.removeChild(oldScript);
            resolve(data);
        };
        const script = document.createElement('script');
        script.src = `${url}${url.indexOf('?') >= 0 ? '&' : '?'}callback=${callbackName}`;
        script.id = callbackName;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

// ניווט בטוח בין מסכים ועצירת פעילויות ברקע
function safeNavigate(id) {
    if (isMenuOpen) document.getElementById('menuToggle').click(); 
    audio.pause(); 
    clearInterval(visualizerInterval);
    clearInterval(timerInterval);
    clearInterval(roundTimerInterval);
    
    const allScreens = document.querySelectorAll('.screen');
    const targetScreen = document.getElementById(id);
    if (targetScreen.classList.contains('active')) return;

    gsap.to(".screen.active", {
        opacity: 0, y: -10, duration: 0.2,
        onComplete: () => {
            allScreens.forEach(s => s.classList.remove('active'));
            gsap.set(targetScreen, { opacity: 0, y: 10 });
            targetScreen.classList.add('active');
            gsap.to(targetScreen, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });
        }
    });

    if (id === 'leaderboard-screen') {
        // כשנכנסים למסך הדירוגים, נטען אוטומטית לפי המוד האחרון ששיחקנו בו
        currentLeaderboardTab = gameMode;
        renderLeaderboard();
    }
}

// תפריט
document.getElementById('menuToggle').onclick = () => {
    isMenuOpen = !isMenuOpen;
    const tl = gsap.timeline();
    const preLayers = document.querySelectorAll('.sm-prelayer');
    const panel = document.getElementById('menuPanel');

    if (isMenuOpen) {
        tl.to(preLayers, { xPercent: -100, duration: 0.4, stagger: 0.08, ease: "power2.inOut" })
          .to(panel, { xPercent: -100, duration: 0.5, ease: "power3.out" }, "-=0.3");
        document.getElementById('toggleText').innerText = "Close";
    } else {
        tl.to([panel, ...preLayers], { xPercent: 0, duration: 0.4, stagger: 0.05, ease: "power2.in" });
        document.getElementById('toggleText').innerText = "Menu";
    }
};

document.getElementById('themeToggle').onclick = () => {
    document.body.classList.toggle('light-mode');
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('quiz_theme', document.body.classList.contains('light-mode') ? 'light-mode' : 'dark-mode');
};

// בורר מצב משחק במסך הבית
window.setGameMode = (mode) => {
    gameMode = mode;
    document.getElementById('modeNormal').classList.toggle('active', mode === 'normal');
    document.getElementById('modeHardcore').classList.toggle('active', mode === 'hardcore');
};

// טיימר המשחק הכללי במרכז המסך
function startTimer() {
    gameStartTime = Date.now();

    timerInterval = setInterval(() => {
        const diff = Date.now() - gameStartTime;
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        finalTimeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        const timerEl = document.getElementById('gameTimer');
        if (timerEl) timerEl.innerText = finalTimeStr;
    }, 1000);
}

// טיימר ספירה לאחור של השיר הנוכחי (מד פרוגרס יחיד ודק)
function startRoundTimer() {
    clearInterval(roundTimerInterval);
    roundTimeLeft = SECONDS_PER_ROUND;
    
    const bar = document.getElementById('roundTimerBar');
    if (bar) {
        gsap.set(bar, { scaleX: 1 });
        gsap.to(bar, { scaleX: 0, duration: SECONDS_PER_ROUND, ease: "none" });
    }

    roundTimerInterval = setInterval(() => {
        roundTimeLeft--;
        if (roundTimeLeft <= 0) {
            clearInterval(roundTimerInterval);
            handleRoundTimeout();
        }
    }, 1000);
}

function handleRoundTimeout() {
    audio.pause();
    const grid = document.getElementById('optionsGrid');
    if (!grid) return;

    grid.querySelectorAll('figure').forEach(f => f.classList.add('locked'));
    grid.querySelectorAll('figure').forEach(f => {
        if (f.dataset.correct === "true") f.classList.add('correct');
    });

    setTimeout(() => {
        if (gameMode === 'hardcore') {
            isGameFullyCompleted = true;
            clearInterval(timerInterval);
            showFinalResults();
        } else {
            currentRound++;
            if (currentRound >= gameQueue.length) {
                isGameFullyCompleted = true;
                clearInterval(timerInterval);
                showFinalResults();
            } else {
                loadRound();
            }
        }
    }, 1500);
}

// חיפוש אמנים
const searchInput = document.getElementById('searchInput');
const suggestions = document.getElementById('suggestions');

searchInput.oninput = async (e) => {
    const q = e.target.value;
    if (q.length < 2) { suggestions.style.display = 'none'; return; }
    try {
        const data = await fetchJSONP(`${API}search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=10`);
        const results = await Promise.all(data.results.map(async (a) => {
            const detail = await fetchJSONP(`${API}lookup?id=${a.artistId}&entity=album&limit=1`);
            const img = detail.results[1] ? detail.results[1].artworkUrl100.replace('100x100', '400x400') : "";
            return { id: a.artistId, name: a.artistName, img: img };
        }));
        suggestions.innerHTML = results.map(a => `
            <div class="s-item" onclick="selectArtist('${a.id}', '${a.name.replace(/'/g, "\\'")}', '${a.img}')">
                ${a.img ? `<img src="${a.img}">` : `<i class="fas fa-user-circle"></i>`}
                <span>${a.name}</span>
            </div>`).join('');
        suggestions.style.display = 'block';
    } catch(e) { console.error(e); }
};

window.selectArtist = (id, name, img) => {
    selectedArtist = { id, name, img };
    searchInput.value = name;
    suggestions.style.display = 'none';
};

// התחלת משחק
document.getElementById('btnStart').onclick = async () => {
    if (selectedArtist.id === -1) return; 
    try {
        const data = await fetchJSONP(`${API}lookup?id=${selectedArtist.id}&entity=song&limit=200`);
        let fetchedSongs = data.results.slice(1).filter(t => t.previewUrl);
        const unique = [];
        const seen = new Set();
        fetchedSongs.forEach(s => {
            const lowName = s.trackName.toLowerCase().trim();
            if(!seen.has(lowName)) { seen.add(lowName); unique.push(s); }
        });
        allArtistSongs = unique;
        
        const totalPossibleRounds = gameMode === 'hardcore' ? allArtistSongs.length : Math.min(allArtistSongs.length, 10);
        gameQueue = [...allArtistSongs].sort(() => Math.random() - 0.5).slice(0, totalPossibleRounds);
        if (gameQueue.length < 2) return alert("Not enough tracks.");
        
        score = 0; currentRound = 0;
        isGameFullyCompleted = false;
        playedCorrectSongIds.clear();
        safeNavigate('game-screen');
        startTimer();
        loadRound();
    } catch(e) { alert("Error connecting to server."); }
};

function loadRound() {
    if (currentRound >= gameQueue.length) {
        isGameFullyCompleted = true;
        clearInterval(timerInterval);
        clearInterval(roundTimerInterval);
        showFinalResults();
        return;
    }
    
    startRoundTimer();

    const track = gameQueue[currentRound];
    playedCorrectSongIds.add(track.trackId);
    
    document.getElementById('tvRound').innerText = gameMode === 'hardcore' ? `Round ${currentRound + 1}` : `${currentRound + 1}/${gameQueue.length}`;
    document.getElementById('tvArtistName').innerText = selectedArtist.name;

    let opts = [{ name: track.trackName, correct: true, img: track.artworkUrl100.replace('100x100','400x400'), id: track.trackId }];
    let pool = allArtistSongs.filter(t => t.trackId !== track.trackId && !playedCorrectSongIds.has(t.trackId));
    if(pool.length < 3) pool = allArtistSongs.filter(t => t.trackId !== track.trackId);
    pool.sort(() => Math.random() - 0.5);
    for(let i=0; i < Math.min(pool.length, 3); i++) {
        opts.push({ name: pool[i].trackName, correct: false, img: pool[i].artworkUrl100.replace('100x100','400x400'), id: pool[i].trackId });
    }
    opts.sort(() => Math.random() - 0.5);

    const grid = document.getElementById('optionsGrid');
    grid.innerHTML = '';
    opts.forEach(o => {
        const fig = document.createElement('figure');
        fig.className = 'tilted-card-figure';
        fig.dataset.correct = o.correct;
        fig.innerHTML = `<div class="tilted-card-inner"><img src="${o.img}" class="tilted-card-img"><div class="overlay-text">${o.name}</div></div>`;
        fig.onclick = () => {
            if (fig.classList.contains('locked')) return;
            clearInterval(roundTimerInterval);
            gsap.killTweensOf(document.getElementById('roundTimerBar'));

            grid.querySelectorAll('figure').forEach(f => f.classList.add('locked'));
            
            if (o.correct) { 
                fig.classList.add('correct'); 
                score++;
                audio.pause();
                setTimeout(() => { currentRound++; loadRound(); }, 1500);
            } else { 
                fig.classList.add('wrong');
                grid.querySelectorAll('figure').forEach((f, idx) => { if (opts[idx].correct) f.classList.add('correct'); });
                audio.pause();
                
                setTimeout(() => {
                    if (gameMode === 'hardcore') {
                        isGameFullyCompleted = true;
                        clearInterval(timerInterval);
                        showFinalResults();
                    } else {
                        currentRound++; 
                        if (currentRound >= gameQueue.length) {
                            isGameFullyCompleted = true;
                            clearInterval(timerInterval);
                            showFinalResults();
                        } else {
                            loadRound();
                        }
                    }
                }, 1500);
            }
        };
        grid.appendChild(fig);
    });
    audio.src = track.previewUrl;
    audio.play().catch(e => {});
    startVis();
}

function showFinalResults() {
    if (isGameFullyCompleted) {
        saveScore();
    }

    const hardcoreBadge = document.getElementById('badgeHardcore');
    if (gameMode === 'hardcore') {
        hardcoreBadge.style.display = 'inline-flex';
        document.getElementById('resScore').innerText = `${score} Hits`;
    } else {
        hardcoreBadge.style.display = 'none';
        document.getElementById('resScore').innerText = `${score}/${gameQueue.length}`;
    }

    document.getElementById('resTime').innerText = `Time: ${finalTimeStr}`;
    document.getElementById('resImg').src = selectedArtist.img;
    safeNavigate('result-screen');
}

function startVis() {
    clearInterval(visualizerInterval);
    visualizerInterval = setInterval(() => {
        document.querySelectorAll('.v-bar').forEach(b => b.style.height = (Math.random()*25+5)+"px");
    }, 100);
}

document.getElementById('volumeSlider').oninput = (e) => {
    audio.volume = e.target.value;
    localStorage.setItem('quiz_volume', e.target.value);
};

function saveScore() {
    const history = JSON.parse(localStorage.getItem('music_quiz_ranks') || '[]');
    history.push({ 
        name: selectedArtist.name, score, total: gameQueue.length, 
        time: finalTimeStr, img: selectedArtist.img, date: new Date().toLocaleDateString('he-IL'),
        mode: gameMode
    });
    localStorage.setItem('music_quiz_ranks', JSON.stringify(history));
}

// פונקציית מעבר בין הטאבים בתוך ה-Leaderboard
window.switchLeaderboardTab = (tab) => {
    currentLeaderboardTab = tab;
    document.getElementById('tabNormal').classList.toggle('active', tab === 'normal');
    document.getElementById('tabHardcore').classList.toggle('active', tab === 'hardcore');
    renderLeaderboard();
};

// רנדור טבלה מופרדת לחלוטין בהתאם לטאב הפעיל
function renderLeaderboard() {
    const content = document.getElementById('leaderboardContent');
    if (!content) return;
    
    // מעדכנים את נראות הטאבים למקרה שהפונקציה נקראה ישירות מניווט
    document.getElementById('tabNormal').classList.toggle('active', currentLeaderboardTab === 'normal');
    document.getElementById('tabHardcore').classList.toggle('active', currentLeaderboardTab === 'hardcore');

    const scores = JSON.parse(localStorage.getItem('music_quiz_ranks') || '[]');
    
    // סינון התוצאות בהתאם לטאב הנבחר (אם אין שדה mode, ברירת המחדל היא normal)
    const filteredScores = scores.filter(s => {
        const m = s.mode || 'normal';
        return m === currentLeaderboardTab;
    });

    if (filteredScores.length === 0) { 
        content.innerHTML = `<p style="text-align:center; opacity:0.5; padding: 20px;">No rankings for ${currentLeaderboardTab} mode yet!</p>`; 
        return; 
    }
    
    // מיון לפי כמות נקודות/פגיעות
    const sorted = filteredScores.sort((a, b) => b.score - a.score).slice(0, 20);
    
    content.innerHTML = sorted.map((s, i) => {
        const isHardcore = s.mode === 'hardcore';
        const scoreDisplay = isHardcore ? `${s.score} Hits` : `${s.score}/${s.total}`;
        const badgeClass = isHardcore ? 'hardcore' : 'normal';
        const badgeText = isHardcore ? 'Hardcore' : 'Normal';

        // תיקון למניעת הצגת המילה undefined במסכים ובדירוגים ישנים
        const hasValidTime = s.time && s.time !== 'undefined';
        const infoString = hasValidTime ? `${s.time} | ${s.date}` : s.date;

        return `
        <div class="rank-item">
            <span style="font-weight:900; color:var(--primary); min-width:25px;">#${i+1}</span>
            <img src="${s.img || ''}" onerror="this.src='https://via.placeholder.com/40'">
            <div style="flex:1; margin-left:12px; text-align:left;">
                <strong style="display:block; font-size:0.9rem;">${s.name}</strong>
                <small style="opacity:0.6; font-size:0.7rem;">${infoString}</small>
            </div>
            <span class="game-type-indicator ${badgeClass}">${badgeText}</span>
            <span style="font-weight:900; margin-left: 10px; font-variant-numeric: tabular-nums;">${scoreDisplay}</span>
        </div>`;
    }).join('');
}

function resetData() {
    if(confirm("Reset all scores?")) { 
        localStorage.removeItem('music_quiz_ranks'); 
        renderLeaderboard(); 
    }
}
