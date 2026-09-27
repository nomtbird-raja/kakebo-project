const VARIABLE_CATEGORIES = ['食費','外食費','日用品','子供費','ひろき費','あさこ費','車費','医療費','その他'];
const FIXED_INCOME_ITEMS = ['夫', '妻', 'ボーナス', 'その他'];
const FIXED_ITEMS = ['住居費','電気','ガス','水道','教育費','通信費','保険','その他'];
const SPECIAL_CATEGORIES = ['旅行','税金','保険','その他'];
const TRAVEL_SUBCATEGORIES = ['交通費','宿泊費','外食費','おみやげ','イベント','その他'];
const CAT_COLORS = ['#4a7c59','#6aab80','#f4a261','#e76f51','#457b9d','#a8dadc','#e9c46a','#2a9d8f','#aaa'];

let currentYear, currentMonth, currentPage = 'input', currentSub = { input: 'daily', report: 'monthly' };
let editingId = null, donutChart = null, annualChart = null, inputSummaryChart = null;
const balanceOptions = { projected: false, special: false, wife: false, extraIncome: false };
const TOGGLE_IDS = { projected: 'toggle-projected', special: 'toggle-special', wife: 'toggle-wife', extraIncome: 'toggle-extra-income' };

function toggleBalanceOption(key) {
  balanceOptions[key] = !balanceOptions[key];
  document.getElementById(TOGGLE_IDS[key]).classList.toggle('active', balanceOptions[key]);
  renderInputSummary();
}

// スマホ幅では収支サマリー/変動費内訳カードを開閉できるようにする（PC幅では常に展開表示）
function toggleCard(id) {
  document.getElementById(id).classList.toggle('collapsed');
}

// 複数端末からの同時登録でもIDが衝突しないようにするため、連番でなくUUIDを使う
function generateId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

// ===== ストレージ =====
function key(year, month, type) {
  return `kakebo_${year}_${String(month).padStart(2,'0')}_${type}`;
}
// 支出はkey()で月ごとに配列を丸ごと保存/上書きすると、複数端末からの同時書き込みで
// 片方の変更が消えてしまう。1件＝1レコードで読み書きできるよう、IDをキーにしたフラットな
// マップで保持する（将来Firestoreに繋ぐ際も1レコード＝1ドキュメントにそのまま対応できる）。
function loadAllExpenses() {
  return JSON.parse(localStorage.getItem('kakebo_expenses') || '{}');
}
function saveAllExpenses(map) {
  localStorage.setItem('kakebo_expenses', JSON.stringify(map));
}
function loadExpenses(y = currentYear, m = currentMonth) {
  const prefix = `${y}-${String(m).padStart(2,'0')}-`;
  return Object.values(loadAllExpenses()).filter(e => e.date.startsWith(prefix));
}
function findExpenseById(id) {
  return loadAllExpenses()[id];
}
function saveExpense(expense) {
  const all = loadAllExpenses();
  all[expense.id] = expense;
  saveAllExpenses(all);
}
function deleteExpenseById(id) {
  const all = loadAllExpenses();
  delete all[id];
  saveAllExpenses(all);
}
function loadFixed(y = currentYear, m = currentMonth) {
  return JSON.parse(localStorage.getItem(key(y, m, 'fixed')) || '{}');
}
function saveFixed(data) {
  localStorage.setItem(key(currentYear, currentMonth, 'fixed'), JSON.stringify(data));
}
function loadSpecial(y = currentYear, m = currentMonth) {
  return JSON.parse(localStorage.getItem(key(y, m, 'special')) || '[]');
}
function saveSpecial(data) {
  localStorage.setItem(key(currentYear, currentMonth, 'special'), JSON.stringify(data));
}
function loadExtraIncome(y = currentYear, m = currentMonth) {
  return JSON.parse(localStorage.getItem(key(y, m, 'extra_income')) || '[]');
}
function saveExtraIncome(data) {
  localStorage.setItem(key(currentYear, currentMonth, 'extra_income'), JSON.stringify(data));
}

function fmt(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }

// ===== ナビゲーション =====
const SUB_TABS = {
  input:  [{ id: 'daily', label: '日別支出' }, { id: 'fixed', label: '収入・固定費' }],
  report: [{ id: 'monthly', label: '月次' }, { id: 'annual', label: '年間' }],
};

function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + page));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  renderSubTabs();
  switchSub(currentSub[page]);
}

function renderSubTabs() {
  const tabs = SUB_TABS[currentPage];
  const html = tabs.map(t =>
    `<button class="sub-tab-btn${currentSub[currentPage] === t.id ? ' active' : ''}" data-sub="${t.id}">${t.label}</button>`
  ).join('');
  document.getElementById('sub-tabs').innerHTML = html;
  document.getElementById('sub-tabs-mobile').innerHTML = html;
  document.querySelectorAll('.sub-tab-btn').forEach(b => {
    b.addEventListener('click', () => switchSub(b.dataset.sub));
  });
}

function switchSub(sub) {
  currentSub[currentPage] = sub;
  const prefix = currentPage === 'input' ? 'sub-' : 'sub-';
  document.querySelectorAll(`#page-${currentPage} .sub-panel`).forEach(el => {
    el.classList.toggle('active', el.id === 'sub-' + sub);
  });
  document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));

  if (sub === 'daily') renderDaily();
  if (sub === 'fixed') renderFixedTab();
  if (sub === 'monthly') renderMonthly();
  if (sub === 'annual') renderAnnual();
  if (currentPage === 'input') renderInputSummary();
}

// ===== 月ナビ =====
function updateMonthLabel() {
  document.getElementById('current-month-label').textContent = `${currentYear}年 ${currentMonth}月`;
  // 同期レイヤー（sync.js）がどの月への保存かを知るために参照する
  window.currentYear = currentYear;
  window.currentMonth = currentMonth;
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  updateMonthLabel();
  const sub = currentSub[currentPage];
  if (sub === 'daily') renderDaily();
  if (sub === 'fixed') renderFixedTab();
  if (sub === 'monthly') renderMonthly();
  if (sub === 'annual') renderAnnual();
  if (currentPage === 'input') renderInputSummary();
}

