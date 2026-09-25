/*
 * GitHub contribution graph.
 *
 * Renders a year of contributions into #github-contributions.
 *
 * GitHub has no embeddable widget for this. The calendar lives behind their
 * GraphQL API, which needs an authenticated token we can't ship in a static
 * page, so we read it from a public proxy instead. Only public contributions
 * are counted unless private contribution visibility is enabled on the profile.
 */
(function () {
  const mount = document.getElementById("github-contributions");
  if (!mount) return;

  const user = mount.dataset.ghUser || "ccristil";
  const API = "https://github-contributions-api.jogruber.de/v4/" + user + "?y=last";
  const PROFILE = "https://github.com/" + user;

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  injectStyles();
  mount.innerHTML = '<p class="gh-note">Loading contributions…</p>';

  fetch(API)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(render)
    .catch(fail);

  /* The API returns ISO dates; `new Date("2026-03-04")` parses as UTC midnight,
     which formats as the previous day west of Greenwich. Build a local date. */
  function localDate(iso) {
    const p = iso.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function render(data) {
    const days = data.contributions || [];
    if (!days.length) return fail(new Error("no contributions returned"));

    // The feed starts on a Sunday, so a flat chunk of 7 is a calendar week.
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    mount.innerHTML = "";
    mount.classList.add("gh-root");

    const scroll = el("div", "gh-scroll");
    const cal = el("div", "gh-cal");

    // Weekday gutter. Only odd rows are labelled, the way GitHub does it.
    const gutter = el("div", "gh-days");
    ["", "Mon", "", "Wed", "", "Fri", ""].forEach(function (label) {
      const d = el("div", "gh-day-label");
      d.textContent = label;
      gutter.appendChild(d);
    });

    const body = el("div", "gh-body");
    body.appendChild(monthRow(weeks));

    const grid = el("div", "gh-grid");
    const frag = document.createDocumentFragment();
    days.forEach(function (day) {
      const cell = el("div", "gh-cell");
      cell.dataset.level = day.level;
      cell.dataset.label = describe(day);
      cell.setAttribute("role", "img");
      cell.setAttribute("aria-label", describe(day));
      frag.appendChild(cell);
    });
    grid.appendChild(frag);
    body.appendChild(grid);

    cal.appendChild(gutter);
    cal.appendChild(body);
    scroll.appendChild(cal);
    mount.appendChild(scroll);
    mount.appendChild(footer(data));

    attachTooltip(grid);
  }

  function monthRow(weeks) {
    const row = el("div", "gh-months");
    const marks = [];
    let prev = -1;

    weeks.forEach(function (week, i) {
      if (!week[0]) return;
      const month = localDate(week[0].date).getMonth();
      if (month !== prev) {
        marks.push({ col: i + 1, month: month });
        prev = month;
      }
    });

    // Skip a label when its month has too few columns to sit under.
    marks.forEach(function (mark, i) {
      const next = marks[i + 1];
      const span = (next ? next.col : weeks.length + 1) - mark.col;
      if (span < 3) return;
      const label = el("div", "gh-month");
      label.style.gridColumn = mark.col + " / span " + span;
      label.textContent = MONTHS[mark.month];
      row.appendChild(label);
    });

    return row;
  }

  function footer(data) {
    const bar = el("div", "gh-footer");

    const link = el("a", "gh-link");
    link.href = PROFILE;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "@" + user;

    const legend = el("div", "gh-legend");
    legend.appendChild(text("span", "Less"));
    for (let level = 0; level <= 4; level++) {
      const swatch = el("div", "gh-cell");
      swatch.dataset.level = level;
      legend.appendChild(swatch);
    }
    legend.appendChild(text("span", "More"));

    bar.appendChild(link);
    bar.appendChild(legend);
    return bar;
  }

  function describe(day) {
    const d = localDate(day.date);
    const when =
      WEEKDAYS[d.getDay()] +
      ", " +
      MONTHS[d.getMonth()] +
      " " +
      d.getDate() +
      ", " +
      d.getFullYear();
    const n = day.count === 1 ? "1 contribution" : day.count + " contributions";
    return n + " on " + when;
  }

  function attachTooltip(grid) {
    const tip = el("div", "gh-tip");
    mount.appendChild(tip);

    grid.addEventListener("mouseover", function (e) {
      const cell = e.target.closest(".gh-cell");
      if (!cell) return;
      tip.textContent = cell.dataset.label;
      tip.classList.add("is-on");

      const box = cell.getBoundingClientRect();
      const frame = mount.getBoundingClientRect();
      const left = box.left - frame.left + box.width / 2;
      tip.style.left = Math.max(0, Math.min(left, frame.width)) + "px";
      tip.style.top = box.top - frame.top - 8 + "px";
    });

    grid.addEventListener("mouseleave", function () {
      tip.classList.remove("is-on");
    });
  }

  function fail(err) {
    mount.innerHTML =
      '<p class="gh-note">Contribution data is unavailable right now — ' +
      '<a class="gh-link" href="' +
      PROFILE +
      '" target="_blank" rel="noopener noreferrer">see the graph on GitHub</a>.</p>';
    console.warn("GitHub contributions failed to load:", err);
  }

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function text(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  }

  function injectStyles() {
    const css = [
      ".gh-root{width:max-content;max-width:100%;margin-inline:auto}",
      ".gh-scroll{overflow-x:auto;padding-bottom:4px}",
      ".gh-cal{display:flex;gap:8px;min-width:max-content}",
      ".gh-days,.gh-grid{display:grid;grid-template-rows:repeat(7,12px);gap:3px}",
      ".gh-days{padding-top:20px}",
      ".gh-day-label{font-size:10px;line-height:12px;color:#9ca3af;padding-right:2px}",
      ".gh-grid{grid-auto-flow:column;grid-auto-columns:12px}",
      ".gh-months{display:grid;grid-auto-flow:column;grid-auto-columns:12px;gap:3px;height:20px}",
      ".gh-month{font-size:10px;color:#9ca3af}",
      ".gh-cell{width:12px;height:12px;border-radius:2px;background:rgba(255,255,255,.05);",
      "outline:1px solid rgba(255,255,255,.04);outline-offset:-1px}",
      '.gh-cell[data-level="1"]{background:#35245c}',
      '.gh-cell[data-level="2"]{background:#4e3391}',
      '.gh-cell[data-level="3"]{background:#6f42c1}',
      '.gh-cell[data-level="4"]{background:#a482ee}',
      ".gh-footer{display:flex;align-items:center;justify-content:space-between;",
      "gap:12px;margin-top:12px;font-size:11px;color:#9ca3af}",
      ".gh-legend{display:flex;align-items:center;gap:4px}",
      ".gh-link{color:#9ca3af;transition:color .2s ease}",
      ".gh-link:hover{color:#fff}",
      ".gh-note{font-size:13px;color:#9ca3af;margin:0}",
      ".gh-tip{position:absolute;transform:translate(-50%,-100%);pointer-events:none;",
      "opacity:0;transition:opacity .15s ease;background:rgba(17,17,20,.95);color:#e5e7eb;",
      "border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:4px 8px;",
      "font-size:11px;white-space:nowrap;z-index:20}",
      ".gh-tip.is-on{opacity:1}",
      "@media (prefers-reduced-motion:reduce){.gh-tip{transition:none}}"
    ].join("");

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
