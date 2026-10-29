// логика повторяет affectors/experiments.py: граф блоков + front_affect + to_forgetting

const ALPHABET =
    ' абвгдежзийклмнопрстуфхцчшщъыьэюя' +
    'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' +
    'abcdefghijklmnopqrstuvwxyz' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    '0123456789';
const EPS = 1e-5;

function buildVocab() {
    const t2i = {};
    for (let i = 0; i < ALPHABET.length; i++) t2i[ALPHABET[i]] = i;
    const i2t = {};
    for (const [t, i] of Object.entries(t2i)) i2t[i] = t;
    return { t2i, i2t };
}

const { t2i, i2t } = buildVocab();
const SOS = ALPHABET.length; // SOS-индекса нет в алфавите, даём его отдельно; END — свой на каждое слово

const wordsInput = document.getElementById('words-input');
const fileInput = document.getElementById('file-input');
const trainBtn = document.getElementById('train-btn');
const statsEl = document.getElementById('stats');
const forgettingSlider = document.getElementById('forgetting');
const forgettingValue = document.getElementById('forgetting-value');
const maxLenSlider = document.getElementById('max-len');
const maxLenValue = document.getElementById('max-len-value');
const outputEl = document.getElementById('output');
const canvas = document.getElementById('heatmap');

let nodes = {};      // id -> {in:Set, out:Set, base, aff} — блоки AffectionBlockClassic
let endIds = new Set(); // id END-блоков (свой на слово)
let edges = new Set();  // "a>b" — матрица связей
let maxId = 0;
let pathEdges = [];     // путь текущей генерации для подсветки

function trainOn(words) {
    nodes = {};
    endIds = new Set();
    edges = new Set();
    pathEdges = [];
    maxId = ALPHABET.length;
    const ensure = id =>
        (nodes[id] ??= { in: new Set(), out: new Set(), base: 1, aff: 0 });
    for (let k = 0; k < words.length; k++) {
        if (![...words[k]].every(ch => ch in t2i)) continue; // слово с посторонними символами пропускаем
        const endId = ALPHABET.length + k; // личный END каждого слова
        endIds.add(endId);
        maxId = Math.max(maxId, endId);
        ensure(endId);
        const ids = [SOS, ...[...words[k]].map(ch => t2i[ch]), endId];
        for (let i = 0; i < ids.length - 1; i++) {
            const a = ids[i], b = ids[i + 1];
            ensure(a).out.add(b);
            ensure(b).in.add(a);
            edges.add(`${a}>${b}`);
        }
    }
    resetAffections();
    drawGraph();
    const edgeCount = edges.size;
    statsEl.textContent = `${words.length} слов, ${Object.keys(nodes).length} блоков, ${edgeCount} связей`;
}

function resetAffections() {
    for (const node of Object.values(nodes)) {
        node.base = 1;
        node.aff = node.base + node.in.size; // affection = входы + base — как в AffectionBlockClassic
    }
}

function frontAffect(cur) { // формула AffectionBlockClassic.to_front_affect
    const affects = [];
    for (const outId of nodes[cur.id].out) {
        const out = nodes[outId];
        const val = Math.abs(out.aff - cur.aff) * (out.aff / (cur.aff + EPS));
        if (val > 0) affects.push([outId, val]);
    }
    return affects;
}

function forgettingStep(node) { // AffectionBlockClassic.to_forgetting
    const f = parseFloat(forgettingSlider.value);
    node.base *= Math.exp(-f);
    node.aff = node.base + node.in.size;
}

function sampleNext(affects) {
    if (affects.length === 0) return null;
    let sum = 0;
    for (const [, w] of affects) sum += w;
    let acc = 0;
    const target = Math.random() * sum;
    for (const [id, w] of affects) {
        acc += w;
        if (acc >= target) return id;
    }
    return affects[affects.length - 1][0];
}

async function generateWord(maxLen) {
    if (Object.keys(nodes).length === 0) return;
    resetAffections();
    pathEdges = [];
    const ids = [];
    let curId = SOS; // старт traversal из SOS-блока
    for (let step = 0; step < maxLen; step++) {
        const node = nodes[curId];
        const affects = frontAffect(node);
        const nxt = sampleNext(affects);
        if (nxt === null || endIds.has(nxt)) break;
        pathEdges.push(`${curId}>${nxt}`);
        curId = nxt;
        ids.push(nxt);
        forgettingStep(nodes[nxt]);
        if (nxt in i2t) outputEl.lastElementChild.textContent += i2t[nxt];
        drawGraph();
        await sleep(70);
    }
    drawGraph();
}

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

function addWordSlot() {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = '';
    outputEl.appendChild(span);
}

function drawGraph() {
    const ctx = canvas.getContext('2d');
    const cell = canvas.width / (maxId + 1);
    const pathSet = new Set(pathEdges);
    ctx.fillStyle = '#191b16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const key of edges) {
        const [a, b] = key.split('>').map(Number);
        const lit = pathSet.has(key);
        ctx.fillStyle = lit ? '#c8f2ff' : '#3a4238';
        ctx.fillRect(a * cell, b * cell, cell, cell);
    }
}

trainBtn.addEventListener('click', () => trainOn(parseWords()));

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        wordsInput.value = reader.result.trim();
        trainOn(parseWords());
    };
    reader.readAsText(file);
});

document.getElementById('generate-one-btn').addEventListener('click', () => {
    outputEl.innerHTML = '';
    addWordSlot();
    generateWord(parseInt(maxLenSlider.value));
});

document.getElementById('generate-batch-btn').addEventListener('click', async () => {
    outputEl.innerHTML = '';
    for (let k = 0; k < 5; k++) {
        addWordSlot();
        await generateWord(parseInt(maxLenSlider.value));
    }
});

forgettingSlider.addEventListener('input', () => {
    forgettingValue.textContent = parseFloat(forgettingSlider.value).toFixed(1);
});

maxLenSlider.addEventListener('input', () => {
    maxLenValue.textContent = maxLenSlider.value;
});

function parseWords() {
    return wordsInput.value.split(/\s+/).filter(w => w.length > 0);
}

// старт: сразу обучаем на словах из поля ввода
trainOn(parseWords());
