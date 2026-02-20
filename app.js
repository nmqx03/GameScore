'use strict';

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════
const STORAGE_KEY = 'sam_v5';

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
//  { boards: [{id, name, players, rounds}], activeBoardId }
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
    // migrate old v4 single-board data
    if (parsed.players && Array.isArray(parsed.players) && !parsed.boards) {
      const leg = { id: 'board_legacy', name: 'Bảng cũ', players: parsed.players || [], rounds: parsed.rounds || [] };
      // recompute totals
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
  clearTimeout(t._tm); t._tm = setTimeout(() => { t.style.opacity = '0'; }, 2200);
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
  $id('board-title-display').textContent = board ? board.name : 'Bảng đấu';
  recomputeTotals();
  renderScoreboard();
}

// ═══════════════════════════════════════════════
//  BOARD PICKER
// ═══════════════════════════════════════════════
let pendingDeleteBoardId = null;

function renderBoardPicker() {
  const list = $id('board-list');
  const atMax = state.boards.length >= 5;

  // Ẩn/hiện nút tạo bảng mới tuỳ số lượng
  const createBtn = $id('btn-create-board');
  if (createBtn) {
    createBtn.style.display = atMax ? 'none' : '';
    $id('bp-max-notice') && ($id('bp-max-notice').style.display = atMax ? '' : 'none');
  }

  if (!state.boards.length) {
    list.innerHTML = '<div class="bp-empty">Chưa có bảng đấu nào.<br>Nhấn bên dưới để tạo mới!</div>';
    return;
  }
  list.innerHTML = state.boards.map(b => {
    const top  = [...b.players].sort((a,z) => z.total - a.total)[0];
    const topHtml = (top && top.total !== 0)
      ? `<span class="bp-leader ${valCls(top.total)}">🏆 ${esc(top.name)}: ${sign(top.total)}</span>` : '';
    const playerChips = b.players.map(p =>
      `<span class="bp-player-chip">
        <span class="bp-dot" style="background:${p.color}"></span>
        <span class="bp-player-name">${esc(p.name)}</span>
      </span>`).join('');
    return `
    <div class="bp-card" data-bid="${b.id}">
      <div class="bp-card-body">
        <div class="bp-card-name">${esc(b.name)}</div>
        <div class="bp-card-meta"><span>${b.rounds.length} ván</span>${topHtml}</div>
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

  // Bind clicks
  list.querySelectorAll('.bp-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.bp-delete-btn')) return;
      state.activeBoardId = card.dataset.bid;
      save();
      showGameScreen();
    });
  });
  list.querySelectorAll('.bp-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const bid = btn.dataset.bid;
      const b   = state.boards.find(x => x.id === bid);
      if (!b) return;
      $id('confirm-delete-board-text').textContent = `"${b.name}" sẽ bị xóa vĩnh viễn.`;
      pendingDeleteBoardId = bid;
      openModal('confirm-delete-board-modal');
    });
  });
}

// ═══════════════════════════════════════════════
//  BOARD CREATE MODAL
//  Toàn bộ state tạm của form nằm ở đây
// ═══════════════════════════════════════════════
let bm_colors = DEFAULT_COLORS.slice(0, 5); // màu tương ứng từng hàng người chơi

function openBoardModal() {
  if (state.boards.length >= 5) {
    showToast('Tối đa 5 bảng đấu!'); return;
  }
  bm_colors = DEFAULT_COLORS.slice(0, 5);

  $id('board-name-input').value = '';

  // Rebuild danh sách người chơi — 2 người mặc định
  const sp = $id('setup-players');
  sp.innerHTML = '';
  addPlayerRow(sp, 0);
  addPlayerRow(sp, 1);
  $id('btn-add-player').style.display = '';

  openModal('board-modal');
  setTimeout(() => $id('board-name-input').focus(), 280);
}

function addPlayerRow(container, idx) {
  const row = document.createElement('div');
  row.className  = 'setup-player-row';
  row.dataset.idx = String(idx);

  const dot = document.createElement('div');
  dot.className  = 'setup-color-dot';
  dot.dataset.idx = String(idx);
  dot.style.background = bm_colors[idx] || colorAt(idx);

  const inp = document.createElement('input');
  inp.type        = 'text';
  inp.className   = 'setup-name-input';
  inp.placeholder = 'Người chơi ' + (idx + 1);
  inp.maxLength   = 16;

  const delBtn = document.createElement('button');
  delBtn.className = 'setup-del-btn';
  delBtn.type      = 'button';
  delBtn.title     = 'Xóa';
  delBtn.innerHTML = '✕';

  row.appendChild(dot);
  row.appendChild(inp);
  row.appendChild(delBtn);
  container.appendChild(row);

  // Color dot
  dot.addEventListener('click', () => {
    openColorPicker(bm_colors[idx] || colorAt(idx), color => {
      bm_colors[idx] = color;
      dot.style.background = color;
    });
  });

  // Xóa row — tối thiểu 2 người
  delBtn.addEventListener('click', () => {
    const rows = container.querySelectorAll('.setup-player-row');
    if (rows.length <= 2) { showToast('Cần ít nhất 2 người chơi'); return; }
    container.removeChild(row);
    // Reindex
    container.querySelectorAll('.setup-player-row').forEach((r, i) => {
      r.dataset.idx = String(i);
      const d = r.querySelector('.setup-color-dot');
      if (d) d.dataset.idx = String(i);
    });
    // Hiện lại nút thêm nếu < 5
    if (container.querySelectorAll('.setup-player-row').length < 5) {
      $id('btn-add-player').style.display = '';
    }
  });
}

function saveNewBoard() {
  const boardName = $id('board-name-input').value.trim() || ('Bảng ' + (state.boards.length + 1));
  const rows      = $id('setup-players').querySelectorAll('.setup-player-row');

  if (rows.length < 2) { showToast('Cần ít nhất 2 người chơi'); return; }

  const now     = Date.now();
  const players = [];
  rows.forEach((row, i) => {
    const inp   = row.querySelector('.setup-name-input');
    const dot   = row.querySelector('.setup-color-dot');
    const name  = (inp && inp.value.trim()) || (inp && inp.placeholder) || ('Người chơi ' + (i+1));
    // Lấy màu từ dot thực tế (sau khi reindex do xóa)
    const color = (dot && dot.style.background) || colorAt(i);
    players.push({ id: 'p' + now + '_' + i, name, color, total: 0 });
  });

  const board = { id: 'board_' + now, name: boardName, players, rounds: [] };
  state.boards.push(board);
  state.activeBoardId = board.id;
  save();
  closeModal('board-modal');
  showGameScreen();
}

// ═══════════════════════════════════════════════
//  SCOREBOARD RENDER
// ═══════════════════════════════════════════════
const MAX_VISIBLE_ROUNDS = 10;
let currentPage = 1;

function recomputeTotals() {
  const board = currentBoard(); if (!board) return;
  board.players.forEach(p => { p.total = 0; });
  board.rounds.forEach(round => {
    Object.entries(round.scores).forEach(([pid, v]) => {
      const p = board.players.find(x => x.id === pid);
      if (p) p.total += v;
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
  const pageEnd    = Math.min(pageStart + MAX_VISIBLE_ROUNDS, roundCount);
  const pageRounds = board.rounds.slice(pageStart, pageEnd);

  const bars = board.players.map(p =>
    `<div class="sb-bar" style="background:${p.color}"></div>`).join('');

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
      const globalIdx = pageStart + i;
      const roundNum  = globalIdx + 1;
      const isLatest  = (globalIdx === roundCount - 1);
      const scoreCells = board.players.map(p => {
        const v = round.scores[p.id] ?? 0;
        return `<div class="sb-score-cell" data-round-id="${round.id}" data-pid="${p.id}">
          <span class="sb-score-val ${valCls(v)}">${v === 0 ? '0' : sign(v)}</span>
        </div>`;
      }).join('');
      roundRowsHtml += `
        <div class="sb-round-row sb-row${isLatest ? ' is-latest' : ''}" style="grid-template-columns:${colTmpl}">
          <div class="sb-cell-label">${roundNum}</div>${scoreCells}
        </div>`;
    });
    const emptyCount = MAX_VISIBLE_ROUNDS - pageRounds.length;
    for (let i = 0; i < emptyCount; i++) {
      const emptyCells = board.players.map(() => '<div class="sb-score-cell sb-score-empty"></div>').join('');
      roundRowsHtml += `
        <div class="sb-round-row sb-row sb-row-empty" style="grid-template-columns:${colTmpl}">
          <div class="sb-cell-label"></div>${emptyCells}
        </div>`;
    }
  }

  let paginationHtml = '';
  if (totalPages > 1) {
    paginationHtml = `
    <div class="sb-pagination">
      <button class="pg-btn" id="pg-prev" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>
      <span class="pg-info">Trang ${currentPage} / ${totalPages}</span>
      <button class="pg-btn" id="pg-next" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>
    </div>`;
  }

  wrap.innerHTML = `
  <div class="scoreboard" id="the-scoreboard">
    <div class="sb-bars sb-row" style="grid-template-columns:${colTmpl}">
      <div class="sb-bar" style="background:var(--surface2)"></div>${bars}
    </div>
    <div class="sb-head sb-row" style="grid-template-columns:${colTmpl}">
      <div class="sb-cell-label">—</div>${headCells}
    </div>
    <div class="sb-total-row sb-row" style="grid-template-columns:${colTmpl}">
      <div class="sb-cell-label" style="font-size:9px">Tổng</div>${totalCells}
    </div>
    <div class="sb-rounds-body" id="sb-rounds-body">${roundRowsHtml}</div>
    ${paginationHtml}
  </div>`;

  adaptRowHeights();
  bindScoreboardClicks();

  const pp = $id('pg-prev'), np2 = $id('pg-next');
  if (pp) pp.addEventListener('click', () => { currentPage--; renderScoreboard(); });
  if (np2) np2.addEventListener('click', () => { currentPage++; renderScoreboard(); });
}

function adaptRowHeights() {
  const sb   = $id('the-scoreboard'); if (!sb)   return;
  const body = $id('sb-rounds-body'); if (!body) return;
  const bodyH = body.clientHeight;    if (bodyH <= 0) return;
  const rowH     = Math.floor(bodyH / MAX_VISIBLE_ROUNDS);
  const clampedH = Math.max(18, Math.min(44, rowH));
  const fs       = Math.max(9, Math.min(14, Math.floor(clampedH * 0.42)));
  body.querySelectorAll('.sb-round-row').forEach(r => { r.style.height = clampedH + 'px'; });
  sb.style.setProperty('--sb-fs', fs + 'px');
}

function bindScoreboardClicks() {
  document.querySelectorAll('.sb-player-cell').forEach(cell => {
    cell.addEventListener('click', () => openEditName(cell.dataset.pid));
  });
  document.querySelectorAll('.sb-score-cell').forEach(cell => {
    cell.addEventListener('click', () => openEditRound(cell.dataset.roundId, cell.dataset.pid));
  });
}

// ═══════════════════════════════════════════════
//  EDIT NAME
// ═══════════════════════════════════════════════
let editingPid = null;

function openEditName(pid) {
  const board = currentBoard(); if (!board) return;
  const p = board.players.find(x => x.id === pid); if (!p) return;
  editingPid = pid;
  $id('name-edit-input').value = p.name;
  openModal('name-modal');
  setTimeout(() => $id('name-edit-input').focus(), 300);
}

function saveEditName() {
  if (!editingPid) return;
  const val = $id('name-edit-input').value.trim();
  if (!val) { showToast('Tên không được để trống'); return; }
  const board = currentBoard(); if (!board) return;
  const p = board.players.find(x => x.id === editingPid);
  if (p) p.name = val;
  editingPid = null;
  save();
  closeModal('name-modal');
  renderScoreboard();
}

// ═══════════════════════════════════════════════
//  EDIT ROUND
// ═══════════════════════════════════════════════
let editingRoundId  = null;
let editingFocusPid = null;

function openEditRound(roundId, focusPid) {
  const board = currentBoard(); if (!board) return;
  const round = board.rounds.find(r => String(r.id) === String(roundId));
  if (!round) return;
  editingRoundId  = roundId;
  editingFocusPid = focusPid;

  currentTab = round.mode === 'winner' ? 'winner' : 'manual';
  resetRoundData();

  if (round.mode === 'manual') {
    Object.entries(round.scores).forEach(([pid, v]) => { manualScores[pid] = v; });
  } else {
    let winnerId = null, maxV = -Infinity;
    Object.entries(round.scores).forEach(([pid, v]) => { if (v > maxV) { maxV = v; winnerId = pid; } });
    currentWinner = winnerId || board.players[0]?.id;
    Object.entries(round.scores).forEach(([pid, v]) => {
      if (pid !== currentWinner) winnerScores[pid] = v;
    });
  }

  $id('round-modal-title').textContent =
    'Sửa ván ' + (board.rounds.findIndex(r => String(r.id) === String(roundId)) + 1);

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${currentTab}"]`).classList.add('active');
  $id(`tab-${currentTab}`).classList.add('active');

  buildManualInputs(); buildWinnerInputs();
  updateManualTotal(); updateWinnerTotal();
  openModal('round-modal');

  if (focusPid) {
    setTimeout(() => {
      const sel = currentTab === 'manual'
        ? `#manual-inputs .score-display[data-pid="${focusPid}"]`
        : `#winner-inputs .score-display[data-pid="${focusPid}"]`;
      const el = document.querySelector(sel);
      if (el && !el.classList.contains('winner-locked')) el.click();
    }, 100);
  }
}

// ═══════════════════════════════════════════════
//  COLOR PICKER
// ═══════════════════════════════════════════════
let colorPickerCb = null;

function openColorPicker(currentColor, cb) {
  colorPickerCb = cb;
  const grid = $id('color-grid');
  grid.innerHTML = COLOR_PALETTE.map(c =>
    `<div class="color-swatch${c === currentColor ? ' selected' : ''}" style="background:${c}" data-color="${c}"></div>`
  ).join('');
  grid.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      if (colorPickerCb) colorPickerCb(sw.dataset.color);
      closeModal('color-modal');
    });
  });
  openModal('color-modal');
}

