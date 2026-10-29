// движок повторяет AffectionBlock Слова.html: формулы front_affect/back_affect из Core.py,
// память W1/W2/W3, стоп-порог θ, softmax по температуре; анимация склейки слов — буквы-кандидаты
const CSSV = getComputedStyle(document.documentElement), col = n => CSSV.getPropertyValue(n).trim();
const C = { sig: col('--sig'), hot: col('--hot'), ext: col('--ext'), line: col('--line'), dim: col('--dim'), fg: col('--fg'), panel: col('--panel') };
const $ = id => document.getElementById(id);
const sig = x => 1 / (1 + Math.exp(-x)), EPS = 1e-4, WMAX = 3, MAXLEN = 16;

// ---------- интернационализация ----------
const I18N = {
    ru: {
        h1: 'AffectorGraph · сеть, которая строит слова',
        sub: 'каждый блок — буква, плюс блок старта «^» и блок конца «$». возбудитель проигрывает слова — связи учатся по front_affect и back_affect, затем активность идёт по графу сама: каждая вспышка приклеивает букву, слово заканчивается, когда лавина гаснет или срабатывает «$»',
        hudHeard: 'прослушано', hudSaid: '· сказано',
        hudClick: 'клик по букве: начать слово с неё',
        g1: '1 · слушать', g2: '2 · говорить', g3: '3 · параметры',
        bListen: 'Слушать словарь', bWipe: 'Стереть память',
        lblEp: 'проходов по словарю',
        bTalk: 'Говорить ∞', bOne: 'Одно слово',
        talkOn: 'Замолчать', talkOff: 'Говорить ∞',
        selfOn: 'Самообучение: вкл', selfOff: 'Самообучение: выкл',
        hintTalk: '∞ — сеть говорит без остановки, слово за словом. самообучение подкрепляет собственные слова, законченные через «$»',
        lblSp: 'букв в секунду',
        lblT: 'температура (шум)', lblTh: 'порог затухания θ',
        lblG2: 'память на 2–3 шага назад', lblBg: 'вес back_affect',
        lblLr: 'скорость обучения', lblFg: 'забывание',
        cSaid: 'что сеть говорит', cScore: 'счёт', cNovel: 'новые слова сети',
        lgKnown: 'есть в словаре', lgNovel: 'новое слово', lgCut: 'оборвано по длине',
        stN: 'слов сказано', stNat: 'закончено через «$»', stKnown: 'из словаря',
        stNovel: 'новых', stLen: 'средняя длина / в словаре', stAff: 'среднее affection',
        hintNovel: 'уникальные, которых нет в словаре, по убыванию правдоподобия пар букв',
        stIdle: 'нажми «Слушать словарь»', stTalking: 'говорю…',
        stListening: 'слушаю: возбудитель проигрывает слово',
        stReady: 'готово. жми «Говорить ∞»', stWiped: 'память стёрта',
        stEnd: 'закончено блоком «$»', stCut: 'оборвано: 16 букв', stFaded: 'лавина погасла (θ)',
        stStart: s => `начал с «${s}»`,
    },
    en: {
        h1: 'AffectorGraph · a network that builds words',
        sub: 'each block is a letter, plus a start block «^» and an end block «$». an external driver speaks the words — connections learn via front_affect and back_affect — then the activity runs through the graph on its own: every flash glues one letter, the word ends when the avalanche dies out or «$» fires',
        hudHeard: 'heard', hudSaid: '· said',
        hudClick: 'click a letter: start the word there',
        g1: '1 · listen', g2: '2 · speak', g3: '3 · parameters',
        bListen: 'Listen to corpus', bWipe: 'Wipe memory',
        lblEp: 'corpus passes',
        bTalk: 'Speak ∞', bOne: 'One word',
        talkOn: 'Be quiet', talkOff: 'Speak ∞',
        selfOn: 'Self-learning: on', selfOff: 'Self-learning: off',
        hintTalk: '∞ — the net speaks non-stop, word after word. self-learning reinforces its own words finished via «$»',
        lblSp: 'letters per second',
        lblT: 'temperature (noise)', lblTh: 'decay threshold θ',
        lblG2: 'memory 2–3 steps back', lblBg: 'back_affect weight',
        lblLr: 'learning rate', lblFg: 'forgetting',
        cSaid: 'what the net says', cScore: 'score', cNovel: 'novel words',
        lgKnown: 'from corpus', lgNovel: 'novel', lgCut: 'cut by length',
        stN: 'words said', stNat: 'finished via «$»', stKnown: 'from corpus',
        stNovel: 'novel', stLen: 'avg length / corpus', stAff: 'avg affection',
        hintNovel: 'unique words missing from the corpus, sorted by bigram plausibility',
        stIdle: 'press «Listen to corpus»', stTalking: 'talking…',
        stListening: 'listening: the driver speaks a word',
        stReady: 'done. press «Speak ∞»', stWiped: 'memory wiped',
        stEnd: 'finished by block «$»', stCut: 'cut: 16 letters', stFaded: 'avalanche faded (θ)',
        stStart: s => `started from «${s}»`,
    },
};
let LANG = localStorage.getItem('lang') || 'ru';
const tr = (...a) => { const v = I18N[LANG][a[0]] ?? a[0]; return typeof v === 'function' ? v(a[1]) : v; };

