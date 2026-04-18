<template>
  <div class="container dashboard">
    <h1>Budget Dashboard</h1>

    <!-- Balances -->
    <div class="balances">
      <div class="card balance-card">
        <h3>Total Income</h3>
        <p class="balance">${{ fmt(totalAll) }}</p>
        <form class="card-form" @submit.prevent="handleIncome">
          <input v-model="incomeAmt" type="number" step="0.01" min="0.01" placeholder="Amount" required />
          <input v-model="incomeDesc" type="text" placeholder="Description (optional)" />
          <button type="submit">Add Income</button>
        </form>
      </div>

      <div class="card balance-card">
        <h3>Spend Savings</h3>
        <p class="balance">${{ fmt(budget?.spendSavings) }}</p>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: spendPct + '%', background: '#4fc3f7' }"></div>
          <span class="progress-label">${{ fmt(budget?.spendSavings) }} / $1,000</span>
        </div>
        <p class="mode-tag" :class="isFlipped ? 'flipped' : 'normal'">
          {{ isFlipped ? '1/3 of income (flipped)' : '2/3 of income' }}
        </p>
        <form class="card-form" @submit.prevent="handleSetSpend">
          <input v-model="existSpend" type="number" step="0.01" min="0" max="1000" placeholder="Set amount" />
          <button type="submit">Set</button>
        </form>
      </div>

      <div class="card balance-card">
        <h3>Savings Savings</h3>
        <p class="balance">${{ fmt(budget?.savingsSavings) }}</p>
        <p class="mode-tag" :class="isFlipped ? 'normal' : ''">
          {{ isFlipped ? '2/3 of income (flipped)' : '1/3 of income' }}
        </p>
        <form class="card-form" @submit.prevent="handleSetSave">
          <input v-model="existSave" type="number" step="0.01" min="0" placeholder="Set amount" />
          <button type="submit">Set</button>
        </form>
      </div>

      <div class="card balance-card">
        <h3>Checking Account</h3>
        <p class="balance">${{ fmt(budget?.checking) }}</p>
        <form class="card-form" @submit.prevent="handleSetChecking">
          <input v-model="existChecking" type="number" step="0.01" min="0" placeholder="Set amount" />
          <button type="submit">Set</button>
        </form>
      </div>

      <div class="card balance-card">
        <h3>Everyday Pool</h3>
        <p class="balance">${{ fmt(budget?.everydayPool) }}</p>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: poolPct + '%', background: poolColor }"></div>
          <span class="progress-label">${{ fmt(budget?.everydayPool) }} / $200</span>
        </div>
        <p class="sub-text">Resets {{ resetDate }}</p>
        <form class="card-form" @submit.prevent="handlePoolDeduct">
          <input v-model="poolDeduct" type="number" step="0.01" min="0.01" placeholder="Amount to deduct" required />
          <button type="submit">Deduct</button>
        </form>
      </div>
    </div>

    <!-- Record Purchase -->
    <div class="card action-card purchase-card">
      <h3>Record Purchase</h3>
      <form @submit.prevent="handleSpend">
        <input v-model="spendAmt" type="number" step="0.01" min="0.01" placeholder="Base cost" required />
        <input v-model="spendFees" type="number" step="0.01" min="0" placeholder="Fees / tax" />
        <input v-model="spendDesc" type="text" placeholder="Description (optional)" />
        <div class="source-toggle">
          <label :class="{ active: spendSource === 'pool' }">
            <input type="radio" v-model="spendSource" value="pool" /> Everyday Pool
          </label>
          <label :class="{ active: spendSource === 'spend' }">
            <input type="radio" v-model="spendSource" value="spend" /> Spend Savings
          </label>
          <label :class="{ active: spendSource === 'checking' }">
            <input type="radio" v-model="spendSource" value="checking" /> Checking
          </label>
        </div>
        <button type="submit">Record Purchase</button>
      </form>
    </div>

    <!-- Stats row -->
    <div class="stats-row">
      <div class="card stat">
        <span class="stat-label">Total Income</span>
        <span class="stat-value">${{ fmt(budget?.totalIncome) }}</span>
      </div>
      <div class="card stat">
        <span class="stat-label">Total Spent</span>
        <span class="stat-value">${{ fmt(budget?.totalSpent) }}</span>
      </div>
      <div class="card stat">
        <span class="stat-label">Total Fees</span>
        <span class="stat-value">${{ fmt(budget?.totalFees) }}</span>
      </div>
    </div>

    <!-- Statement Balances -->
    <div v-if="statementHistory.length">
      <h2 class="section-title">Statement Overview</h2>
      <div class="balances">
        <div class="card balance-card stmt-card">
          <h3>Statement Checking</h3>
          <p class="balance" :class="stmtChecking >= 0 ? '' : 'negative'">${{ fmt(stmtChecking) }}</p>
          <p class="sub-text">Deposits - Spending from statements</p>
        </div>
        <div class="card balance-card stmt-card">
          <h3>Statement Deposits</h3>
          <p class="balance green">${{ fmt(statementDeposits) }}</p>
          <p class="sub-text">{{ stmtDepositCount }} deposits</p>
        </div>
        <div class="card balance-card stmt-card">
          <h3>Statement Spending</h3>
          <p class="balance red">${{ fmt(statementSpending) }}</p>
          <p class="sub-text">{{ stmtSpendCount }} transactions</p>
        </div>
      </div>

      <div class="stats-row">
        <div class="card stat statement-stat">
          <span class="stat-label">Stmt Transfers In</span>
          <span class="stat-value green">${{ fmt(stmtByType('Transfer', true)) }}</span>
        </div>
        <div class="card stat statement-stat">
          <span class="stat-label">Stmt Purchases</span>
          <span class="stat-value red">${{ fmt(stmtByType('Purchase', false)) }}</span>
        </div>
        <div class="card stat statement-stat">
          <span class="stat-label">Stmt Direct Debits</span>
          <span class="stat-value red">${{ fmt(stmtByType('Direct Debit', false)) }}</span>
        </div>
        <div class="card stat statement-stat">
          <span class="stat-label">Stmt Net</span>
          <span class="stat-value" :class="statementNet >= 0 ? 'green' : 'red'">${{ fmt(statementNet) }}</span>
        </div>
      </div>
    </div>

    <!-- Statement Upload -->
    <div class="card statement-card">
      <h3>Import Chime Statement</h3>
      <div class="upload-area">
        <label class="upload-btn">
          {{ statementUploading ? 'Parsing...' : 'Upload PDF Statements' }}
          <input type="file" accept=".pdf" multiple @change="handleStatementUpload" :disabled="statementUploading" hidden />
        </label>
      </div>

      <div v-if="parsedStatements.length" class="parsed-preview">
        <p class="parsed-count">{{ parsedStatements.length }} transactions found</p>
        <div class="parsed-list">
          <div v-for="(txn, i) in parsedStatements" :key="i" class="parsed-item" :class="txn.amount > 0 ? 'credit' : 'debit'">
            <div class="parsed-left">
              <span class="parsed-sign">{{ txn.amount > 0 ? '+' : '-' }}</span>
              <div>
                <input class="parsed-desc-input" v-model="txn.description" type="text" />
                <p class="parsed-date">{{ new Date(txn.date).toLocaleDateString() }} &middot; {{ txn.type }}</p>
              </div>
            </div>
            <div class="parsed-right">
              <p class="parsed-amount">${{ Math.abs(txn.amount).toFixed(2) }}</p>
              <button class="remove-btn" @click="removeFromParsed(i)">Skip</button>
            </div>
          </div>
        </div>
        <div class="import-actions">
          <button @click="handleImport">Import All ({{ parsedStatements.length }})</button>
          <button class="btn-secondary" @click="parsedStatements = []">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Error -->
    <p v-if="budgetError" class="error-msg">{{ budgetError }}</p>

    <!-- History Columns -->
    <div class="history-columns">
      <!-- Manual Transactions -->
      <div class="card history-card">
        <div class="history-header">
          <h3>Budget Transactions</h3>
          <div v-if="manualHistory.length">
            <button v-if="!showClearBudget" class="clear-btn" @click="showClearBudget = true">Clear Budget</button>
            <span v-else class="clear-confirm">
              Are you sure?
              <button class="clear-btn confirm" @click="clearBudget(); showClearBudget = false">Yes, clear budget</button>
              <button class="clear-btn cancel" @click="showClearBudget = false">Cancel</button>
            </span>
          </div>
        </div>
        <div v-if="!manualHistory.length" class="empty">No budget transactions yet</div>
        <div v-else class="history-list">
          <div v-for="h in manualHistory" :key="h._id" class="history-item" :class="h.type">
            <div class="history-left">
              <span class="history-type">{{ h.type === 'income' ? '+' : '-' }}</span>
              <div>
                <p class="history-desc">{{ h.description }}</p>
                <p class="history-date">{{ new Date(h.date).toLocaleDateString() }}</p>
              </div>
            </div>
            <div class="history-right">
              <p class="history-amount">${{ fmt(h.amount) }}</p>
              <p v-if="h.type === 'income'" class="history-split">
                Spend: ${{ fmt(h.toSpendSavings) }} | Save: ${{ fmt(h.toSavingsSavings) }}
              </p>
              <p v-if="h.type === 'spend'" class="history-source">From: {{ h.source === 'spend' ? 'Spend Savings' : h.source === 'checking' ? 'Checking' : 'Everyday Pool' }}</p>
              <p v-if="h.fees" class="history-fees">Fees: ${{ fmt(h.fees) }}</p>
              <button class="remove-btn" @click="handleRemove(h._id)">Remove</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Statement Transactions -->
      <div class="card history-card">
        <div class="history-header">
          <h3>Statement History</h3>
          <div v-if="statementHistory.length">
            <button v-if="!showClearStatements" class="clear-btn" @click="showClearStatements = true">Clear Statements</button>
            <span v-else class="clear-confirm">
              Are you sure?
              <button class="clear-btn confirm" @click="clearStatements(); showClearStatements = false">Yes, clear statements</button>
              <button class="clear-btn cancel" @click="showClearStatements = false">Cancel</button>
            </span>
          </div>
        </div>
        <div v-if="!statementHistory.length" class="empty">No statement imports yet</div>
        <template v-else>
          <div v-for="year in statementYears" :key="year.year" class="year-section">
            <div class="year-header" @click="toggleYear(year.year)">
              <span class="year-arrow">{{ openYears[year.year] ? '▼' : '▶' }}</span>
              <span class="year-label">{{ year.year }}</span>
              <span class="year-summary">
                <span class="green">+${{ fmt(year.deposits) }}</span>
                <span class="red">-${{ fmt(year.spending) }}</span>
                <span :class="year.net >= 0 ? 'green' : 'red'">Net: ${{ fmt(year.net) }}</span>
              </span>
              <span class="month-count">{{ year.count }} transactions</span>
            </div>
            <div v-if="openYears[year.year]">
              <div v-for="month in year.months" :key="month.key" class="month-group">
                <div class="month-header" @click="toggleMonth(month.key)">
                  <span class="month-arrow">{{ openMonths[month.key] ? '▼' : '▶' }}</span>
                  <span class="month-name">{{ month.label }}</span>
                  <span class="month-summary">
                    <span class="green">+${{ fmt(month.deposits) }}</span>
                    <span class="red">-${{ fmt(month.spending) }}</span>
                    <span :class="month.net >= 0 ? 'green' : 'red'">Net: ${{ fmt(month.net) }}</span>
                  </span>
                  <span class="month-count">{{ month.items.length }}</span>
                </div>
                <div v-if="openMonths[month.key]" class="history-list">
                  <div v-for="h in month.items" :key="h._id" class="history-item" :class="h.type">
                    <div class="history-left">
                      <span class="history-type">{{ h.type === 'income' ? '+' : '-' }}</span>
                      <div>
                        <p class="history-desc">{{ h.description }}</p>
                        <p class="history-date">{{ new Date(h.date).toLocaleDateString() }}</p>
                      </div>
                    </div>
                    <div class="history-right">
                      <p class="history-amount">${{ fmt(h.amount) }}</p>
                      <button class="remove-btn" @click="handleRemove(h._id)">Remove</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useBudget } from '@/composables/useBudget.js';

