// ============================================================
//  APP PRINCIPAL
// ============================================================

let currentStudent = null;
let currentSemester = 1;

// ---- Helpers -----------------------------------------------
function calcFinal(evaluations) {
  return evaluations.reduce((sum, e) => sum + e.grade * (e.percentage / 100), 0);
}

function gradeColor(g) {
  if (g >= 6.0) return "grade-green";
  if (g >= 5.0) return "grade-yellow";
  if (g >= 4.0) return "grade-orange";
  return "grade-red";
}

function gradeLabel(g) {
  if (g >= 6.0) return "Excelente";
  if (g >= 5.0) return "Bueno";
  if (g >= 4.0) return "Suficiente";
  return "Insuficiente";
}

function typeIcon(type) {
  const icons = { prueba: "📝", control: "✏️", trabajo: "📁", examen: "📋" };
  return icons[type] || "📄";
}

function typeLabel(type) {
  const labels = { prueba: "Prueba", control: "Control", trabajo: "Trabajo", examen: "Examen" };
  return labels[type] || "Evaluación";
}

function formatDate(str) {
  const [y, m, d] = str.split("-");
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

// ---- Login -------------------------------------------------
document.getElementById("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const user = document.getElementById("username").value.trim().toLowerCase();
  const pass = document.getElementById("password").value;
  const err  = document.getElementById("loginError");

  if (USERS[user] && USERS[user].password === pass) {
    err.classList.add("hidden");
    const sid = USERS[user].studentId;
    currentStudent = { id: sid, ...STUDENTS[sid] };
    showApp();
  } else {
    err.classList.remove("hidden");
  }
});

function showApp() {
  document.getElementById("loginScreen").classList.remove("active");
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  document.getElementById("appScreen").classList.add("active");

  document.getElementById("studentName").textContent  = currentStudent.name;
  document.getElementById("studentGrade").textContent = currentStudent.grade;
  document.getElementById("studentAvatar").textContent = currentStudent.avatar;
  document.getElementById("topbarBadge").textContent   = currentStudent.avatar;

  currentSemester = 1;
  document.getElementById("semesterSelect").value = "1";
  renderAll();
}

// ---- Logout ------------------------------------------------
document.getElementById("logoutBtn").addEventListener("click", () => {
  document.getElementById("appScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("active");
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("loginScreen").classList.add("active");
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  currentStudent = null;
});

// ---- Semester change ---------------------------------------
document.getElementById("semesterSelect").addEventListener("change", (e) => {
  currentSemester = parseInt(e.target.value);
  renderAll();
});

// ---- Sidebar -----------------------------------------------
const sidebar        = document.getElementById("sidebar");
const overlay        = document.getElementById("sidebarOverlay");
const hamburger      = document.getElementById("hamburger");
const sidebarClose   = document.getElementById("sidebarClose");

hamburger.addEventListener("click", () => {
  sidebar.classList.add("open");
  overlay.classList.remove("hidden");
});

function closeSidebar() {
  sidebar.classList.remove("open");
  overlay.classList.add("hidden");
}

sidebarClose.addEventListener("click", closeSidebar);
overlay.addEventListener("click", closeSidebar);

// ---- Navigation --------------------------------------------
const navItems = document.querySelectorAll(".nav-item");
navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    const section = btn.dataset.section;
    navItems.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".content-section").forEach((s) => {
      s.classList.add("hidden");
      s.classList.remove("active");
    });
    const target = document.getElementById("section-" + section);
    target.classList.remove("hidden");
    target.classList.add("active");
    document.getElementById("topbarTitle").textContent =
      { resumen: "Resumen", notas: "Mis Notas", asistencia: "Asistencia", comunicados: "Comunicados" }[section];
    closeSidebar();
  });
});

// ---- Render all sections -----------------------------------
function renderAll() {
  renderSummary();
  renderGrades();
  renderAttendance();
  renderComunicados();
}

