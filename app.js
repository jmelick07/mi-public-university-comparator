const csvInput = document.getElementById("csvInput");
const loadBtn = document.getElementById("loadBtn");
const loadStatus = document.getElementById("loadStatus");
const metricSelect = document.getElementById("metricSelect");
const sortSelect = document.getElementById("sortSelect");
const resultTable = document.getElementById("resultTable");
const trendChart = document.getElementById("trendChart");
const chartTooltip = document.getElementById("chartTooltip");
const chartTitle = document.getElementById("chartTitle");
const chartSubtitle = document.getElementById("chartSubtitle");
const institutionList = document.getElementById("institutionList");
const selectAllBtn = document.getElementById("selectAllBtn");
const selectNoneBtn = document.getElementById("selectNoneBtn");
const definitionTitle = document.getElementById("definitionTitle");
const definitionBody = document.getElementById("definitionBody");
const definitionSource = document.getElementById("definitionSource");

const state = {
  header: [],
  rows: [],
  metricMap: new Map(),
  metrics: [],
  selectedBase: "",
  selectedInstitutions: new Set(),
  hoverSeries: null,
  lastChart: null,
};

const SCHOOL_COLORS = {
  "Central Michigan University": "#6A0032",
  "Eastern Michigan University": "#046A38",
  "Ferris State University": "#BA0C2F",
  "Grand Valley State University": "#0032A0",
  "Michigan State University": "#18453B",
  "Michigan Technological University": "#FFCD00",
  "Northern Michigan University": "#095339",
  "Oakland University": "#B59A57",
  "University of Michigan-Ann Arbor": "#00274C",
  "University of Michigan-Dearborn": "#FFCB05",
  "University of Michigan-Flint": "#00274C",
  "Wayne State University": "#0C5449",
  "Western Michigan University": "#532E1F",
  "Lake Superior State University": "#6D6E71",
  "Saginaw Valley State University": "#6D6E71",
};

const SCHOOL_CODES = {
  "Central Michigan University": "CMU",
  "Eastern Michigan University": "EMU",
  "Ferris State University": "Ferris",
  "Grand Valley State University": "GVSU",
  "Lake Superior State University": "LSSU",
  "Michigan State University": "MSU",
  "Michigan Technological University": "MTU",
  "Northern Michigan University": "NMU",
  "Oakland University": "OU",
  "Saginaw Valley State University": "SVSU",
  "University of Michigan-Ann Arbor": "UM-AA",
  "University of Michigan-Dearborn": "UM-D",
  "University of Michigan-Flint": "UM-F",
  "Wayne State University": "WSU",
  "Western Michigan University": "WMU",
};

const FALLBACK_COLORS = [
  "#0A9396",
  "#3D5A80",
  "#7B2CBF",
  "#BC4749",
  "#FF7F11",
  "#2A9D8F",
  "#8338EC",
  "#5F6C7B",
];

loadBtn.addEventListener("click", () => {
  if (!csvInput.files.length) {
    setStatus("Please select a CSV file first.", true);
    return;
  }
  loadCSV(csvInput.files[0]);
});

metricSelect.addEventListener("change", () => {
  state.selectedBase = metricSelect.value;
  updateDefinition();
  renderAll();
});

sortSelect.addEventListener("change", renderAll);

selectAllBtn.addEventListener("click", () => {
  state.selectedInstitutions = new Set(state.rows.map((row) => row.instnm));
  updateInstitutionChecks();
  renderAll();
});

selectNoneBtn.addEventListener("click", () => {
  state.selectedInstitutions.clear();
  updateInstitutionChecks();
  renderAll();
});

trendChart.addEventListener("mousemove", throttle(onChartHover, 30));
trendChart.addEventListener("mouseleave", () => {
  state.hoverSeries = null;
  chartTooltip.style.display = "none";
  if (state.lastChart) drawChart(trendChart, state.lastChart.years, state.lastChart.series);
});
window.addEventListener("resize", () => {
  if (state.lastChart) drawChart(trendChart, state.lastChart.years, state.lastChart.series);
});

function setStatus(message, isError = false) {
  loadStatus.textContent = message;
  loadStatus.style.color = isError ? "#a13e2d" : "";
}

