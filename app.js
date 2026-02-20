'use strict';

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════
const STORAGE_KEY = 'sam_v6';

const DEFAULT_COLORS = [
  '#4F8EF7','#F74F6A','#18A55E','#F59E0B','#8B5CF6',
  '#0EA5E9','#EC4899','#10B981','#F97316','#A855F7'
];
const COLOR_PALETTE = [
  '#4F8EF7','#3A7AE8','#0EA5E9','#06B6D4','#14B8A6',
  '#F74F6A','#EF4444','#F97316','#F59E0B','#EAB308',
  '#18A55E','#10B981','#22C55E','#84CC16','#A3E635',
  '#8B5CF6','#A855F7','#EC4899','#F472B6','#64748B'
];

// ═══════════════════════════════════════════════
//  STATE
//  board.type: 'sam' | 'poker'
//  board (poker extra): chipValue, buyinChips
//  player (poker extra): rebuys (số lần rebuy), totalIn (tổng chip đã mua)
//  round (poker): { id, type:'poker', finalChips:{pid:n}, profit:{pid:n} }
// ═══════════════════════════════════════════════
let state = { boards: [], activeBoardId: null };

function currentBoard() {
  return state.boards.find(b => b.id === state.activeBoardId) || null;
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.players && Array.isArray(parsed.players) && !parsed.boards) {
      // migrate v4
      const leg = { id: 'board_legacy', name: 'Bảng cũ', type: 'sam',
        players: parsed.players || [], rounds: parsed.rounds || [] };
      leg.players.forEach(p => p.total = 0);
      leg.rounds.forEach(r => Object.entries(r.scores).forEach(([pid,v]) => {
        const p = leg.players.find(x => x.id === pid); if (p) p.total += v;
      }));
      state.boards = leg.players.length ? [leg] : [];
      state.activeBoardId = null;
    } else {
      state = { boards: parsed.boards || [], activeBoardId: parsed.activeBoardId || null };
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════
const esc      = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const initials = n => n.trim().charAt(0).toUpperCase();
const colorAt  = i => DEFAULT_COLORS[i % DEFAULT_COLORS.length];
const sign     = v => v > 0 ? `+${v}` : `${v}`;
const valCls   = v => v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
const fmtMoney = v => {
  const abs = Math.abs(v);
  const s   = abs >= 1000000 ? (abs/1000000).toFixed(1).replace('.0','') + 'M'
             : abs >= 1000   ? (abs/1000).toFixed(0) + 'K'
             : String(abs);
  return (v < 0 ? '-' : v > 0 ? '+' : '') + s;
};

function $id(id) { return document.getElementById(id); }
function openModal(id)  { $id(id).classList.add('active'); }
function closeModal(id) { $id(id).classList.remove('active'); }

function showToast(msg, type = 'err') {
  let t = $id('_toast');
  if (!t) {
    t = document.createElement('div'); t.id = '_toast';
    Object.assign(t.style, {
      position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
      color:'#fff', padding:'9px 20px', borderRadius:'100px',
      fontFamily:'var(--font)', fontSize:'13px', fontWeight:'700',
      zIndex:'9999', whiteSpace:'nowrap', boxShadow:'0 4px 16px rgba(0,0,0,0.18)',
      opacity:'0', transition:'opacity 0.18s', pointerEvents:'none',
    });
    document.body.appendChild(t);
  }
  t.style.background = type === 'ok' ? '#18A55E' : '#E53E3E';
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._tm); t._tm = setTimeout(() => { t.style.opacity = '0'; }, 2400);
}

// ═══════════════════════════════════════════════
//  SCREEN SWITCHER
// ═══════════════════════════════════════════════
function showBoardPicker() {
  $id('app').classList.add('hidden');
  $id('board-picker-screen').classList.remove('hidden');
  renderBoardPicker();
}

function showGameScreen() {
  $id('board-picker-screen').classList.add('hidden');
  $id('app').classList.remove('hidden');
  const board = currentBoard();
  if (!board) return;
  $id('board-title-display').textContent = board.name;

  const isSam   = board.type !== 'poker';
  const isPoker = board.type === 'poker';

  $id('sb-container').classList.toggle('hidden', !isSam);
  $id('poker-container').classList.toggle('hidden', !isPoker);
  $id('btn-new-round').classList.toggle('hidden', !isSam);
  $id('poker-fabs').classList.toggle('hidden', !isPoker);

  if (isSam) {
    recomputeTotals();
    renderScoreboard();
  } else {
    renderPokerBoard();
  }
}

// ═══════════════════════════════════════════════
//  BOARD PICKER
// ═══════════════════════════════════════════════
let pendingDeleteBoardId = null;