// ═══════════════════════════════════════════════
//  INLINE NUMPAD
// ═══════════════════════════════════════════════
let npValue    = '0';
let npCallback = null;
let npActiveEl = null;

function openNumpad(el, playerName, playerColor, currentVal, cb) {
  if (npActiveEl && npActiveEl !== el) npActiveEl.classList.remove('focused');
  npActiveEl = el; el.classList.add('focused');
  npCallback = cb;
  npValue = currentVal === 0 ? '0' : String(currentVal);
  $id('inp-dot').style.background = playerColor || '#4F8EF7';
  $id('inp-name').textContent = playerName;
  renderNpDisplay();
  const np = $id('inline-numpad');
  np.classList.remove('hidden');
  np.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeNumpad() {
  if (npActiveEl) { npActiveEl.classList.remove('focused'); npActiveEl = null; }
  npCallback = null;
  $id('inline-numpad').classList.add('hidden');
}

function renderNpDisplay() {
  const el = $id('np-display');
  const n  = parseFloat(npValue) || 0;
  el.textContent = npValue === '-' ? '−' : npValue;
  el.className   = 'np-display ' + (npValue === '-' ? 'is-negative' : n > 0 ? 'is-positive' : n < 0 ? 'is-negative' : 'is-zero');
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
  } else if (action === 'clear') {
    npValue = '0';
  } else if (action === 'set-negative') {
    if (!npValue.startsWith('-')) npValue = npValue === '0' ? '-' : '-' + npValue;
  } else if (action === 'set-positive') {
    npValue = npValue.replace('-','') || '0';
  } else if (action === 'confirm') {
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
      if (v !== undefined) npPress('digit', v);
      else if (a) npPress(a);
    });
  });
}