function loadCSV(file) {
  setStatus("Loading CSV...");
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    const { header, rows } = parseCSV(text);
    if (!header.length) {
      setStatus("CSV appears empty or unreadable.", true);
      return;
    }
    state.header = header;
    state.rows = rows;
    state.metricMap = buildMetricMap(header);
    state.metrics = Array.from(state.metricMap.keys()).sort((a, b) =>
      a.localeCompare(b)
    );
    state.selectedInstitutions = new Set(rows.map((row) => row.instnm));

    populateMetricSelect();
    renderInstitutionList();

    metricSelect.disabled = false;
    sortSelect.disabled = false;

    state.selectedBase = state.metrics[0] || "";
    metricSelect.value = state.selectedBase;
    updateDefinition();

    setStatus(
      `Loaded ${rows.length} institutions and ${state.metrics.length} metric groups.`
    );
    renderAll();
  };
  reader.onerror = () => setStatus("Failed to read CSV.", true);
  reader.readAsText(file);
}

function parseCSV(text) {
  const rows = [];
  let current = [];
  let value = "";
  let inQuotes = false;

  const pushValue = () => {
    current.push(value);
    value = "";
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      pushValue();
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      pushValue();
      if (current.length > 1 || current.some((cell) => cell.trim())) {
        rows.push(current);
      }
      current = [];
      continue;
    }

    value += char;
  }

  if (value.length || current.length) {
    pushValue();
    rows.push(current);
  }

  const header = rows.shift() || [];
  const normalized = rows.map((row) => {
    const obj = {};
    header.forEach((key, idx) => {
      obj[key] = row[idx] ?? "";
    });
    return obj;
  });

  return { header, rows: normalized };
}

function buildMetricMap(header) {
  const map = new Map();
  header.forEach((col) => {
    if (!col || col === "instnm") return;
    const { base, year } = parseMetricColumn(col);
    if (!base) return;
    if (!map.has(base)) map.set(base, []);
    map.get(base).push({ year, column: col });
  });

  for (const entries of map.values()) {
    entries.sort((a, b) => (a.year || 0) - (b.year || 0));
  }

  return map;
}

function parseMetricColumn(col) {
  let year = null;
  let base = col;
  const rangeMatch = col.match(/\b(20\d{2})\s*-\s*(\d{2})\b/);
  if (rangeMatch) {
    year = parseInt(rangeMatch[1], 10);
  }

  if (!year) {
    const match = col.match(/\b(20\d{2})\b/);
    if (match) year = parseInt(match[1], 10);
  }

  if (!year) {
    const codeMatch = col.match(/\(([^)]*?)\)/);
    const code = codeMatch ? codeMatch[1] : col;
    const yearMatch = code.match(/(20\d{2})/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
    } else {
      const four = code.match(/(\d{4})/g);
      if (four && four.length) {
        const last = four[four.length - 1];
        const first = parseInt(last.slice(0, 2), 10);
        if (first >= 19 && first <= 30) year = 2000 + first;
      }
    }
  }

  base = base.replace(/\(([^)]*)\)/g, (full, inner) => {
    const trimmed = inner.trim();
    if (!trimmed) return " ";
    if (/^[A-Z0-9_]+$/.test(trimmed)) return " ";
    return ` ${trimmed} `;
  });
  base = base.replace(/\b20\d{2}\b/g, " ");
  base = base.replace(/\b\d{2}\s*-\s*\d{2}\b/g, " ");
  base = base.replace(/\s*-\s*\d{2}\b/g, " ");
  base = base.replace(/\s{2,}/g, " ").trim();
  return { base, year };
}

function populateMetricSelect() {
  metricSelect.innerHTML = "";
  state.metrics.forEach((metric) => {
    const option = document.createElement("option");
    option.value = metric;
    option.textContent = metric;
    metricSelect.appendChild(option);
  });
}

function renderInstitutionList() {
  institutionList.innerHTML = "";
  const names = state.rows.map((row) => row.instnm).sort((a, b) => a.localeCompare(b));
  names.forEach((name) => {
    const label = document.createElement("label");
    label.className = "institution-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedInstitutions.has(name);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedInstitutions.add(name);
      else state.selectedInstitutions.delete(name);
      label.classList.toggle("selected", checkbox.checked);
      renderAll();
    });

    const swatch = document.createElement("span");
    swatch.className = "institution-swatch";
    swatch.style.backgroundColor = colorForInstitution(name);

    const code = document.createElement("span");
    code.className = "institution-code";
    code.textContent = SCHOOL_CODES[name] || name;

    label.title = name;
    label.classList.toggle("selected", checkbox.checked);

    label.appendChild(checkbox);
    label.appendChild(swatch);
    label.appendChild(code);
    institutionList.appendChild(label);
  });
}

