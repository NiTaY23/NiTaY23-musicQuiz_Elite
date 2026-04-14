let isMenuOpen = false;
const audio = new Audio();
const API = "https://itunes.apple.com/";
let selectedArtist = { id: -1, name: "", img: "" };
let gameQueue = [], currentRound = 0, score = 0;
let visualizerInterval = null;

let allArtistSongs = [];
let playedCorrectSongIds = new Set();
let lastRoundDistractorIds = new Set();

// --- טעינת העדפות משתמש ---
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

// --- תפריט וניווט ---
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

function safeNavigate(id) {
    if (isMenuOpen) document.getElementById('menuToggle').click(); 
    
    audio.pause(); 
    clearInterval(visualizerInterval); 
    
    const allScreens = document.querySelectorAll('.screen');
    const targetScreen = document.getElementById(id);
    
    // אם המסך כבר פעיל, אין צורך להריץ אנימציה
    if (targetScreen.classList.contains('active')) return;

    // אנימציית יציאה עדינה למסך הנוכחי וכניסה למסך החדש
    gsap.to(".screen.active", {
        opacity: 0,
        y: -10,
        duration: 0.2,
        onComplete: () => {
            allScreens.forEach(s => s.classList.remove('active'));
            
            // הכנת המסך החדש (שקוף ומורם מעט)
            gsap.set(targetScreen, { opacity: 0, y: 10 });
            targetScreen.classList.add('active');
            
            // אנימציית כניסה
            gsap.to(targetScreen, {
                opacity: 1,
                y: 0,
                duration: 0.3,
                ease: "power2.out"
            });
        }
    });

    if (id === 'leaderboard-screen') renderLeaderboard();
}

document.getElementById('themeToggle').onclick = () => {
    document.body.classList.toggle('light-mode');
    document.body.classList.toggle('dark-mode');
    const currentTheme = document.body.classList.contains('light-mode') ? 'light-mode' : 'dark-mode';
    localStorage.setItem('quiz_theme', currentTheme);
};

// --- חיפוש ---
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

// --- משחק ---
document.getElementById('btnStart').onclick = async () => {
    if (selectedArtist.id === -1) return; 
    try {
        // תיקון: הגדלת ה-limit ל-200 לגיוון מקסימלי
        const data = await fetchJSONP(`${API}lookup?id=${selectedArtist.id}&entity=song&limit=200`);
        let fetchedSongs = data.results.slice(1).filter(t => t.previewUrl);
        
        // סינון כפילויות שמות שירים
        const unique = [];
        const seen = new Set();
        fetchedSongs.forEach(s => {
            const lowName = s.trackName.toLowerCase().trim();
            if(!seen.has(lowName)) {
                seen.add(lowName);
                unique.push(s);
            }
        });

        allArtistSongs = unique;

        // תיקון: הגדרת כמות סיבובים דינמית (עד 10, או פחות אם אין מספיק שירים)
        const totalPossibleRounds = Math.min(allArtistSongs.length, 10);
        gameQueue = [...allArtistSongs].sort(() => Math.random() - 0.5).slice(0, totalPossibleRounds);
        
        if (gameQueue.length < 2) return alert("Not enough tracks for this artist.");
        
        score = 0; currentRound = 0;
        playedCorrectSongIds.clear();
        safeNavigate('game-screen');
        loadRound();
    } catch(e) { alert("Error connecting to server."); }
};