// буквы = всё, что реально встретилось в словаре: кириллица + латиница + цифры
let SYM = [], N = 0, S0 = 0, SE = 0, IX = {};
const LEGAL = /[а-яёa-z0-9]/;
let lastAlph = '';
function rebuildAlphabet(ws) {
    const chars = new Set();
    ws.forEach(w => [...w].forEach(ch => { if (LEGAL.test(ch)) chars.add(ch); }));
    SYM = ['^', ...[...chars].sort(), '$'];
    N = SYM.length; S0 = 0; SE = N - 1;
    IX = {};
    SYM.forEach((c, i) => IX[c] = i);
    return SYM.slice().join('');
}

$('corpus').value = `дом мама папа кот небо река вода лес поле море гора свет луна солнце звезда ветер дождь снег
утро вечер ночь день город улица окно дверь стол стул книга слово голос рука нога глаз сердце друг
земля огонь камень дерево трава цветок птица рыба лиса волк медведь заяц собака корова лошадь
хлеб молоко сыр каша чай сахар соль масло яблоко груша дорога мост поезд машина лодка парус
песня музыка сказка память время мир жизнь радость любовь сила мечта дело работа школа урок
белый чёрный красный синий зелёный тёплый холодный тихий громкий новый старый добрый
идти бежать думать читать писать говорить слушать смотреть знать любить жить летать`;

let W1, W2, W3, base, A, heard = 0, said = 0, words = [], corpusSet = new Set(), corpusBig = new Set(), corpusLen = 0;
const P = { T: .35, th: .2, g2: 1, bg: -.3, lr: .15, fg: .0005, ep: 3, sp: 4, self: false, talk: false };

function wipe() {
    W1 = new Float32Array(N * N); W2 = new Float32Array(N * N); W3 = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) { W1[k] = Math.random() * .004; W2[k] = Math.random() * .003; }
    base = new Float32Array(N).fill(.5); A = new Float32Array(N); heard = 0; said = 0; words = []; gen = null;
    hl = new Float32Array(N); lastV = new Float32Array(N);
    $('feed').innerHTML = ''; $('novel').innerHTML = '';
    affection(); refreshStats();
}
function affection() { for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += W1[i * N + j]; A[i] = base[i] + s; } }

// формулы из Core.py: front = |Aj-Ai| * Aj/(Ai+e), back = |Aj-Ai| * Ai/(Aj+e)
const front = (i, j) => { const d = Math.abs(A[j] - A[i]); return d * (A[j] / (A[i] + EPS)); };
const back = (i, j) => { const d = Math.abs(A[j] - A[i]); return d * (A[i] / (A[j] + EPS)); };

