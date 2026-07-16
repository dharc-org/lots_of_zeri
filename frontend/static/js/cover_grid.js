/*
 * cover_grid.js — Griglia flip 4×3 copertine cataloghi
 * ──────────────────────────────────────────────────────
 * Immagini: /static/img/covers/001.jpg … 068.jpg

 */

const GRID_COLS        = 3;
const GRID_ROWS        = 3;
const FLIP_INTERVAL_MS = 500;

const COVERS = Array.from({length: 67}, (_, i) =>
  `${window.BASE_PATH || ''}/static/img/covers/${String(i + 1).padStart(3, '0')}.jpg`
);

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

const grid    = document.getElementById('catalogueGrid');
const CELLS   = GRID_COLS * GRID_ROWS;
const flipped = new Array(CELLS).fill(false);
const busy    = new Array(CELLS).fill(false);
let pool      = shuffle(COVERS);
let poolIdx   = 0;

function nextCover() {
  if (poolIdx >= pool.length) { pool = shuffle(COVERS); poolIdx = 0; }
  return pool[poolIdx++];
}

for (let i = 0; i < CELLS; i++) {
  const cell  = document.createElement('div');
  cell.className = 'grid-cell';
  const inner = document.createElement('div');
  inner.className = 'card-inner'; inner.id = 'ci' + i;
  const front = document.createElement('div');
  front.className = 'card-face';
  const imgF  = document.createElement('img');
  imgF.src = nextCover(); imgF.alt = ''; imgF.loading = 'eager';
  front.appendChild(imgF);
  const back  = document.createElement('div');
  back.className = 'card-face card-face-back';
  const imgB  = document.createElement('img');
  imgB.src = nextCover(); imgB.alt = ''; imgB.loading = 'lazy';
  back.appendChild(imgB);
  inner.appendChild(front); inner.appendChild(back);
  cell.appendChild(inner); grid.appendChild(cell);
}

setInterval(() => {
  const pick = Math.floor(Math.random() * CELLS);
  if (busy[pick]) return;
  busy[pick] = true;
  const inner     = document.getElementById('ci' + pick);
  const isFlipped = flipped[pick];
  const hiddenFace = isFlipped
    ? inner.querySelector('.card-face:not(.card-face-back)')
    : inner.querySelector('.card-face-back');
  hiddenFace.querySelector('img').src = nextCover();
  inner.classList.toggle('is-flipped');
  flipped[pick] = !isFlipped;
  setTimeout(() => { busy[pick] = false; }, 700);
}, FLIP_INTERVAL_MS);