function renderBoardPicker() {
  const list  = $id('board-list');
  const atMax = state.boards.length >= 5;
  $id('btn-create-board').style.display  = atMax ? 'none' : '';
  $id('bp-max-notice').style.display     = atMax ? '' : 'none';

  if (!state.boards.length) {
    list.innerHTML = '<div class="bp-empty">Chưa có bảng đấu nào.<br>Nhấn bên dưới để tạo mới!</div>';
    return;
  }

  list.innerHTML = state.boards.map(b => {
    const isPoker = b.type === 'poker';
    const badge   = isPoker
      ? '<span class="bp-game-badge poker">♠ Poker</span>'
      : '<span class="bp-game-badge sam">🃏 Sâm</span>';

    let metaRight = '';
    if (isPoker) {
      // Tính tổng lãi/lỗ từ sessions
      const anySession = b.rounds && b.rounds.length > 0;
      metaRight = anySession ? `<span>${b.rounds.length} session</span>` : '<span>Chưa có session</span>';
    } else {
      const top = [...b.players].sort((a,z) => z.total - a.total)[0];
      metaRight = (top && top.total !== 0)
        ? `<span class="bp-leader ${valCls(top.total)}">🏆 ${esc(top.name)}: ${sign(top.total)}</span>`
        : `<span>${b.rounds.length} ván</span>`;
    }

    const playerChips = b.players.map(p =>
      `<span class="bp-player-chip">
        <span class="bp-dot" style="background:${p.color}"></span>
        <span class="bp-player-name">${esc(p.name)}</span>
      </span>`).join('');

    return `
    <div class="bp-card" data-bid="${b.id}">
      <div class="bp-card-body">
        <div class="bp-card-name">${esc(b.name)} ${badge}</div>
        <div class="bp-card-meta">${metaRight}</div>
        <div class="bp-card-players">${playerChips}</div>
      </div>
      <button class="bp-delete-btn" data-bid="${b.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>`;
  }).join('');

  list.querySelectorAll('.bp-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.bp-delete-btn')) return;
      state.activeBoardId = card.dataset.bid;
      save(); showGameScreen();
    });
  });
  list.querySelectorAll('.bp-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const b = state.boards.find(x => x.id === btn.dataset.bid); if (!b) return;
      $id('confirm-delete-board-text').textContent = `"${b.name}" sẽ bị xóa vĩnh viễn.`;
      pendingDeleteBoardId = btn.dataset.bid;
      openModal('confirm-delete-board-modal');
    });
  });
}

// ═══════════════════════════════════════════════
//  BOARD CREATE MODAL
// ═══════════════════════════════════════════════
let bm_colors  = DEFAULT_COLORS.slice(0,9);
let bm_type    = 'sam'; // 'sam' | 'poker'

function openBoardModal() {
  if (state.boards.length >= 5) { showToast('Tối đa 5 bảng đấu!'); return; }
  bm_colors = DEFAULT_COLORS.slice(0,9);
  bm_type   = 'sam';

  $id('board-name-input').value = '';
  $id('poker-buyin-chips').value = '100';
  $id('poker-chip-value').value  = '1000';
  $id('poker-settings').classList.add('hidden');

  // Reset game type buttons
  document.querySelectorAll('.game-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === 'sam');
  });

  // Reset players (2 mặc định)
  const sp = $id('setup-players');
  sp.innerHTML = '';
  addPlayerRow(sp, 0);
  addPlayerRow(sp, 1);
  $id('btn-add-player').style.display = '';

  openModal('board-modal');
  setTimeout(() => $id('board-name-input').focus(), 280);
}

function addPlayerRow(container, idx) {
  const maxPlayers = bm_type === 'poker' ? 9 : 5;
  const row = document.createElement('div');
  row.className = 'setup-player-row'; row.dataset.idx = String(idx);

  const dot = document.createElement('div');
  dot.className = 'setup-color-dot'; dot.dataset.idx = String(idx);
  dot.style.background = bm_colors[idx] || colorAt(idx);

  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'setup-name-input';
  inp.placeholder = 'Người chơi ' + (idx + 1); inp.maxLength = 16;

  const delBtn = document.createElement('button');
  delBtn.className = 'setup-del-btn'; delBtn.type = 'button'; delBtn.title = 'Xóa'; delBtn.innerHTML = '✕';

  row.appendChild(dot); row.appendChild(inp); row.appendChild(delBtn);
  container.appendChild(row);

  dot.addEventListener('click', () => {
    openColorPicker(bm_colors[idx] || colorAt(idx), color => {
      bm_colors[idx] = color; dot.style.background = color;
    });
  });

  delBtn.addEventListener('click', () => {
    const rows = container.querySelectorAll('.setup-player-row');
    if (rows.length <= 2) { showToast('Cần ít nhất 2 người chơi'); return; }
    container.removeChild(row);
    container.querySelectorAll('.setup-player-row').forEach((r, i) => {
      r.dataset.idx = String(i);
      const d = r.querySelector('.setup-color-dot'); if (d) d.dataset.idx = String(i);
    });
    const maxP = bm_type === 'poker' ? 9 : 5;
    if (container.querySelectorAll('.setup-player-row').length < maxP) {
      $id('btn-add-player').style.display = '';
    }
  });
}

function saveNewBoard() {
  const boardName = $id('board-name-input').value.trim() || ('Bảng ' + (state.boards.length + 1));
  const rows      = $id('setup-players').querySelectorAll('.setup-player-row');
  if (rows.length < 2) { showToast('Cần ít nhất 2 người chơi'); return; }

  const now = Date.now();
  const players = [];
  rows.forEach((row, i) => {
    const inp  = row.querySelector('.setup-name-input');
    const dot  = row.querySelector('.setup-color-dot');
    const name = (inp && inp.value.trim()) || (inp && inp.placeholder) || ('Người chơi ' + (i+1));
    const color = (dot && dot.style.background) || colorAt(i);
    const p = { id: 'p' + now + '_' + i, name, color, total: 0 };
    if (bm_type === 'poker') {
      p.rebuys  = 0;
      p.totalIn = parseInt($id('poker-buyin-chips').value) || 100;
    }
    players.push(p);
  });

  const board = {
    id: 'board_' + now, name: boardName, type: bm_type,
    players, rounds: [],
  };
  if (bm_type === 'poker') {
    board.chipValue   = parseInt($id('poker-chip-value').value)   || 1000;
    board.buyinChips  = parseInt($id('poker-buyin-chips').value)  || 100;
  }

  state.boards.push(board);
  state.activeBoardId = board.id;
  save(); closeModal('board-modal'); showGameScreen();
}

// ═══════════════════════════════════════════════
//  SÂM — SCOREBOARD
// ═══════════════════════════════════════════════
const MAX_VISIBLE_ROUNDS = 10;
let currentPage = 1;

function recomputeTotals() {
  const board = currentBoard(); if (!board) return;
  board.players.forEach(p => { p.total = 0; });
  board.rounds.forEach(round => {
    Object.entries(round.scores).forEach(([pid, v]) => {
      const p = board.players.find(x => x.id === pid); if (p) p.total += v;
    });
  });
}

