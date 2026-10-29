// логика повторяет affectors/experiments.py: SymbolTokenizer + bigram WordGenerator

const ALPHABET =
    ' абвгдежзийклмнопрстуфхцчшщъыьэюя' +
    'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' +
    'abcdefghijklmnopqrstuvwxyz' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    '0123456789';
const SPECIAL = ['<|SOS|>', '<|END|>'];

function buildVocab() {
    const t2i = {};
    for (let i = 0; i < ALPHABET.length; i++) t2i[ALPHABET[i]] = i;
    for (let i = 0; i < SPECIAL.length; i++) t2i[SPECIAL[i]] = ALPHABET.length + i;
    const i2t = {};
    for (const [t, i] of Object.entries(t2i)) i2t[i] = t;
    return { t2i, i2t };
}

const { t2i, i2t } = buildVocab();
const VOCAB = Object.keys(t2i).length;
const SOS = t2i[SPECIAL[0]];
const END = t2i[SPECIAL[1]];

const wordsInput = document.getElementById('words-input');
const fileInput = document.getElementById('file-input');
const trainBtn = document.getElementById('train-btn');
const statsEl = document.getElementById('stats');
const temperatureSlider = document.getElementById('temperature');
const temperatureValue = document.getElementById('temperature-value');
const maxLenSlider = document.getElementById('max-len');
const maxLenValue = document.getElementById('max-len-value');
const outputEl = document.getElementById('output');
const canvas = document.getElementById('heatmap');

let prob = null; // матрица биграмм, null = не обучена

function parseWords() {
    return wordsInput.value.split(/\s+/).filter(w => w.length > 0);
}

function trainOn(words) {
    prob = Array.from({ length: VOCAB }, () => new Float32Array(VOCAB));
    for (const word of words) {
        const ok = [...word].every(ch => ch in t2i);
        if (!ok) continue;
        const ids = [SOS, ...[...word].map(ch => t2i[ch]), END];
        for (let i = 0; i < ids.length - 1; i++) prob[ids[i]][ids[i + 1]]++;
    }
    for (let i = 0; i < VOCAB; i++) {
        let sum = 0;
        for (let j = 0; j < VOCAB; j++) sum += prob[i][j];
        if (sum > 0) for (let j = 0; j < VOCAB; j++) prob[i][j] /= sum;
    }
    drawHeatmap();
    statsEl.textContent = `${words.length} слов, ${VOCAB} токенов`;
}

function sampleNext(idx) {
    const row = prob[idx];
    let sum = 0;
    for (const p of row) sum += p;
    if (sum === 0) return END;
    const t = parseFloat(temperatureSlider.value);
    // вероятности со степенью 1/t, нормируем, сэмплируем накоплением
    const weights = new Float32Array(VOCAB);
    let norm = 0;
    for (let j = 0; j < VOCAB; j++) {
        weights[j] = Math.pow(row[j], 1 / t);
        norm += weights[j];
    }
    let acc = 0;
    const target = Math.random() * norm;
    for (let j = 0; j < VOCAB; j++) {
        acc += weights[j];
        if (acc >= target) return j;
    }
    return END;
}

async function generateWord(maxLen) {
    if (!prob) return null;
    let ids = [];
    let cur = SOS;
    while (ids.length < maxLen) {
        cur = sampleNext(cur);
        if (cur === END) break;
        ids.push(cur);
        outputWordPartial(ids); // посимвольная анимация
        await sleep(60);
    }
    return ids.map(i => i2t[i]).join('');
}

function outputWordPartial(ids) {
    const word = ids.map(i => i2t[i]).join('');
    const el = outputEl.lastElementChild;
    if (el) el.textContent = word;
}

function addWordSlot() {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = '';
    outputEl.appendChild(span);
}

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

function drawHeatmap() {
    const ctx = canvas.getContext('2d');
    const cell = 4; // 1 токен = 4px, показываем плотную зону алфавита
    const visible = Math.min(VOCAB, 60);
    ctx.fillStyle = '#191b16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < visible; i++) {
        for (let j = 0; j < visible; j++) {
            if (!prob) continue;
            const v = prob[i][j];
            ctx.fillStyle = v > 0.9 ? '#c8f2ff' : v > 0.5 ? '#7ab8cb' : v > 0.2
                ? '#4a6a75' : v > 0 ? '#2a3a40' : '#212420';
            ctx.fillRect(i * cell, j * cell, cell, cell);
        }
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
    generateWord(parseInt(maxLenSlider.value)).catch(() => {});
});

document.getElementById('generate-batch-btn').addEventListener('click', async () => {
    outputEl.innerHTML = '';
    if (!prob) return;
    for (let k = 0; k < 5; k++) {
        addWordSlot();
        await generateWord(parseInt(maxLenSlider.value));
    }
});

temperatureSlider.addEventListener('input', () => {
    temperatureValue.textContent = parseFloat(temperatureSlider.value).toFixed(1);
});

maxLenSlider.addEventListener('input', () => {
    maxLenValue.textContent = maxLenSlider.value;
});

// старт: сразу обучаем на словах из поля ввода
trainOn(parseWords());