const { budget, budgetError, getBudget, addIncome, recordSpend, removeEntry, setExistingSavings, uploadStatement, importTransactions, clearBudget, clearStatements } = useBudget();

const incomeAmt = ref('');
const incomeDesc = ref('');
const spendAmt = ref('');
const spendFees = ref('');
const spendDesc = ref('');
const spendSource = ref('pool');
const existSpend = ref('');
const existSave = ref('');
const existChecking = ref('');
const poolDeduct = ref('');
const showClearBudget = ref(false);
const showClearStatements = ref(false);
const openMonths = reactive({});
const openYears = reactive({});
const parsedStatements = ref([]);
const statementUploading = ref(false);

const fmt = (n) => (n ?? 0).toFixed(2);

const totalAll = computed(() =>
  (budget.value?.checking ?? 0) +
  (budget.value?.spendSavings ?? 0) +
  (budget.value?.savingsSavings ?? 0) +
  (budget.value?.everydayPool ?? 0)
);

const isFlipped = computed(() => (budget.value?.spendSavings ?? 0) >= 1000);
const spendPct = computed(() => Math.min(((budget.value?.spendSavings ?? 0) / 1000) * 100, 100));
const poolPct = computed(() => ((budget.value?.everydayPool ?? 0) / 200) * 100);
const poolColor = computed(() => {
  const pct = poolPct.value;
  if (pct > 50) return '#66bb6a';
  if (pct > 20) return '#ffa726';
  return '#ef5350';
});