// ===== 日別支出（週グリッド） =====
function renderInputSummary() {
  const { income, fixedTotal, variable, specialTotal, balance, catTotals } = calcMonth(currentYear, currentMonth);

  // 収入（夫のみ）
  const fixed = loadFixed();
  const husbandIncome = fixed['income_夫'] || 0;
  const wifeIncome = fixed['income_妻'] || 0;
  document.getElementById('input-summary-income').textContent = fmt(husbandIncome);
  document.getElementById('input-summary-wife').textContent = fmt(wifeIncome);

  // その他収入月均（ボーナス・その他・extraIncomeを合算して当月まで累計÷月数）
  let extraIncomeCumulative = 0;
  for (let m = 1; m <= currentMonth; m++) {
    const f = loadFixed(currentYear, m);
    extraIncomeCumulative += (f['income_ボーナス'] || 0) + (f['income_その他'] || 0);
    extraIncomeCumulative += loadExtraIncome(currentYear, m).reduce((s, e) => s + e.amount, 0);
  }
  const extraIncomeAvg = Math.round(extraIncomeCumulative / currentMonth);
  document.getElementById('input-summary-extra-income').textContent = fmt(extraIncomeAvg);

  document.getElementById('input-summary-fixed').textContent = fmt(fixedTotal);
  document.getElementById('input-summary-variable').textContent = fmt(variable);
  document.getElementById('daily-total').textContent = fmt(variable);

  // 変動費予測
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const expensesForProj = loadExpenses();
  let daysElapsedForProj;
  if (expensesForProj.length > 0) {
    daysElapsedForProj = Math.max(...expensesForProj.map(e => parseInt(e.date.split('-')[2])));
  } else {
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth;
    daysElapsedForProj = isCurrentMonth ? today.getDate() : daysInMonth;
  }
  const projectedVariable = daysElapsedForProj > 0 ? Math.round((variable / daysElapsedForProj) * daysInMonth) : variable;
  document.getElementById('input-summary-projected').textContent = fmt(projectedVariable);

  // 特別支出：当月までの累計 ÷ 月数
  let specialCumulative = 0;
  for (let m = 1; m <= currentMonth; m++) {
    specialCumulative += loadSpecial(currentYear, m).reduce((s, g) => s + (g.items || []).reduce((s2, i) => s2 + i.amount, 0), 0);
  }
  const specialAvg = Math.round(specialCumulative / currentMonth);
  document.getElementById('input-summary-special-avg').textContent = fmt(specialAvg);
  // 収支計算：トグルで収入・支出の加算項目を切り替え
  const incomeForBalance = husbandIncome
    + (balanceOptions.wife ? wifeIncome : 0)
    + (balanceOptions.extraIncome ? extraIncomeAvg : 0);
  const variableForBalance = balanceOptions.projected ? projectedVariable : variable;
  const specialForBalance = balanceOptions.special ? specialAvg : 0;
  const displayBalance = incomeForBalance - fixedTotal - variableForBalance - specialForBalance;
  const balEl = document.getElementById('input-summary-balance');
  balEl.textContent = fmt(displayBalance);
  balEl.style.color = displayBalance >= 0 ? 'var(--blue)' : '#dc2626';

  // カテゴリ別内訳リスト
  const activeCats = VARIABLE_CATEGORIES.filter(c => catTotals[c] > 0);
  document.getElementById('input-category-bar').innerHTML = activeCats.length
    ? activeCats.map(c => `
        <div class="cat-bar-item">
          <span class="cat-dot" style="background:${CAT_COLORS[VARIABLE_CATEGORIES.indexOf(c)]}"></span>
          <span class="cat-bar-label">${c}</span>
          <span class="cat-bar-amount">${fmt(catTotals[c])}</span>
        </div>`).join('')
    : '<p style="color:#bbb;font-size:12px;padding:8px 0">データなし</p>';

  // 変動費の月末予測（サマリー計算を流用）
  const projectedExtra = Math.max(0, projectedVariable - variable);

  // グラフ描画
  const BP = 0.85;
  const barBase = { type: 'bar', stack: 'stack', barPercentage: BP, categoryPercentage: 0.35, borderRadius: 4, borderSkipped: false };

  if (inputSummaryChart) { inputSummaryChart.destroy(); inputSummaryChart = null; }
  inputSummaryChart = new Chart(document.getElementById('chart-input-summary'), {
    data: {
      labels: ['収入', '費用'],
      datasets: [
        { ...barBase, label: '夫',           data: [husbandIncome, null],                             backgroundColor: '#2563eb' },
        { ...barBase, label: '妻',     data: [balanceOptions.wife ? wifeIncome : 0, null],      backgroundColor: '#60a5fa' },
        { ...barBase, label: 'その他収入',   data: [balanceOptions.extraIncome ? extraIncomeAvg : 0, null], backgroundColor: '#bfdbfe' },
        { ...barBase, label: '固定費',       data: [null, fixedTotal],                                backgroundColor: '#94a3b8' },
        { ...barBase, label: '変動費（実績）', data: [null, variable],                                backgroundColor: '#475569' },
        { ...barBase, label: '変動費（予測）',
          data: [null, balanceOptions.projected ? projectedExtra : 0],
          backgroundColor: 'rgba(71,85,105,0.2)',
          borderColor: '#94a3b8',
          borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
        },
        { ...barBase, label: '特別支出（月均）',
          data: [null, balanceOptions.special ? specialAvg : 0],
          backgroundColor: 'rgba(37,99,235,0.15)',
          borderColor: '#93c5fd',
          borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
        },
        {
          type: 'line',
          label: '収入ライン',
          data: incomeForBalance > 0 ? [incomeForBalance, incomeForBalance] : [null, null],
          borderColor: 'rgba(37,99,235,0.3)',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
          yAxisID: 'y',
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: '#fff',
          borderColor: '#e2e8f0',
          borderWidth: 1,
          titleColor: '#1e293b',
          bodyColor: '#64748b',
          padding: 10,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}：¥${Math.round(ctx.raw || 0).toLocaleString()}`
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { display: false },
          ticks: { color: '#94a3b8', font: { size: 12, weight: '600' } },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: '#f1f5f9', drawTicks: false },
          border: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            padding: 8,
            callback: v => '¥' + (v / 10000).toFixed(0) + '万'
          }
        }
      }
    }
  });

  // カスタム凡例を描画
  const legendEl = document.getElementById('chart-legend-html');
  if (legendEl) {
    const incomeLegend = [
      { label: '夫', color: '#2563eb' },
      { label: '妻', color: '#60a5fa' },
      { label: 'その他収入', color: '#bfdbfe' },
    ];
    const expenseLegend = [
      { label: '固定費', color: '#94a3b8' },
      { label: '変動費（実績）', color: '#475569' },
      { label: '変動費（予測）', color: 'rgba(71,85,105,0.35)' },
      { label: '特別支出（月均）', color: 'rgba(37,99,235,0.3)' },
    ];
    const mkItem = ({ label, color }) =>
      `<div class="cl-item"><span class="cl-dot" style="background:${color}"></span><span class="cl-label">${label}</span></div>`;
    legendEl.innerHTML =
      `<div class="cl-group"><div class="cl-heading">収入</div>${incomeLegend.map(mkItem).join('')}</div>` +
      `<div class="cl-group"><div class="cl-heading">費用</div>${expenseLegend.map(mkItem).join('')}</div>`;
  }
}

function renderDaily() {
  const expenses = loadExpenses();

  const list = document.getElementById('daily-list');
  const grouped = {};
  expenses.forEach(e => { (grouped[e.date] = grouped[e.date] || []).push(e); });

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDowSun = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0=日
  const firstDow = (firstDowSun + 6) % 7; // 月曜始まりに変換（月=0）
  const today = new Date();
  const isThisMonth = today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth;
  const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const DOW_CLASS = ['','','','','','sat','sun'];

  // ヘッダー行
  const headerHtml = DAY_NAMES.map((n, i) =>
    `<div class="week-day-header ${DOW_CLASS[i]}">${n}</div>`
  ).join('');

  // 日付セルを生成（先頭の空白 + 実日付）
  const totalCells = firstDow + daysInMonth;
  const weeks = Math.ceil(totalCells / 7);
  let cellsHtml = '';

  for (let i = 0; i < weeks * 7; i++) {
    const day = i - firstDow + 1;
    if (day < 1 || day > daysInMonth) {
      cellsHtml += `<div class="day-cell empty"></div>`;
      continue;
    }
    const dow = i % 7;
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayExp = grouped[dateStr] || [];
    const dayTotal = dayExp.reduce((s, e) => s + e.amount, 0);
    const isToday = isThisMonth && today.getDate() === day;

    const expRows = dayExp.slice(0, 4).map(e => `
      <div class="day-expense-row" onclick="openDayDetail('${dateStr}')">
        <span class="day-exp-cat">${e.category}</span>
        <span class="day-exp-memo">${e.memo || ''}</span>
        <span class="day-exp-amount">${e.amount.toLocaleString('ja-JP')}</span>
      </div>`).join('');
    const moreHtml = dayExp.length > 4
      ? `<div style="font-size:10px;color:#aaa;text-align:right">他${dayExp.length - 4}件</div>` : '';

    cellsHtml += `
      <div class="day-cell${isToday ? ' today' : ''}">
        <div class="day-cell-header">
          <span class="day-num ${DOW_CLASS[dow]}">${day}</span>
          <button class="day-add-btn" onclick="openModal('${dateStr}')">＋</button>
        </div>
        <div class="day-cell-body">${expRows}${moreHtml}</div>
        ${dayTotal > 0 ? `<div class="day-cell-footer">${fmt(dayTotal)}</div>` : ''}
      </div>`;
  }

  list.innerHTML = `
    <div class="week-grid">${headerHtml}</div>
    <div class="week-grid">${cellsHtml}</div>`;
}

function deleteExpense(id) {
  deleteExpenseById(id);
  renderDaily();
  renderInputSummary();
  // 詳細モーダルが開いていれば再描画
  const modal = document.getElementById('day-detail-modal');
  if (modal && !modal.classList.contains('hidden')) {
    const date = modal.dataset.date;
    renderDayDetail(date);
  }
}

// 日付セルクリックで詳細一覧表示
function openDayDetail(dateStr) {
  let modal = document.getElementById('day-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'day-detail-modal';
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content day-detail-modal-content">
      <h3 id="day-detail-title"></h3>
      <div id="day-detail-list" class="day-detail-list"></div>
      <div class="modal-actions">
        <button class="btn-primary" id="day-detail-add">＋ 追加</button>
        <button class="btn-secondary" id="day-detail-close">閉じる</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
    document.getElementById('day-detail-close').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('day-detail-add').addEventListener('click', () => {
      modal.classList.add('hidden');
      openModal(modal.dataset.date);
    });
  }
  modal.dataset.date = dateStr;
  modal.classList.remove('hidden');
  renderDayDetail(dateStr);
}

function renderDayDetail(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const DAY_NAMES = ['日','月','火','水','木','金','土'];
  document.getElementById('day-detail-title').textContent =
    `${d.getMonth()+1}月${d.getDate()}日（${DAY_NAMES[d.getDay()]}）`;
  const expenses = loadExpenses().filter(e => e.date === dateStr);
  const list = document.getElementById('day-detail-list');
  list.innerHTML = expenses.length
    ? expenses.map(e => `
        <div class="day-detail-item">
          <span class="expense-category">${e.category}</span>
          <span class="expense-memo">${e.memo || ''}</span>
          <span class="expense-amount">${fmt(e.amount)}</span>
          <div class="day-item-menu">
            <button class="day-item-menu-btn" onclick="toggleDayItemMenu(event, '${e.id}')">⋯</button>
            <div class="day-item-menu-dropdown hidden" id="day-item-menu-${e.id}">
              <button onclick="editExpense('${e.id}')">編集</button>
              <button onclick="openExpenseItemsModal('${e.id}')">${(e.items && e.items.length) ? '内訳編集' : '内訳追加'}</button>
              <button class="danger" onclick="deleteExpense('${e.id}')">削除</button>
            </div>
          </div>
        </div>
        ${(e.items && e.items.length) ? `<div class="expense-items-detail">${
          e.items.slice(0, 4).map(i => `<span>${i.name} ${fmt(i.amount)}</span>`).join('')
        }${e.items.length > 4 ? `<span class="expense-items-more">他${e.items.length - 4}件</span>` : ''}</div>` : ''}`).join('')
    : '<p style="color:#bbb;text-align:center;padding:16px">支出なし</p>';
}

// 日別詳細の各行「⋯」メニュー（編集・内訳・削除をまとめる）
function toggleDayItemMenu(event, id) {
  event.stopPropagation();
  const menu = document.getElementById('day-item-menu-' + id);
  const isOpen = !menu.classList.contains('hidden');
  document.querySelectorAll('.day-item-menu-dropdown').forEach(m => m.classList.add('hidden'));
  if (!isOpen) menu.classList.remove('hidden');
}
document.addEventListener('click', () => {
  document.querySelectorAll('.day-item-menu-dropdown').forEach(m => m.classList.add('hidden'));
});

// ===== モーダル =====
let modalItems = [];

let modalOpenedFromDayDetail = false;

function openModal(dateStr = null) {
  editingId = null;
  modalItems = [];
  modalOpenedFromDayDetail = false;
  const now = new Date();
  const defaultDate = dateStr || `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  document.getElementById('modal-title').textContent = '支出を追加';
  document.getElementById('input-date').value = defaultDate;
  document.getElementById('input-category').value = '食費';
  document.getElementById('input-amount').value = '';
  document.getElementById('input-memo').value = '';
  document.getElementById('modal-items-section').classList.add('hidden');
  document.getElementById('modal-items-toggle').classList.remove('hidden');
  renderModalItems();
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('input-amount').focus();
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  editingId = null;
  if (modalOpenedFromDayDetail) {
    const dayModal = document.getElementById('day-detail-modal');
    if (dayModal) dayModal.classList.remove('hidden');
    modalOpenedFromDayDetail = false;
  }
}

function editExpense(id) {
  const exp = findExpenseById(id);
  if (!exp) return;
  editingId = id;
  modalItems = (exp.items || []).filter(i => !i.auto).map(i => ({ name: i.name, amount: i.amount }));
  document.getElementById('modal-title').textContent = '支出を編集';
  document.getElementById('input-date').value = exp.date;
  document.getElementById('input-category').value = exp.category;
  document.getElementById('input-amount').value = exp.amount;
  document.getElementById('input-memo').value = exp.memo || '';
  if (modalItems.length > 0) {
    document.getElementById('modal-items-section').classList.remove('hidden');
    document.getElementById('modal-items-toggle').classList.add('hidden');
  } else {
    document.getElementById('modal-items-section').classList.add('hidden');
    document.getElementById('modal-items-toggle').classList.remove('hidden');
  }
  renderModalItems();
  // 日別詳細モーダルは後からDOMに追加され重なり順が上になるため、開いたままだと編集モーダルが裏に隠れてしまう
  const dayModal = document.getElementById('day-detail-modal');
  if (dayModal && !dayModal.classList.contains('hidden')) {
    dayModal.classList.add('hidden');
    modalOpenedFromDayDetail = true;
  }
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('input-amount').focus();
}

// ===== 支出の内訳（品目単位） =====
function toggleModalItems() {
  document.getElementById('modal-items-section').classList.remove('hidden');
  document.getElementById('modal-items-toggle').classList.add('hidden');
  if (modalItems.length === 0) addModalItemRow();
}

function addModalItemRow() {
  modalItems.push({ name: '', amount: 0 });
  renderModalItems();
}

function removeModalItemRow(index) {
  modalItems.splice(index, 1);
  renderModalItems();
  if (modalItems.length === 0) {
    document.getElementById('modal-items-section').classList.add('hidden');
    document.getElementById('modal-items-toggle').classList.remove('hidden');
  }
}

function updateModalItem(index, field, value) {
  modalItems[index][field] = field === 'amount' ? (parseInt(value, 10) || 0) : value;
}

function renderModalItems() {
  const list = document.getElementById('modal-items-list');
  list.innerHTML = modalItems.map((it, i) => `
    <div class="modal-item-row">
      <input type="text" placeholder="品目（例：ラーメン）" value="${it.name || ''}" oninput="updateModalItem(${i}, 'name', this.value)">
      <input type="number" placeholder="金額" min="0" value="${it.amount || ''}" oninput="updateModalItem(${i}, 'amount', this.value)">
      <button type="button" class="expense-delete" onclick="removeModalItemRow(${i})">×</button>
    </div>`).join('');
}

// 内訳の合計が本来の金額と合わない場合、差分を「その他」として自動補完する
function reconcileItems(items, totalAmount) {
  const sum = items.reduce((s, it) => s + it.amount, 0);
  const diff = totalAmount - sum;
  return diff > 0 ? [...items, { id: generateId(), name: 'その他', amount: diff, auto: true }] : items;
}

// ===== 登録済み支出の内訳編集 =====
let editingItemsExpenseId = null;
let editingItemsArr = [];

function openExpenseItemsModal(id) {
  editingItemsExpenseId = id;
  const exp = findExpenseById(id);
  editingItemsArr = (exp && exp.items) ? exp.items.filter(i => !i.auto).map(i => ({ name: i.name, amount: i.amount })) : [];
  if (editingItemsArr.length === 0) editingItemsArr.push({ name: '', amount: 0 });
  renderExpenseItemsModalList();
  // 日別詳細モーダルは後からDOMに追加されるため重なり順が上になり、開いたままだと内訳モーダルが裏に隠れてしまう
  const dayModal = document.getElementById('day-detail-modal');
  if (dayModal) dayModal.classList.add('hidden');
  document.getElementById('expense-items-modal').classList.remove('hidden');
}

function closeExpenseItemsModal() {
  document.getElementById('expense-items-modal').classList.add('hidden');
  editingItemsExpenseId = null;
  const dayModal = document.getElementById('day-detail-modal');
  if (dayModal && dayModal.dataset.date) dayModal.classList.remove('hidden');
}

function addExpenseItemsModalRow() {
  editingItemsArr.push({ name: '', amount: 0 });
  renderExpenseItemsModalList();
}

function removeExpenseItemsModalRow(index) {
  editingItemsArr.splice(index, 1);
  renderExpenseItemsModalList();
}

function updateExpenseItemsModalItem(index, field, value) {
  editingItemsArr[index][field] = field === 'amount' ? (parseInt(value, 10) || 0) : value;
}

function renderExpenseItemsModalList() {
  const list = document.getElementById('expense-items-modal-list');
  list.innerHTML = editingItemsArr.map((it, i) => `
    <div class="modal-item-row">
      <input type="text" placeholder="品目（例：ラーメン）" value="${it.name || ''}" oninput="updateExpenseItemsModalItem(${i}, 'name', this.value)">
      <input type="number" placeholder="金額" min="0" value="${it.amount || ''}" oninput="updateExpenseItemsModalItem(${i}, 'amount', this.value)">
      <button type="button" class="expense-delete" onclick="removeExpenseItemsModalRow(${i})">×</button>
    </div>`).join('');
}

function saveExpenseItemsModal() {
  const items = editingItemsArr
    .filter(it => it.name.trim() && it.amount > 0)
    .map(it => ({ id: generateId(), name: it.name.trim(), amount: it.amount }));
  const exp = findExpenseById(editingItemsExpenseId);
  if (exp) {
    const finalItems = items.length > 0 ? reconcileItems(items, exp.amount) : items;
    if (finalItems.length > 0) exp.items = finalItems; else delete exp.items;
    exp.updatedAt = new Date().toISOString();
    saveExpense(exp);
  }
  closeExpenseItemsModal();
  renderDaily();
  renderInputSummary();
  const modal = document.getElementById('day-detail-modal');
  if (modal && !modal.classList.contains('hidden')) renderDayDetail(modal.dataset.date);
}

function saveModal() {
  const date = document.getElementById('input-date').value;
  const category = document.getElementById('input-category').value;
  const amount = parseInt(document.getElementById('input-amount').value, 10);
  const memo = document.getElementById('input-memo').value.trim();
  if (!date || isNaN(amount) || amount <= 0) return;
  const items = modalItems
    .filter(it => it.name.trim() && it.amount > 0)
    .map(it => ({ id: generateId(), name: it.name.trim(), amount: it.amount }));
  const now = new Date().toISOString();

  if (editingId) {
    const exp = findExpenseById(editingId);
    if (!exp) return;
    exp.date = date; exp.category = category; exp.amount = amount; exp.memo = memo;
    if (items.length > 0) exp.items = reconcileItems(items, amount); else delete exp.items;
    exp.updatedAt = now;
    saveExpense(exp);
  } else {
    const expense = { id: generateId(), date, category, amount, memo, createdAt: now, updatedAt: now };
    if (items.length > 0) expense.items = reconcileItems(items, amount);
    saveExpense(expense);
  }

  closeModal();
  renderDaily();
  renderInputSummary();
  const dayModal = document.getElementById('day-detail-modal');
  if (dayModal && !dayModal.classList.contains('hidden')) renderDayDetail(dayModal.dataset.date);
}

// 「1000+2000」のように+区切りで入力された場合は合計してから確定する
function resolveNumericInput(raw) {
  const cleaned = raw.replace(/,/g, '');
  if (/^[0-9]+(\+[0-9]+)+$/.test(cleaned)) {
    return cleaned.split('+').reduce((s, n) => s + parseInt(n, 10), 0);
  }
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

function formatNumericInput(el) {
  const value = resolveNumericInput(el.value);
  el.value = value ? value.toLocaleString() : '';
}

// カンマ付き数値入力のHTMLを生成（+区切りで入力すると足し算して確定する）
function numericInput(dataKey, value) {
  const display = value ? Number(value).toLocaleString() : '';
  return `<input type="text" inputmode="tel" class="numeric-input" data-key="${dataKey}" value="${display}" placeholder="0"
    onfocus="this.value=this.value.replace(/,/g,'')"
    onblur="formatNumericInput(this);updateSectionTotal();saveFixedTab(false)"
    oninput="updateSectionTotal()">`;
}

// ===== 収入・固定費タブ =====
function renderFixedTab() {
  const fixed = loadFixed();

  // 収入テーブル（固定行 + その他追加分）
  const extraItems = loadExtraIncome();
  document.getElementById('income-table').innerHTML =
    FIXED_INCOME_ITEMS.map(k =>
      `<tr><td>${k}</td><td>${numericInput('income_'+k, fixed['income_'+k])}</td><td></td></tr>`
    ).join('') +
    extraItems.map(e => `
      <tr>
        <td>その他${e.memo ? `<span style="color:#94a3b8;font-size:11px;margin-left:6px">${e.memo}</span>` : ''}</td>
        <td style="text-align:right;font-weight:600;color:var(--blue)">${fmt(e.amount)}</td>
        <td><button class="expense-delete" onclick="deleteExtraIncome('${e.id}')">×</button></td>
      </tr>`).join('') +
    `<tr><td colspan="3" style="padding-top:6px"><button class="special-add-btn" onclick="openExtraIncomeModal()">＋ その他追加</button></td></tr>`;

  // 固定費
  document.getElementById('fixed-table').innerHTML = FIXED_ITEMS.map(k =>
    `<tr><td>${k}</td><td>${numericInput('fixed_'+k, fixed['fixed_'+k])}</td></tr>`
  ).join('');

  updateSectionTotal();
  renderSpecialList();
}

function toggleWife() {
  const fixed = loadFixed();
  const btn = document.getElementById('wife-toggle');
  const row = document.getElementById('wife-row');
  const isActive = btn.classList.toggle('active');
  row.style.display = isActive ? '' : 'none';
  if (!isActive) {
    delete fixed['income_妻'];
    saveFixed(fixed);
    renderInputSummary();
  }
}

function parseNumericInput(el) {
  return resolveNumericInput(el?.value || '') || 0;
}

function updateSectionTotal() {
  const fixedIncomeTotal = FIXED_INCOME_ITEMS.reduce((s, k) => {
    return s + parseNumericInput(document.querySelector(`input[data-key="income_${k}"]`));
  }, 0);
  const extraTotal = loadExtraIncome().reduce((s, e) => s + e.amount, 0);
  document.getElementById('income-total').textContent = fmt(fixedIncomeTotal + extraTotal);
  const fixedExpTotal = FIXED_ITEMS.reduce((s, k) => {
    return s + parseNumericInput(document.querySelector(`input[data-key="fixed_${k}"]`));
  }, 0);
  document.getElementById('fixed-total').textContent = fmt(fixedExpTotal);
}

function saveFixedTab(showAlert = true) {
  const data = {};
  document.querySelectorAll('.input-table input[data-key]').forEach(el => {
    const v = resolveNumericInput(el.value);
    if (v > 0) data[el.dataset.key] = v;
  });
  saveFixed(data);
  renderInputSummary();
  if (showAlert) alert('保存しました');
}

// ===== 特別収入 =====
function renderExtraIncomeList() {
  renderFixedTab();
}

function openExtraIncomeModal() {
  document.getElementById('extra-income-memo').value = '';
  document.getElementById('extra-income-amount').value = '';
  document.getElementById('extra-income-modal').classList.remove('hidden');
  document.getElementById('extra-income-amount').focus();
}

function closeExtraIncomeModal() {
  document.getElementById('extra-income-modal').classList.add('hidden');
}

function saveExtraIncomeModal() {
  const memo = document.getElementById('extra-income-memo').value.trim();
  const amount = parseInt(document.getElementById('extra-income-amount').value, 10);
  if (isNaN(amount) || amount <= 0) return;
  const items = loadExtraIncome();
  items.push({ id: generateId(), memo, amount, createdAt: new Date().toISOString() });
  saveExtraIncome(items);
  closeExtraIncomeModal();
  renderExtraIncomeList();
  renderInputSummary();
}

function deleteExtraIncome(id) {
  saveExtraIncome(loadExtraIncome().filter(e => e.id !== id));
  renderExtraIncomeList();
  renderInputSummary();
}

// ===== 特別支出 =====
let editingSpecialGroupId = null;

function specialGroupTotal(g) {
  return (g.items || []).reduce((s, i) => s + i.amount, 0);
}

function renderSpecialList() {
  const groups = loadSpecial();
  const total = groups.reduce((s, g) => s + specialGroupTotal(g), 0);
  document.getElementById('special-total').textContent = fmt(total);

  const list = document.getElementById('special-list');
  if (!groups.length) {
    list.innerHTML = '<p style="color:#bbb;font-size:12px;text-align:center;padding:12px 0">まだありません</p>';
    return;
  }
  list.innerHTML = groups.map(g => {
    const subtotal = specialGroupTotal(g);
    const itemsHtml = (g.items || []).map(i => `
      <div class="special-line-item">
        <span class="special-line-label">${i.subCategory || ''}${i.memo ? `<span class="special-line-memo"> / ${i.memo}</span>` : ''}</span>
        <span class="special-line-amount">${fmt(i.amount)}</span>
        <button class="expense-delete" onclick="deleteSpecialItem('${g.id}', '${i.id}')">×</button>
      </div>`).join('');
    return `
      <div class="special-group">
        <div class="special-group-header">
          <span class="expense-category">${g.category}</span>
          <span class="special-group-name">${g.name}</span>
          <span class="special-group-subtotal">${fmt(subtotal)}</span>
          <button class="special-item-add" data-gid="${g.id}" data-gcat="${g.category}" data-gname="${g.name.replace(/"/g,'&quot;')}" onclick="openSpecialItemModalById(this)">＋費目</button>
          <button class="expense-delete" onclick="deleteSpecial('${g.id}')">×</button>
        </div>
        ${itemsHtml}
      </div>`;
  }).join('');
}

function openSpecialModal() {
  document.getElementById('special-name').value = '';
  document.getElementById('special-category').value = '旅行';
  document.getElementById('special-modal').classList.remove('hidden');
  document.getElementById('special-name').focus();
}

function closeSpecialModal() {
  document.getElementById('special-modal').classList.add('hidden');
}

function saveSpecialModal() {
  const name = document.getElementById('special-name').value.trim();
  const category = document.getElementById('special-category').value;
  if (!name) return;
  const groups = loadSpecial();
  groups.push({ id: generateId(), name, category, items: [], createdAt: new Date().toISOString() });
  saveSpecial(groups);
  closeSpecialModal();
  renderSpecialList();
}

function deleteSpecial(id) {
  saveSpecial(loadSpecial().filter(g => g.id !== id));
  renderSpecialList();
  renderInputSummary();
}

function openSpecialItemModalById(btn) {
  openSpecialItemModal(btn.dataset.gid, btn.dataset.gcat, btn.dataset.gname);
}

function openSpecialItemModal(groupId, category, groupName) {
  editingSpecialGroupId = groupId;
  const isTravel = category === '旅行';
  document.getElementById('special-item-modal-title').textContent = `費目を追加（${groupName}）`;
  document.getElementById('special-item-sub-label').style.display = isTravel ? '' : 'none';
  document.getElementById('special-item-sub-text-label').style.display = isTravel ? 'none' : '';
  document.getElementById('special-item-subcategory').value = '交通費';
  document.getElementById('special-item-subtext').value = '';
  document.getElementById('special-item-memo').value = '';
  document.getElementById('special-item-amount').value = '';
  document.getElementById('special-item-modal').classList.remove('hidden');
  document.getElementById('special-item-amount').focus();
}

function closeSpecialItemModal() {
  document.getElementById('special-item-modal').classList.add('hidden');
  editingSpecialGroupId = null;
}

function saveSpecialItemModal() {
  const amount = parseInt(document.getElementById('special-item-amount').value, 10);
  if (isNaN(amount) || amount <= 0) return;
  const subLabel = document.getElementById('special-item-sub-label');
  const subCategory = subLabel.style.display !== 'none'
    ? document.getElementById('special-item-subcategory').value
    : document.getElementById('special-item-subtext').value.trim();
  const memo = document.getElementById('special-item-memo').value.trim();
  const groups = loadSpecial();
  const group = groups.find(g => g.id === editingSpecialGroupId);
  if (!group) return;
  group.items = group.items || [];
  group.items.push({ id: generateId(), subCategory, memo, amount, createdAt: new Date().toISOString() });
  saveSpecial(groups);
  closeSpecialItemModal();
  renderSpecialList();
  renderInputSummary();
}

function deleteSpecialItem(groupId, itemId) {
  const groups = loadSpecial();
  const group = groups.find(g => g.id === groupId);
  if (group) group.items = (group.items || []).filter(i => i.id !== itemId);
  saveSpecial(groups);
  renderSpecialList();
  renderInputSummary();
}

// ===== 集計ヘルパー =====
function calcMonth(y, m) {
  const fixed = loadFixed(y, m);
  const expenses = loadExpenses(y, m);
  const special = loadSpecial(y, m);
  const extraIncome = loadExtraIncome(y, m);
  const income = FIXED_INCOME_ITEMS.reduce((s, k) => s + (fixed['income_'+k] || 0), 0)
    + extraIncome.reduce((s, e) => s + e.amount, 0);
  const fixedTotal = FIXED_ITEMS.reduce((s, k) => s + (fixed['fixed_'+k] || 0), 0);
  const variable = expenses.reduce((s, e) => s + e.amount, 0);
  const specialTotal = special.reduce((s, g) => s + (g.items || []).reduce((s2, i) => s2 + i.amount, 0), 0);
  const balance = income - fixedTotal - variable - specialTotal;
  const catTotals = {};
  VARIABLE_CATEGORIES.forEach(c => catTotals[c] = 0);
  expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  return { income, fixedTotal, variable, specialTotal, balance, catTotals };
}

// ===== 月次 =====
function renderMonthly() {
  const { income, fixedTotal, variable, balance, catTotals } = calcMonth(currentYear, currentMonth);

  document.getElementById('summary-income').textContent = fmt(income);
  document.getElementById('summary-fixed').textContent = fmt(fixedTotal);
  document.getElementById('summary-variable').textContent = fmt(variable);
  const balEl = document.getElementById('summary-balance');
  balEl.textContent = fmt(balance);
  balEl.style.color = balance >= 0 ? '#2e7d32' : '#c62828';

  const activeCats = VARIABLE_CATEGORIES.filter(c => catTotals[c] > 0);
  document.getElementById('category-breakdown').innerHTML = activeCats.length
    ? activeCats.map(c => `<tr><td>${c}</td><td>${fmt(catTotals[c])}</td></tr>`).join('')
    : '<tr><td colspan="2" style="text-align:center;color:#bbb;padding:16px">データなし</td></tr>';

  // ドーナツグラフ
  const canvas = document.getElementById('chart-donut');
  if (donutChart) { donutChart.destroy(); donutChart = null; }
  if (activeCats.length) {
    donutChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: activeCats,
        datasets: [{ data: activeCats.map(c => catTotals[c]), backgroundColor: CAT_COLORS }]
      },
      options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } }, cutout: '60%' }
    });
  } else {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ===== 年間 =====
function renderAnnual() {
  document.getElementById('annual-year').textContent = currentYear;
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const data = months.map(m => calcMonth(currentYear, m));

  // テーブル
  document.getElementById('annual-table-body').innerHTML = months.map((m, i) => {
    const d = data[i];
    const cls = d.balance >= 0 ? 'positive' : 'negative';
    return `<tr>
      <td>${m}月</td>
      <td>${d.income ? fmt(d.income) : '-'}</td>
      <td>${d.fixedTotal ? fmt(d.fixedTotal) : '-'}</td>
      <td>${d.variable ? fmt(d.variable) : '-'}</td>
      <td class="${cls}">${(d.income || d.fixedTotal || d.variable) ? fmt(d.balance) : '-'}</td>
    </tr>`;
  }).join('');

  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalFixed = data.reduce((s, d) => s + d.fixedTotal, 0);
  const totalVar = data.reduce((s, d) => s + d.variable, 0);
  const totalBal = data.reduce((s, d) => s + d.balance, 0);
  document.getElementById('annual-table-foot').innerHTML = `<tr>
    <td>合計</td>
    <td>${fmt(totalIncome)}</td>
    <td>${fmt(totalFixed)}</td>
    <td>${fmt(totalVar)}</td>
    <td class="${totalBal >= 0 ? 'positive' : 'negative'}">${fmt(totalBal)}</td>
  </tr>`;

  // 棒グラフ
  if (annualChart) { annualChart.destroy(); annualChart = null; }
  annualChart = new Chart(document.getElementById('chart-annual'), {
    type: 'bar',
    data: {
      labels: months.map(m => `${m}月`),
      datasets: [
        { label: '収入', data: data.map(d => d.income), backgroundColor: '#4a7c59' },
        { label: '固定費', data: data.map(d => d.fixedTotal), backgroundColor: '#457b9d' },
        { label: '変動費', data: data.map(d => d.variable), backgroundColor: '#f4a261' },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } },
      scales: { x: { stacked: false }, y: { beginAtZero: true, ticks: { callback: v => '¥' + v.toLocaleString() } } }
    }
  });
}