function renderScoreboard() {
  const wrap  = $id('sb-container');
  const board = currentBoard();
  if (!board || !board.players.length) { wrap.innerHTML = ''; return; }

  const n         = board.players.length;
  const colTmpl   = `40px repeat(${n}, 1fr)`;
  const roundCount = board.rounds.length;
  const totalPages = Math.max(1, Math.ceil(roundCount / MAX_VISIBLE_ROUNDS));
  if (currentPage > totalPages) currentPage = totalPages;

  const pageStart  = (currentPage - 1) * MAX_VISIBLE_ROUNDS;
  const pageRounds = board.rounds.slice(pageStart, Math.min(pageStart + MAX_VISIBLE_ROUNDS, roundCount));

  const bars = board.players.map(p => `<div class="sb-bar" style="background:${p.color}"></div>`).join('');

  const headCells = board.players.map(p => `
    <div class="sb-player-cell" data-pid="${p.id}">
      <div class="sb-avatar" style="background:${p.color}">${initials(p.name)}</div>
      <div class="sb-pname">${esc(p.name)}</div>
      <div class="sb-edit-hint">✎</div>
    </div>`).join('');

  const totalCells = board.players.map(p => `
    <div class="sb-total-cell">
      <span class="sb-total-val ${valCls(p.total)}">${p.total === 0 ? '0' : sign(p.total)}</span>
    </div>`).join('');

  let roundRowsHtml = '';
  if (roundCount === 0) {
    roundRowsHtml = '<div class="sb-empty-state">Chưa có ván nào — nhấn "Ván mới"!</div>';
  } else {
    pageRounds.forEach((round, i) => {
      const gIdx = pageStart + i, isLatest = (gIdx === roundCount - 1);
      const cells = board.players.map(p => {
        const v = round.scores[p.id] ?? 0;
        return `<div class="sb-score-cell" data-round-id="${round.id}" data-pid="${p.id}">
          <span class="sb-score-val ${valCls(v)}">${v===0?'0':sign(v)}</span></div>`;
      }).join('');
      roundRowsHtml += `<div class="sb-round-row sb-row${isLatest?' is-latest':''}" style="grid-template-columns:${colTmpl}">
        <div class="sb-cell-label">${gIdx+1}</div>${cells}</div>`;
    });
    const empty = MAX_VISIBLE_ROUNDS - pageRounds.length;
    for (let i = 0; i < empty; i++) {
      const cells = board.players.map(() => '<div class="sb-score-cell sb-score-empty"></div>').join('');
      roundRowsHtml += `<div class="sb-round-row sb-row sb-row-empty" style="grid-template-columns:${colTmpl}">
        <div class="sb-cell-label"></div>${cells}</div>`;
    }
  }

  let paginationHtml = '';
  if (totalPages > 1) {
    paginationHtml = `<div class="sb-pagination">
      <button class="pg-btn" id="pg-prev" ${currentPage<=1?'disabled':''}>‹</button>
      <span class="pg-info">Trang ${currentPage} / ${totalPages}</span>
      <button class="pg-btn" id="pg-next" ${currentPage>=totalPages?'disabled':''}>›</button>
    </div>`;
  }

  wrap.innerHTML = `
  <div class="scoreboard" id="the-scoreboard">
    <div class="sb-bars sb-row" style="grid-template-columns:${colTmpl}">
      <div class="sb-bar" style="background:var(--surface2)"></div>${bars}</div>
    <div class="sb-head sb-row" style="grid-template-columns:${colTmpl}">
      <div class="sb-cell-label">—</div>${headCells}</div>
    <div class="sb-total-row sb-row" style="grid-template-columns:${colTmpl}">
      <div class="sb-cell-label" style="font-size:9px">Tổng</div>${totalCells}</div>
    <div class="sb-rounds-body" id="sb-rounds-body">${roundRowsHtml}</div>
    ${paginationHtml}
  </div>`;

  adaptRowHeights();
  document.querySelectorAll('.sb-player-cell').forEach(c => c.addEventListener('click', () => openEditName(c.dataset.pid)));
  document.querySelectorAll('.sb-score-cell').forEach(c => c.addEventListener('click', () => openEditRound(c.dataset.roundId, c.dataset.pid)));
  const pp = $id('pg-prev'), np = $id('pg-next');
  if (pp) pp.addEventListener('click', () => { currentPage--; renderScoreboard(); });
  if (np) np.addEventListener('click', () => { currentPage++; renderScoreboard(); });
}

function adaptRowHeights() {
  const sb = $id('the-scoreboard'), body = $id('sb-rounds-body');
  if (!sb || !body || body.clientHeight <= 0) return;
  const rowH = Math.max(18, Math.min(44, Math.floor(body.clientHeight / MAX_VISIBLE_ROUNDS)));
  body.querySelectorAll('.sb-round-row').forEach(r => r.style.height = rowH + 'px');
  sb.style.setProperty('--sb-fs', Math.max(9, Math.min(14, Math.floor(rowH * 0.42))) + 'px');
}

// ═══════════════════════════════════════════════
//  SÂM — EDIT NAME / ROUND
// ═══════════════════════════════════════════════
let editingPid = null, editingRoundId = null;

function openEditName(pid) {
  const board = currentBoard(); if (!board) return;
  const p = board.players.find(x => x.id === pid); if (!p) return;
  editingPid = pid;
  $id('name-edit-input').value = p.name;
  openModal('name-modal');
  setTimeout(() => $id('name-edit-input').focus(), 300);
}
function saveEditName() {
  const val = $id('name-edit-input').value.trim();
  if (!val) { showToast('Tên không được để trống'); return; }
  const board = currentBoard(); if (!board) return;
  const p = board.players.find(x => x.id === editingPid);
  if (p) p.name = val;
  editingPid = null; save(); closeModal('name-modal');
  if (currentBoard()?.type === 'poker') renderPokerBoard(); else renderScoreboard();
}

