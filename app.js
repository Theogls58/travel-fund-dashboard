const cfg = window.TRAVEL_FUND_CONFIG || {};
const hasConfig =
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_URL.includes("PASTE_") &&
  !cfg.SUPABASE_ANON_KEY.includes("PASTE_");

const db = hasConfig ? supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

let state = {
  contributions: [],
  goal: 5000,
  partnerName: "Partner",
  cadToEur: 0.62,
  fxDate: null
};

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

const el = id => document.getElementById(id);

async function fetchFx() {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=CAD&symbols=EUR");
    const data = await res.json();
    if (data?.rates?.EUR) {
      state.cadToEur = Number(data.rates.EUR);
      state.fxDate = data.date || null;
    }
  } catch (e) {
    console.warn("FX lookup failed; using fallback rate.", e);
  }
}

async function loadAll() {
  setStatus(hasConfig ? "Syncing…" : "Demo mode: add Supabase details in config.js.");
  await fetchFx();

  let hadError = false;
  if (db) {
    const [{ data: contributions, error: cErr }, { data: settings, error: sErr }] =
      await Promise.all([
        db.from("contributions").select("*").order("created_at", { ascending: false }),
        db.from("settings").select("*").eq("id", 1).maybeSingle()
      ]);

    if (cErr) { hadError = true; setStatus("Could not load contributions: " + cErr.message); }
    if (sErr) { hadError = true; setStatus("Could not load settings: " + sErr.message); }

    if (contributions) state.contributions = contributions;
    if (settings) {
      state.goal = Number(settings.goal_eur || 5000);
      state.partnerName = settings.partner_name || "Partner";
    }
  }

  render();
  if (db && !hadError) setStatus("Synced");
}

function totals() {
  let theoEur = 0;
  let partnerCad = 0;

  for (const c of state.contributions) {
    if (c.person === "Theo" && c.currency === "EUR") theoEur += Number(c.amount);
    if (c.person === "Partner" && c.currency === "CAD") partnerCad += Number(c.amount);
  }

  const partnerEur = partnerCad * state.cadToEur;
  return { theoEur, partnerCad, partnerEur, combined: theoEur + partnerEur };
}

function render() {
  const t = totals();
  el("theoBalance").textContent = euro.format(t.theoEur);
  el("partnerBalance").textContent = cad.format(t.partnerCad);
  el("partnerEur").textContent = "≈ " + euro.format(t.partnerEur);
  el("combinedBalance").textContent = euro.format(t.combined);

  const pct = Math.min(100, state.goal > 0 ? (t.combined / state.goal) * 100 : 0);
  el("goalText").textContent = `${euro.format(t.combined)} of ${euro.format(state.goal)}`;
  el("progressPercent").textContent = `${pct.toFixed(1)}%`;
  el("progressBar").style.width = `${pct}%`;

  el("fxText").textContent =
    `1 CAD ≈ ${state.cadToEur.toFixed(4)} EUR` +
    (state.fxDate ? ` · rate date ${state.fxDate}` : " · fallback rate");

  el("goalInput").value = state.goal;
  el("partnerNameInput").value = state.partnerName;

  const history = el("history");
  history.innerHTML = "";
  el("emptyHistory").style.display = state.contributions.length ? "none" : "block";

  state.contributions.slice(0, 20).forEach(c => {
    const row = document.createElement("div");
    row.className = "history-row";

    const label = c.person === "Partner" ? state.partnerName : "Theo";
    const amountNum = Number(c.amount);
    const formatter = c.currency === "CAD" ? cad : euro;
    const amount = formatter.format(Math.abs(amountNum));
    const sign = amountNum < 0 ? "−" : "+";

    const when = new Date(c.created_at).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short"
    });

    row.innerHTML = `
      <div class="history-main">
        <div class="avatar">${label.slice(0,1).toUpperCase()}</div>
        <div>
          <div class="history-name">${escapeHtml(label)}</div>
          <div class="tiny">${when}</div>
        </div>
      </div>
      <div class="history-amount${amountNum < 0 ? " withdrawal" : ""}">${sign}${amount}</div>
      <button class="delete-btn" type="button">Delete</button>
    `;
    row.querySelector(".delete-btn").addEventListener("click", () => deleteContribution(c.id));
    history.appendChild(row);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[s]));
}

async function addContribution(person, currency, amount) {
  amount = Number(amount);
  if (!Number.isFinite(amount) || amount === 0) {
    setStatus("Enter an amount other than 0.");
    return;
  }

  if (!db) {
    state.contributions.unshift({
      id: crypto.randomUUID(),
      person, currency, amount,
      created_at: new Date().toISOString()
    });
    render();
    setStatus("Demo mode only — refresh will reset.");
    return;
  }

  const { data, error } = await db
    .from("contributions")
    .insert({ person, currency, amount })
    .select()
    .single();

  if (error) {
    setStatus("Could not add contribution: " + error.message);
    return;
  }

  state.contributions.unshift(data);
  render();
  setStatus(`Added ${currency === "CAD" ? cad.format(amount) : euro.format(amount)}`);
}


async function deleteContribution(id) {
  if (!confirm("Delete this entry? Use this for accidental clicks.")) return;

  if (!db) {
    state.contributions = state.contributions.filter(c => c.id !== id);
    render();
    return;
  }

  const { error } = await db.from("contributions").delete().eq("id", id);
  if (error) {
    setStatus("Could not delete entry: " + error.message);
    return;
  }

  state.contributions = state.contributions.filter(c => c.id !== id);
  render();
  setStatus("Entry deleted");
}

async function saveSettings() {
  const goal = Number(el("goalInput").value);
  const partnerName = el("partnerNameInput").value.trim() || "Partner";

  state.goal = Number.isFinite(goal) && goal > 0 ? goal : 5000;
  state.partnerName = partnerName;

  if (db) {
    const { error } = await db.from("settings").upsert({
      id: 1,
      goal_eur: state.goal,
      partner_name: state.partnerName
    });
    if (error) return setStatus("Could not save settings: " + error.message);
  }

  render();
  setStatus(db ? "Settings saved" : "Demo settings updated");
}

function setStatus(message) {
  el("status").textContent = message;
}

document.querySelectorAll(".quick").forEach(btn => {
  btn.addEventListener("click", () =>
    addContribution(btn.dataset.person, btn.dataset.currency, btn.dataset.amount)
  );
});

el("theoAdd").addEventListener("click", () => {
  const input = el("theoCustom");
  addContribution("Theo", "EUR", input.value);
  input.value = "";
});

el("partnerAdd").addEventListener("click", () => {
  const input = el("partnerCustom");
  addContribution("Partner", "CAD", input.value);
  input.value = "";
});

el("saveSettings").addEventListener("click", saveSettings);
el("refreshBtn").addEventListener("click", loadAll);

["theoCustom", "partnerCustom"].forEach(id => {
  el(id).addEventListener("keydown", e => {
    if (e.key === "Enter") {
      if (id === "theoCustom") el("theoAdd").click();
      else el("partnerAdd").click();
    }
  });
});

if (db) {
  db.channel("travel-fund-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "contributions" }, loadAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, loadAll)
    .subscribe();
}

loadAll();