function loadRound() {
    if (currentRound >= gameQueue.length) {
        saveScore();
        // הצגת הציון הסופי מתוך כמות הסיבובים שבוצעו בפועל
        document.getElementById('resScore').innerText = `${score}/${gameQueue.length}`;
        document.getElementById('resImg').src = selectedArtist.img;
        safeNavigate('result-screen');
        return;
    }

    const track = gameQueue[currentRound];
    playedCorrectSongIds.add(track.trackId);

    // תיקון: עדכון ה-UI שיציג את כמות הסיבובים הדינמית
    document.getElementById('tvRound').innerText = `${currentRound + 1}/${gameQueue.length}`;
    document.getElementById('tvArtistName').innerText = selectedArtist.name;

    let opts = [{ name: track.trackName, correct: true, img: track.artworkUrl100.replace('100x100','400x400'), id: track.trackId }];
    
    // מציאת מסיחים
    let pool = allArtistSongs.filter(t => 
        t.trackId !== track.trackId && 
        !playedCorrectSongIds.has(t.trackId) && 
        !lastRoundDistractorIds.has(t.trackId)
    );
    
    if(pool.length < 3) pool = allArtistSongs.filter(t => t.trackId !== track.trackId);
    pool.sort(() => Math.random() - 0.5);
    
    let currentDistractors = new Set();
    // בחירה של עד 3 מסיחים (או פחות אם אין מספיק שירים בכלל לאמן)
    const numDistractors = Math.min(pool.length, 3);
    for(let i=0; i < numDistractors; i++) {
        const s = pool[i];
        opts.push({ name: s.trackName, correct: false, img: s.artworkUrl100.replace('100x100','400x400'), id: s.trackId });
        currentDistractors.add(s.trackId);
    }
    lastRoundDistractorIds = currentDistractors;
    opts.sort(() => Math.random() - 0.5);

    const grid = document.getElementById('optionsGrid');
    grid.innerHTML = '';
    opts.forEach(o => {
        const fig = document.createElement('figure');
        fig.className = 'tilted-card-figure';
        fig.innerHTML = `<div class="tilted-card-inner"><img src="${o.img}" class="tilted-card-img"><div class="overlay-text">${o.name}</div></div>`;
        fig.onclick = () => {
            if (fig.classList.contains('locked')) return;
            grid.querySelectorAll('figure').forEach(f => f.classList.add('locked'));
            if (o.correct) { fig.classList.add('correct'); score++; }
            else { 
                fig.classList.add('wrong');
                grid.querySelectorAll('figure').forEach((f, idx) => {
                    if (opts[idx].correct) f.classList.add('correct');
                });
            }
            audio.pause();
            setTimeout(() => { currentRound++; loadRound(); }, 1500);
        };
        grid.appendChild(fig);
    });

    audio.src = track.previewUrl;
    audio.play().catch(e => console.log("Audio play blocked"));
    startVis();
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
    try {
        const history = JSON.parse(localStorage.getItem('music_quiz_ranks') || '[]');
        const newEntry = { 
            name: selectedArtist.name, 
            score: score, 
            total: gameQueue.length, 
            img: selectedArtist.img, 
            date: new Date().toLocaleDateString('he-IL') 
        };
        history.push(newEntry);
        localStorage.setItem('music_quiz_ranks', JSON.stringify(history));
        console.log("Score saved:", newEntry);
    } catch (e) {
        console.error("Error saving score:", e);
    }
}

function renderLeaderboard() {
    const content = document.getElementById('leaderboardContent');
    if (!content) return;

    const rawData = localStorage.getItem('music_quiz_ranks');
    const scores = JSON.parse(rawData || '[]');
    
    if (scores.length === 0) {
        content.innerHTML = '<p style="margin-top:20px; opacity:0.5; text-align:center;">No rankings yet!</p>';
        return;
    }
    
    // מיון לפי הניקוד הגבוה ביותר
    const sorted = scores.sort((a, b) => b.score - a.score).slice(0, 20);
    
    content.innerHTML = sorted.map((s, i) => `
        <div class="rank-item">
            <span style="font-weight:900; color:var(--primary); min-width:25px;">#${i+1}</span>
            <img src="${s.img || ''}" onerror="this.src='https://via.placeholder.com/40'">
            <div style="flex:1; margin-left:12px; text-align:left;">
                <strong style="display:block; font-size:0.9rem;">${s.name}</strong>
                <small style="opacity:0.6; font-size:0.7rem;">${s.date}</small>
            </div>
            <span style="font-weight:900; white-space:nowrap; margin-left:10px;">${s.score}/${s.total || 10}</span>
        </div>`).join('');
}

function resetData() {
    if(confirm("Reset all scores?")) { localStorage.removeItem('music_quiz_ranks'); renderLeaderboard(); }
}