function openEditRound(roundId, focusPid) {
  const board = currentBoard(); if (!board) return;
  const round = board.rounds.find(r => String(r.id) === String(roundId)); if (!round) return;
  editingRoundId = roundId;
  currentTab = round.mode === 'winner' ? 'winner' : 'manual';
  resetRoundData();
  if (round.mode === 'manual') {
    Object.entries(round.scores).forEach(([pid, v]) => { manualScores[pid] = v; });
  } else {
    let wid = null, mx = -Infinity;
    Object.entries(round.scores).forEach(([pid,v]) => { if (v > mx) { mx=v; wid=pid; } });
    currentWinner = wid || board.players[0]?.id;
    Object.entries(round.scores).forEach(([pid,v]) => { if (pid !== currentWinner) winnerScores[pid] = v; });
  }
  $id('round-modal-title').textContent = 'Sửa ván ' + (board.rounds.findIndex(r => String(r.id) === String(roundId)) + 1);
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${currentTab}"]`).classList.add('active');
  $id(`tab-${currentTab}`).classList.add('active');
  buildManualInputs(); buildWinnerInputs(); updateManualTotal(); updateWinnerTotal();
  openModal('round-modal');
  if (focusPid) setTimeout(() => {
    const el = document.querySelector(`#${currentTab==='manual'?'manual':'winner'}-inputs .score-display[data-pid="${focusPid}"]`);
    if (el && !el.classList.contains('winner-locked')) el.click();
  }, 100);
}

// ═══════════════════════════════════════════════
//  COLOR PICKER
// ═══════════════════════════════════════════════
let colorPickerCb = null;
function openColorPicker(current, cb) {
  colorPickerCb = cb;
  const grid = $id('color-grid');
  grid.innerHTML = COLOR_PALETTE.map(c =>
    `<div class="color-swatch${c===current?' selected':''}" style="background:${c}" data-color="${c}"></div>`).join('');
  grid.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => { if (colorPickerCb) colorPickerCb(sw.dataset.color); closeModal('color-modal'); });
  });
  openModal('color-modal');
}

// ═══════════════════════════════════════════════
//  INLINE NUMPAD (shared)
// ═══════════════════════════════════════════════
let npValue = '0', npCallback = null, npActiveEl = null;
let npAllowNeg = true; // false for poker chip input

function openNumpad(el, name, color, curVal, cb, allowNeg = true) {
  if (npActiveEl && npActiveEl !== el) npActiveEl.classList.remove('focused');
  npActiveEl = el; el.classList.add('focused');
  npCallback = cb; npAllowNeg = allowNeg;
  npValue = curVal === 0 ? '0' : String(curVal);
  $id('inp-dot').style.background = color || '#4F8EF7';
  $id('inp-name').textContent = name;
  renderNpDisplay();
  const np = $id('inline-numpad');
  np.classList.remove('hidden');
  np.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
function closeNumpad() {
  if (npActiveEl) { npActiveEl.classList.remove('focused'); npActiveEl = null; }
  npCallback = null;
  $id('inline-numpad').classList.add('hidden');
}
function renderNpDisplay() {
  const el = $id('np-display'), n = parseFloat(npValue) || 0;
  el.textContent = npValue === '-' ? '−' : npValue;
  el.className   = 'np-display ' + (npValue==='-'?'is-negative':n>0?'is-positive':n<0?'is-negative':'is-zero');
}
function npPress(action, val) {
  if (action === 'digit') {
    if (val === '000') {
      if (npValue === '0' || npValue === '-0' || npValue === '-') return;
      if (npValue.replace('-','').length + 3 > 8) return;
      npValue += '000';
    } else {
      if      (npValue === '0')  npValue = val;
      else if (npValue === '-0') npValue = '-' + val;
      else if (npValue === '-')  npValue = '-' + val;
      else { if (npValue.replace('-','').length >= 8) return; npValue += val; }
    }
  } else if (action === 'backspace') {
    if (npValue === '-' || npValue.length <= 1 || npValue === '-0') npValue = '0';
    else { npValue = npValue.slice(0,-1); if (!npValue) npValue = '0'; }
  } else if (action === 'clear') { npValue = '0'; }
  else if (action === 'set-negative') { if (npAllowNeg && !npValue.startsWith('-')) npValue = npValue==='0'?'-':'-'+npValue; }
  else if (action === 'set-positive')  { npValue = npValue.replace('-','') || '0'; }
  else if (action === 'confirm') {
    const n = parseInt(npValue, 10) || 0;
    if (npCallback) npCallback(n);
    closeNumpad(); return;
  }
  renderNpDisplay();
}
function initNumpad() {
  $id('btn-np-close').addEventListener('click', closeNumpad);
  $id('inline-numpad').querySelectorAll('.nk').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.val, a = btn.dataset.action;
      if (v !== undefined) npPress('digit', v); else if (a) npPress(a);
    });
  });
}

// ═══════════════════════════════════════════════
//  SÂM — ROUND MODAL
// ═══════════════════════════════════════════════
let currentTab = 'manual', manualScores = {}, winnerScores = {}, currentWinner = null;

