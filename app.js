// ============================================================
// Hidrata — lógica do app
// ============================================================

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const COLORS = ["#118ab2", "#06d6a0", "#ef476f", "#ffd166"]; // uma cor por colaborador (ordem alfabética)

let colaboradores = [];      // [{id, nome, meta_ml}]
let registrosHoje = [];      // [{id, colaborador_id, quantidade_ml, criado_em}]
let currentUserId = localStorage.getItem("hidrata_user_id");
let chart = null;

const $ = (sel) => document.querySelector(sel);

function todayISO() {
  // data de hoje no fuso de São Paulo, formato YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  return fmt.format(new Date());
}

function todayLabel() {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const s = fmt.format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Tema ----------
function applyTheme(mode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
  localStorage.setItem("hidrata_theme", mode);
  $("#btn-light").classList.toggle("active", mode === "light");
  $("#btn-dark").classList.toggle("active", mode === "dark");
}

function initTheme() {
  const saved = localStorage.getItem("hidrata_theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
  $("#btn-light").addEventListener("click", () => applyTheme("light"));
  $("#btn-dark").addEventListener("click", () => applyTheme("dark"));
}

// ---------- Dados ----------
async function loadColaboradores() {
  const { data, error } = await sb
    .from("colaboradores")
    .select("id, nome, meta_ml")
    .order("nome", { ascending: true });
  if (error) {
    console.error(error);
    showToast("Erro ao carregar colaboradores");
    return;
  }
  colaboradores = data || [];
}

async function loadRegistrosHoje() {
  const { data, error } = await sb
    .from("registros")
    .select("id, colaborador_id, quantidade_ml, criado_em")
    .eq("data", todayISO())
    .order("criado_em", { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  registrosHoje = data || [];
}

function totalDe(colaboradorId) {
  return registrosHoje
    .filter((r) => r.colaborador_id === colaboradorId)
    .reduce((sum, r) => sum + r.quantidade_ml, 0);
}

// ---------- Seleção de usuário ----------
function renderPills() {
  const wrap = $("#pills");
  wrap.innerHTML = "";
  colaboradores.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "pill" + (c.id === currentUserId ? " selected" : "");
    btn.textContent = c.nome;
    btn.addEventListener("click", () => selectUser(c.id));
    wrap.appendChild(btn);
  });
}

function selectUser(id) {
  currentUserId = id;
  localStorage.setItem("hidrata_user_id", id);
  $("#who-panel").style.display = "none";
  $("#me-card").style.display = "grid";
  renderPills();
  renderAll();
}

function initUserPanel() {
  $("#switch-user").addEventListener("click", () => {
    $("#who-panel").style.display = "block";
    $("#me-card").style.display = "none";
  });

  const exists = colaboradores.some((c) => c.id === currentUserId);
  if (currentUserId && exists) {
    $("#who-panel").style.display = "none";
    $("#me-card").style.display = "grid";
  } else {
    currentUserId = null;
    $("#who-panel").style.display = "block";
    $("#me-card").style.display = "none";
  }
  renderPills();
}

// ---------- Ações ----------
async function registrarConsumo(ml) {
  if (!currentUserId) return;
  const { error } = await sb.from("registros").insert({
    colaborador_id: currentUserId,
    quantidade_ml: ml,
    data: todayISO(),
  });
  if (error) {
    console.error(error);
    showToast("Não deu pra registrar, tenta de novo");
    return;
  }
  showToast(`+${ml} ml registrado 💧`);
  await loadRegistrosHoje();
  renderAll();
}

async function salvarMeta() {
  if (!currentUserId) return;
  const valor = parseInt($("#meta-input").value, 10);
  if (!valor || valor < 100) {
    showToast("Informe uma meta válida");
    return;
  }
  const { error } = await sb
    .from("colaboradores")
    .update({ meta_ml: valor })
    .eq("id", currentUserId);
  if (error) {
    console.error(error);
    showToast("Erro ao salvar meta");
    return;
  }
  await loadColaboradores();
  showToast("Meta atualizada");
  renderAll();
}

// ---------- Render: tanque individual ----------
function setTank(fillEl, labelEl, tankEl, total, meta, showSub) {
  const pct = meta > 0 ? Math.min(100, Math.round((total / meta) * 100)) : 0;
  fillEl.style.height = pct + "%";
  tankEl.classList.toggle("reached", pct >= 100);
  labelEl.innerHTML = `${pct}%` + (showSub ? `<small>${total}/${meta}ml</small>` : "");
}

function renderMeCard() {
  const me = colaboradores.find((c) => c.id === currentUserId);
  if (!me) return;
  const total = totalDe(me.id);

  $("#me-name").textContent = me.nome;
  $("#me-total").innerHTML = `${total}<span>ml hoje</span>`;
  $("#meta-input").value = me.meta_ml;

  setTank($("#me-tank-fill"), $("#me-tank-label"), $("#me-tank"), total, me.meta_ml, false);
}

function renderTeamGrid() {
  const grid = $("#team-grid");
  grid.innerHTML = "";
  colaboradores.forEach((c) => {
    const total = totalDe(c.id);
    const card = document.createElement("div");
    card.className = "team-card";
    card.innerHTML = `
      <div class="mini-tank">
        <div class="tank">
          <div class="tank-fill"></div>
          <div class="tank-label"></div>
        </div>
      </div>
      <div class="name">${c.nome}${c.id === currentUserId ? " (você)" : ""}</div>
      <div class="amounts">${total} / ${c.meta_ml} ml</div>
    `;
    grid.appendChild(card);
    setTank(
      card.querySelector(".tank-fill"),
      card.querySelector(".tank-label"),
      card.querySelector(".tank"),
      total,
      c.meta_ml,
      false
    );
  });
}

// ---------- Gráfico ----------
function buildSeries() {
  // Para cada colaborador, gera pontos acumulados ao longo do dia
  return colaboradores.map((c, i) => {
    let acc = 0;
    const pontos = registrosHoje
      .filter((r) => r.colaborador_id === c.id)
      .map((r) => {
        acc += r.quantidade_ml;
        return { x: new Date(r.criado_em), y: acc };
      });
    // ponto inicial em 0 no começo do dia, ajuda a visualizar quem ainda não bebeu
    return {
      label: c.nome,
      data: pontos,
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length],
      tension: 0.35,
      pointRadius: 3,
      borderWidth: 2,
      stepped: false,
    };
  });
}

function renderChart() {
  const ctx = $("#chart").getContext("2d");
  const datasets = buildSeries();

  if (chart) {
    chart.data.datasets = datasets;
    chart.update();
    return;
  }

  chart = new Chart(ctx, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      scales: {
        x: {
          type: "time",
          time: { unit: "hour" },
          grid: { color: "rgba(128,128,128,0.12)" },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "ml acumulados" },
          grid: { color: "rgba(128,128,128,0.12)" },
        },
      },
      plugins: {
        legend: { position: "bottom" },
      },
    },
  });
}

function renderAll() {
  if (currentUserId) renderMeCard();
  renderTeamGrid();
  renderChart();
}

// ---------- Realtime ----------
function initRealtime() {
  sb
    .channel("hidrata-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "registros" }, async () => {
      await loadRegistrosHoje();
      renderAll();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "colaboradores" }, async () => {
      await loadColaboradores();
      renderAll();
    })
    .subscribe();
}

// ---------- Boot ----------
async function boot() {
  $("#today-label").textContent = todayLabel();
  initTheme();

  await loadColaboradores();
  await loadRegistrosHoje();

  initUserPanel();
  renderAll();
  initRealtime();

  document.querySelectorAll(".add-btn").forEach((btn) => {
    btn.addEventListener("click", () => registrarConsumo(parseInt(btn.dataset.ml, 10)));
  });
  $("#save-meta").addEventListener("click", salvarMeta);
}

boot();