// ═══════════════════════════════════════════════
//  ROUND MODAL
// ═══════════════════════════════════════════════
let currentTab    = 'manual';
let manualScores  = {};
let winnerScores  = {};
let currentWinner = null;

function resetRoundData() {
  const board = currentBoard(); if (!board) return;
  manualScores = {}; winnerScores = {};
  currentWinner = board.players[0]?.id || null;
  board.players.forEach(p => { manualScores[p.id] = 0; winnerScores[p.id] = 0; });
}

function openNewRoundModal() {
  editingRoundId = null;
  $id('round-modal-title').textContent = 'Ván mới';
  currentTab = 'manual';
  resetRoundData();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[data-tab="manual"]').classList.add('active');
  $id('tab-manual').classList.add('active');
  buildManualInputs(); buildWinnerInputs();
  updateManualTotal(); updateWinnerTotal();
  closeNumpad();
  openModal('round-modal');
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
      const pid = el.dataset.pid;
      const p   = currentBoard().players.find(x => x.id === pid);
      openNumpad(el, p.name, p.color, manualScores[pid] || 0, val => {
        manualScores[pid] = val; refreshDisplay(el, val);
        el.closest('.round-input-row').classList.remove('active-row');
        updateManualTotal();
      });
      el.closest('.round-input-row').classList.add('active-row');
    });
  });
}

