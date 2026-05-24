const stCharUrl = 'data/characters_st.json';
const spCharUrl = 'data/characters_sp.json';

let stImages = {}, spImages = {};
let stNames = [], spNames = [];

const STORAGE_KEY = 'tacticalTeamData';
const HISTORY_KEY = 'tacticalHistoryData';
const FREQ_KEY = 'characterUsageFreq';
const VIEW_STATE_KEY = 'tacticalViewState';
const PRIORITY_ST_KEY = 'priorityStrikerCharacters';
const PRIORITY_SP_KEY = 'prioritySpecialCharacters';
const SAVE_SLOTS_KEY = 'tacticalSaveSlots';

let teamData = [];
let editIndex = null;
let currentSort = { key: null, asc: true };
let historyMap = {};
let usageFreq = {};

// 表示状態（localStorageから復元）
let viewState = {
  showAttack: true,
  showMemo: false
};

// ユーザー設定の優先生徒（localStorageから復元）
let userPriorityStriker = [];
let userPrioritySpecial = [];

const defaultTopCharacters = [
  'シロコ*テラー','シュン','イオリ（水着）','マリナ（チーパオ）','ハスミ（水着）','ハナコ（水着）',  'ホシノ（攻撃）',
  'マリナ','ネル（バニーガール）', 'ミヤコ', 'ユウカ', 'ミヤコ（水着）','カノエ', 'ホシノ（防御）','アツコ', 'ツバキ', 'エイミ','ハルカ',
  'ツルギ','チェリノ','ミカ','ハスミ（体操服）',
  'ヒナ（水着）','レンゲ（水着）','イオリ','ハルナ（正月）','ネル','ネル（制服）',
  'ムツキ（正月）','ヨシミ（バンド）','ヒヨリ'
];

const defaultTopCharactersSP = [
  'シロコ（水着）','ミチル（ドレス）',
  'ウタハ','アヤネ（水着）','サツキ',
  'ヤクモ','サヤ（私服）', 
  'アツコ（水着）', 'ヒビキ', 'レイサ（マジカル）', 
];

// 実際に使用する優先生徒（ユーザー設定 or デフォルト）
let fixedTopCharacters = [...defaultTopCharacters];
let fixedTopCharactersSP = [...defaultTopCharactersSP];

// ========================================
// ユーティリティ関数
// ========================================

function sortCharactersByPriority(characters, usageMap, fixedTop = []) {
  return [...characters].sort((a, b) => {
    const aFixedIndex = fixedTop.indexOf(a.name);
    const bFixedIndex = fixedTop.indexOf(b.name);
    const aFixed = aFixedIndex !== -1;
    const bFixed = bFixedIndex !== -1;
    
    // 両方とも優先リストにある場合は、リスト内の順番で並べる
    if (aFixed && bFixed) {
      return aFixedIndex - bFixedIndex;
    }
    // 片方だけ優先リストにある場合は、そちらを上に
    if (aFixed && !bFixed) return -1;
    if (!aFixed && bFixed) return 1;
    
    // どちらも優先リストにない場合は、使用頻度順
    const aCount = usageMap[a.name] || 0;
    const bCount = usageMap[b.name] || 0;
    return bCount - aCount;
  });
}

function migrateEntry(entry) {
  return {
    name: entry.name || '',
    icon: entry.icon || null,
    D1: entry.D1 || '', D2: entry.D2 || '', D3: entry.D3 || '', D4: entry.D4 || '',
    S1: entry.S1 || '', S2: entry.S2 || '',
    A1: entry.A1 || '', A2: entry.A2 || '', A3: entry.A3 || '', A4: entry.A4 || '',
    SP1: entry.SP1 || '', SP2: entry.SP2 || '',
    date: entry.date || '',
    memo: entry.memo || '',
    favorite: entry.favorite || false
  };
}

function parseJapaneseDate(dateStr) {
  if (!dateStr) return new Date(0);
  const newMatch = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (newMatch) {
    const [, year, month, day, hour, minute] = newMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  const oldMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (oldMatch) {
    const [, month, day, hour, minute] = oldMatch;
    return new Date(new Date().getFullYear(), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

// 重複チェック（未選択・空文字は除外）
function hasDuplicateInArray(arr) {
  const validChars = arr.filter(char => char && char !== '未選択' && char.trim() !== '');
  const seen = new Set();
  for (const char of validChars) {
    if (seen.has(char)) return true;
    seen.add(char);
  }
  return false;
}

function hasDuplicateDefense(entry) {
  const chars = [entry.D1, entry.D2, entry.D3, entry.D4, entry.S1, entry.S2];
  return hasDuplicateInArray(chars);
}

function hasDuplicateAttack(entry) {
  const chars = [entry.A1, entry.A2, entry.A3, entry.A4, entry.SP1, entry.SP2];
  return hasDuplicateInArray(chars);
}

// ========================================
// ストレージ関数
// ========================================

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teamData));
}

function loadData() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    const parsed = JSON.parse(data);
    teamData = parsed.map(migrateEntry);
  }
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyMap));
}

function loadHistory() {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (raw) historyMap = JSON.parse(raw);
}

function saveToHistory(name, oldEntry) {
  if (!historyMap[name]) historyMap[name] = [];
  historyMap[name].unshift(oldEntry);
  saveHistory();
}

function loadFreq() {
  const stored = localStorage.getItem(FREQ_KEY);
  if (stored) usageFreq = JSON.parse(stored);
}

function saveFreq() {
  localStorage.setItem(FREQ_KEY, JSON.stringify(usageFreq));
}

function increaseUsage(...names) {
  names.forEach(name => {
    if (!name) return;
    if (!usageFreq[name]) usageFreq[name] = 0;
    usageFreq[name]++;
  });
  saveFreq();
}

