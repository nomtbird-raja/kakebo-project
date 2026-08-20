// 家族間でのデータ共有を行うFirestore同期レイヤー。
// app.jsのストレージ関数（saveExpense等）はそのままlocalStorageに書き込み続け、
// このファイルはその関数を差し替えて「保存の都度Firestoreにも書き込む」処理を足す。
// Firebase未設定（firebase-config.jsがプレースホルダのまま）の場合は何もせずローカルのみで動作する。

(function () {
  const config = window.FIREBASE_CONFIG;
  const isConfigured = config && config.apiKey && config.apiKey !== 'YOUR_API_KEY';

  if (!isConfigured) {
    window.startApp = function () { window.__appInit(); };
    // ローカルのみの動作では世帯の概念がないため、合言葉変更ボタンは隠す
    const switchBtn = document.getElementById('switch-household-btn');
    if (switchBtn) switchBtn.style.display = 'none';
    console.info('[kakebo] Firebase未設定のためローカルのみで動作します（firebase-config.jsを設定すると家族間で共有できます）');
    return;
  }

  // ===== 本番世帯（合言葉0000）の保護 =====
  // 家族の実データが入っている世帯では、デモ読み込み・データリセットを操作不可にする
  async function protectProductionHousehold() {
    const prodHid = await sha256Hex('0000');
    if (householdId !== prodHid) return;
    document.querySelectorAll('.demo-load, .demo-reset').forEach(btn => {
      if (btn.id === 'switch-household-btn') return;
      btn.disabled = true;
      btn.title = '本番データ保護のため、この合言葉では使えません';
    });
  }

  // ===== 合言葉の変更（別の世帯でログインし直す） =====
  window.switchHousehold = function () {
    const msg = '別の合言葉でログインし直します。\n'
      + 'この端末の表示データは切り替え先の世帯のものに入れ替わります\n'
      + '（今の世帯のデータはクラウドに残っており、同じ合言葉で戻れば復元されます）。\n\n'
      + '続けますか？';
    if (!confirm(msg)) return;
    localStorage.removeItem('kakebo_household_id');
    localStorage.removeItem('kakebo_pin_display');
    location.reload();
  };

  firebase.initializeApp(config);
  const auth = firebase.auth();
  const db = firebase.firestore();

  let householdId = localStorage.getItem('kakebo_household_id');

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function householdRef() {
    return db.collection('households').doc(householdId);
  }

  // ===== 合言葉（PIN）ゲート =====
  function showPinGate() {
    return new Promise(resolve => {
      const gate = document.getElementById('pin-gate');
      const input = document.getElementById('pin-input');
      const submit = document.getElementById('pin-submit');
      const errorEl = document.getElementById('pin-error');
      gate.classList.remove('hidden');
      // 全角数字は半角に自動変換し、数字以外は入力させない（IMEで００００と打っても0000になる）
      input.addEventListener('input', () => {
        const normalized = input.value
          .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
          .replace(/[^0-9]/g, '')
          .slice(0, 4);
        if (input.value !== normalized) input.value = normalized;
        errorEl.classList.add('hidden');
      });
      const onSubmit = async () => {
        const pin = input.value;
        if (!/^[0-9]{4}$/.test(pin)) {
          errorEl.classList.remove('hidden');
          return;
        }
        submit.disabled = true;
        householdId = await sha256Hex(pin);
        localStorage.setItem('kakebo_household_id', householdId);
        // ハッシュだけでは元の合言葉が分からないため、表示用に平文も別途保持しておく
        localStorage.setItem('kakebo_pin_display', pin);
        gate.classList.add('hidden');
        resolve();
      };
      submit.addEventListener('click', onSubmit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') onSubmit(); });
    });
  }

  // ===== 初期データの同期（新規世帯なら端末→クラウド、既存世帯ならクラウド→端末） =====
  async function pullFromFirestore() {
    const allExpenses = {};
    const expensesSnap = await householdRef().collection('expenses').get();
    expensesSnap.forEach(doc => { allExpenses[doc.id] = doc.data(); });
    localStorage.setItem('kakebo_expenses', JSON.stringify(allExpenses));

    const monthlySnap = await householdRef().collection('monthly').get();
    monthlySnap.forEach(doc => {
      const [y, m] = doc.id.split('-');
      const data = doc.data();
      if (data.fixed) localStorage.setItem(`kakebo_${y}_${m}_fixed`, JSON.stringify(data.fixed));
      if (data.special) localStorage.setItem(`kakebo_${y}_${m}_special`, JSON.stringify(data.special));
      if (data.extraIncome) localStorage.setItem(`kakebo_${y}_${m}_extra_income`, JSON.stringify(data.extraIncome));
    });
  }

  async function pushToFirestore() {
    const batch = db.batch();
    const allExpenses = JSON.parse(localStorage.getItem('kakebo_expenses') || '{}');
    Object.values(allExpenses).forEach(exp => {
      batch.set(householdRef().collection('expenses').doc(exp.id), exp);
    });
    Object.keys(localStorage).forEach(k => {
      const match = k.match(/^kakebo_(\d{4})_(\d{2})_(fixed|special|extra_income)$/);
      if (!match) return;
      const [, y, m, type] = match;
      const field = type === 'fixed' ? 'fixed' : type === 'special' ? 'special' : 'extraIncome';
      batch.set(householdRef().collection('monthly').doc(`${y}-${m}`), { [field]: JSON.parse(localStorage.getItem(k)) }, { merge: true });
    });
    await batch.commit();
  }

  // ===== リアルタイム同期（他端末の変更を反映） =====
  function setupRealtimeListeners() {
    householdRef().collection('expenses').onSnapshot(snap => {
      const allExpenses = JSON.parse(localStorage.getItem('kakebo_expenses') || '{}');
      let changed = false;
      snap.docChanges().forEach(change => {
        changed = true;
        if (change.type === 'removed') delete allExpenses[change.doc.id];
        else allExpenses[change.doc.id] = change.doc.data();
      });
      if (changed) {
        localStorage.setItem('kakebo_expenses', JSON.stringify(allExpenses));
        if (window.refreshCurrentView) window.refreshCurrentView();
      }
    });

    householdRef().collection('monthly').onSnapshot(snap => {
      let changed = false;
      snap.docChanges().forEach(change => {
        changed = true;
        const [y, m] = change.doc.id.split('-');
        const data = change.type === 'removed' ? {} : change.doc.data();
        if (data.fixed) localStorage.setItem(`kakebo_${y}_${m}_fixed`, JSON.stringify(data.fixed));
        if (data.special) localStorage.setItem(`kakebo_${y}_${m}_special`, JSON.stringify(data.special));
        if (data.extraIncome) localStorage.setItem(`kakebo_${y}_${m}_extra_income`, JSON.stringify(data.extraIncome));
      });
      if (changed && window.refreshCurrentView) window.refreshCurrentView();
    });
  }

  // ===== 保存関数を差し替えて、ローカル保存の都度Firestoreにも書き込む =====
  function wrapStorageFunctions() {
    const origSaveExpense = window.saveExpense;
    window.saveExpense = function (expense) {
      origSaveExpense(expense);
      householdRef().collection('expenses').doc(expense.id).set(expense).catch(console.error);
    };

    const origDeleteExpenseById = window.deleteExpenseById;
    window.deleteExpenseById = function (id) {
      origDeleteExpenseById(id);
      householdRef().collection('expenses').doc(id).delete().catch(console.error);
    };

    ['saveFixed', 'saveSpecial', 'saveExtraIncome'].forEach(fnName => {
      const field = fnName === 'saveFixed' ? 'fixed' : fnName === 'saveSpecial' ? 'special' : 'extraIncome';
      const orig = window[fnName];
      window[fnName] = function (data) {
        orig(data);
        const docId = `${window.currentYear}-${String(window.currentMonth).padStart(2, '0')}`;
        householdRef().collection('monthly').doc(docId).set({ [field]: data }, { merge: true }).catch(console.error);
      };
    });
  }

  // ローカルデータがどの世帯のものかを記録し、別の合言葉に切り替えた場合は
  // ローカルを一旦クリアする。これをしないと、前の世帯のデータが初回同期
  // （クラウドが空ならローカルをアップロード）で新しい世帯にコピーされてしまう。
  function clearLocalIfHouseholdChanged() {
    const marker = localStorage.getItem('kakebo_data_household');
    if (marker && marker !== householdId) {
      const keep = new Set(['kakebo_household_id', 'kakebo_data_household', 'kakebo_pin_display']);
      Object.keys(localStorage)
        .filter(k => k.startsWith('kakebo_') && !keep.has(k))
        .forEach(k => localStorage.removeItem(k));
    }
    localStorage.setItem('kakebo_data_household', householdId);
  }

  // メニュー最下部に、今ログイン中の合言葉を薄く表示する
  function showCurrentPin() {
    const el = document.getElementById('current-pin-display');
    if (!el) return;
    const pin = localStorage.getItem('kakebo_pin_display');
    if (pin) {
      el.textContent = pin;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  window.startApp = async function () {
    try {
      if (!householdId) await showPinGate();
      showCurrentPin();
      await protectProductionHousehold();
      await auth.signInAnonymously();

      clearLocalIfHouseholdChanged();

      const existingSnap = await householdRef().collection('expenses').limit(1).get();
      const existingMonthly = await householdRef().collection('monthly').limit(1).get();
      if (!existingSnap.empty || !existingMonthly.empty) {
        await pullFromFirestore();
      } else {
        await pushToFirestore();
      }

      wrapStorageFunctions();
      setupRealtimeListeners();
    } catch (err) {
      console.error('[kakebo] Firebase同期の初期化に失敗しました。ローカルのみで動作します。', err);
    }
    window.__appInit();
  };
})();
