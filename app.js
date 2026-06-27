const VARIABLE_CATEGORIES = ['食費','外食費','日用品','子供費','ひろき費','あさこ費','車費','医療費','その他'];
const INCOME_ITEMS = ['夫','妻パート','ボーナス','児童手当','その他'];
const DEDUCTION_ITEMS = ['社会保険・税金','貯蓄','自己投資'];
const FIXED_ITEMS = ['住居費','電気','ガス','水道','教育費','通信費','保険'];

let currentYear, currentMonth, editingId = null;

function storageKey(year, month, type) {
  return `kakebo_${year}_${String(month).padStart(2,'0')}_${type}`;
}

function loadExpenses() {
  return JSON.parse(localStorage.getItem(storageKey(currentYear, currentMonth, 'expenses')) || '[]');
}

function saveExpenses(data) {
  localStorage.setItem(storageKey(currentYear, currentMonth, 'expenses'), JSON.stringify(data));
}

function loadFixed() {
  return JSON.parse(localStorage.getItem(storageKey(currentYear, currentMonth, 'fixed')) || '{}');
}

function saveFixed(data) {
  localStorage.setItem(storageKey(currentYear, currentMonth, 'fixed'), JSON.stringify(data));
}

function fmt(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

// --- 日別入力タブ ---
function renderDaily() {
  const expenses = loadExpenses();
  const list = document.getElementById('daily-list');
  const totalEl = document.getElementById('daily-total');

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  totalEl.textContent = fmt(total);

  if (expenses.length === 0) {
    list.innerHTML = '<p class="empty-state">支出がまだありません</p>';
    return;
  }

  const grouped = {};
  expenses.forEach(e => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  list.innerHTML = sortedDates.map(date => {
    const d = new Date(date + 'T00:00:00');
    const dayNames = ['日','月','火','水','木','金','土'];
    const label = `${d.getMonth()+1}月${d.getDate()}日（${dayNames[d.getDay()]}）`;
    const dayTotal = grouped[date].reduce((s, e) => s + e.amount, 0);
    const items = grouped[date]
      .sort((a, b) => a.id - b.id)
      .map(e => `
        <div class="expense-item" data-id="${e.id}">
          <span class="expense-category">${e.category}</span>
          <span class="expense-memo">${e.memo || ''}</span>
          <span class="expense-amount">${fmt(e.amount)}</span>
          <button class="expense-delete" onclick="deleteExpense(${e.id})">×</button>
        </div>
      `).join('');
    return `
      <div class="day-group">
        <div class="day-group-header">${label}　合計 ${fmt(dayTotal)}</div>
        ${items}
      </div>
    `;
  }).join('');
}

function deleteExpense(id) {
  const expenses = loadExpenses().filter(e => e.id !== id);
  saveExpenses(expenses);
  renderDaily();
  renderSummary();
}

// --- モーダル ---
function openModal(expense = null) {
  editingId = expense ? expense.id : null;
  const today = new Date();
  const defaultDate = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  document.getElementById('modal-title').textContent = expense ? '支出を編集' : '支出を追加';
  document.getElementById('input-date').value = expense ? expense.date : defaultDate;
  document.getElementById('input-category').value = expense ? expense.category : '食費';
  document.getElementById('input-amount').value = expense ? expense.amount : '';
  document.getElementById('input-memo').value = expense ? expense.memo : '';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('input-amount').focus();
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  editingId = null;
}

function saveModal() {
  const date = document.getElementById('input-date').value;
  const category = document.getElementById('input-category').value;
  const amount = parseInt(document.getElementById('input-amount').value, 10);
  const memo = document.getElementById('input-memo').value.trim();

  if (!date || isNaN(amount) || amount <= 0) return;

  const expenses = loadExpenses();
  if (editingId !== null) {
    const idx = expenses.findIndex(e => e.id === editingId);
    if (idx >= 0) expenses[idx] = { id: editingId, date, category, amount, memo };
  } else {
    const id = Date.now();
    expenses.push({ id, date, category, amount, memo });
  }
  saveExpenses(expenses);
  closeModal();
  renderDaily();
  renderSummary();
}

// --- サマリータブ ---
function renderSummary() {
  const expenses = loadExpenses();
  const fixed = loadFixed();

  const income = INCOME_ITEMS.reduce((s, k) => s + (fixed['income_' + k] || 0), 0);
  const deductions = DEDUCTION_ITEMS.reduce((s, k) => s + (fixed['deduction_' + k] || 0), 0);
  const fixedTotal = FIXED_ITEMS.reduce((s, k) => s + (fixed['fixed_' + k] || 0), 0);
  const variable = expenses.reduce((s, e) => s + e.amount, 0);
  const balance = income - deductions - fixedTotal - variable;

  document.getElementById('summary-income').textContent = fmt(income);
  document.getElementById('summary-fixed').textContent = fmt(fixedTotal);
  document.getElementById('summary-variable').textContent = fmt(variable);
  const balEl = document.getElementById('summary-balance');
  balEl.textContent = fmt(balance);
  balEl.style.color = balance >= 0 ? '#2e7d32' : '#c62828';

  const catTotals = {};
  VARIABLE_CATEGORIES.forEach(c => catTotals[c] = 0);
  expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });

  document.getElementById('category-breakdown').innerHTML = VARIABLE_CATEGORIES
    .filter(c => catTotals[c] > 0)
    .map(c => `<tr><td>${c}</td><td>${fmt(catTotals[c])}</td></tr>`)
    .join('') || '<tr><td colspan="2" style="text-align:center;color:#aaa;padding:20px">データなし</td></tr>';
}