function saveViewState() {
  localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(viewState));
}

function loadViewState() {
  const stored = localStorage.getItem(VIEW_STATE_KEY);
  if (stored) {
    viewState = JSON.parse(stored);
  }
}

// ========================================
// 優先生徒設定
// ========================================

function savePriorityCharacters() {
  localStorage.setItem(PRIORITY_ST_KEY, JSON.stringify(userPriorityStriker));
  localStorage.setItem(PRIORITY_SP_KEY, JSON.stringify(userPrioritySpecial));
}

function loadPriorityCharacters() {
  const storedSt = localStorage.getItem(PRIORITY_ST_KEY);
  const storedSp = localStorage.getItem(PRIORITY_SP_KEY);
  
  if (storedSt) {
    userPriorityStriker = JSON.parse(storedSt);
    fixedTopCharacters = userPriorityStriker.length > 0 ? userPriorityStriker : [...defaultTopCharacters];
  }
  if (storedSp) {
    userPrioritySpecial = JSON.parse(storedSp);
    fixedTopCharactersSP = userPrioritySpecial.length > 0 ? userPrioritySpecial : [...defaultTopCharactersSP];
  }
}

function refreshDropdowns() {
  const sortedSt = sortCharactersByPriority(stCharacterData, usageFreq, fixedTopCharacters);
  const sortedSp = sortCharactersByPriority(spCharacterData, usageFreq, fixedTopCharactersSP);
  const allSorted = [...sortedSt, ...sortedSp];

  createDropdown('userIcon', allSorted, () => {});
  createDropdown('D1', sortedSt, () => {}); createDropdown('D2', sortedSt, () => {});
  createDropdown('D3', sortedSt, () => {}); createDropdown('D4', sortedSt, () => {});
  createDropdown('S1', sortedSp, () => {}); createDropdown('S2', sortedSp, () => {});
  createDropdown('A1', sortedSt, () => {}); createDropdown('A2', sortedSt, () => {});
  createDropdown('A3', sortedSt, () => {}); createDropdown('A4', sortedSt, () => {});
  createDropdown('SP1', sortedSp, () => {}); createDropdown('SP2', sortedSp, () => {});
}

// 攻め編成のバックアップ（元に戻す用）
let attackBackup = null;

// ========================================
// 攻めクリア・元に戻す
// ========================================

function clearAttackSlots() {
  // 現在の攻め編成をバックアップ
  attackBackup = {
    A1: getValue('A1'),
    A2: getValue('A2'),
    A3: getValue('A3'),
    A4: getValue('A4'),
    SP1: getValue('SP1'),
    SP2: getValue('SP2')
  };
  
  // 攻め枠をクリア
  ['A1', 'A2', 'A3', 'A4', 'SP1', 'SP2'].forEach(id => {
    const wrapper = document.getElementById(`dropdown-${id}`);
    if (!wrapper) return;
    const el = wrapper.querySelector('.dropdown-select');
    if (el) {
      el.innerHTML = '<span class="placeholder-text">未選択</span>';
      el.dataset.value = '';
    }
  });
  
  // 元に戻すボタンを表示
  document.getElementById('undoAttackBtn').style.display = 'inline-flex';
}

function undoAttackClear() {
  if (!attackBackup) return;
  
  // バックアップから復元
  if (attackBackup.A1) setDropdown('A1', attackBackup.A1);
  if (attackBackup.A2) setDropdown('A2', attackBackup.A2);
  if (attackBackup.A3) setDropdown('A3', attackBackup.A3);
  if (attackBackup.A4) setDropdown('A4', attackBackup.A4);
  if (attackBackup.SP1) setDropdown('SP1', attackBackup.SP1);
  if (attackBackup.SP2) setDropdown('SP2', attackBackup.SP2);
  
  // バックアップをクリア
  attackBackup = null;
  
  // 元に戻すボタンを非表示
  document.getElementById('undoAttackBtn').style.display = 'none';
}

// ========================================
// お気に入り機能
// ========================================

function toggleFavorite(index) {
  teamData[index].favorite = !teamData[index].favorite;
  saveData();
  populateTable();
}

// ========================================
// フォーム表示/非表示
// ========================================

function showForm() {
  document.getElementById('formContent').classList.remove('hidden');
  document.getElementById('newEntryBtn').style.display = 'none';
}

function hideForm() {
  document.getElementById('formContent').classList.add('hidden');
  document.getElementById('newEntryBtn').style.display = 'inline-flex';
  document.getElementById('teamForm').classList.remove('editing');
  editIndex = null;
}

// ========================================
// ドロップダウン
// ========================================

function createDropdown(targetId, characters, onSelect) {
  const wrapper = document.getElementById(`dropdown-${targetId}`);
  if (!wrapper) return;
  wrapper.innerHTML = '';

  const selected = document.createElement('div');
  selected.className = 'dropdown-select';
  selected.innerHTML = '<span class="placeholder-text">未選択</span>';
  wrapper.appendChild(selected);

  const options = document.createElement('div');
  options.className = 'dropdown-options';

  // 検索入力欄
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'dropdown-search';
  searchInput.placeholder = '名前で検索...';
  options.appendChild(searchInput);

  // オプションコンテナ
  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'dropdown-options-list';
  
  characters.forEach(char => {
    const opt = document.createElement('div');
    opt.className = 'option';
    opt.dataset.name = char.name.toLowerCase();
    opt.innerHTML = `<img src="${char.image}" alt="${char.name}"><span>${char.name}</span>`;
    opt.addEventListener('click', () => {
      selected.innerHTML = `<img src="${char.image}" alt="${char.name}">`;
      selected.dataset.value = char.name;
      options.style.display = 'none';
      searchInput.value = '';
      filterOptions('');
      onSelect(char.name);
    });
    optionsContainer.appendChild(opt);
  });

  options.appendChild(optionsContainer);
  wrapper.appendChild(options);

  // フィルタリング関数
  function filterOptions(query) {
    const lowerQuery = query.toLowerCase();
    optionsContainer.querySelectorAll('.option').forEach(opt => {
      const name = opt.dataset.name;
      if (name.includes(lowerQuery)) {
        opt.style.display = 'flex';
      } else {
        opt.style.display = 'none';
      }
    });
  }

  // 検索入力イベント
  searchInput.addEventListener('input', (e) => {
    filterOptions(e.target.value);
  });

  // 検索欄クリック時にドロップダウンが閉じないように
  searchInput.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  selected.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.dropdown-options').forEach(opt => {
      if (opt !== options) opt.style.display = 'none';
    });
    const isOpening = options.style.display !== 'block';
    options.style.display = isOpening ? 'block' : 'none';
    if (isOpening) {
      searchInput.value = '';
      filterOptions('');
      setTimeout(() => searchInput.focus(), 10);
    }
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown-wrapper')) {
    document.querySelectorAll('.dropdown-options').forEach(opt => {
      opt.style.display = 'none';
    });
  }
});