const clean = t => t.toLowerCase().replace(/ё/g, 'е').split(/[^а-яa-z]+/).filter(w => w.length > 1);
function parseCorpus() {
    const ws = clean($('corpus').value);
    corpusSet = new Set(ws); corpusBig = new Set(); let L = 0;
    ws.forEach(w => { L += w.length; const s = '^' + w + '$'; for (let i = 1; i < s.length; i++) corpusBig.add(s[i - 1] + s[i]); });
    corpusLen = ws.length ? L / ws.length : 0;
    return ws;
}

// обучение: последовательность вспышек a(t-1) → b(t); front_affect усиливает связь a→b, b шлёт back к a
function learnSeq(word, lr) {
    const s = [S0, ...[...word].map(c => IX[c]), SE];
    affection();
    for (let t = 1; t < s.length; t++) {
        const a = s[t - 1], b = s[t], k = a * N + b;
        W1[k] += lr * (.5 + sig(front(a, b))) * (WMAX - W1[k]) / WMAX;
        for (let j = 0; j < N; j++) if (j !== b) W1[a * N + j] *= 1 - lr * .01; // конкуренция выходов a
        if (t >= 2) { const c = s[t - 2], k2 = c * N + b; W2[k2] += lr * .7 * (.5 + sig(front(c, b))) * (WMAX - W2[k2]) / WMAX;
            for (let j = 0; j < N; j++) if (j !== b) W2[c * N + j] *= 1 - lr * .008; }
        if (t >= 3) { const e = s[t - 3], k3 = e * N + b; W3[k3] += lr * .5 * (.5 + sig(front(e, b))) * (WMAX - W3[k3]) / WMAX;
            for (let j = 0; j < N; j++) if (j !== b) W3[e * N + j] *= 1 - lr * .006; }
        base[b] += lr * .02 * (1 - base[b]);
    }
    for (let i = 0; i < N; i++) base[i] *= Math.exp(-P.fg);
}
function forget() { const f = 1 - P.fg; for (let k = 0; k < N * N; k++) { W1[k] *= f; W2[k] *= f; W3[k] *= f; } }

// одна лавина = одно слово
let gen = null, listenQ = [], listenTotal = 0, hl = new Float32Array(N), lastV = new Float32Array(N), lastCands = [];

function startWord(force) {
    affection();
    gen = { p1: S0, p2: -1, p3: -1, s: '', path: [S0], done: false };
    hl[S0] = 1;
    if (force != null) { gen.s = SYM[force]; gen.p3 = -1; gen.p2 = S0; gen.p1 = force; gen.path.push(force); hl[force] = 1; }
    renderWord(); renderCands();
}
function stepWord() {
    const { p1, p2, p3 } = gen, v = new Float32Array(N); let mx = -1e9;
    for (let j = 1; j < N; j++) {
        let x = W1[p1 * N + j] * sig(front(p1, j));
        if (p2 >= 0) x += P.g2 * W2[p2 * N + j] * sig(front(p2, j));
        if (p3 >= 0) x += P.g2 * .8 * W3[p3 * N + j] * sig(front(p3, j));
        x += P.bg * W1[j * N + p1] * sig(back(j, p1)) * .5;            // back-сигнал в тех, кто ведёт в текущий блок
        const used = gen.path.filter(q => q === j).length;
        x *= Math.pow(.45, used);                                       // рефрактерность: уже горевший блок слабее
        v[j] = x; if (x > mx) mx = x;
    }
    lastV = v;
    if (mx < P.th || gen.s.length >= MAXLEN) return finish(gen.s.length >= MAXLEN ? 'cut' : 'faded');
    // softmax по возбуждению с шумом T — из него же берутся кандидаты для анимации
    let Z = 0; const pr = new Float32Array(N);
    for (let j = 1; j < N; j++) if (v[j] >= mx * .25) { pr[j] = Math.exp((v[j] - mx) / (mx * Math.max(.02, P.T))); Z += pr[j]; }
    let r = Math.random() * Z, pick = SE;
    for (let j = 1; j < N; j++) { r -= pr[j]; if (r <= 0 && pr[j] > 0) { pick = j; break; } }
    lastCands = [];
    for (let j = 1; j < N; j++) if (pr[j] > 0) lastCands.push({ sym: SYM[j], p: pr[j] / Z, pick: j === pick });
    lastCands.sort((a, b) => b.p - a.p); lastCands = lastCands.slice(0, 9);
    hl[pick] = 1; gen.path.push(pick);
    if (pick === SE) return finish('end');
    gen.s += SYM[pick]; gen.p3 = gen.p2; gen.p2 = gen.p1; gen.p1 = pick;
    renderWord(); renderCands();
}
function finish(how) {
    gen.done = true;
    const w = gen.s;
    if (w.length >= 1) {
        said++;
        const known = corpusSet.has(w);
        const rec = { w, how, known, big: bigScore(w) };
        words.push(rec); if (words.length > 400) words.shift(); addChip(rec);
        if (P.self && how === 'end' && w.length >= 2) learnSeq(w, P.lr * .25);
    }
    forget(); refreshStats();
    $('curSt').textContent = how === 'end' ? tr('stEnd') : how === 'cut' ? tr('stCut') : tr('stFaded');
}
function bigScore(w) { const s = '^' + w + '$'; let k = 0; for (let i = 1; i < s.length; i++) if (corpusBig.has(s[i - 1] + s[i])) k++; return k / (s.length - 1); }
function addChip(r) {
    const el = document.createElement('span');
    el.className = 'w ' + (r.how === 'cut' ? 'cut' : r.known ? 'known' : 'novel');
    el.textContent = r.w;
    $('feed').prepend(el);
    while ($('feed').children.length > 120) $('feed').lastChild.remove();
}