const resetDate = computed(() => {
  if (!budget.value?.everydayPoolResetDate) return '';
  return new Date(budget.value.everydayPoolResetDate).toLocaleDateString();
});

const sortedHistory = computed(() =>
  [...(budget.value?.history || [])].sort((a, b) => new Date(b.date) - new Date(a.date))
);

const statementHistory = computed(() =>
  sortedHistory.value.filter(h => h.source === 'checking')
);

const manualHistory = computed(() =>
  sortedHistory.value.filter(h => h.source !== 'checking')
);

const statementDeposits = computed(() =>
  statementHistory.value.filter(h => h.type === 'income').reduce((sum, h) => sum + h.amount, 0)
);

const statementSpending = computed(() =>
  statementHistory.value.filter(h => h.type === 'spend').reduce((sum, h) => sum + h.amount, 0)
);

const statementNet = computed(() => statementDeposits.value - statementSpending.value);

const stmtChecking = computed(() => statementNet.value);

const stmtDepositCount = computed(() =>
  statementHistory.value.filter(h => h.type === 'income').length
);

const stmtSpendCount = computed(() =>
  statementHistory.value.filter(h => h.type === 'spend').length
);

const statementMonths = computed(() => {
  const months = {};
  for (const h of statementHistory.value) {
    const d = new Date(h.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!months[key]) months[key] = { key, items: [], deposits: 0, spending: 0 };
    months[key].items.push(h);
    if (h.type === 'income') months[key].deposits += h.amount;
    else months[key].spending += h.amount;
  }
  return Object.values(months)
    .map(m => ({
      ...m,
      net: m.deposits - m.spending,
      label: new Date(m.items[0].date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      items: m.items.sort((a, b) => new Date(b.date) - new Date(a.date))
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
});

const statementYears = computed(() => {
  const years = {};
  for (const month of statementMonths.value) {
    const year = month.key.split('-')[0];
    if (!years[year]) years[year] = { year, months: [], deposits: 0, spending: 0, count: 0 };
    years[year].months.push(month);
    years[year].deposits += month.deposits;
    years[year].spending += month.spending;
    years[year].count += month.items.length;
  }
  return Object.values(years)
    .map(y => ({ ...y, net: y.deposits - y.spending }))
    .sort((a, b) => b.year.localeCompare(a.year));
});

const toggleMonth = (key) => {
  openMonths[key] = !openMonths[key];
};

const toggleYear = (year) => {
  openYears[year] = !openYears[year];
};

const stmtByType = (txnType, isCredit) => {
  return statementHistory.value
    .filter(h => {
      const matchType = (h.statementType || '').toLowerCase() === txnType.toLowerCase();
      const matchCredit = isCredit ? h.type === 'income' : h.type === 'spend';
      return matchType && matchCredit;
    })
    .reduce((sum, h) => sum + h.amount, 0);
};


const handleIncome = async () => {
  await addIncome(incomeAmt.value, incomeDesc.value);
  incomeAmt.value = '';
  incomeDesc.value = '';
};

const handleSpend = async () => {
  await recordSpend(spendAmt.value, spendDesc.value, spendFees.value || 0, spendSource.value);
  spendAmt.value = '';
  spendFees.value = '';
  spendDesc.value = '';
  spendSource.value = 'pool';
};

const handleSetSpend = async () => {
  await setExistingSavings(existSpend.value, null, null);
  existSpend.value = '';
};

const handleSetSave = async () => {
  await setExistingSavings(null, existSave.value, null);
  existSave.value = '';
};

const handleSetChecking = async () => {
  await setExistingSavings(null, null, existChecking.value);
  existChecking.value = '';
};

const handleRemove = async (entryId) => {
  await removeEntry(entryId);
};

const handlePoolDeduct = async () => {
  const val = parseFloat(poolDeduct.value);
  if (!val || val <= 0) return;
  await recordSpend(val, 'Pool deduction', 0);
  poolDeduct.value = '';
};

const handleStatementUpload = async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  statementUploading.value = true;
  try {
    const results = await Promise.all(files.map(f => uploadStatement(f)));
    const all = results.flatMap(r => r.transactions);
    // Sort by date descending
    all.sort((a, b) => new Date(b.date) - new Date(a.date));
    parsedStatements.value = all;
  } catch { /* error shown via ref */ }
  finally { statementUploading.value = false; e.target.value = ''; }
};

const handleImport = async () => {
  await importTransactions(parsedStatements.value);
  parsedStatements.value = [];
};

const removeFromParsed = (index) => {
  parsedStatements.value.splice(index, 1);
};

onMounted(getBudget);
</script>

<style scoped lang="scss">
.dashboard {
  h1 { margin-bottom: 20px; font-size: 1.6rem; }
}

.balances {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.balance-card {
  h3 { font-size: 0.9rem; color: #888; margin-bottom: 4px; }
  .balance { font-size: 1.8rem; font-weight: 700; margin-bottom: 10px; }
  .progress-bar { margin-bottom: 8px; }
  .mode-tag {
    font-size: 0.8rem;
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-block;
    background: #1e3a4a;
    color: #4fc3f7;
    &.flipped { background: #3a2e1e; color: #ffa726; }
  }
  .sub-text { font-size: 0.8rem; color: #666; }
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat {
  text-align: center;
  padding: 14px;
  .stat-label { display: block; font-size: 0.8rem; color: #888; margin-bottom: 4px; }
  .stat-value { font-size: 1.3rem; font-weight: 700; }
}


.card-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #2a2a2a;

  input { font-size: 0.85rem; padding: 8px 10px; }
  button { font-size: 0.8rem; padding: 8px 12px; }
}

.purchase-card {
  margin-bottom: 16px;
  h3 { margin-bottom: 12px; font-size: 1rem; }
  form { display: flex; flex-direction: column; gap: 10px; }
}

.action-card {
  h3 { margin-bottom: 12px; font-size: 1rem; }
  form { display: flex; flex-direction: column; gap: 10px; }
}

.error-msg { color: #ef5350; text-align: center; margin-bottom: 12px; }

.section-title {
  font-size: 1.2rem;
  margin: 20px 0 12px;
  color: #aaa;
  border-bottom: 1px solid #2a2a2a;
  padding-bottom: 8px;
}

.stmt-card {
  border-color: #2a3a2a;
  .green { color: #66bb6a; }
  .red { color: #ef5350; }
  .negative { color: #ef5350; }
}

.statement-stat {
  border: 1px solid #2a3a2a;
  .green { color: #66bb6a; }
  .red { color: #ef5350; }
}

.history-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 900px) {
  .history-columns { grid-template-columns: 1fr; }
}

.history-card {
  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .clear-btn {
    padding: 4px 12px;
    font-size: 0.75rem;
    background: #333;
    color: #ef5350;
    border: 1px solid #ef5350;
    &:hover { background: #ef5350; color: #fff; }
    &.confirm { background: #ef5350; color: #fff; }
    &.cancel { color: #888; border-color: #555; &:hover { background: #444; color: #fff; } }
  }
  .clear-confirm {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: #ef5350;
  }
  .empty { color: #555; text-align: center; padding: 20px; }
}

.year-section {
  margin-bottom: 12px;
}

.year-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  margin-bottom: 8px;
  transition: background 0.2s;
  &:hover { background: #222; }

  .year-arrow {
    font-size: 0.75rem;
    width: 14px;
    color: #888;
  }
  .year-label {
    font-weight: 700;
    font-size: 1.1rem;
    flex: 1;
    color: #4fc3f7;
  }
  .year-summary {
    display: flex;
    gap: 14px;
    font-size: 0.8rem;
    font-weight: 600;
    .green { color: #66bb6a; }
    .red { color: #ef5350; }
  }
}

.month-group {
  margin-bottom: 8px;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}

.month-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #151515;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
  &:hover { background: #1e1e1e; }

  .month-arrow {
    font-size: 0.7rem;
    width: 14px;
    color: #666;
  }
  .month-name {
    font-weight: 600;
    font-size: 0.95rem;
    flex: 1;
  }
  .month-summary {
    display: flex;
    gap: 12px;
    font-size: 0.75rem;
    .green { color: #66bb6a; }
    .red { color: #ef5350; }
  }
  .month-count {
    background: #2a2a2a;
    color: #888;
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 10px;
  }
}

.month-group > .history-list {
  padding: 8px;
  background: #0f0f0f;
}

.history-list { display: flex; flex-direction: column; gap: 8px; }

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #111;
  border-radius: 8px;
  border-left: 3px solid;

  &.income { border-color: #66bb6a; }
  &.spend { border-color: #ef5350; }
}

.history-left {
  display: flex;
  align-items: center;
  gap: 10px;

  .history-type {
    font-size: 1.2rem;
    font-weight: 700;
    width: 24px;
    text-align: center;
  }
  .history-desc { font-size: 0.95rem; }
  .history-date { font-size: 0.75rem; color: #666; }
}

.history-right {
  text-align: right;
  .history-amount { font-weight: 700; font-size: 1rem; }
  .history-split, .history-fees, .history-source { font-size: 0.75rem; color: #888; }
  .remove-btn {
    margin-top: 4px;
    padding: 3px 10px;
    font-size: 0.7rem;
    background: #333;
    color: #ef5350;
    border: 1px solid #ef5350;
    &:hover { background: #ef5350; color: #fff; }
  }
}

.statement-card {
  h3 { margin-bottom: 12px; }
}

.upload-area {
  margin-bottom: 12px;
}

.upload-btn {
  display: inline-block;
  background: #4fc3f7;
  color: #000;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  transition: background 0.2s;
  &:hover { background: #39a8db; }
}

.parsed-preview {
  .parsed-count { font-size: 0.9rem; color: #888; margin-bottom: 10px; }
}

.parsed-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.parsed-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #111;
  border-radius: 8px;
  border-left: 3px solid;
  &.credit { border-color: #66bb6a; }
  &.debit { border-color: #ef5350; }
}

.parsed-left {
  display: flex;
  align-items: center;
  gap: 8px;
  .parsed-sign { font-weight: 700; font-size: 1.1rem; width: 20px; text-align: center; }
  .parsed-desc-input {
    font-size: 0.85rem;
    background: #1a1a1a;
    border: 1px solid #333;
    color: #e0e0e0;
    padding: 3px 6px;
    border-radius: 4px;
    width: 220px;
    &:focus { border-color: #4fc3f7; }
  }
  .parsed-date { font-size: 0.7rem; color: #666; }
}

.parsed-right {
  text-align: right;
  display: flex;
  align-items: center;
  gap: 10px;
  .parsed-amount { font-weight: 700; }
}

.import-actions {
  display: flex;
  gap: 10px;
  .btn-secondary {
    background: #333;
    color: #e0e0e0;
    &:hover { background: #444; }
  }
}

.source-toggle {
  display: flex;
  gap: 12px;

  label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85rem;
    color: #888;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid #333;
    transition: all 0.2s;

    input[type="radio"] { display: none; }
    &.active { border-color: #4fc3f7; color: #4fc3f7; background: #1e3a4a; }
  }
}

@media (max-width: 600px) {
  .stats-row { grid-template-columns: 1fr; }
}
</style>