function resetRoundData() {
  const board = currentBoard(); if (!board) return;
  manualScores = {}; winnerScores = {};
  currentWinner = board.players[0]?.id || null;
  board.players.forEach(p => { manualScores[p.id] = 0; winnerScores[p.id] = 0; });
}
function openNewRoundModal() {
  editingRoundId = null;
  $id('round-modal-title').textContent = 'Ván mới';
  currentTab = 'manual'; resetRoundData();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[data-tab="manual"]').classList.add('active');
  $id('tab-manual').classList.add('active');
  buildManualInputs(); buildWinnerInputs(); updateManualTotal(); updateWinnerTotal();
  closeNumpad(); openModal('round-modal');
}
function buildManualInputs() {
  const board = currentBoard(); if (!board) return;
  const c = $id('manual-inputs');
  c.innerHTML = board.players.map(p => `
    <div class="round-input-row">
      <div class="row-dot" style="background:${p.color}"></div>
      <label>${esc(p.name)}</label>
      <div class="score-display is-zero" data-pid="${p.id}" role="button" tabindex="0">0</div>
    </div>`).join('');
  board.players.forEach(p => {
    const v = manualScores[p.id] || 0;
    if (v !== 0) { const el = c.querySelector(`.score-display[data-pid="${p.id}"]`); if (el) refreshDisplay(el, v); }
  });
  c.querySelectorAll('.score-display').forEach(el => {
    el.addEventListener('click', () => {
      const p = currentBoard().players.find(x => x.id === el.dataset.pid);
      openNumpad(el, p.name, p.color, manualScores[p.id]||0, val => {
        manualScores[p.id] = val; refreshDisplay(el, val);
        el.closest('.round-input-row').classList.remove('active-row'); updateManualTotal();
      });
      el.closest('.round-input-row').classList.add('active-row');
    });
  });
}
function updateManualTotal() {
  let t = 0; Object.values(manualScores).forEach(v => t += v);
  $id('manual-total').textContent = t===0?'0':sign(t);
  const h = $id('manual-hint');
  if (t===0) { h.textContent='✓ Hợp lệ'; h.className='hint ok'; }
  else { h.textContent=`Cần = 0 (đang ${sign(t)})`; h.className='hint err'; }
}
function buildWinnerInputs() {
  const board = currentBoard(); if (!board) return;
  const c = $id('winner-inputs');
  if (!currentWinner) currentWinner = board.players[0]?.id;
  c.innerHTML = board.players.map(p => {
    const isW = p.id === currentWinner;
    return `<div class="round-input-row">
      <input type="radio" name="winner" class="winner-radio" value="${p.id}" ${isW?'checked':''}/>
      <label>${esc(p.name)}</label>
      <div class="score-display ${isW?'winner-locked':'is-zero'}" data-pid="${p.id}"
           role="button" tabindex="${isW?'-1':'0'}">${isW?'Nhất':'0'}</div>
    </div>`;
  }).join('');
  board.players.forEach(p => {
    if (p.id === currentWinner) return;
    const v = winnerScores[p.id]||0;
    if (v !== 0) { const el = c.querySelector(`.score-display[data-pid="${p.id}"]`); if (el) refreshDisplay(el, v); }
  });
  updateWinnerTotal();
  c.querySelectorAll('.winner-radio').forEach(r => {
    r.addEventListener('change', () => {
      currentWinner = r.value; closeNumpad();
      c.querySelectorAll('.score-display').forEach(el => {
        const isW = el.dataset.pid === currentWinner;
        if (isW) { el.classList.add('winner-locked'); el.classList.remove('is-pos','is-neg','is-zero'); el.textContent='Nhất'; el.setAttribute('tabindex','-1'); }
        else { el.classList.remove('winner-locked'); el.setAttribute('tabindex','0'); refreshDisplay(el, winnerScores[el.dataset.pid]||0); }
        el.closest('.round-input-row').classList.remove('active-row');
      });
      updateWinnerTotal();
    });
  });
  c.querySelectorAll('.score-display').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.pid === currentWinner) return;
      const p = currentBoard().players.find(x => x.id === el.dataset.pid);
      openNumpad(el, p.name, p.color, winnerScores[p.id]||0, val => {
        const neg = val>0?-val:val; winnerScores[p.id]=neg; refreshDisplay(el,neg);
        el.closest('.round-input-row').classList.remove('active-row'); updateWinnerTotal();
      });
      el.closest('.round-input-row').classList.add('active-row');
    });
  });
}
function updateWinnerTotal() {
  const board = currentBoard(); if (!board) return;
  let t = 0; board.players.forEach(p => { if (p.id !== currentWinner) t += Math.abs(winnerScores[p.id]||0); });
  $id('winner-total').textContent = t;
  const winEl = document.querySelector(`#winner-inputs .score-display[data-pid="${currentWinner}"]`);
  if (winEl) winEl.textContent = t>0?`+${t}`:'Nhất';
}
function refreshDisplay(el, val) {
  el.textContent = val===0?'0':sign(val);
  el.classList.remove('is-pos','is-neg','is-zero');
  el.classList.add(val>0?'is-pos':val<0?'is-neg':'is-zero');
}
function clearRoundForm() {
  resetRoundData(); buildManualInputs(); buildWinnerInputs(); updateManualTotal(); updateWinnerTotal(); closeNumpad();
}
function saveRound() {
  const board = currentBoard(); if (!board) return;
  let scores = {}, mode;
  if (currentTab === 'manual') {
    let t = 0; board.players.forEach(p => { scores[p.id]=manualScores[p.id]||0; t+=scores[p.id]; });
    if (t !== 0) { showToast('Tổng điểm phải bằng 0!'); return; }
    mode = 'manual';
  } else {
    let sum = 0; board.players.forEach(p => {
      if (p.id !== currentWinner) { const v=winnerScores[p.id]||0; scores[p.id]=v; sum+=Math.abs(v); }
    });
    scores[currentWinner] = sum; mode = 'winner';
  }
  if (editingRoundId !== null) {
    const r = board.rounds.find(r => String(r.id)===String(editingRoundId));
    if (r) { r.scores=scores; r.mode=mode; }
    editingRoundId = null;
  } else {
    board.rounds.push({ id:Date.now(), mode, scores });
    currentPage = Math.ceil(board.rounds.length / MAX_VISIBLE_ROUNDS);
  }
  recomputeTotals(); save(); closeModal('round-modal'); closeNumpad(); renderScoreboard();
}