// ---------- склейка: слово по буквам + ряд кандидатов ----------
function renderWord() {
    const s = gen ? gen.s : '';
    let html = '';
    [...s].forEach((ch, i) => {
        const cls = 'l' + (i === s.length - 1 && !gen?.done ? ' pop' : '');
        html += `<span class="${cls}">${ch}</span>`;
    });
    $('cur').innerHTML = html || '<span class="l ghost">·</span>';
}
function renderCands() {
    const el = $('cands');
    if (!lastCands.length) { el.innerHTML = ''; return; }
    el.innerHTML = lastCands.map(c => {
        const lead = c.p > .35 ? ' lead' : '';
        const cls = c.pick ? `chosen${lead}` : lead;
        return `<span class="cand${cls}"><b>${c.sym}</b>${(c.p * 100).toFixed(0)}%</span>`;
    }).join('');
}

// ---------- прослушивание ----------
function listen() {
    const ws = parseCorpus(); if (!ws.length) return;
    // алфавит перестраивается под словарь; старая память с тем же алфавитом остаётся
    const alph = rebuildAlphabet(ws);
    if (alph !== lastAlph) { lastAlph = alph; wipe(); }
    listenQ = [];
    for (let e = 0; e < P.ep; e++) listenQ.push(...ws.slice().sort(() => Math.random() - .5));
    listenTotal = listenQ.length;
    P.talk = false; syncTalk();
    $('bListen').classList.add('on');
}
let listenWord = null;
function listenTick(n) {
    for (let k = 0; k < n && listenQ.length; k++) {
        const w = listenQ.shift();
        learnSeq(w, P.lr); heard++;
        listenWord = w;
    }
    if (listenWord) {
        const s = [S0, ...[...listenWord].map(c => IX[c]), SE];
        hl.fill(0); s.forEach((i, t) => hl[i] = Math.max(hl[i], .4 + .6 * t / s.length));
        renderStatic(listenWord);
        $('curSt').textContent = tr('stListening');
    }
    $('prog').style.width = (listenTotal ? 100 * (1 - listenQ.length / listenTotal) : 0) + '%';
    if (!listenQ.length) {
        $('bListen').classList.remove('on'); listenWord = null;
        affection(); refreshStats();
        $('curSt').textContent = tr('stReady');
    }
}
function renderStatic(w) {
    $('cur').innerHTML = [...w].map(ch => `<span class="l">${ch}</span>`).join('');
}