function updateInstitutionChecks() {
  const items = institutionList.querySelectorAll(".institution-item");
  items.forEach((item) => {
    const name = item.title;
    const input = item.querySelector("input");
    const checked = state.selectedInstitutions.has(name);
    input.checked = checked;
    item.classList.toggle("selected", checked);
  });
}

function renderAll() {
  renderTable();
  renderChart();
}

function renderTable() {
  const base = state.selectedBase;
  if (!base) return;

  const entries = state.metricMap.get(base) || [];
  const years = entries
    .map((entry) => entry.year)
    .filter((year) => year)
    .sort((a, b) => a - b);

  const rows = state.rows
    .filter((row) => state.selectedInstitutions.has(row.instnm))
    .map((row) => {
      const valuesByYear = {};
      entries.forEach((entry) => {
        valuesByYear[entry.year || "Unknown"] = row[entry.column] ?? "";
      });
      return {
        name: row.instnm || "Unknown",
        valuesByYear,
      };
    });

  const latestYear = years[years.length - 1];
  if (sortSelect.value === "value" && latestYear) {
    rows.sort(
      (a, b) =>
        parseValue(b.valuesByYear[latestYear]) -
        parseValue(a.valuesByYear[latestYear])
    );
  } else {
    rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  const thead = resultTable.querySelector("thead");
  const tbody = resultTable.querySelector("tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const headerRow = document.createElement("tr");
  headerRow.innerHTML = `<th>Institution</th>${years
    .map((year) => `<th>${year}</th>`)
    .join("")}`;
  thead.appendChild(headerRow);

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const cells = years
      .map((year) =>
        formatValue(row.valuesByYear[year], base, { empty: "—" })
      )
      .map((val) => `<td>${val}</td>`)
      .join("");
    tr.innerHTML = `<td>${row.name}</td>${cells}`;
    tbody.appendChild(tr);
  });
}

function renderChart() {
  const base = state.selectedBase;
  if (!base) return;

  const entries = state.metricMap.get(base) || [];
  const years = entries
    .map((entry) => entry.year)
    .filter((year) => year)
    .sort((a, b) => a - b);

  chartTitle.textContent = base;
  chartSubtitle.textContent = years.length
    ? `Years: ${years.join(" – ")}`
    : "No year data";

  const series = state.rows
    .filter((row) => state.selectedInstitutions.has(row.instnm))
    .map((row) => {
      const values = entries.map((entry) => parseValue(row[entry.column]));
      return {
        name: row.instnm || "Unknown",
        values,
      };
    });

  state.lastChart = { years, series };
  drawChart(trendChart, years, series);
}