// ═══════════════════════════════════════════════
//  POKER — BOARD RENDER
// ═══════════════════════════════════════════════
function renderPokerBoard() {
  const wrap  = $id('poker-container');
  const board = currentBoard(); if (!board) return;

  // Tính lãi/lỗ tích luỹ từ các sessions
  const profit = {}; // pid -> tổng lãi/lỗ chip
  board.players.forEach(p => profit[p.id] = 0);
  board.rounds.forEach(r => {
    if (r.type !== 'poker') return;
    Object.entries(r.profit).forEach(([pid, v]) => { profit[pid] = (profit[pid]||0) + v; });
  });

  // Player cards
  const playerCards = board.players.map(p => {
    const pft      = profit[p.id] || 0;
    const money    = pft * board.chipValue;
    const totalIn  = (p.totalIn || board.buyinChips) + (p.rebuys || 0) * board.buyinChips;
    const moneyStr = fmtMoney(money);
    const chipStr  = pft === 0 ? '0' : sign(pft);
    return `
    <div class="pk-player-card" data-pid="${p.id}">
      <div class="pk-avatar" style="background:${p.color}">${initials(p.name)}</div>
      <div class="pk-player-info">
        <div class="pk-player-name">${esc(p.name)}</div>
        <div class="pk-player-sub">Buy-in: ${totalIn} chip${p.rebuys>0?' · Rebuy ×'+p.rebuys:''}</div>
      </div>
      <div class="pk-player-result">
        <div class="pk-chip-val ${valCls(pft)}">${chipStr}</div>
        <div class="pk-money-val ${valCls(money)}">${moneyStr}đ</div>
      </div>
    </div>`;
  }).join('');

  // Session history
  const sessionRows = board.rounds.length === 0
    ? '<div class="pk-empty">Chưa có session nào</div>'
    : [...board.rounds].reverse().map((r, idx) => {
        const num = board.rounds.length - idx;
        const chips = board.players.map(p => {
          const v = r.profit[p.id] ?? 0;
          return `<span class="pk-hist-chip ${valCls(v)}">
            <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${p.color};margin-right:3px"></span>
            ${esc(p.name)}: ${v===0?'0':sign(v)}
          </span>`;
        }).join('');
        return `<div class="pk-session-row">
          <div class="pk-session-label">Session ${num}</div>
          <div class="pk-session-chips">${chips}</div>
        </div>`;
      }).join('');

  wrap.innerHTML = `
  <div class="poker-board">
    <div class="pk-chip-rate">
      <span>1 chip = <strong>${board.chipValue.toLocaleString()}đ</strong></span>
      <span>Buy-in: <strong>${board.buyinChips} chip</strong></span>
    </div>
    <div class="pk-players">${playerCards}</div>
    <div class="pk-sessions">
      <div class="pk-sessions-title">Lịch sử session</div>
      ${sessionRows}
    </div>
  </div>`;

  // Edit name on avatar click
  wrap.querySelectorAll('.pk-player-card').forEach(c => {
    c.querySelector('.pk-avatar')?.addEventListener('click', () => openEditName(c.dataset.pid));
  });
}

// ═══════════════════════════════════════════════
//  POKER — NUMPAD (riêng, chỉ số dương)
// ═══════════════════════════════════════════════
let pkNpValue = '0', pkNpCb = null, pkNpActiveEl = null;

function openPokerNumpad(el, name, color, curVal) {
  return new Promise(resolve => {
    if (pkNpActiveEl && pkNpActiveEl !== el) pkNpActiveEl.classList.remove('focused');
    pkNpActiveEl = el; el.classList.add('focused');
    pkNpCb = v => { resolve(v); };
    pkNpValue = curVal > 0 ? String(curVal) : '0';
    $id('pk-inp-dot').style.background = color;
    $id('pk-inp-name').textContent = name;
    renderPkNpDisplay();
    $id('poker-end-inline-numpad').classList.remove('hidden');
    $id('poker-end-inline-numpad').scrollIntoView({ behavior:'smooth', block:'nearest' });
  });
}
function closePkNumpad() {
  if (pkNpActiveEl) { pkNpActiveEl.classList.remove('focused'); pkNpActiveEl = null; }
  pkNpCb = null; pkNpValue = '0';
  $id('poker-end-inline-numpad').classList.add('hidden');
}
function renderPkNpDisplay() {
  const n = parseInt(pkNpValue) || 0;
  $id('pk-np-display').textContent = pkNpValue;
  $id('pk-np-display').className = 'np-display ' + (n > 0 ? 'is-positive' : 'is-zero');
}
function pkNpPress(action, val) {
  if (action === 'digit') {
    if (val === '000') {
      if (pkNpValue === '0') return;
      if (pkNpValue.length + 3 > 8) return;
      pkNpValue += '000';
    } else {
      if (pkNpValue === '0') pkNpValue = val;
      else { if (pkNpValue.length >= 8) return; pkNpValue += val; }
    }
  } else if (action === 'backspace') {
    pkNpValue = pkNpValue.length <= 1 ? '0' : pkNpValue.slice(0,-1);
  } else if (action === 'clear') { pkNpValue = '0'; }
  else if (action === 'confirm') {
    const n = parseInt(pkNpValue, 10) || 0;
    if (pkNpCb) pkNpCb(n);
    closePkNumpad(); return;
  }
  renderPkNpDisplay();
}
function initPokerNumpad() {
  $id('btn-pk-np-close').addEventListener('click', closePkNumpad);
  $id('pk-np-grid').querySelectorAll('.nk').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.val, a = btn.dataset.action;
      if (v !== undefined) pkNpPress('digit', v); else if (a) pkNpPress(a);
    });
  });
}

// ═══════════════════════════════════════════════
//  POKER — END SESSION MODAL
// ═══════════════════════════════════════════════
let pkEndChips = {}; // pid -> final chips