function updateManualTotal() {
  let total = 0; Object.values(manualScores).forEach(v => total += v);
  $id('manual-total').textContent = total === 0 ? '0' : sign(total);
  const hint = $id('manual-hint');
  if (total === 0) { hint.textContent = '✓ Hợp lệ'; hint.className = 'hint ok'; }
  else { hint.textContent = `Cần = 0 (đang ${sign(total)})`; hint.className = 'hint err'; }
}

function buildWinnerInputs() {
  const board = currentBoard(); if (!board) return;
  const c = $id('winner-inputs');
  if (!currentWinner) currentWinner = board.players[0]?.id;
  c.innerHTML = board.players.map(p => {
    const isW = p.id === currentWinner;
    return `
    <div class="round-input-row">
      <input type="radio" name="winner" class="winner-radio" value="${p.id}" ${isW?'checked':''}/>
      <label>${esc(p.name)}</label>
      <div class="score-display ${isW?'winner-locked':'is-zero'}" data-pid="${p.id}"
           role="button" tabindex="${isW?'-1':'0'}">${isW?'Nhất':'0'}</div>
    </div>`;
  }).join('');

  board.players.forEach(p => {
    if (p.id === currentWinner) return;
    const v = winnerScores[p.id] || 0;
    if (v !== 0) { const el = c.querySelector(`.score-display[data-pid="${p.id}"]`); if (el) refreshDisplay(el, v); }
  });
  updateWinnerTotal();

  c.querySelectorAll('.winner-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      currentWinner = radio.value; closeNumpad();
      c.querySelectorAll('.score-display').forEach(el => {
        const pid = el.dataset.pid;
        if (pid === currentWinner) {
          el.classList.add('winner-locked'); el.classList.remove('is-pos','is-neg','is-zero');
          el.textContent = 'Nhất'; el.setAttribute('tabindex','-1');
        } else {
          el.classList.remove('winner-locked'); el.setAttribute('tabindex','0');
          refreshDisplay(el, winnerScores[pid] || 0);
        }
        el.closest('.round-input-row').classList.remove('active-row');
      });
      updateWinnerTotal();
    });
  });

  c.querySelectorAll('.score-display').forEach(el => {
    el.addEventListener('click', () => {
      const pid = el.dataset.pid;
      if (pid === currentWinner) return;
      const p = currentBoard().players.find(x => x.id === pid);
      openNumpad(el, p.name, p.color, winnerScores[pid] || 0, val => {
        const negVal = val > 0 ? -val : val;
        winnerScores[pid] = negVal; refreshDisplay(el, negVal);
        el.closest('.round-input-row').classList.remove('active-row');
        updateWinnerTotal();
      });
      el.closest('.round-input-row').classList.add('active-row');
    });
  });
}

