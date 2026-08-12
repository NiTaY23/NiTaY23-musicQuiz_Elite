let isMenuOpen = false;
const audio = new Audio();
const API = "https://itunes.apple.com/";
let selectedArtist = { id: -1, name: "", img: "" };
let gameQueue = [], currentRound = 0, score = 0;
let visualizerInterval = null;

let gameStartTime = 0;
let timerInterval = null;
let finalTimeStr = "00:00";[cite: 1, 2]

let gameMode = 'normal'; 
let roundTimeLeft = 15; 
let roundTimerInterval = null;
const SECONDS_PER_ROUND = 15;[cite: 2]

let oneSecTimeout = null;
let isGameFullyCompleted = false;[cite: 2]
let currentLeaderboardTab = 'normal';[cite: 2]

let allArtistSongs = [];
let playedCorrectSongIds = new Set();[cite: 2]

let searchDebounceTimer = null;

const savedTheme = localStorage.getItem('quiz_theme') || 'dark-mode';[cite: 2]
const savedVolume = localStorage.getItem('quiz_volume') || '0.5';[cite: 2]
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

function safeNavigate(id) {
    if (isMenuOpen) {
        const menuToggleBtn = document.getElementById('menuToggle');
        if (menuToggleBtn) menuToggleBtn.click(); 
    }
    audio.pause(); 
    clearInterval(visualizerInterval);
    clearInterval(timerInterval);
    clearInterval(roundTimerInterval);
    clearTimeout(oneSecTimeout);
    
    const allScreens = document.querySelectorAll('.screen');
    const targetScreen = document.getElementById(id);
    if (!targetScreen || targetScreen.classList.contains('active')) return;

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
        currentLeaderboardTab = gameMode;
        renderLeaderboard();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const menuToggleBtn = document.getElementById('menuToggle');
    if (menuToggleBtn) {
        menuToggleBtn.onclick = (e) => {
            e.preventDefault();
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
                document.getElementById('toggleText').innerText = "Menu";[cite: 2]
            }
        };
    }

    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
        themeToggleBtn.onclick = () => {
            document.body.classList.toggle('light-mode');
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('quiz_theme', document.body.classList.contains('light-mode') ? 'light-mode' : 'dark-mode');[cite: 2]
        };
    }

    const searchInput = document.getElementById('searchInput');
    const suggestions = document.getElementById('suggestions');
    const clearSearchBtn = document.getElementById('clearSearchBtn');

    if (searchInput) {
        searchInput.oninput = (e) => {
            const q = e.target.value.trim();
            if (q.length > 0) {
                if (clearSearchBtn) clearSearchBtn.style.display = 'block';
            } else {
                if (clearSearchBtn) clearSearchBtn.style.display = 'none';
                if (suggestions) suggestions.style.display = 'none';
            }

            clearTimeout(searchDebounceTimer);
            if (q.length < 2) { 
                if (suggestions) suggestions.style.display = 'none'; 
                return; 
            }

            if (suggestions) {
                suggestions.innerHTML = `<div class="s-item" style="justify-content: center; opacity: 0.6;"><i class="fas fa-spinner fa-spin"></i><span>Searching artists...</span></div>`;
                suggestions.style.display = 'block';
            }

            searchDebounceTimer = setTimeout(async () => {
                try {
                    const data = await fetchJSONP(`${API}search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=6`);
                    if (!data.results || data.results.length === 0) {
                        if (suggestions) suggestions.innerHTML = `<div class="s-item" style="justify-content: center; opacity: 0.5;"><span>No artists found</span></div>`;
                        return;
                    }

                    const results = await Promise.all(data.results.map(async (a) => {
                        try {
                            const detail = await fetchJSONP(`${API}lookup?id=${a.artistId}&entity=album&limit=1`);
                            const img = detail.results && detail.results[1] && detail.results[1].artworkUrl100 ? detail.results[1].artworkUrl100.replace('100x100', '400x400') : "";
                            return { id: a.artistId, name: a.artistName, img: img };
                        } catch(err) {
                            return { id: a.artistId, name: a.artistName, img: "" };
                        }
                    }));

                    if (suggestions) {
                        suggestions.innerHTML = results.map(a => `
                            <div class="s-item" onmousedown="selectArtist('${a.id}', '${a.name.replace(/'/g, "\\'")}', '${a.img}')" ontouchend="selectArtist('${a.id}', '${a.name.replace(/'/g, "\\'")}', '${a.img}'); event.preventDefault();">
                                ${a.img ? `<img src="${a.img}" alt="Artist">` : `<i class="fas fa-user-circle" style="font-size:40px; color:var(--primary);"></i>`}
                                <span>${a.name}</span>
                            </div>`).join('');
                        suggestions.style.display = 'block';
                    }
                } catch(e) { 
                    if (suggestions) suggestions.style.display = 'none'; 
                }
            }, 300);
        };

        // הוספת האזנה לאירועי touchstart/mousedown כדי למנוע סגירת מקלדת מהירה בטלפונים
        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                if (suggestions && document.activeElement !== searchInput) {
                    // נותן זמן ללחיצה על תוצאה להתבצע לפני הסתרה
                    suggestions.style.display = 'none';
                }
            }, 200);
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.onclick = () => {
            if (searchInput) searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            if (suggestions) suggestions.style.display = 'none';
            selectedArtist = { id: -1, name: "", img: "" };
            if (searchInput) searchInput.focus();
        };
    }

    const btnStart = document.getElementById('btnStart');
    if (btnStart) {
        btnStart.onclick = async () => {
            if (selectedArtist.id === -1) {
                alert("Please select an artist first!");
                return;
            } 
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
                
                const totalPossibleRounds = (gameMode === 'hardcore' || gameMode === 'onesec') ? allArtistSongs.length : Math.min(allArtistSongs.length, 10);
                gameQueue = [...allArtistSongs].sort(() => Math.random() - 0.5).slice(0, totalPossibleRounds);
                if (gameQueue.length < 2) {
                    alert("Not enough tracks for this artist.");
                    return;
                }
                
                score = 0; currentRound = 0;
                isGameFullyCompleted = false;
                playedCorrectSongIds.clear();[cite: 2]
                safeNavigate('game-screen');
                startTimer();
                loadRound();
            } catch(e) { alert("Error connecting to server.");[cite: 2] }
        };
    }

    const volSlider = document.getElementById('volumeSlider');
    if (volSlider) {
        volSlider.oninput = (e) => {
            audio.volume = e.target.value;
            localStorage.setItem('quiz_volume', e.target.value);[cite: 2]
        };
    }
});