// ---------- рисование кольца блоков ----------
const g = $('g'), gx = g.getContext('2d');
function fit(c) { const d = devicePixelRatio || 1, b = c.getBoundingClientRect(); c.width = b.width * d; c.height = b.height * d; }
function npos(i) {
    const R = Math.min(g.width, g.height) * .4, a = -Math.PI / 2 + i / N * Math.PI * 2;
    return [g.width / 2 + Math.cos(a) * R, g.height / 2 + Math.sin(a) * R];
}
function draw() {
    const d = devicePixelRatio || 1;
    gx.clearRect(0, 0, g.width, g.height);
    for (let i = 0; i < N; i++) { // три сильнейшие связи каждого блока
        const row = []; for (let j = 0; j < N; j++) row.push([W1[i * N + j], j]);
        row.sort((a, b) => b[0] - a[0]);
        for (const [w, j] of row.slice(0, 3)) {
            if (w < .15) continue;
            const [x1, y1] = npos(i), [x2, y2] = npos(j);
            gx.strokeStyle = C.sig; gx.globalAlpha = Math.min(.5, w / WMAX * .6); gx.lineWidth = (.5 + w * .8) * d;
            gx.beginPath(); gx.moveTo(x1, y1); gx.quadraticCurveTo(g.width / 2, g.height / 2, x2, y2); gx.stroke();
        }
    }
    gx.globalAlpha = 1;
    if (gen && gen.path.length > 1) { // путь текущего слова
        gx.strokeStyle = C.hot; gx.lineWidth = 2.5 * d; gx.beginPath();
        gen.path.forEach((i, t) => { const [x, y] = npos(i); t ? gx.quadraticCurveTo(g.width / 2, g.height / 2, x, y) : gx.moveTo(x, y); });
        gx.stroke();
    }
    let vm = Math.max(1e-6, ...lastV);
    for (let i = 0; i < N; i++) {
        const [x, y] = npos(i), h = hl[i], r = (9 + Math.min(8, A[i] * 1.6)) * d, pot = Math.max(0, lastV[i] / vm);
        if (h > .05) {
            gx.fillStyle = listenWord ? C.ext : C.hot; gx.globalAlpha = h * .35;
            gx.beginPath(); gx.arc(x, y, r + 12 * h * d, 0, 7); gx.fill();
        }
        gx.globalAlpha = 1;
        gx.fillStyle = C.panel;
        gx.strokeStyle = h > .5 ? (listenWord ? C.ext : C.hot) : pot > .2 ? C.sig : C.line;
        gx.lineWidth = (1 + pot * 2) * d;
        gx.beginPath(); gx.arc(x, y, r, 0, 7); gx.fill(); gx.stroke();
        gx.fillStyle = i === S0 || i === SE ? C.ext : C.fg;
        gx.font = `600 ${12 * d}px JetBrains Mono, monospace`;
        gx.textAlign = 'center'; gx.textBaseline = 'middle';
        gx.fillText(SYM[i], x, y + .5 * d);
        hl[i] *= .9;
    }
}

function refreshStats() {
    const n = words.length, m = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, pc = x => (x * 100).toFixed(0) + '%';
    $('hHeard').textContent = heard; $('hSaid').textContent = said; $('sN').textContent = said;
    const nov = words.filter(r => !r.known && r.how !== 'cut');
    if (n) {
        $('sNat').textContent = pc(words.filter(r => r.how === 'end').length / n);
        $('sKnown').textContent = pc(words.filter(r => r.known).length / n);
        $('sNovel').textContent = pc(nov.length / n);
        $('sLen').textContent = `${m(words.map(r => r.w.length)).toFixed(1)} / ${corpusLen.toFixed(1)}`;
    }
    $('sA').textContent = m(Array.from(A)).toFixed(2);
    const uniq = new Map();
    nov.forEach(r => uniq.set(r.w, r.big));
    $('novel').innerHTML = [...uniq].sort((a, b) => b[1] - a[1]).slice(0, 40)
        .map(([w, s]) => `<span class="w novel" title="знакомых пар ${(s * 100).toFixed(0)}%">${w}</span>`).join('');
}