// ---- RESUMEN -----------------------------------------------
function renderSummary() {
  const grades = GRADES[currentStudent.id][currentSemester];
  const container = document.getElementById("summaryCards");
  const barChart   = document.getElementById("barChart");
  const statusEl   = document.getElementById("statusChart");

  const finals = grades.map((s) => ({ subject: s.subject, final: calcFinal(s.evaluations) }));
  const avg    = finals.reduce((a, b) => a + b.final, 0) / finals.length;
  const best   = finals.reduce((a, b) => (b.final > a.final ? b : a));
  const worst  = finals.reduce((a, b) => (b.final < a.final ? b : a));
  const passed = finals.filter((f) => f.final >= 4.0).length;

  container.innerHTML = `
    <div class="summary-card">
      <div class="scard-icon">📊</div>
      <div class="scard-value ${gradeColor(avg)}">${avg.toFixed(1)}</div>
      <div class="scard-label">Promedio General</div>
    </div>
    <div class="summary-card">
      <div class="scard-icon">✅</div>
      <div class="scard-value grade-green">${passed}/${finals.length}</div>
      <div class="scard-label">Asignaturas Aprobadas</div>
    </div>
    <div class="summary-card">
      <div class="scard-icon">🏆</div>
      <div class="scard-value grade-green">${best.final.toFixed(1)}</div>
      <div class="scard-label">Mejor: ${best.subject}</div>
    </div>
    <div class="summary-card">
      <div class="scard-icon">⚠️</div>
      <div class="scard-value ${gradeColor(worst.final)}">${worst.final.toFixed(1)}</div>
      <div class="scard-label">Más baja: ${worst.subject}</div>
    </div>
  `;

  // Bar chart
  const maxGrade = 7;
  barChart.innerHTML = finals.map((f) => {
    const pct   = (f.final / maxGrade) * 100;
    const short = f.subject.length > 12 ? f.subject.substring(0, 12) + "…" : f.subject;
    return `
      <div class="bar-item">
        <div class="bar-label">${short}</div>
        <div class="bar-track">
          <div class="bar-fill ${gradeColor(f.final)}" style="width:${pct}%">
            <span class="bar-value">${f.final.toFixed(1)}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Status donut-style
  const aprobadas  = finals.filter((f) => f.final >= 6.0).length;
  const suficiente = finals.filter((f) => f.final >= 4.0 && f.final < 6.0).length;
  const reprobadas = finals.filter((f) => f.final < 4.0).length;

  statusEl.innerHTML = `
    <div class="status-legend">
      <div class="legend-item">
        <div class="legend-dot green"></div>
        <span>Excelente (≥6.0): <strong>${aprobadas}</strong></span>
      </div>
      <div class="legend-item">
        <div class="legend-dot yellow"></div>
        <span>Aprobado (4.0–5.9): <strong>${suficiente}</strong></span>
      </div>
      <div class="legend-item">
        <div class="legend-dot red"></div>
        <span>Reprobado (&lt;4.0): <strong>${reprobadas}</strong></span>
      </div>
    </div>
    <div class="status-big ${gradeColor(avg)}">
      <div class="status-number">${avg.toFixed(2)}</div>
      <div class="status-sublabel">Promedio ${currentSemester === 1 ? "1er" : "2do"} Semestre</div>
      <div class="status-badge ${gradeColor(avg)}">${gradeLabel(avg)}</div>
    </div>
  `;
}

// ---- NOTAS -------------------------------------------------
function renderGrades() {
  const grades    = GRADES[currentStudent.id][currentSemester];
  const container = document.getElementById("gradesContainer");

  container.innerHTML = grades.map((subject, si) => {
    const final = calcFinal(subject.evaluations);
    const totalPct = subject.evaluations.reduce((a, b) => a + b.percentage, 0);

    const rows = subject.evaluations.map((ev, i) => `
      <tr class="eval-row">
        <td>
          <span class="eval-type-icon">${typeIcon(ev.type)}</span>
          <span class="eval-name">${ev.name}</span>
          <span class="eval-type-badge type-${ev.type}">${typeLabel(ev.type)}</span>
        </td>
        <td>
          <div class="pct-bar-wrap">
            <div class="pct-bar" style="width:${ev.percentage}%"></div>
            <span class="pct-text">${ev.percentage}%</span>
          </div>
        </td>
        <td>
          <span class="grade-pill ${gradeColor(ev.grade)}">${ev.grade.toFixed(1)}</span>
        </td>
        <td class="contrib-cell">
          <span class="contrib">${(ev.grade * ev.percentage / 100).toFixed(2)}</span>
        </td>
      </tr>
    `).join("");

    return `
      <div class="subject-card" id="subject-${si}">
        <div class="subject-header" onclick="toggleSubject(${si})">
          <div class="subject-left">
            <div class="subject-title">${subject.subject}</div>
            <div class="subject-teacher">${subject.teacher}</div>
          </div>
          <div class="subject-right">
            <div class="final-grade-wrap">
              <span class="final-label">Nota Final</span>
              <span class="final-grade ${gradeColor(final)}">${final.toFixed(1)}</span>
              <span class="final-status-badge ${gradeColor(final)}">${gradeLabel(final)}</span>
            </div>
            <span class="chevron" id="chevron-${si}">▼</span>
          </div>
        </div>

        <div class="subject-body hidden" id="body-${si}">
          <div class="table-wrapper">
            <table class="eval-table">
              <thead>
                <tr>
                  <th>Evaluación</th>
                  <th>Ponderación</th>
                  <th>Nota</th>
                  <th>Aporte</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td><strong>Total</strong></td>
                  <td><strong>${totalPct}%</strong></td>
                  <td></td>
                  <td>
                    <span class="grade-pill ${gradeColor(final)} large">${final.toFixed(1)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="grade-breakdown">
            ${subject.evaluations.map((ev) => `
              <div class="breakdown-item">
                <div class="breakdown-name">${ev.name}</div>
                <div class="breakdown-formula">
                  ${ev.grade.toFixed(1)} × ${ev.percentage}% = <strong>${(ev.grade * ev.percentage / 100).toFixed(2)}</strong>
                </div>
              </div>
            `).join("")}
            <div class="breakdown-final">
              Nota Final = <strong class="${gradeColor(final)}">${final.toFixed(2)}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function toggleSubject(idx) {
  const body    = document.getElementById("body-" + idx);
  const chevron = document.getElementById("chevron-" + idx);
  if (body.classList.contains("hidden")) {
    body.classList.remove("hidden");
    chevron.textContent = "▲";
  } else {
    body.classList.add("hidden");
    chevron.textContent = "▼";
  }
}

// ---- ASISTENCIA --------------------------------------------
function renderAttendance() {
  const data      = ATTENDANCE[currentStudent.id]?.[currentSemester];
  const container = document.getElementById("attendanceContainer");

  if (!data) {
    container.innerHTML = `<div class="empty-state">No hay datos de asistencia para este semestre.</div>`;
    return;
  }

  const pct = Math.round((data.present / data.total) * 100);
  const pctColor = pct >= 85 ? "green" : pct >= 70 ? "yellow" : "red";

  const recentRows = data.records.length
    ? data.records.slice(-10).reverse().map((r) => `
        <tr>
          <td>${formatDate(r.date)}</td>
          <td><span class="att-badge att-${r.status}">${
            { present: "Presente", absent: "Ausente", late: "Tardanza" }[r.status]
          }</span></td>
        </tr>
      `).join("")
    : `<tr><td colspan="2" class="text-center text-muted">Sin registros recientes</td></tr>`;

  container.innerHTML = `
    <div class="att-summary-grid">
      <div class="att-card">
        <div class="att-pct ${pctColor}">${pct}%</div>
        <div class="att-pct-label">Asistencia</div>
        <div class="att-pct-bar-track">
          <div class="att-pct-bar ${pctColor}" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="att-stats">
        <div class="att-stat">
          <span class="att-stat-icon">📅</span>
          <div>
            <div class="att-stat-value">${data.total}</div>
            <div class="att-stat-label">Clases Totales</div>
          </div>
        </div>
        <div class="att-stat">
          <span class="att-stat-icon" style="color:#22c55e">✅</span>
          <div>
            <div class="att-stat-value" style="color:#22c55e">${data.present}</div>
            <div class="att-stat-label">Presentes</div>
          </div>
        </div>
        <div class="att-stat">
          <span class="att-stat-icon" style="color:#ef4444">❌</span>
          <div>
            <div class="att-stat-value" style="color:#ef4444">${data.absent}</div>
            <div class="att-stat-label">Ausencias</div>
          </div>
        </div>
        <div class="att-stat">
          <span class="att-stat-icon" style="color:#f59e0b">⏰</span>
          <div>
            <div class="att-stat-value" style="color:#f59e0b">${data.late}</div>
            <div class="att-stat-label">Tardanzas</div>
          </div>
        </div>
      </div>
    </div>
    <div class="att-table-card">
      <h3>Últimos registros</h3>
      <table class="att-table">
        <thead><tr><th>Fecha</th><th>Estado</th></tr></thead>
        <tbody>${recentRows}</tbody>
      </table>
    </div>
  `;
}

// ---- COMUNICADOS -------------------------------------------
function renderComunicados() {
  const container = document.getElementById("comunicadosContainer");
  const catIcons  = { reunion: "👥", academico: "📚", deporte: "⚽", orientacion: "🧭", cultura: "🎭" };
  const catLabels = { reunion: "Reunión", academico: "Académico", deporte: "Deporte", orientacion: "Orientación", cultura: "Cultura" };

  container.innerHTML = COMUNICADOS.map((c) => `
    <div class="com-card ${c.important ? "com-important" : ""}">
      <div class="com-header">
        <span class="com-cat-icon">${catIcons[c.category] || "📢"}</span>
        <div class="com-meta">
          <span class="com-cat-badge cat-${c.category}">${catLabels[c.category] || c.category}</span>
          <span class="com-date">${formatDate(c.date)}</span>
        </div>
        ${c.important ? '<span class="com-imp-badge">Importante</span>' : ""}
      </div>
      <div class="com-title">${c.title}</div>
      <div class="com-content">${c.content}</div>
    </div>
  `).join("");
}