function updateWinnerTotal() {
  const board = currentBoard(); if (!board) return;
  let total = 0;
  board.players.forEach(p => { if (p.id !== currentWinner) total += Math.abs(winnerScores[p.id] || 0); });
  $id('winner-total').textContent = total;
  const winEl = document.querySelector(`#winner-inputs .score-display[data-pid="${currentWinner}"]`);
  if (winEl) winEl.textContent = total > 0 ? `+${total}` : 'Nhất';
}

function refreshDisplay(el, val) {
  el.textContent = val === 0 ? '0' : sign(val);
  el.classList.remove('is-pos','is-neg','is-zero');
  el.classList.add(val > 0 ? 'is-pos' : val < 0 ? 'is-neg' : 'is-zero');
}

function clearRoundForm() {
  resetRoundData(); buildManualInputs(); buildWinnerInputs();
  updateManualTotal(); updateWinnerTotal(); closeNumpad();
}

function saveRound() {
  const board = currentBoard(); if (!board) return;
  let scores = {}, mode;
  if (currentTab === 'manual') {
    let total = 0;
    board.players.forEach(p => { scores[p.id] = manualScores[p.id] || 0; total += scores[p.id]; });
    if (total !== 0) { showToast('Tổng điểm phải bằng 0!'); return; }
    mode = 'manual';
  } else {
    let sum = 0;
    board.players.forEach(p => {
      if (p.id !== currentWinner) { const v = winnerScores[p.id] || 0; scores[p.id] = v; sum += Math.abs(v); }
    });
    scores[currentWinner] = sum; mode = 'winner';
  }
  if (editingRoundId !== null) {
    const round = board.rounds.find(r => String(r.id) === String(editingRoundId));
    if (round) { round.scores = scores; round.mode = mode; }
    editingRoundId = null;
  } else {
    board.rounds.push({ id: Date.now(), mode, scores });
    currentPage = Math.ceil(board.rounds.length / MAX_VISIBLE_ROUNDS);
  }
  recomputeTotals(); save(); closeModal('round-modal'); closeNumpad(); renderScoreboard();
}