// ---------- цикл ----------
let acc = 0, lastT = performance.now(), pauseLeft = 0;
function loop(now) {
    const dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
    if (listenQ.length || listenWord) listenTick(Math.max(1, Math.ceil(P.sp / 4)));
    else if (P.talk || (gen && !gen.done)) {
        acc += P.sp * dt; let k = 0;
        while (acc >= 1 && k < 50) {
            acc--; k++;
            if (pauseLeft > 0) { pauseLeft--; continue; }
            if (!gen || gen.done) { if (!P.talk) break; startWord(); }
            else { stepWord(); if (gen.done) pauseLeft = P.sp > 20 ? 0 : 3; }
        }
    }
    draw();
    requestAnimationFrame(loop);
}
// ---------- управление ----------
function syncTalk() {
    $('bTalk').classList.toggle('on', P.talk);
    $('bTalk').textContent = P.talk ? tr('talkOn') : tr('talkOff');
}
$('bListen').onclick = () => { $('curSt').textContent = tr('stTalking'); listen(); };
$('bWipe').onclick = () => { listenQ = []; listenWord = null; wipe(); $('cur').textContent = '·'; $('curSt').textContent = tr('stWiped'); renderCands(); };
$('bTalk').onclick = () => { if (listenQ.length) return; P.talk = !P.talk; syncTalk(); if (!P.talk && gen && !gen.done) gen.done = true; };
$('bOne').onclick = () => { if (listenQ.length) return; P.talk = false; syncTalk(); startWord(); $('curSt').textContent = tr('stTalking'); };
$('bSelf').onclick = e => {
    P.self = !P.self;
    e.target.textContent = tr(P.self ? 'selfOn' : 'selfOff');
    e.target.classList.toggle('on', P.self);
};
g.addEventListener('click', e => {
    if (listenQ.length) return;
    const b = g.getBoundingClientRect(), d = devicePixelRatio || 1, mx = (e.clientX - b.left) * d, my = (e.clientY - b.top) * d;
    let best = -1, bd = 1e9;
    for (let i = 1; i < SE; i++) { const [x, y] = npos(i), q = Math.hypot(x - mx, y - my); if (q < bd) { bd = q; best = i; } }
    if (bd < 24 * d) { P.talk = false; syncTalk(); startWord(best); $('curSt').textContent = tr('stStart', SYM[best]); }
});

const cnfg = [
    ['t', 'vT', x => x / 100, 2], ['th', 'vTh', x => x / 100, 2],
    ['g2', 'vG2', x => x / 100, 2], ['bg', 'vBg', x => x / 100, 2],
    ['lr', 'vLr', x => x / 100, 2], ['fg', 'vFg', x => x / 100000, 4],
    ['ep', 'vEp', x => x, 0], ['sp', 'vSp', x => x, 0],
];
cnfg.forEach(([id, out, f, dp]) => {
    const el = $(id), up = () => { P[id] = f(+el.value); $(out).textContent = P[id].toFixed(dp).replace('-', '−'); };
    el.oninput = up; up();
});

// переключатель языка RU/EN
function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr(el.dataset.i18n); });
    $('langBtn').textContent = LANG === 'ru' ? 'EN' : 'RU';
    document.documentElement.lang = LANG;
}
$('langBtn').onclick = () => {
    LANG = LANG === 'ru' ? 'en' : 'ru';
    localStorage.setItem('lang', LANG);
    applyLang();
    if (gen && !gen.done) $('curSt').textContent = tr('stTalking');
    else if (!listenQ.length) $('curSt').textContent = heard ? tr('stReady') : tr('stIdle');
    syncTalk();
};

addEventListener('resize', () => fit(g));
applyLang();
$('curSt').textContent = tr('stIdle');
fit(g);
const ws0 = parseCorpus();
lastAlph = rebuildAlphabet(ws0);
wipe();
requestAnimationFrame(loop);