window.setGameMode = (mode) => {
    gameMode = mode;
    const mNorm = document.getElementById('modeNormal');
    const mOne = document.getElementById('modeOneSec');
    const mHard = document.getElementById('modeHardcore');
    if (mNorm) mNorm.classList.toggle('active', mode === 'normal');
    if (mOne) mOne.classList.toggle('active', mode === 'onesec');
    if (mHard) mHard.classList.toggle('active', mode === 'hardcore');
};

function startTimer() {
    gameStartTime = Date.now();
    clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        const diff = Date.now() - gameStartTime;
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        finalTimeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;[cite: 2]
        
        const timerEl = document.getElementById('gameTimer');
        if (timerEl) timerEl.innerText = finalTimeStr;
    }, 1000);
}

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
    clearTimeout(oneSecTimeout);
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

window.selectArtist = (id, name, img) => {
    selectedArtist = { id, name, img };
    const searchInput = document.getElementById('searchInput');
    const suggestions = document.getElementById('suggestions');
    const clearSearchBtn = document.getElementById('clearSearchBtn');

    if (searchInput) searchInput.value = name;
    if (suggestions) suggestions.style.display = 'none';
    if (clearSearchBtn) clearSearchBtn.style.display = 'block';
};

window.replayOneSecond = () => {
    if (gameMode !== 'onesec') return;
    audio.currentTime = 0;
    audio.play().catch(e => {});
    clearTimeout(oneSecTimeout);
    oneSecTimeout = setTimeout(() => {
        audio.pause();
    }, 1000);
};