// --- 収入・固定費タブ ---
function renderFixedTab() {
  const fixed = loadFixed();

  document.getElementById('income-table').innerHTML = INCOME_ITEMS.map(k => `
    <tr>
      <td>${k}</td>
      <td><input type="number" min="0" data-key="income_${k}" value="${fixed['income_'+k] || ''}" placeholder="0"></td>
    </tr>
  `).join('');

  document.getElementById('deduction-table').innerHTML = DEDUCTION_ITEMS.map(k => `
    <tr>
      <td>${k}</td>
      <td><input type="number" min="0" data-key="deduction_${k}" value="${fixed['deduction_'+k] || ''}" placeholder="0"></td>
    </tr>
  `).join('');

  document.getElementById('fixed-table').innerHTML = FIXED_ITEMS.map(k => `
    <tr>
      <td>${k}</td>
      <td><input type="number" min="0" data-key="fixed_${k}" value="${fixed['fixed_'+k] || ''}" placeholder="0"></td>
    </tr>
  `).join('');
}

function saveFixedTab() {
  const data = {};
  document.querySelectorAll('.input-table input[data-key]').forEach(el => {
    const v = parseInt(el.value, 10);
    if (!isNaN(v) && v > 0) data[el.dataset.key] = v;
  });
  saveFixed(data);
  renderSummary();
  alert('保存しました');
}

// --- タブ切り替え ---
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
  if (name === 'summary') renderSummary();
  if (name === 'fixed') renderFixedTab();
}

// --- 月ナビ ---
function updateMonthLabel() {
  document.getElementById('current-month-label').textContent = `${currentYear}年${currentMonth}月`;
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  updateMonthLabel();
  renderDaily();
  renderSummary();
  renderFixedTab();
}

// --- 初期化 ---
function init() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;
  updateMonthLabel();

  document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('open-add-modal').addEventListener('click', () => openModal());
  document.getElementById('modal-save').addEventListener('click', saveModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.getElementById('save-fixed').addEventListener('click', saveFixedTab);

  document.getElementById('input-amount').addEventListener('keydown', e => { if (e.key === 'Enter') saveModal(); });

  renderDaily();
}

init();