// ═══════════════════════════════════════════════
//  HISTORY
// ═══════════════════════════════════════════════
function renderHistory() {
  const board = currentBoard();
  const list  = $id('history-list');
  if (!board || !board.rounds.length) { list.innerHTML = '<div class="empty-state">Chưa có ván nào.</div>'; return; }
  list.innerHTML = [...board.rounds].reverse().map((round, idx) => {
    const num   = board.rounds.length - idx;
    const chips = Object.entries(round.scores).map(([pid, val]) => {
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
        <span class="history-mode">${round.mode==='winner'?'🏆 Nhất ăn tất':'✏️ Thủ công'}</span>
      </div>
      <div class="history-scores">${chips}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      $id(`tab-${currentTab}`).classList.add('active');
      closeNumpad();
    });
  });
}

// ═══════════════════════════════════════════════
//  RESET (xóa bảng hiện tại)
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

  // Recompute totals cho tất cả boards sau khi load
  state.boards.forEach(b => {
    b.players.forEach(p => { p.total = 0; });
    b.rounds.forEach(r => {
      Object.entries(r.scores).forEach(([pid, v]) => {
        const p = b.players.find(x => x.id === pid); if (p) p.total += v;
      });
    });
  });

  initTabs();
  initNumpad();

  // ── Board Picker ──
  $id('btn-create-board').addEventListener('click', openBoardModal);

  // ── Board Modal buttons ──
  $id('btn-save-board').addEventListener('click', saveNewBoard);
  $id('btn-cancel-board').addEventListener('click', () => closeModal('board-modal'));
  $id('btn-close-board-modal').addEventListener('click', () => closeModal('board-modal'));
  $id('btn-add-player').addEventListener('click', () => {
    const sp   = $id('setup-players');
    const rows = sp.querySelectorAll('.setup-player-row');
    if (rows.length >= 5) return;
    const idx = rows.length;
    addPlayerRow(sp, idx);
    if (idx + 1 >= 5) $id('btn-add-player').style.display = 'none';
  });
  $id('board-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveNewBoard(); });

  // ── Header ──
  $id('btn-back-boards').addEventListener('click', () => { closeNumpad(); showBoardPicker(); });
  $id('btn-new-board-from-game').addEventListener('click', openBoardModal);
  $id('btn-history').addEventListener('click', () => { renderHistory(); openModal('history-modal'); });
  $id('btn-close-history').addEventListener('click', () => closeModal('history-modal'));
  $id('btn-reset').addEventListener('click', () => openModal('confirm-modal'));
  $id('btn-cancel-reset').addEventListener('click', () => closeModal('confirm-modal'));
  $id('btn-confirm-reset').addEventListener('click', doReset);

  // ── Round modal ──
  $id('btn-new-round').addEventListener('click', openNewRoundModal);
  $id('btn-close-modal').addEventListener('click', () => { closeModal('round-modal'); closeNumpad(); });
  $id('btn-save-round').addEventListener('click', saveRound);
  $id('btn-clear-round').addEventListener('click', clearRoundForm);

  // ── Name modal ──
  $id('btn-close-name').addEventListener('click', () => closeModal('name-modal'));
  $id('btn-cancel-name').addEventListener('click', () => closeModal('name-modal'));
  $id('btn-save-name').addEventListener('click', saveEditName);
  $id('name-edit-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveEditName(); });

  // ── Color modal ──
  $id('btn-close-color').addEventListener('click', () => closeModal('color-modal'));

  // ── Confirm delete board (từ picker) ──
  $id('btn-cancel-delete-board').addEventListener('click', () => {
    pendingDeleteBoardId = null; closeModal('confirm-delete-board-modal');
  });
  $id('btn-confirm-delete-board').addEventListener('click', () => {
    if (pendingDeleteBoardId) {
      state.boards = state.boards.filter(b => b.id !== pendingDeleteBoardId);
      if (state.activeBoardId === pendingDeleteBoardId) state.activeBoardId = null;
      pendingDeleteBoardId = null; save();
    }
    closeModal('confirm-delete-board-modal'); renderBoardPicker();
  });

  // ── Backdrop close ──
  ['round-modal','history-modal','color-modal'].forEach(id => {
    $id(id).addEventListener('click', function(e) {
      if (e.target === this) { closeModal(id); if (id === 'round-modal') closeNumpad(); }
    });
  });

  window.addEventListener('resize', () => { if (currentBoard()) renderScoreboard(); });

  // ── Initial screen ──
  if (state.activeBoardId && state.boards.find(b => b.id === state.activeBoardId)) {
    showGameScreen();
  } else {
    showBoardPicker();
  }
}

document.addEventListener('DOMContentLoaded', init);