function loadRound() {
    if (currentRound >= gameQueue.length) {
        isGameFullyCompleted = true;
        clearInterval(timerInterval);
        clearInterval(roundTimerInterval);
        clearTimeout(oneSecTimeout);
        showFinalResults();
        return;
    }
    
    startRoundTimer();

    const track = gameQueue[currentRound];
    playedCorrectSongIds.add(track.trackId);[cite: 2]
    
    const roundText = (gameMode === 'hardcore' || gameMode === 'onesec') ? `Round ${currentRound + 1}` : `${currentRound + 1}/${gameQueue.length}`;
    const tvRound = document.getElementById('tvRound');
    const tvArtistName = document.getElementById('tvArtistName');
    if (tvRound) tvRound.innerText = roundText;
    if (tvArtistName) tvArtistName.innerText = selectedArtist.name;

    const replayBtn = document.getElementById('btnReplayOneSec');
    if (replayBtn) {
        if (gameMode === 'onesec') {
            replayBtn.style.display = 'inline-flex';
        } else {
            replayBtn.style.display = 'none';
        }
    }

    let opts = [{ name: track.trackName, correct: true, img: track.artworkUrl100 ? track.artworkUrl100.replace('100x100','400x400') : '', id: track.trackId }];
    let pool = allArtistSongs.filter(t => t.trackId !== track.trackId && !playedCorrectSongIds.has(t.trackId));
    if(pool.length < 3) pool = allArtistSongs.filter(t => t.trackId !== track.trackId);
    pool.sort(() => Math.random() - 0.5);
    for(let i=0; i < Math.min(pool.length, 3); i++) {
        opts.push({ name: pool[i].trackName, correct: false, img: pool[i].artworkUrl100 ? pool[i].artworkUrl100.replace('100x100','400x400') : '', id: pool[i].trackId });
    }
    opts.sort(() => Math.random() - 0.5);

    const grid = document.getElementById('optionsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    opts.forEach(o => {
        const fig = document.createElement('figure');
        fig.className = 'tilted-card-figure';
        fig.dataset.correct = o.correct;
        fig.innerHTML = `<div class="tilted-card-inner"><img src="${o.img}" class="tilted-card-img" alt="Option"><div class="overlay-text">${o.name}</div></div>`;
        
        const handleOptionClick = () => {
            if (fig.classList.contains('locked')) return;
            clearInterval(roundTimerInterval);
            clearTimeout(oneSecTimeout);
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
                    if (gameMode === 'hardcore' || gameMode === 'onesec') {
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

        fig.onclick = handleOptionClick;
        fig.ontouchend = (e) => {
            e.preventDefault();
            handleOptionClick();
        };

        grid.appendChild(fig);
    });

    audio.src = track.previewUrl;
    audio.currentTime = 0;
    audio.play().catch(e => {});

    if (gameMode === 'onesec') {
        clearTimeout(oneSecTimeout);
        oneSecTimeout = setTimeout(() => {
            audio.pause();
        }, 1000);
    }

    startVis();
}

function showFinalResults() {
    if (isGameFullyCompleted) {
        saveScore();
    }

    const hardcoreBadge = document.getElementById('badgeHardcore');
    const oneSecBadge = document.getElementById('badgeOneSec');
    
    if (hardcoreBadge) hardcoreBadge.style.display = 'none';
    if (oneSecBadge) oneSecBadge.style.display = 'none';

    const resScore = document.getElementById('resScore');
    if (gameMode === 'hardcore') {
        if (hardcoreBadge) hardcoreBadge.style.display = 'inline-flex';
        if (resScore) resScore.innerText = `${score} Hits`;
    } else if (gameMode === 'onesec') {
        if (oneSecBadge) oneSecBadge.style.display = 'inline-flex';
        if (resScore) resScore.innerText = `${score} Hits`;
    } else {
        if (resScore) resScore.innerText = `${score}/${gameQueue.length}`;
    }

    const resTime = document.getElementById('resTime');
    const resImg = document.getElementById('resImg');
    if (resTime) resTime.innerText = `Time: ${finalTimeStr}`;[cite: 1, 2]
    if (resImg) resImg.src = selectedArtist.img;
    safeNavigate('result-screen');
}

function startVis() {
    clearInterval(visualizerInterval);
    visualizerInterval = setInterval(() => {
        document.querySelectorAll('.v-bar').forEach(b => b.style.height = (Math.random()*25+5)+"px");
    }, 100);
}

function saveScore() {
    const history = JSON.parse(localStorage.getItem('music_quiz_ranks') || '[]');[cite: 2]
    history.push({ 
        name: selectedArtist.name, score, total: gameQueue.length, 
        time: finalTimeStr, img: selectedArtist.img, date: new Date().toLocaleDateString('he-IL'),[cite: 2]
        mode: gameMode
    });
    localStorage.setItem('music_quiz_ranks', JSON.stringify(history));[cite: 2]
}

window.switchLeaderboardTab = (tab) => {
    currentLeaderboardTab = tab;[cite: 2]
    const tabNorm = document.getElementById('tabNormal');
    const tabOne = document.getElementById('tabOneSec');
    const tabHard = document.getElementById('tabHardcore');
    if (tabNorm) tabNorm.classList.toggle('active', tab === 'normal');
    if (tabOne) tabOne.classList.toggle('active', tab === 'onesec');
    if (tabHard) tabHard.classList.toggle('active', tab === 'hardcore');
    renderLeaderboard();
};

function renderLeaderboard() {
    const content = document.getElementById('leaderboardContent');
    if (!content) return;
    
    const tabNorm = document.getElementById('tabNormal');
    const tabOne = document.getElementById('tabOneSec');
    const tabHard = document.getElementById('tabHardcore');
    if (tabNorm) tabNorm.classList.toggle('active', currentLeaderboardTab === 'normal');[cite: 2]
    if (tabOne) tabOne.classList.toggle('active', currentLeaderboardTab === 'onesec');
    if (tabHard) tabHard.classList.toggle('active', currentLeaderboardTab === 'hardcore');[cite: 2]

    const scores = JSON.parse(localStorage.getItem('music_quiz_ranks') || '[]');[cite: 2]
    
    const filteredScores = scores.filter(s => {
        const m = s.mode || 'normal';
        return m === currentLeaderboardTab;[cite: 2]
    });

    if (filteredScores.length === 0) { 
        content.innerHTML = `<p style="text-align:center; opacity:0.5; padding: 20px;">No rankings for ${currentLeaderboardTab} mode yet!</p>`;[cite: 2]
        return; 
    }
    
    const sorted = filteredScores.sort((a, b) => b.score - a.score).slice(0, 20);
    
    content.innerHTML = sorted.map((s, i) => {
        const isHardcore = s.mode === 'hardcore';
        const isOneSec = s.mode === 'onesec';
        
        let scoreDisplay = `${s.score}/${s.total}`;
        if (isHardcore || isOneSec) scoreDisplay = `${s.score} Hits`;

        let badgeClass = 'normal';
        let badgeText = 'Normal';[cite: 2]
        if (isHardcore) { badgeClass = 'hardcore'; badgeText = 'Hardcore'; }[cite: 2]
        if (isOneSec) { badgeClass = 'onesec'; badgeText = '1-Sec'; }

        const hasValidTime = s.time && s.time !== 'undefined';
        const infoString = hasValidTime ? `${s.time} | ${s.date}` : s.date;[cite: 2]

        return `
        <div class="rank-item">
            <span style="font-weight:900; color:var(--primary); min-width:25px;">#${i+1}</span>
            <img src="${s.img || ''}" onerror="this.src='https://via.placeholder.com/40'" alt="Rank">
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
    if(confirm("Reset all scores?")) {[cite: 2]
        localStorage.removeItem('music_quiz_ranks');[cite: 2]
        renderLeaderboard(); 
    }
}