function setDropdown(id, name) {
  const wrapper = document.getElementById(`dropdown-${id}`);
  if (!wrapper) return;
  const selected = wrapper.querySelector('.dropdown-select');
  if (!selected) return;
  const allData = [...stCharacterData, ...spCharacterData];
  const match = allData.find(c => c.name === name);
  if (match) {
    selected.innerHTML = `<img src="${match.image}" alt="${match.name}">`;
    selected.dataset.value = match.name;
  } else {
    selected.innerHTML = '<span class="placeholder-text">未選択</span>';
    selected.dataset.value = '';
  }
}

function getValue(id) {
  const wrapper = document.getElementById(`dropdown-${id}`);
  if (!wrapper) return '';
  const el = wrapper.querySelector('.dropdown-select');
  return el && el.dataset.value ? el.dataset.value : '';
}

// ========================================
// テーブル描画
// ========================================

function populateTable() {
  const tbody = document.querySelector('#teamTable tbody');
  const table = document.getElementById('teamTable');
  tbody.innerHTML = '';
  const allImages = { ...stImages, ...spImages };

  // 攻め列の表示/非表示とクラス切り替え
  const attackHeader = document.querySelector('.th-attack');
  if (attackHeader) {
    attackHeader.style.display = viewState.showAttack ? '' : 'none';
  }
  
  // 攻め非表示時はテーブルにクラスを追加（防衛画像を大きくするため）
  if (viewState.showAttack) {
    table.classList.remove('attack-hidden');
  } else {
    table.classList.add('attack-hidden');
  }

  teamData.forEach((entry, index) => {
    const row = document.createElement('tr');
    row.className = 'data-row';
    row.dataset.index = index;
    
    // お気に入りクラス
    if (entry.favorite) {
      row.classList.add('favorite');
    }
    
    // 防衛・攻めそれぞれで重複チェック
    const defDup = hasDuplicateDefense(entry);
    const atkDup = hasDuplicateAttack(entry);
    if (defDup || atkDup) {
      row.classList.add('warning');
    }

    const userIcon = entry.icon && allImages[entry.icon] 
      ? `<img src="${allImages[entry.icon]}" alt="${entry.icon}" title="${entry.icon}">`
      : '';
    
    // 名前を10文字に制限し、長さに応じてフォントサイズを調整
    let displayName = entry.name;
    if (displayName.length > 10) {
      displayName = displayName.substring(0, 10);
    }
    let nameFontSize = '0.95rem';
    if (displayName.length > 8) {
      nameFontSize = '0.8rem';
    } else if (displayName.length > 6) {
      nameFontSize = '0.85rem';
    }
    
    const defenseChars = [entry.D1, entry.D2, entry.D3, entry.D4, entry.S1, entry.S2]
      .filter(Boolean)
      .map(ch => `<img src="${allImages[ch] || ''}" alt="${ch}" title="${ch}">`)
      .join('');
    
    const attackChars = [entry.A1, entry.A2, entry.A3, entry.A4, entry.SP1, entry.SP2]
      .filter(Boolean)
      .map(ch => `<img src="${allImages[ch] || ''}" alt="${ch}" title="${ch}">`)
      .join('');

    const hasMemo = entry.memo && entry.memo.trim();

    row.innerHTML = `
      <td>
        <div class="user-cell">
          ${userIcon}
          <span style="font-size: ${nameFontSize};" title="${entry.name}">${displayName}</span>
        </div>
      </td>
      <td><div class="char-cell defense-cell">${defenseChars || '<span style="color: var(--text-muted);">-</span>'}</div></td>
      <td class="attack-col" style="display: ${viewState.showAttack ? '' : 'none'}"><div class="char-cell attack-cell">${attackChars || '<span style="color: var(--text-muted);">-</span>'}</div></td>
      <td class="date-cell">${entry.date}</td>
      <td>
        <div class="actions-cell ${viewState.showAttack ? 'two-rows' : ''}">
          <button class="action-btn favorite-btn ${entry.favorite ? 'active' : ''}" data-index="${index}">⭐Fav</button>
          <button class="action-btn edit-btn" data-index="${index}">🔧編集</button>
          <button class="action-btn delete-btn" data-index="${index}">🗑️削除</button>
          <button class="action-btn history-btn" data-name="${entry.name}" data-index="${index}">📜履歴</button>
          <button class="action-btn inventory-btn" data-name="${entry.name}" data-index="${index}">🗃️所持</button>
          <button class="action-btn share-btn" data-index="${index}">🐦共有</button>
        </div>
      </td>
    `;

    tbody.appendChild(row);

    // メモ行（折りたたみ可能）
    if (hasMemo) {
      const memoRow = document.createElement('tr');
      memoRow.className = 'collapsible-row memo-row';
      memoRow.dataset.memoFor = index;
      memoRow.style.display = viewState.showMemo ? '' : 'none';
      
      const colSpan = viewState.showAttack ? 5 : 4;
      memoRow.innerHTML = `
        <td colspan="${colSpan}">
          <div class="collapsible-content">
            <div class="collapsible-section">
              <div class="collapsible-label">📝 メモ</div>
              <div class="memo-content">${entry.memo}</div>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(memoRow);
    }

    // 行クリックで選択
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      document.querySelectorAll('#teamTable tbody tr.data-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
    });

    // お気に入りボタン
    row.querySelector('.favorite-btn').addEventListener('click', () => {
      toggleFavorite(index);
    });

    // 編集ボタン
    row.querySelector('.edit-btn').addEventListener('click', () => {
      editEntry(index);
    });

    // 削除ボタン
    row.querySelector('.delete-btn').addEventListener('click', () => {
      deleteEntry(index);
    });

    // 履歴ボタン
    row.querySelector('.history-btn').addEventListener('click', () => {
      const name = entry.name;
      const existing = tbody.querySelector(`.history-row[data-history-for="${index}"]`);
      if (existing) { existing.remove(); return; }

      const history = (historyMap[name] || []).slice(0, 20);
      if (history.length === 0) {
        Swal.fire('履歴なし', 'この相手の履歴はありません', 'info');
        return;
      }

      const historyRow = document.createElement('tr');
      historyRow.className = 'history-row';
      historyRow.dataset.historyFor = index;
      const colSpan = viewState.showAttack ? 5 : 4;
      historyRow.innerHTML = `<td colspan="${colSpan}">
        <div class="history-container">
          ${history.map((e, i) => `
            <div class="history-entry">
              <strong>${e.date}</strong>
              ${[e.D1, e.D2, e.D3, e.D4].filter(Boolean).map(ch => `
                <img src="${allImages[ch] || ''}" alt="${ch}" class="history-icon" title="${ch}">
              `).join('')}
              <span style="margin: 0 8px; color: var(--text-muted);">|</span>
              ${[e.S1, e.S2].filter(Boolean).map(ch => `
                <img src="${allImages[ch] || ''}" alt="${ch}" class="history-icon" title="${ch}">
              `).join('')}
              <button class="delete-history-btn" data-hindex="${i}">❌</button>
            </div>
          `).join('')}
        </div>
      </td>`;
      
      const memoRow = tbody.querySelector(`tr[data-memo-for="${index}"]`);
      if (memoRow) { memoRow.after(historyRow); } else { row.after(historyRow); }

      historyRow.querySelectorAll('.delete-history-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.dataset.hindex);
          Swal.fire({
            title: '履歴削除の確認',
            text: `この履歴（${history[i].date}）を削除しますか？`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '削除',
            cancelButtonText: 'キャンセル',
          }).then(result => {
            if (result.isConfirmed) {
              historyMap[name].splice(i, 1);
              saveHistory();
              populateTable();
            }
          });
        });
      });
    });

    // 所持ボタン
    row.querySelector('.inventory-btn').addEventListener('click', () => {
      const name = entry.name;
      const existing = tbody.querySelector(`.inventory-row[data-inventory-for="${index}"]`);
      if (existing) { existing.remove(); return; }

      const history = historyMap[name] || [];
      if (history.length === 0) {
        Swal.fire('データなし', 'この相手の履歴データがないため所持キャラを表示できません', 'info');
        return;
      }

      const allChars = new Set();
      history.forEach(h => {
        [h.D1, h.D2, h.D3, h.D4, h.S1, h.S2, h.A1, h.A2, h.A3, h.A4, h.SP1, h.SP2].forEach(c => {
          if (c && c !== '未選択') allChars.add(c);
        });
      });

      const inventoryRow = document.createElement('tr');
      inventoryRow.className = 'inventory-row';
      inventoryRow.dataset.inventoryFor = index;
      const colSpan = viewState.showAttack ? 5 : 4;
      inventoryRow.innerHTML = `<td colspan="${colSpan}">
        <div class="inventory-container">
          ${[...allChars].map(c => `
            <img src="${allImages[c] || ''}" alt="${c}" class="history-icon" title="${c}">
          `).join('')}
        </div>
      </td>`;
      
      const memoRow = tbody.querySelector(`tr[data-memo-for="${index}"]`);
      if (memoRow) { memoRow.after(inventoryRow); } else { row.after(inventoryRow); }
    });

    // 共有ボタン
    row.querySelector('.share-btn').addEventListener('click', () => {
      const e = teamData[index];
      const defChars = [e.D1, e.D2, e.D3, e.D4, e.S1, e.S2].filter(Boolean).join(' / ');
      const atkChars = [e.A1, e.A2, e.A3, e.A4, e.SP1, e.SP2].filter(Boolean).join(' / ');
      let tweet = `【${e.name}】の編成\n🛡防衛: ${defChars}`;
      if (atkChars) tweet += `\n⚔攻め: ${atkChars}`;
      tweet += `\n#ブルアカ #戦術対抗戦`;
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`;
      window.open(url, '_blank');
    });
  });
}

// ========================================
// エントリ操作
// ========================================

function deleteEntry(index) {
  Swal.fire({
    title: '削除の確認',
    text: 'この編成を本当に削除しますか？',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '削除する',
    cancelButtonText: 'キャンセル',
  }).then((result) => {
    if (result.isConfirmed) {
      teamData.splice(index, 1);
      saveData();
      populateTable();
      Swal.fire('削除されました', '', 'success');
    }
  });
}

function editEntry(index) {
  const entry = teamData[index];
  
  // フォームを表示
  showForm();
  
  document.getElementById('username').value = entry.name;
  editIndex = index;

  if (entry.icon) setDropdown('userIcon', entry.icon);
  setDropdown('D1', entry.D1); setDropdown('D2', entry.D2);
  setDropdown('D3', entry.D3); setDropdown('D4', entry.D4);
  setDropdown('S1', entry.S1); setDropdown('S2', entry.S2);
  setDropdown('A1', entry.A1); setDropdown('A2', entry.A2);
  setDropdown('A3', entry.A3); setDropdown('A4', entry.A4);
  setDropdown('SP1', entry.SP1); setDropdown('SP2', entry.SP2);

  document.getElementById('memo').value = entry.memo || '';
  document.getElementById('teamForm').classList.add('editing');
  document.getElementById('submitBtn').innerHTML = '<span class="btn-icon">✔</span> 更新';
  document.getElementById('cancelBtn').innerHTML = '<span class="btn-icon">✖</span> 中止';
  document.getElementById('teamForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  document.getElementById('username').value = '';
  document.getElementById('memo').value = '';
  document.getElementById('teamForm').classList.remove('editing');
  document.getElementById('submitBtn').innerHTML = '<span class="btn-icon">➕</span> 追加';
  document.getElementById('cancelBtn').innerHTML = '<span class="btn-icon">✖</span> 閉じる';

  const ids = ['userIcon', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'A1', 'A2', 'A3', 'A4', 'SP1', 'SP2'];
  ids.forEach(id => {
    const wrapper = document.getElementById(`dropdown-${id}`);
    if (!wrapper) return;
    const el = wrapper.querySelector('.dropdown-select');
    if (el) { el.innerHTML = '<span class="placeholder-text">未選択</span>'; el.dataset.value = ''; }
  });
  
  // 攻めバックアップをクリアし、元に戻すボタンを非表示
  attackBackup = null;
  document.getElementById('undoAttackBtn').style.display = 'none';
  
  editIndex = null;
}

function finalizeForm() {
  resetForm();
  hideForm();
  populateTable();
  saveData();
}

// ========================================
// ソート
// ========================================

function sortTableBy(key) {
  if (currentSort.key === key) { currentSort.asc = !currentSort.asc; }
  else { currentSort.key = key; currentSort.asc = true; }

  teamData.sort((a, b) => {
    // お気に入りを常に上に
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    
    let valA = a[key], valB = b[key];
    if (key === 'date') { valA = parseJapaneseDate(valA); valB = parseJapaneseDate(valB); }
    if (valA < valB) return currentSort.asc ? -1 : 1;
    if (valA > valB) return currentSort.asc ? 1 : -1;
    return 0;
  });

  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.getAttribute('data-sort') === key) {
      th.classList.add(currentSort.asc ? 'sorted-asc' : 'sorted-desc');
    }
  });
  populateTable();
}

// ========================================
// 表示トグル
// ========================================

function updateToggleButtons() {
  document.getElementById('attackLabel').textContent = viewState.showAttack ? '攻めを非表示' : '攻めを表示';
  document.getElementById('memoLabel').textContent = viewState.showMemo ? 'メモを非表示' : 'メモを表示';
}

// ========================================
// イベントリスナー
// ========================================

document.getElementById('newEntryBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  resetForm();
  showForm();
});

document.getElementById('clearAttackBtn').addEventListener('click', (e) => {
  e.preventDefault();
  clearAttackSlots();
});

document.getElementById('undoAttackBtn').addEventListener('click', (e) => {
  e.preventDefault();
  undoAttackClear();
});

document.getElementById('submitBtn').addEventListener('click', e => {
  e.preventDefault();
  const name = document.getElementById('username').value.trim();
  if (!name) { Swal.fire('エラー', 'ユーザー名を入力してください', 'error'); return; }

  const icon = getValue('userIcon');
  const D1 = getValue('D1'), D2 = getValue('D2'), D3 = getValue('D3'), D4 = getValue('D4');
  const S1 = getValue('S1'), S2 = getValue('S2');
  const A1 = getValue('A1'), A2 = getValue('A2'), A3 = getValue('A3'), A4 = getValue('A4');
  const SP1 = getValue('SP1'), SP2 = getValue('SP2');

  const now = new Date();
  const today = now.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  const memo = document.getElementById('memo').value.trim();
  const entry = { name, icon, D1, D2, D3, D4, S1, S2, A1, A2, A3, A4, SP1, SP2, date: today, memo };
  const existingIndex = teamData.findIndex(e => e.name === name);

  if (editIndex !== null) {
    saveToHistory(teamData[editIndex].name, { ...teamData[editIndex] });
    teamData[editIndex] = entry;
    editIndex = null;
    finalizeForm();
    return;
  }

  if (existingIndex !== -1) {
    Swal.fire({
      title: '上書き確認',
      text: `同じ名前のデータ（${name}）があります。上書きしますか？`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '上書きする',
      cancelButtonText: 'キャンセル',
    }).then((result) => {
      if (result.isConfirmed) {
        saveToHistory(teamData[existingIndex].name, { ...teamData[existingIndex] });
        teamData[existingIndex] = entry;
        increaseUsage(D1, D2, D3, D4, S1, S2, A1, A2, A3, A4, SP1, SP2);
        finalizeForm();
      }
    });
    return;
  }

  teamData.push(entry);
  increaseUsage(D1, D2, D3, D4, S1, S2, A1, A2, A3, A4, SP1, SP2);
  finalizeForm();
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  resetForm();
  hideForm();
});

document.querySelectorAll('th[data-sort]').forEach(th => {
  th.addEventListener('click', () => { sortTableBy(th.getAttribute('data-sort')); });
});

document.getElementById('toggleAttackBtn').addEventListener('click', () => {
  viewState.showAttack = !viewState.showAttack;
  saveViewState();
  updateToggleButtons();
  populateTable();
});

document.getElementById('toggleMemoBtn').addEventListener('click', () => {
  viewState.showMemo = !viewState.showMemo;
  saveViewState();
  updateToggleButtons();
  populateTable();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(teamData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'tactical_teams.json'; a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (Array.isArray(imported)) {
        teamData = imported.map(migrateEntry);
        saveData();
        populateTable();
        Swal.fire('成功', 'インポートが完了しました！', 'success');
      } else {
        Swal.fire('エラー', '無効なファイル形式です。', 'error');
      }
    } catch (err) {
      Swal.fire('エラー', '読み込みに失敗しました。', 'error');
    }
  };
  reader.readAsText(file);
});

document.getElementById('pageShareBtn').addEventListener('click', () => {
  const tweet = `ブルアカ対抗戦の編成管理に便利なツール！\n使ってみてください👇\n${location.href}\n#ブルアカ #対抗戦 #編成記録ツール`;
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`;
  window.open(url, '_blank');
});

// ========================================
// 優先生徒設定モーダル
// ========================================

let tempPriorityStriker = [];
let tempPrioritySpecial = [];
let draggedItem = null;
let draggedType = null;

function openPriorityModal() {
  // 現在の設定をコピー
  tempPriorityStriker = [...(userPriorityStriker.length > 0 ? userPriorityStriker : defaultTopCharacters)];
  tempPrioritySpecial = [...(userPrioritySpecial.length > 0 ? userPrioritySpecial : defaultTopCharactersSP)];
  
  // モーダル用のドロップダウンを作成
  createPriorityDropdown('addStriker', stCharacterData);
  createPriorityDropdown('addSpecial', spCharacterData);
  
  renderPrioritySelected();
  document.getElementById('priorityModal').classList.remove('hidden');
}

function closePriorityModal() {
  document.getElementById('priorityModal').classList.add('hidden');
}

function createPriorityDropdown(targetId, characters) {
  const wrapper = document.getElementById(`dropdown-${targetId}`);
  if (!wrapper) return;
  wrapper.innerHTML = '';

  const selected = document.createElement('div');
  selected.className = 'dropdown-select';
  selected.innerHTML = '<span class="placeholder-text">生徒を選択...</span>';
  wrapper.appendChild(selected);

  const options = document.createElement('div');
  options.className = 'dropdown-options';

  // 検索入力欄
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'dropdown-search';
  searchInput.placeholder = '名前で検索...';
  options.appendChild(searchInput);

  // オプションコンテナ
  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'dropdown-options-list';
  
  characters.forEach(char => {
    const opt = document.createElement('div');
    opt.className = 'option';
    opt.dataset.name = char.name.toLowerCase();
    opt.innerHTML = `<img src="${char.image}" alt="${char.name}"><span>${char.name}</span>`;
    opt.addEventListener('click', () => {
      selected.innerHTML = `<img src="${char.image}" alt="${char.name}"><span class="selected-name">${char.name}</span>`;
      selected.dataset.value = char.name;
      options.style.display = 'none';
      searchInput.value = '';
      filterPriorityOptions(optionsContainer, '');
    });
    optionsContainer.appendChild(opt);
  });

  options.appendChild(optionsContainer);
  wrapper.appendChild(options);

  // フィルタリング
  searchInput.addEventListener('input', (e) => {
    filterPriorityOptions(optionsContainer, e.target.value);
  });

  searchInput.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  selected.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.dropdown-options').forEach(opt => {
      if (opt !== options) opt.style.display = 'none';
    });
    const isOpening = options.style.display !== 'block';
    options.style.display = isOpening ? 'block' : 'none';
    if (isOpening) {
      searchInput.value = '';
      filterPriorityOptions(optionsContainer, '');
      setTimeout(() => searchInput.focus(), 10);
    }
  });
}

function filterPriorityOptions(container, query) {
  const lowerQuery = query.toLowerCase();
  container.querySelectorAll('.option').forEach(opt => {
    const name = opt.dataset.name;
    opt.style.display = name.includes(lowerQuery) ? 'flex' : 'none';
  });
}

function renderPrioritySelected() {
  renderPriorityList('priorityStrikerSelected', tempPriorityStriker, stImages, 'striker');
  renderPriorityList('prioritySpecialSelected', tempPrioritySpecial, spImages, 'special');
}

function renderPriorityList(containerId, items, images, type) {
  const container = document.getElementById(containerId);
  container.innerHTML = items.map((name, index) => {
    const img = images[name] || '';
    return `<div class="priority-char" draggable="true" data-name="${name}" data-index="${index}" data-type="${type}">
      <img src="${img}" alt="${name}" title="${name}">
      <span>${name}</span>
      <button class="remove-btn" data-name="${name}" data-type="${type}">✕</button>
    </div>`;
  }).join('');
  
  // イベントリスナー設定
  setupDragAndDrop(container, type);
  setupRemoveButtons(container, type);
}

function setupDragAndDrop(container, type) {
  const items = container.querySelectorAll('.priority-char');
  
  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedItem = item;
      draggedType = type;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedItem = null;
      draggedType = null;
      container.querySelectorAll('.priority-char').forEach(el => {
        el.classList.remove('drag-over');
      });
    });
    
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedType !== type) return;
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });
    
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });
    
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (draggedType !== type || !draggedItem || draggedItem === item) return;
      
      const items = type === 'striker' ? tempPriorityStriker : tempPrioritySpecial;
      const fromIndex = parseInt(draggedItem.dataset.index);
      const toIndex = parseInt(item.dataset.index);
      
      // 配列内で要素を移動
      const [movedItem] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, movedItem);
      
      renderPrioritySelected();
    });
  });
}

function setupRemoveButtons(container, type) {
  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (type === 'striker') {
        tempPriorityStriker = tempPriorityStriker.filter(n => n !== name);
      } else {
        tempPrioritySpecial = tempPrioritySpecial.filter(n => n !== name);
      }
      renderPrioritySelected();
    });
  });
}

function addPriorityCharacter(type) {
  const dropdownId = type === 'striker' ? 'addStriker' : 'addSpecial';
  const wrapper = document.getElementById(`dropdown-${dropdownId}`);
  const selected = wrapper.querySelector('.dropdown-select');
  const name = selected.dataset.value;
  
  if (!name) {
    Swal.fire({
      title: '生徒を選択してください',
      icon: 'warning',
      timer: 1500,
      showConfirmButton: false
    });
    return;
  }
  
  const targetArray = type === 'striker' ? tempPriorityStriker : tempPrioritySpecial;
  
  if (targetArray.includes(name)) {
    Swal.fire({
      title: 'すでに追加されています',
      icon: 'info',
      timer: 1500,
      showConfirmButton: false
    });
    return;
  }
  
  targetArray.push(name);
  renderPrioritySelected();
  
  // ドロップダウンをリセット
  selected.innerHTML = '<span class="placeholder-text">生徒を選択...</span>';
  selected.dataset.value = '';
}

document.getElementById('prioritySettingsBtn').addEventListener('click', openPriorityModal);
document.getElementById('closePriorityModal').addEventListener('click', closePriorityModal);
document.querySelector('#priorityModal .modal-overlay').addEventListener('click', closePriorityModal);

document.getElementById('addStrikerBtn').addEventListener('click', () => {
  addPriorityCharacter('striker');
});

document.getElementById('addSpecialBtn').addEventListener('click', () => {
  addPriorityCharacter('special');
});

document.getElementById('resetPriorityBtn').addEventListener('click', () => {
  tempPriorityStriker = [...defaultTopCharacters];
  tempPrioritySpecial = [...defaultTopCharactersSP];
  renderPrioritySelected();
});

document.getElementById('savePriorityBtn').addEventListener('click', () => {
  userPriorityStriker = [...tempPriorityStriker];
  userPrioritySpecial = [...tempPrioritySpecial];
  fixedTopCharacters = userPriorityStriker.length > 0 ? userPriorityStriker : [...defaultTopCharacters];
  fixedTopCharactersSP = userPrioritySpecial.length > 0 ? userPrioritySpecial : [...defaultTopCharactersSP];
  
  savePriorityCharacters();
  refreshDropdowns();
  closePriorityModal();
  
  Swal.fire({
    title: '保存しました',
    text: '優先表示生徒の設定を更新しました',
    icon: 'success',
    timer: 1500,
    showConfirmButton: false
  });
});

// ========================================
// セーブ・ロード機能
// ========================================

const SAVE_SLOT_COUNT = 12;
const SEASON_OPTIONS = ['Season 8', 'Season 9', 'Season 10'];
let saveSlots = new Array(SAVE_SLOT_COUNT).fill(null);
let saveLoadMode = 'save'; // 'save' or 'load'

function saveSlotsToStorage() {
  localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(saveSlots));
}

function loadSlotsFromStorage() {
  const stored = localStorage.getItem(SAVE_SLOTS_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    saveSlots = new Array(SAVE_SLOT_COUNT).fill(null);
    for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
      saveSlots[i] = parsed[i] || null;
    }
  }
}

function openSaveLoadModal(mode) {
  saveLoadMode = mode;
  updateSaveLoadModalUI();
  renderSaveSlots();
  document.getElementById('saveLoadModal').classList.remove('hidden');
}

function closeSaveLoadModal() {
  document.getElementById('saveLoadModal').classList.add('hidden');
}

function updateSaveLoadModalUI() {
  const title = document.getElementById('saveLoadTitle');
  const toggleBtn = document.getElementById('toggleModeBtn');
  if (saveLoadMode === 'save') {
    title.textContent = '💾 セーブ';
    toggleBtn.textContent = '📂 ロードに切替';
  } else {
    title.textContent = '📂 ロード';
    toggleBtn.textContent = '💾 セーブに切替';
  }
}

function renderSaveSlots() {
  const grid = document.getElementById('saveSlotGrid');
  grid.innerHTML = '';

  for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
    const slot = saveSlots[i];
    const slotEl = document.createElement('div');
    slotEl.className = `save-slot ${saveLoadMode}-mode${slot ? ' has-data' : ' empty'}`;

    if (slot) {
      const entryCount = slot.data ? slot.data.length : 0;
      const dateStr = slot.savedAt || '';
      slotEl.innerHTML = `
        <div class="save-slot-header">
          <span class="save-slot-number">SLOT ${i + 1}</span>
          <span class="save-slot-season">${slot.season || ''}</span>
        </div>
        <div class="save-slot-info">
          <span class="save-slot-count">${entryCount}件</span>
          <span class="save-slot-date">${dateStr}</span>
        </div>
        <button class="save-slot-delete" data-index="${i}" title="削除">🗑</button>
      `;
    } else {
      slotEl.innerHTML = `
        <div class="save-slot-header">
          <span class="save-slot-number">SLOT ${i + 1}</span>
        </div>
        <div class="save-slot-empty">空</div>
      `;
    }

    // Slot click handler
    slotEl.addEventListener('click', (e) => {
      if (e.target.closest('.save-slot-delete')) return;
      if (saveLoadMode === 'save') {
        saveToSlot(i);
      } else {
        if (slot) loadFromSlot(i);
      }
    });

    // Delete button handler
    const deleteBtn = slotEl.querySelector('.save-slot-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSlot(i);
      });
    }

    grid.appendChild(slotEl);
  }
}

function saveToSlot(index) {
  if (teamData.length === 0) {
    Swal.fire('データなし', '保存する編成データがありません', 'info');
    return;
  }

  const existing = saveSlots[index];
  const seasonOptions = SEASON_OPTIONS.reduce((acc, s) => {
    acc[s] = s;
    return acc;
  }, {});

  Swal.fire({
    title: `SLOT ${index + 1} にセーブ`,
    input: 'select',
    inputOptions: seasonOptions,
    inputPlaceholder: 'Seasonを選択',
    inputValue: existing ? existing.season : SEASON_OPTIONS[SEASON_OPTIONS.length - 1],
    showCancelButton: true,
    confirmButtonText: 'セーブ',
    cancelButtonText: 'キャンセル',
    inputValidator: (value) => {
      if (!value) return 'Seasonを選択してください';
    },
    text: existing ? '既存のデータを上書きします。' : undefined,
  }).then((result) => {
    if (result.isConfirmed) {
      const now = new Date();
      const dateStr = now.toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
      saveSlots[index] = {
        data: JSON.parse(JSON.stringify(teamData)),
        season: result.value,
        savedAt: dateStr,
        label: ''
      };
      saveSlotsToStorage();
      renderSaveSlots();
      Swal.fire({
        title: 'セーブ完了',
        text: `SLOT ${index + 1} (${result.value}) に保存しました`,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    }
  });
}

function loadFromSlot(index) {
  const slot = saveSlots[index];
  if (!slot) return;

  const entryCount = slot.data ? slot.data.length : 0;
  Swal.fire({
    title: `SLOT ${index + 1} からロード`,
    html: `<p><strong>${slot.season}</strong> / ${entryCount}件 / ${slot.savedAt}</p><p style="color: #e07070; margin-top: 8px;">現在の編成データは上書きされます。</p>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ロード',
    cancelButtonText: 'キャンセル',
  }).then((result) => {
    if (result.isConfirmed) {
      teamData = slot.data.map(migrateEntry);
      saveData();
      populateTable();
      closeSaveLoadModal();
      Swal.fire({
        title: 'ロード完了',
        text: `SLOT ${index + 1} (${slot.season}) のデータを読み込みました`,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    }
  });
}

function deleteSlot(index) {
  const slot = saveSlots[index];
  if (!slot) return;

  Swal.fire({
    title: `SLOT ${index + 1} を削除`,
    text: `${slot.season} / ${slot.data.length}件のデータを削除しますか？`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '削除',
    cancelButtonText: 'キャンセル',
  }).then((result) => {
    if (result.isConfirmed) {
      saveSlots[index] = null;
      saveSlotsToStorage();
      renderSaveSlots();
    }
  });
}

document.getElementById('saveBtn').addEventListener('click', () => openSaveLoadModal('save'));
document.getElementById('loadBtn').addEventListener('click', () => openSaveLoadModal('load'));
document.getElementById('closeSaveLoadModal').addEventListener('click', closeSaveLoadModal);
document.querySelector('.save-load-overlay').addEventListener('click', closeSaveLoadModal);
document.getElementById('toggleModeBtn').addEventListener('click', () => {
  saveLoadMode = saveLoadMode === 'save' ? 'load' : 'save';
  updateSaveLoadModalUI();
  renderSaveSlots();
});

// ========================================
// 初期化
// ========================================

let stCharacterData = [], spCharacterData = [];

Promise.all([
  fetch(stCharUrl).then(res => res.json()),
  fetch(spCharUrl).then(res => res.json())
]).then(([stData, spData]) => {
  stData.forEach(c => { stNames.push(c.name); stImages[c.name] = c.image; });
  spData.forEach(c => { spNames.push(c.name); spImages[c.name] = c.image; });

  stCharacterData = stData;
  spCharacterData = spData;

  loadFreq();
  loadPriorityCharacters();

  const sortedSt = sortCharactersByPriority(stCharacterData, usageFreq, fixedTopCharacters);
  const sortedSp = sortCharactersByPriority(spCharacterData, usageFreq, fixedTopCharactersSP);
  const allSorted = [...sortedSt, ...sortedSp];

  createDropdown('userIcon', allSorted, () => {});
  createDropdown('D1', sortedSt, () => {}); createDropdown('D2', sortedSt, () => {});
  createDropdown('D3', sortedSt, () => {}); createDropdown('D4', sortedSt, () => {});
  createDropdown('S1', sortedSp, () => {}); createDropdown('S2', sortedSp, () => {});
  createDropdown('A1', sortedSt, () => {}); createDropdown('A2', sortedSt, () => {});
  createDropdown('A3', sortedSt, () => {}); createDropdown('A4', sortedSt, () => {});
  createDropdown('SP1', sortedSp, () => {}); createDropdown('SP2', sortedSp, () => {});

  loadData();
  populateTable();
});

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  loadViewState();
  loadSlotsFromStorage();
  updateToggleButtons();
  loadData();
  populateTable();

  // ハンバーガーメニュー
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const hamburgerMenu = document.getElementById('hamburgerMenu');
  const hamburgerOverlay = document.getElementById('hamburgerOverlay');

  function toggleHamburger() {
    const isOpen = hamburgerBtn.classList.toggle('active');
    hamburgerMenu.classList.toggle('active');
    hamburgerOverlay.classList.toggle('active');
    hamburgerBtn.setAttribute('aria-expanded', isOpen);
  }

  function closeHamburger() {
    hamburgerBtn.classList.remove('active');
    hamburgerMenu.classList.remove('active');
    hamburgerOverlay.classList.remove('active');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  }

  hamburgerBtn.addEventListener('click', toggleHamburger);
  hamburgerOverlay.addEventListener('click', closeHamburger);
  hamburgerMenu.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') closeHamburger();
  });
});
