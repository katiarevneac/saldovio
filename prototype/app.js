const transactions = [
  { date: "2026-09-01", category: "Salary", amount: 450000, type: "income" },
  { date: "2026-09-02", category: "Rent", amount: -180000, type: "expense" },
  { date: "2026-09-04", category: "Groceries", amount: -32050, type: "expense" },
  { date: "2026-09-05", category: "Subscription", amount: -4999, type: "expense" },
  { date: "2026-09-06", category: "Freelance", amount: 60000, type: "income" },
];

function formatAmount(bani) {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
  }).format(bani / 100);
}

function renderTransactions() {
  const tbody = document.getElementById("transactions-body");

  for (const t of transactions) {
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent = t.date;

    const categoryCell = document.createElement("td");
    categoryCell.textContent = t.category;

    const amountCell = document.createElement("td");
    amountCell.textContent = formatAmount(t.amount);
    amountCell.classList.add(t.type);

    row.appendChild(dateCell);
    row.appendChild(categoryCell);
    row.appendChild(amountCell);

    tbody.appendChild(row);
  }
}

function renderBalance() {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  document.getElementById("balance").textContent = formatAmount(total);
}

renderTransactions();
renderBalance();