function openPokerEndModal() {
  const board = currentBoard(); if (!board) return;
  pkEndChips = {};
  board.players.forEach(p => { pkEndChips[p.id] = 0; });

  const c = $id('poker-end-inputs');
  c.innerHTML = board.players.map(p => `
    <div class="round-input-row">
      <div class="row-dot" style="background:${p.color}"></div>
      <label>${esc(p.name)}</label>
      <div class="score-display is-zero pk-chip-display" data-pid="${p.id}" role="button" tabindex="0">0</div>
    </div>`).join('');

  closePkNumpad();
  c.querySelectorAll('.pk-chip-display').forEach(el => {
    el.addEventListener('click', async () => {
      const pid = el.dataset.pid;
      const p   = board.players.find(x => x.id === pid);
      const val = await openPokerNumpad(el, p.name, p.color, pkEndChips[pid] || 0);
      pkEndChips[pid] = val;
      el.textContent = val;
      el.classList.remove('is-zero','is-pos');
      el.classList.add(val > 0 ? 'is-pos' : 'is-zero');
      el.closest('.round-input-row').classList.remove('active-row');
    });
    el.addEventListener('click', () => el.closest('.round-input-row').classList.add('active-row'), true);
  });

  openModal('poker-end-modal');
}

function savePokerSession() {
  const board = currentBoard(); if (!board) return;
  // Tính lãi/lỗ: finalChips - totalIn
  const profit = {};
  board.players.forEach(p => {
    const fin    = pkEndChips[p.id] || 0;
    const totalIn = (p.totalIn || board.buyinChips) + (p.rebuys || 0) * board.buyinChips;
    profit[p.id]  = fin - totalIn;
  });

  board.rounds.push({ id: Date.now(), type: 'poker', finalChips: { ...pkEndChips }, profit });

  // Reset rebuys sau session
  board.players.forEach(p => { p.rebuys = 0; p.totalIn = board.buyinChips; });

  save(); closePkNumpad(); closeModal('poker-end-modal'); renderPokerBoard();
  showToast('Đã lưu session!', 'ok');
}

// ═══════════════════════════════════════════════
//  POKER — REBUY MODAL
// ═══════════════════════════════════════════════
function openRebuyModal() {
  const board = currentBoard(); if (!board) return;
  const c = $id('poker-rebuy-inputs');
  c.innerHTML = board.players.map(p => `
    <div class="round-input-row" style="justify-content:space-between">
      <div style="display:flex;align-items:center;gap:9px">
        <div class="row-dot" style="background:${p.color}"></div>
        <span style="font-weight:600;font-size:14px">${esc(p.name)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="rebuy-dec" data-pid="${p.id}">−</button>
        <span class="rebuy-count" data-pid="${p.id}" style="font-size:15px;font-weight:700;min-width:20px;text-align:center">${p.rebuys||0}</span>
        <button class="rebuy-inc" data-pid="${p.id}">+</button>
      </div>
    </div>`).join('');

  // Temp rebuy counts
  const tmp = {}; board.players.forEach(p => tmp[p.id] = p.rebuys || 0);

  c.querySelectorAll('.rebuy-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.pid; tmp[pid]++;
      c.querySelector(`.rebuy-count[data-pid="${pid}"]`).textContent = tmp[pid];
    });
  });
  c.querySelectorAll('.rebuy-dec').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.pid; if (tmp[pid] <= 0) return; tmp[pid]--;
      c.querySelector(`.rebuy-count[data-pid="${pid}"]`).textContent = tmp[pid];
    });
  });

  $id('btn-save-rebuy').onclick = () => {
    const board2 = currentBoard();
    board2.players.forEach(p => { p.rebuys = tmp[p.id]; });
    save(); closeModal('poker-rebuy-modal'); renderPokerBoard();
    showToast('Đã cập nhật rebuy!', 'ok');
  };
  openModal('poker-rebuy-modal');
}

// ═══════════════════════════════════════════════
//  HISTORY (Sâm)
// ═══════════════════════════════════════════════
function renderHistory() {
  const board = currentBoard(), list = $id('history-list');
  const isPoker = board?.type === 'poker';

  if (!board || !board.rounds.length) {
    list.innerHTML = '<div class="empty-state">Chưa có lịch sử.</div>'; return;
  }

  if (isPoker) {
    list.innerHTML = [...board.rounds].reverse().map((r, idx) => {
      const num = board.rounds.length - idx;
      const chips = board.players.map(p => {
        const v = r.profit[p.id] ?? 0, money = v * board.chipValue;
        return `<div class="history-score-chip">
          <span class="hs-dot" style="background:${p.color}"></span>
          <span class="hs-name">${esc(p.name)}</span>
          <span class="hs-val ${valCls(v)}">${v===0?'0':sign(v)} chip (${fmtMoney(money)}đ)</span>
        </div>`;
      }).join('');
      return `<div class="history-item">
        <div class="history-item-header">
          <span class="history-van">Session ${num}</span>
          <span class="history-mode">♠ Poker</span>
        </div>
        <div class="history-scores">${chips}</div>
      </div>`;
    }).join('');
  } else {
    list.innerHTML = [...board.rounds].reverse().map((r, idx) => {
      const num = board.rounds.length - idx;
      const chips = Object.entries(r.scores).map(([pid, val]) => {
        const p = board.players.find(x => x.id === pid); if (!p) return '';
        return `<div class="history-score-chip">
          <span class="hs-dot" style="background:${p.color}"></span>
          <span class="hs-name">${esc(p.name)}</span>
          <span class="hs-val ${valCls(val)}">${val===0?'0':sign(val)}</span>
        </div>`;
      }).join('');
      return `<div class="history-item">
        <div class="history-item-header">
          <span class="history-van">Ván ${num}</span>
          <span class="history-mode">${r.mode==='winner'?'🏆 Nhất ăn tất':'✏️ Thủ công'}</span>
        </div>
        <div class="history-scores">${chips}</div>
      </div>`;
    }).join('');
  }
}