function drawChart(canvas, years, series) {
  const ctx = canvas.getContext("2d");
  const cssWidth = canvas.clientWidth || 1000;
  const cssHeight = canvas.clientHeight || 320;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssWidth * ratio);
  canvas.height = Math.floor(cssHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = cssWidth;
  const height = cssHeight;
  ctx.clearRect(0, 0, width, height);

  if (!years.length || !series.length) {
    ctx.fillStyle = "#5a6678";
    ctx.font = "14px Inter, sans-serif";
    ctx.fillText("No data to display.", 20, 40);
    return;
  }

  const padding = { top: 24, right: 24, bottom: 40, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = series.flatMap((s) => s.values).filter((v) => v > -Infinity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const nice = niceScale(min, max, 5);

  ctx.strokeStyle = "#e3d9cc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  ctx.fillStyle = "#5a6678";
  ctx.font = "12px Inter, sans-serif";
  years.forEach((year, idx) => {
    const x = padding.left + (chartWidth * idx) / (years.length - 1 || 1);
    ctx.fillText(String(year), x - 10, padding.top + chartHeight + 20);
  });

  const steps = nice.steps;
  for (let i = 0; i <= steps; i += 1) {
    const value = nice.max - nice.step * i;
    const y = padding.top + (chartHeight * i) / steps;
    const formatted = formatValue(value, state.selectedBase, {
      numericInput: true,
    });
    ctx.fillText(formatted, 6, y + 4);
    ctx.strokeStyle = "#f0e5d6";
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  series.forEach((s, index) => {
    const color = colorForInstitution(s.name);
    const isHover = state.hoverSeries === index;
    ctx.strokeStyle = color;
    ctx.globalAlpha = state.hoverSeries === null || isHover ? 1 : 0.2;
    ctx.lineWidth = isHover ? 3 : 2;
    ctx.beginPath();
    s.values.forEach((val, i) => {
      if (val === -Infinity) return;
      const x = padding.left + (chartWidth * i) / (years.length - 1 || 1);
      const y = padding.top + ((nice.max - val) / (nice.max - nice.min || 1)) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    s.values.forEach((val, i) => {
      if (val === -Infinity) return;
      const x = padding.left + (chartWidth * i) / (years.length - 1 || 1);
      const y = padding.top + ((nice.max - val) / (nice.max - nice.min || 1)) * chartHeight;
      ctx.fillStyle = color;
      ctx.globalAlpha = state.hoverSeries === null || isHover ? 1 : 0.2;
      ctx.beginPath();
      ctx.arc(x, y, isHover ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.globalAlpha = 1;
  canvas.dataset.years = JSON.stringify(years);
  canvas.dataset.series = JSON.stringify(
    series.map((s) => ({ name: s.name, values: s.values }))
  );
  canvas.dataset.min = String(nice.min);
  canvas.dataset.max = String(nice.max);
  canvas.dataset.range = String(nice.max - nice.min || 1);
  canvas.dataset.padding = JSON.stringify(padding);
}

function onChartHover(event) {
  const years = JSON.parse(trendChart.dataset.years || "[]");
  const series = JSON.parse(trendChart.dataset.series || "[]");
  if (!years.length || !series.length) return;

  const padding = JSON.parse(trendChart.dataset.padding || "{}");
  const rect = trendChart.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * trendChart.width;
  const y = ((event.clientY - rect.top) / rect.height) * trendChart.height;

  const chartWidth = trendChart.width - padding.left - padding.right;
  const chartHeight = trendChart.height - padding.top - padding.bottom;

  const minVal = parseFloat(trendChart.dataset.min || "0");
  const range = parseFloat(trendChart.dataset.range || "1");
  const yearIndex = Math.round(
    ((x - padding.left) / chartWidth) * (years.length - 1 || 1)
  );
  const clampedIndex = Math.max(0, Math.min(yearIndex, years.length - 1));
  const px = padding.left + (chartWidth * clampedIndex) / (years.length - 1 || 1);

  let closest = null;
  series.forEach((s, sIdx) => {
    const val = s.values[clampedIndex];
    if (val === -Infinity) return;
    const py = padding.top + ((minVal + range - val) / range) * chartHeight;
    const dist = Math.abs(py - y);
    if (!closest || dist < closest.dist) {
      closest = { dist, px, py, sIdx, year: years[clampedIndex], value: val };
    }
  });

  if (closest && closest.dist < 28) {
    state.hoverSeries = closest.sIdx;
    if (state.lastChart) drawChart(trendChart, state.lastChart.years, state.lastChart.series);

    const name = series[closest.sIdx].name;
    const code = SCHOOL_CODES[name] || name;
    const tooltipText = `${code} • ${closest.year}: ${formatValue(
      closest.value,
      state.selectedBase,
      { numericInput: true }
    )}`;
    chartTooltip.textContent = tooltipText;
    chartTooltip.style.display = "block";

    const offsetX = (closest.px / trendChart.width) * rect.width;
    const offsetY = (closest.py / trendChart.height) * rect.height;
    chartTooltip.style.left = `${offsetX}px`;
    chartTooltip.style.top = `${offsetY}px`;

    const tooltipRect = chartTooltip.getBoundingClientRect();
    const minLeft = 8;
    const maxLeft = rect.width - tooltipRect.width - 8;
    let left = offsetX - tooltipRect.width / 2;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    let top = offsetY - tooltipRect.height - 12;
    if (top < 8) top = offsetY + 12;

    chartTooltip.style.transform = `translate(${left - offsetX}px, ${top - offsetY}px)`;
  } else {
    state.hoverSeries = null;
    chartTooltip.style.display = "none";
    if (state.lastChart) drawChart(trendChart, state.lastChart.years, state.lastChart.series);
  }
}

function throttle(fn, wait) {
  let lastTime = 0;
  let timeout = null;
  return function (...args) {
    const now = Date.now();
    const remaining = wait - (now - lastTime);
    if (remaining <= 0) {
      lastTime = now;
      fn.apply(this, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastTime = Date.now();
        timeout = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

function parseValue(value) {
  if (value === null || value === undefined || value === "") return -Infinity;
  const numeric = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isNaN(numeric) ? -Infinity : numeric;
}

function formatValue(value, base, opts = {}) {
  const empty = opts.empty ?? "";
  if (value === null || value === undefined || value === "") return empty;
  const num =
    opts.numericInput === true
      ? Number(value)
      : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(num)) return String(value);

  const lower = (base || "").toLowerCase();
  if (
    lower.includes("percent") ||
    lower.includes("rate") ||
    lower.includes("yield")
  ) {
    return `${num}%`;
  }

  if (
    lower.includes("price") ||
    lower.includes("tuition") ||
    lower.includes("fees") ||
    lower.includes("aid") ||
    lower.includes("loans")
  ) {
    return `$${num.toLocaleString()}`;
  }

  return num.toLocaleString();
}

function colorForInstitution(name) {
  if (SCHOOL_COLORS[name]) return SCHOOL_COLORS[name];
  const index = Math.abs(hashString(name)) % FALLBACK_COLORS.length;
  return FALLBACK_COLORS[index];
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

function niceScale(min, max, maxTicks) {
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min * 0.1);
    return { min: min - pad, max: max + pad, step: pad, steps: 2 };
  }
  const range = niceNum(max - min, false);
  const step = niceNum(range / (maxTicks - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const steps = Math.round((niceMax - niceMin) / step);
  return { min: niceMin, max: niceMax, step, steps };
}

function niceNum(range, round) {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

function updateDefinition() {
  const base = state.selectedBase;
  const def = getDefinition(base);
  if (!base) return;
  definitionTitle.textContent = base;
  if (def) {
    definitionBody.textContent = def.text;
    definitionSource.textContent = def.source || "IPEDS definition";
  } else {
    definitionBody.textContent =
      "Definition not found in the current lookup set.";
    definitionSource.textContent = "IPEDS";
  }
}

function getDefinition(base) {
  if (!base) return null;
  const lower = base.toLowerCase();

  if (lower.startsWith("percent admitted")) {
    return {
      text:
        "IPEDS Admissions collects counts of applicants and admitted students (and admitted who enrolled) for first-time degree/certificate-seeking undergraduates. Percent admitted is derived from the applicant and admitted counts.",
      source: "IPEDS Admissions (ADM)",
    };
  }

  if (lower.startsWith("admissions yield")) {
    return {
      text:
        "IPEDS Admissions reports the number of admitted students who enrolled. Admissions yield is derived as the share of admitted students who enrolled.",
      source: "IPEDS Admissions (ADM)",
    };
  }

  if (lower.startsWith("full-time retention rate")) {
    return {
      text:
        "Full-time retention rate is the number of first-time, full-time degree/certificate-seeking undergraduates who enter in the fall and return to the same institution the following fall (full- or part-time), divided by the total entering cohort.",
      source: "IPEDS Data Feedback Report (Retention)",
    };
  }

  if (lower.startsWith("graduation rate - bachelor degree within")) {
    return {
      text:
        "Graduation Rates track first-time, full-time degree/certificate-seeking undergraduates and report completions within 150% of normal time; for bachelor’s programs this is typically 6 years. The 4- and 5-year rates reflect shorter completion windows.",
      source: "IPEDS Graduation Rates (GR)",
    };
  }

  if (lower.startsWith("total price for")) {
    return {
      text:
        "Total price (cost of attendance) is the sum of published tuition and required fees, books and supplies, and the weighted average of room, board, and other expenses. IPEDS reports totals by living arrangement (on campus, off campus with family, off campus not with family) and residency status.",
      source: "IPEDS Institutional Characteristics (IC)",
    };
  }

  if (lower.startsWith("average amount of pell grant aid")) {
    return {
      text:
        "Average Pell grant aid is calculated by dividing total Pell grant dollars awarded by the number of Pell recipients in the cohort.",
      source: "IPEDS Student Financial Aid (SFA)",
    };
  }

  if (lower.startsWith("average amount of student loans")) {
    return {
      text:
        "Average loan aid is calculated by dividing total loan dollars awarded by the number of loan recipients in the cohort.",
      source: "IPEDS Student Financial Aid (SFA)",
    };
  }

  return null;
}
