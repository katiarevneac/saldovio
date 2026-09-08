const API_BASE_URL = "http://localhost:3000";

let transactions = [];

// The API returns amounts as exact decimal strings (Postgres numeric,
// e.g. "-75.20") — never run those through parseFloat and then sum
// with +, that reintroduces the float rounding error we avoided in
// Sprint 1. Convert to integer bani using string parsing instead, so
// arithmetic (reduce, below) stays exact.
function toBani(decimalString) {
  const [wholePart, fractionPart = ""] = decimalString.split(".");
  const paddedFraction = (fractionPart + "00").slice(0, 2);
  const sign = wholePart.startsWith("-") ? -1 : 1;
  const wholeDigits = wholePart.replace("-", "");
  return sign * (Number(wholeDigits) * 100 + Number(paddedFraction));
}

function formatAmount(bani) {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
  }).format(bani / 100);
}

function renderTransactions() {
  const tbody = document.getElementById("transactions-body");
  tbody.innerHTML = "";

  for (const t of transactions) {
    const row = document.createElement("tr");
    const bani = toBani(t.amount);

    const dateCell = document.createElement("td");
    dateCell.textContent = t.occurred_on;

    const categoryCell = document.createElement("td");
    categoryCell.textContent = t.category ?? "";

    const amountCell = document.createElement("td");
    amountCell.textContent = formatAmount(bani);
    amountCell.classList.add(bani < 0 ? "expense" : "income");

    row.appendChild(dateCell);
    row.appendChild(categoryCell);
    row.appendChild(amountCell);

    tbody.appendChild(row);
  }
}

function renderBalance() {
  const totalBani = transactions.reduce((sum, t) => sum + toBani(t.amount), 0);
  document.getElementById("balance").textContent = formatAmount(totalBani);
}

async function loadTransactions() {
  const response = await fetch(`${API_BASE_URL}/transactions`);
  transactions = await response.json();
  renderTransactions();
  renderBalance();
}

async function handleSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const errorEl = document.getElementById("form-error");
  errorEl.textContent = "";

  const type = form.type.value;
  const enteredAmount = Number(form.amount.value);
  // The form always collects a positive number; the sign is derived
  // from the selected type, not typed by the user.
  const signedAmount = type === "expense" ? -Math.abs(enteredAmount) : Math.abs(enteredAmount);

  const payload = {
    accountId: 1,
    type,
    amount: signedAmount,
    occurredOn: form.occurredOn.value,
    category: form.category.value || undefined,
  };

  const response = await fetch(`${API_BASE_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    errorEl.textContent = Array.isArray(error.message) ? error.message.join(", ") : error.message;
    return;
  }

  form.reset();
  await loadTransactions();
}

document.getElementById("transaction-form").addEventListener("submit", handleSubmit);

loadTransactions();