// ═══════════════════════════════════════════════
//  TABS (Sâm round modal)
// ═══════════════════════════════════════════════
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active'); currentTab = btn.dataset.tab;
      $id(`tab-${currentTab}`).classList.add('active'); closeNumpad();
    });
  });
}

// ═══════════════════════════════════════════════
//  RESET
// ═══════════════════════════════════════════════
function doReset() {
  const board = currentBoard(); if (!board) return;
  state.boards = state.boards.filter(b => b.id !== board.id);
  state.activeBoardId = null;
  save(); closeModal('confirm-modal'); showBoardPicker();
}

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
function init() {
  load();
  state.boards.forEach(b => {
    if (b.type !== 'poker') {
      b.players.forEach(p => p.total = 0);
      b.rounds.forEach(r => Object.entries(r.scores||{}).forEach(([pid,v]) => {
        const p = b.players.find(x => x.id === pid); if (p) p.total += v;
      }));
    }
  });

  initTabs(); initNumpad(); initPokerNumpad();

  // ── Game type selector (board modal) ──
  document.querySelectorAll('.game-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.game-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bm_type = btn.dataset.type;
      $id('poker-settings').classList.toggle('hidden', bm_type !== 'poker');
      // Adjust max players hint
      const label = document.querySelector('#board-modal .field-label[data-players-label]');
    });
  });

  // ── Board Picker ──
  $id('btn-create-board').addEventListener('click', openBoardModal);

  // ── Board Modal ──
  $id('btn-save-board').addEventListener('click', saveNewBoard);
  $id('btn-cancel-board').addEventListener('click', () => closeModal('board-modal'));
  $id('btn-close-board-modal').addEventListener('click', () => closeModal('board-modal'));
  $id('btn-add-player').addEventListener('click', () => {
    const sp = $id('setup-players'), rows = sp.querySelectorAll('.setup-player-row');
    const maxP = bm_type === 'poker' ? 9 : 5;
    if (rows.length >= maxP) return;
    addPlayerRow(sp, rows.length);
    if (sp.querySelectorAll('.setup-player-row').length >= maxP) $id('btn-add-player').style.display = 'none';
  });
  $id('board-name-input').addEventListener('keydown', e => { if (e.key==='Enter') saveNewBoard(); });

  // ── Header ──
  $id('btn-back-boards').addEventListener('click', () => { closeNumpad(); showBoardPicker(); });
  $id('btn-new-board-from-game').addEventListener('click', openBoardModal);
  $id('btn-history').addEventListener('click', () => { renderHistory(); openModal('history-modal'); });
  $id('btn-close-history').addEventListener('click', () => closeModal('history-modal'));
  $id('btn-reset').addEventListener('click', () => openModal('confirm-modal'));
  $id('btn-cancel-reset').addEventListener('click', () => closeModal('confirm-modal'));
  $id('btn-confirm-reset').addEventListener('click', doReset);

  // ── Sâm round modal ──
  $id('btn-new-round').addEventListener('click', openNewRoundModal);
  $id('btn-close-modal').addEventListener('click', () => { closeModal('round-modal'); closeNumpad(); });
  $id('btn-save-round').addEventListener('click', saveRound);
  $id('btn-clear-round').addEventListener('click', clearRoundForm);

  // ── Poker FABs ──
  $id('btn-poker-end').addEventListener('click', openPokerEndModal);
  $id('btn-poker-rebuy').addEventListener('click', openRebuyModal);

  // ── Poker end modal ──
  $id('btn-close-poker-end').addEventListener('click', () => { closePkNumpad(); closeModal('poker-end-modal'); });
  $id('btn-cancel-poker-end').addEventListener('click', () => { closePkNumpad(); closeModal('poker-end-modal'); });
  $id('btn-save-poker-end').addEventListener('click', savePokerSession);

  // ── Poker rebuy modal ──
  $id('btn-close-rebuy').addEventListener('click', () => closeModal('poker-rebuy-modal'));
  $id('btn-cancel-rebuy').addEventListener('click', () => closeModal('poker-rebuy-modal'));

  // ── Name modal ──
  $id('btn-close-name').addEventListener('click', () => closeModal('name-modal'));
  $id('btn-cancel-name').addEventListener('click', () => closeModal('name-modal'));
  $id('btn-save-name').addEventListener('click', saveEditName);
  $id('name-edit-input').addEventListener('keydown', e => { if (e.key==='Enter') saveEditName(); });

  // ── Color modal ──
  $id('btn-close-color').addEventListener('click', () => closeModal('color-modal'));

  // ── Confirm delete board ──
  $id('btn-cancel-delete-board').addEventListener('click', () => { pendingDeleteBoardId=null; closeModal('confirm-delete-board-modal'); });
  $id('btn-confirm-delete-board').addEventListener('click', () => {
    if (pendingDeleteBoardId) {
      state.boards = state.boards.filter(b => b.id !== pendingDeleteBoardId);
      if (state.activeBoardId === pendingDeleteBoardId) state.activeBoardId = null;
      pendingDeleteBoardId = null; save();
    }
    closeModal('confirm-delete-board-modal'); renderBoardPicker();
  });

  // ── Backdrop close ──
  ['round-modal','history-modal','color-modal','poker-end-modal'].forEach(id => {
    $id(id).addEventListener('click', function(e) {
      if (e.target === this) {
        closeModal(id);
        if (id === 'round-modal') closeNumpad();
        if (id === 'poker-end-modal') closePkNumpad();
      }
    });
  });

  window.addEventListener('resize', () => {
    const b = currentBoard();
    if (b?.type === 'poker') renderPokerBoard();
    else if (b) renderScoreboard();
  });

  // ── Initial screen: always show board picker on refresh ──
  state.activeBoardId = null;
  showBoardPicker();
}

document.addEventListener('DOMContentLoaded', init);