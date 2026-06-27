// ダミーデータ投入スクリプト
// ブラウザのコンソールで loadDummy() を実行してください

function loadDummy() {
  // 既存データをすべてクリア
  Object.keys(localStorage).filter(k => k.startsWith('kakebo_')).forEach(k => localStorage.removeItem(k));

  // ===== 月別固定データ（収入・固定費） =====
  const months = [
    { y: 2026, m: 1,  income: { 夫: 320000, 妻パート: 80000, 児童手当: 20000 }, fixed: { 住居費: 95000, 電気: 8500, ガス: 4200, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 2,  income: { 夫: 320000, 妻パート: 80000, 児童手当: 20000 }, fixed: { 住居費: 95000, 電気: 9200, ガス: 5100, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 3,  income: { 夫: 320000, 妻パート: 80000, 児童手当: 20000 }, fixed: { 住居費: 95000, 電気: 7800, ガス: 3800, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 4,  income: { 夫: 320000, 妻パート: 80000, 児童手当: 20000 }, fixed: { 住居費: 95000, 電気: 6500, ガス: 2900, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 5,  income: { 夫: 320000, 妻パート: 80000, 児童手当: 20000 }, fixed: { 住居費: 95000, 電気: 6200, ガス: 2500, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 6,  income: { 夫: 320000, 妻パート: 80000, 児童手当: 20000, ボーナス: 200000 }, fixed: { 住居費: 95000, 電気: 7100, ガス: 2200, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
    { y: 2026, m: 7,  income: { 夫: 320000, 妻パート: 80000, 児童手当: 20000 }, fixed: { 住居費: 95000, 水道: 3000, 教育費: 15000, 通信費: 8000, 保険: 12000 } },
  ];

  // ===== 変動費テンプレート =====
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

  months.forEach(({ y, m, income, fixed }) => {
    // 固定費・収入
    const fixedData = {};
    Object.entries(income).forEach(([k, v]) => { fixedData[`income_${k}`] = v; });
    Object.entries(fixed).forEach(([k, v]) => { fixedData[`fixed_${k}`] = v; });
    localStorage.setItem(`kakebo_${y}_${String(m).padStart(2,'0')}_fixed`, JSON.stringify(fixedData));

    // 変動費（7月は1〜14日のみ）
    const daysInMonth = m === 7 ? 14 : new Date(y, m, 0).getDate();
    const expenses = [];
    expenseTemplates.forEach(tmpl => {
      tmpl.items.forEach(([memo, baseAmt]) => {
        const day = Math.floor(Math.random() * daysInMonth) + 1;
        const date = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const amount = baseAmt + Math.floor((Math.random() - 0.5) * baseAmt * 0.2);
        expenses.push({ id: Date.now() + Math.random(), date, category: tmpl.category, amount, memo });
      });
    });
    localStorage.setItem(`kakebo_${y}_${String(m).padStart(2,'0')}_expenses`, JSON.stringify(expenses));
  });

  // ===== 特別支出（新形式：グループ + 費目リスト） =====
  // 6月：山梨旅行
  const special06 = [
    {
      id: 1000001,
      name: '山梨旅行',
      category: '旅行',
      items: [
        { id: 1000101, subCategory: '交通費', memo: '高速代', amount: 8000 },
        { id: 1000102, subCategory: '宿泊費', memo: 'ホテル',  amount: 25000 },
        { id: 1000103, subCategory: '外食費', memo: '夕食',    amount: 12000 },
        { id: 1000104, subCategory: 'おみやげ', memo: '',      amount: 5000 },
      ]
    }
  ];
  localStorage.setItem('kakebo_2026_06_special', JSON.stringify(special06));

  // 4月：自動車税
  const special04 = [
    {
      id: 1000002,
      name: '自動車税',
      category: '税金',
      items: [
        { id: 1000201, subCategory: '自動車税', memo: '', amount: 39500 },
      ]
    }
  ];
  localStorage.setItem('kakebo_2026_04_special', JSON.stringify(special04));

  // ===== その他収入 =====
  // 6月：ボーナスは固定収入として保存済みのため不要。3月：児童手当は固定収入として保存済み。
  // その他追加分（不定期な臨時収入の例）
  const extraIncome05 = [
    { id: 2000001, memo: 'フリマ売上', amount: 8500 }
  ];
  localStorage.setItem('kakebo_2026_05_extra_income', JSON.stringify(extraIncome05));

  alert('ダミーデータを投入しました！ページをリロードしてください。');
}

loadDummy();
