// ============================================================
// Hidrata — lógica do app
// ============================================================

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const COLORS = ["#118ab2", "#06d6a0", "#ef476f", "#ffd166"]; // uma cor por colaborador (ordem alfabética)
const MEDALS = ["🥇", "🥈", "🥉"];

let colaboradores = [];      // [{id, nome, meta_ml, garrafa_ml}]
let registrosHoje = [];      // [{id, colaborador_id, quantidade_ml, criado_em}]
let registrosSemana = [];    // [{colaborador_id, quantidade_ml, data}]
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

function subtractDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function medalOu(posicao) {
  return MEDALS[posicao] || `${posicao + 1}º`;
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
    .select("id, nome, meta_ml, garrafa_ml")
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

async function loadRegistrosSemana() {
  const inicio = subtractDays(todayISO(), 6);
  const { data, error } = await sb
    .from("registros")
    .select("colaborador_id, quantidade_ml, data")
    .gte("data", inicio);
  if (error) {
    console.error(error);
    return;
  }
  registrosSemana = data || [];
}

function totalDe(colaboradorId) {
  return registrosHoje
    .filter((r) => r.colaborador_id === colaboradorId)
    .reduce((sum, r) => sum + r.quantidade_ml, 0);
}

function totalSemanaDe(colaboradorId) {
  return registrosSemana
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

// ---------- Comemoração ----------
function celebrar() {
  if (window.confetti) {
    confetti({ particleCount: 140, spread: 75, origin: { y: 0.6 } });
    setTimeout(() => confetti({ particleCount: 80, spread: 100, origin: { y: 0.5 } }), 250);
  }
  showToast("🎉 Meta do dia batida, parabéns!");
}

// ---------- Ações ----------
async function registrarConsumo(ml) {
  if (!currentUserId || !ml) return;
  const me = colaboradores.find((c) => c.id === currentUserId);
  const totalAntes = totalDe(currentUserId);

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

  await loadRegistrosHoje();
  await loadRegistrosSemana();

  const totalDepois = totalDe(currentUserId);
  const bateuMeta = me && totalAntes < me.meta_ml && totalDepois >= me.meta_ml;

  if (bateuMeta) {
    celebrar();
  } else {
    showToast(`+${ml} ml registrado 💧`);
  }
  renderAll();
}

async function desfazerUltimo() {
  if (!currentUserId) return;
  const meus = registrosHoje.filter((r) => r.colaborador_id === currentUserId);
  if (meus.length === 0) {
    showToast("Não há nada pra desfazer hoje");
    return;
  }
  const ultimo = meus[meus.length - 1]; // registrosHoje já vem ordenado por horário crescente
  const { error } = await sb.from("registros").delete().eq("id", ultimo.id);
  if (error) {
    console.error(error);
    showToast("Erro ao desfazer");
    return;
  }
  showToast(`Último registro (${ultimo.quantidade_ml} ml) desfeito`);
  await loadRegistrosHoje();
  await loadRegistrosSemana();
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

async function salvarGarrafa() {
  if (!currentUserId) return;
  const valor = parseInt($("#garrafa-input").value, 10);
  if (!valor || valor < 50) {
    showToast("Informe um tamanho válido");
    return;
  }
  const { error } = await sb
    .from("colaboradores")
    .update({ garrafa_ml: valor })
    .eq("id", currentUserId);
  if (error) {
    console.error(error);
    showToast("Erro ao salvar garrafa");
    return;
  }
  await loadColaboradores();
  showToast("Tamanho da garrafa atualizado");
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
  $("#garrafa-input").value = me.garrafa_ml;
  $("#add-btn").textContent = `+ ${me.garrafa_ml} ml`;

  setTank($("#me-tank-fill"), $("#me-tank-label"), $("#me-tank"), total, me.meta_ml, false);
}

function renderTeamGrid() {
  const grid = $("#team-grid");
  grid.innerHTML = "";

  const ranqueado = [...colaboradores].sort((a, b) => totalDe(b.id) - totalDe(a.id));

  ranqueado.forEach((c, i) => {
    const total = totalDe(c.id);
    const card = document.createElement("div");
    card.className = "team-card";
    card.innerHTML = `
      <div class="rank-badge">${medalOu(i)}</div>
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

function renderRankingSemana() {
  const wrap = $("#ranking-semana");
  wrap.innerHTML = "";

  const ranqueado = colaboradores
    .map((c) => ({ ...c, total: totalSemanaDe(c.id) }))
    .sort((a, b) => b.total - a.total);

  const maior = Math.max(1, ...ranqueado.map((r) => r.total));

  ranqueado.forEach((c, i) => {
    const pct = Math.round((c.total / maior) * 100);
    const row = document.createElement("div");
    row.className = "ranking-row";
    row.innerHTML = `
      <div class="medal">${medalOu(i)}</div>
      <div class="rname">${c.nome}${c.id === currentUserId ? " (você)" : ""}</div>
      <div class="rbar"><div class="rbar-fill" style="width:${pct}%"></div></div>
      <div class="rtotal">${(c.total / 1000).toFixed(1)}L</div>
    `;
    wrap.appendChild(row);
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
  renderRankingSemana();
  renderChart();
}

// ---------- Realtime ----------
function initRealtime() {
  sb
    .channel("hidrata-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "registros" }, async () => {
      await loadRegistrosHoje();
      await loadRegistrosSemana();
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
  await loadRegistrosSemana();

  initUserPanel();
  renderAll();
  initRealtime();

  $("#add-btn").addEventListener("click", () => {
    const me = colaboradores.find((c) => c.id === currentUserId);
    if (me) registrarConsumo(me.garrafa_ml);
  });
  $("#undo-btn").addEventListener("click", desfazerUltimo);
  $("#save-meta").addEventListener("click", salvarMeta);
  $("#save-garrafa").addEventListener("click", salvarGarrafa);
}

boot();