// ===== 初期化 =====
function init() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;
  updateMonthLabel();

  // 月ナビ
  document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

  // サイドバーナビ
  document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
    switchPage(b.dataset.page);
    // モバイル：サイドバーを閉じる
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }));

  // ボトムナビ
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));

  // ハンバーガー
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  });

  // モーダル
  document.getElementById('open-add-modal').addEventListener('click', openModal);
  document.getElementById('modal-save').addEventListener('click', saveModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.getElementById('special-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeSpecialModal(); });
  document.getElementById('special-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveSpecialModal(); });
  document.getElementById('special-item-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeSpecialItemModal(); });
  document.getElementById('special-item-amount').addEventListener('keydown', e => { if (e.key === 'Enter') saveSpecialItemModal(); });
  document.getElementById('extra-income-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeExtraIncomeModal(); });
  document.getElementById('expense-items-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeExpenseItemsModal(); });
  document.getElementById('extra-income-amount').addEventListener('keydown', e => { if (e.key === 'Enter') saveExtraIncomeModal(); });
  document.getElementById('input-amount').addEventListener('keydown', e => { if (e.key === 'Enter') saveModal(); });

  // 保存ボタン
  document.getElementById('save-fixed').addEventListener('click', saveFixedTab);

  // 初期表示
  switchPage('input');
}

// sync.jsが遠隔（他端末）からの更新を受け取った際に、今表示中の画面を再描画するためのフック
window.refreshCurrentView = () => switchSub(currentSub[currentPage]);

// 起動タイミングはsync.js（Firestoreからの初期データ取得後）が制御する。
// sync.jsが読み込まれていない/Firebase未設定の場合はここで即時起動する。
window.__appInit = init;
if (window.startApp) {
  window.startApp();
} else {
  init();
}

// ===== デモ / リセット =====
function loadDemoData() {
  if (!confirm('デモデータを読み込みます。現在のデータは上書きされます。よろしいですか？')) return;

  Object.keys(localStorage).filter(k => k.startsWith('kakebo_')).forEach(k => localStorage.removeItem(k));

  const months = [
    { y: 2026, m: 1,  income: { 夫: 320000, 妻: 80000, その他: 20000 }, fixed: { 住居費: 95000, 電気: 8500, ガス: 4200, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 2,  income: { 夫: 320000, 妻: 80000, その他: 20000 }, fixed: { 住居費: 95000, 電気: 9200, ガス: 5100, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 3,  income: { 夫: 320000, 妻: 80000, その他: 20000 }, fixed: { 住居費: 95000, 電気: 7800, ガス: 3800, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 4,  income: { 夫: 320000, 妻: 80000, その他: 20000 }, fixed: { 住居費: 95000, 電気: 6500, ガス: 2900, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 5,  income: { 夫: 320000, 妻: 80000, その他: 20000 }, fixed: { 住居費: 95000, 電気: 6200, ガス: 2500, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 6,  income: { 夫: 320000, 妻: 80000, その他: 20000, ボーナス: 200000 }, fixed: { 住居費: 95000, 電気: 7100, ガス: 2200, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 7,  income: { 夫: 320000, 妻: 80000, その他: 20000 }, fixed: { 住居費: 95000, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
  ];

  const expenseTemplates = [
    { category: '食費',   items: [['AVE',16845],['業務スーパー',8500],['三和',6200],['ローゼン',3800],['OK',4500],['農協',2800]] },
    { category: '外食費', items: [['マクドナルド',1200],['リビンお弁当',980],['ガスト',3200]] },
    { category: '日用品', items: [['ドラッグストア',3200],['クリエイト',5600],['ダイソー',880]] },
    { category: '子供費', items: [['しまむら',4800],['学用品',2500]] },
    { category: 'あさこ費', items: [['ブレドール',3500],['美容室',6500]] },
    { category: '車費',  items: [['ガソリン',6800]] },
    { category: '医療費', items: [['小児科',1500],['歯科',3200]] },
    { category: 'その他', items: [['楽天',18629],['Amazon',4500]] },
  ];

  const allExpenses = loadAllExpenses();
  months.forEach(({ y, m, income, fixed }) => {
    const fixedData = {};
    Object.entries(income).forEach(([k, v]) => { fixedData[`income_${k}`] = v; });
    Object.entries(fixed).forEach(([k, v]) => { fixedData[`fixed_${k}`] = v; });
    localStorage.setItem(`kakebo_${y}_${String(m).padStart(2,'0')}_fixed`, JSON.stringify(fixedData));

    const daysInMonth = m === 7 ? 14 : new Date(y, m, 0).getDate();
    const now = new Date().toISOString();
    expenseTemplates.forEach(tmpl => {
      tmpl.items.forEach(([memo, baseAmt]) => {
        const day = Math.floor(Math.random() * daysInMonth) + 1;
        const date = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const amount = baseAmt + Math.floor((Math.random() - 0.5) * baseAmt * 0.2);
        const id = generateId();
        allExpenses[id] = { id, date, category: tmpl.category, amount, memo, createdAt: now, updatedAt: now };
      });
    });
  });
  saveAllExpenses(allExpenses);

  localStorage.setItem('kakebo_2026_06_special', JSON.stringify([{id:'1000001',name:'山梨旅行',category:'旅行',items:[{id:'1000101',subCategory:'交通費',memo:'高速代',amount:8000},{id:'1000102',subCategory:'宿泊費',memo:'ホテル',amount:25000},{id:'1000103',subCategory:'外食費',memo:'夕食',amount:12000},{id:'1000104',subCategory:'おみやげ',memo:'',amount:5000}]}]));
  localStorage.setItem('kakebo_2026_04_special', JSON.stringify([{id:'1000002',name:'自動車税',category:'税金',items:[{id:'1000201',subCategory:'自動車税',memo:'',amount:39500}]}]));
  localStorage.setItem('kakebo_2026_05_extra_income', JSON.stringify([{id:'2000001',memo:'フリマ売上',amount:8500}]));

  location.reload();
}

function resetAllData() {
  if (!confirm('すべてのデータを削除します。この操作は取り消せません。よろしいですか？')) return;
  Object.keys(localStorage).filter(k => k.startsWith('kakebo_')).forEach(k => localStorage.removeItem(k));
  location.reload();
}
