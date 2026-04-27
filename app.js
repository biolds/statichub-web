(function () {
  "use strict";

  const DATA_URL = "https://biolds.github.io/statichub-pkg/staticweb.json";
  const FALLBACK_URL = "./staticweb.json";
  const PKG_BASE_URL = "https://biolds.github.io/statichub-pkg/packages/";

  // ─── State ────────────────────────────────────────────────

  const state = {
    packages: [],   // normalized packages
    query: "",
    sort: "alpha",  // "alpha" | "stars"
    loaded: false,
    error: null,
  };

  // ─── Theme ────────────────────────────────────────────────

  const themeToggle = document.getElementById("theme-toggle");

  function currentTheme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    if (theme === "light") {
      document.documentElement.dataset.theme = "light";
      themeToggle.setAttribute("aria-label", "Switch to dark mode");
    } else {
      delete document.documentElement.dataset.theme;
      themeToggle.setAttribute("aria-label", "Switch to light mode");
    }
    localStorage.setItem("theme", theme);
  }

  themeToggle.addEventListener("click", function () {
    applyTheme(currentTheme() === "light" ? "dark" : "light");
  });

  if (currentTheme() === "light") {
    themeToggle.setAttribute("aria-label", "Switch to dark mode");
  }

  // ─── Data loading ─────────────────────────────────────────

  async function loadData() {
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (_) {
      const fallback = await fetch(FALLBACK_URL);
      if (!fallback.ok) throw new Error(`HTTP ${fallback.status}`);
      return fallback.json();
    }
  }

  function normalizePackage(entry) {
    const path = `${entry?.path ?? ""}`.trim();
    const title = `${entry?.title ?? path}`.trim() || path;
    const description = `${entry?.description ?? ""}`.trim();
    const version = `${entry?.version ?? ""}`.trim();
    const license = `${entry?.license ?? ""}`.trim();
    const homepage = `${entry?.homepage ?? ""}`.trim();
    const liveUrl = `${entry?.live_url ?? ""}`.trim();
    const tags = Array.isArray(entry?.tags)
      ? entry.tags.map((t) => `${t}`.trim()).filter(Boolean)
      : [];
    const stars = typeof entry?.stars === "number" ? entry.stars : null;
    const source = entry?.source && typeof entry.source === "object" ? entry.source : null;

    const repoUrl = resolveRepoUrl(source);
    const icon = entry?.icon ? `${entry.icon}`.trim() : null;

    return {
      path,
      title,
      description,
      version,
      license,
      homepage,
      liveUrl,
      tags,
      stars,
      source,
      repoUrl,
      icon,
      searchIndex: [title, description, path, tags.join(" ")].join(" ").toLowerCase(),
    };
  }

  function resolveRepoUrl(source) {
    if (!source) return "";
    if (source.type === "github_release" && source.repo) {
      return `https://github.com/${source.repo}`;
    }
    if (source.type === "gitlab_release" && source.repo) {
      return `https://gitlab.com/${source.repo}`;
    }
    if (source.url) return source.url;
    return "";
  }

  function formatStars(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return `${n}`;
  }

  // ─── Copy to clipboard ────────────────────────────────────

  function attachCopyButton(btn) {
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      const text = btn.dataset.copy || btn.closest("[data-copy]")?.dataset.copy || "";
      navigator.clipboard.writeText(text).then(function () {
        const label = btn.querySelector(".copy-label");
        if (label) {
          const original = label.textContent;
          label.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(function () {
            label.textContent = original;
            btn.classList.remove("copied");
          }, 1800);
        }
      }).catch(function () {
        // silently ignore clipboard denial
      });
    });
  }

  // ─── Monogram icon ────────────────────────────────────────

  function createMonogram(title) {
    const el = document.createElement("div");
    el.className = "monogram";
    const letters = title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
    el.textContent = letters || "SH";
    return el;
  }

  function createIcon(pkg) {
    if (!pkg.icon) return createMonogram(pkg.title);
    const img = document.createElement("img");
    img.src = `${PKG_BASE_URL}${pkg.path}/${pkg.icon}`;
    img.alt = pkg.title;
    return img;
  }

  // ─── Sorting ──────────────────────────────────────────────

  function sortPackages(packages, sort) {
    const list = packages.slice();
    if (sort === "stars") {
      list.sort(function (a, b) {
        const sa = a.stars ?? -1;
        const sb = b.stars ?? -1;
        if (sb !== sa) return sb - sa;
        return a.title.localeCompare(b.title);
      });
    } else {
      list.sort(function (a, b) {
        return a.title.localeCompare(b.title);
      });
    }
    return list;
  }

  // ─── Catalog rendering ────────────────────────────────────

  function renderCatalog() {
    const main = document.getElementById("main");
    const template = document.getElementById("view-catalog");
    main.replaceChildren(template.content.cloneNode(true));

    updateNavActive("catalog");

    const searchInput = document.getElementById("search-input");
    const statusCopy = document.getElementById("status-copy");
    const statusMeta = document.getElementById("status-meta");
    const cardGrid = document.getElementById("card-grid");
    const sortBtns = main.querySelectorAll(".sort-btn");

    searchInput.value = state.query;

    sortBtns.forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.dataset.sort === state.sort ? "true" : "false");
      btn.classList.toggle("active", btn.dataset.sort === state.sort);
      btn.addEventListener("click", function () {
        state.sort = btn.dataset.sort;
        sortBtns.forEach(function (b) {
          b.classList.toggle("active", b.dataset.sort === state.sort);
          b.setAttribute("aria-pressed", b.dataset.sort === state.sort ? "true" : "false");
        });
        updateGrid(cardGrid, statusCopy, statusMeta);
      });
    });

    searchInput.addEventListener("input", function (event) {
      state.query = event.currentTarget.value;
      updateGrid(cardGrid, statusCopy, statusMeta);
    });

    if (!state.loaded && !state.error) {
      statusCopy.textContent = "Loading packages…";
      statusMeta.textContent = "";
      loadData().then(function (payload) {
        const raw = Array.isArray(payload?.packages) ? payload.packages : [];
        state.packages = raw.map(normalizePackage).filter((p) => p.path);
        state.loaded = true;
        updateGrid(cardGrid, statusCopy, statusMeta);
      }).catch(function (err) {
        state.error = err instanceof Error ? err.message : "Unknown error";
        statusCopy.textContent = "The package catalog could not be loaded.";
        statusMeta.textContent = state.error;
        renderMessage(cardGrid, "Catalog unavailable", `StaticHub could not fetch ${DATA_URL}. Check your internet connection.`);
      });
    } else if (state.error) {
      statusCopy.textContent = "The package catalog could not be loaded.";
      statusMeta.textContent = state.error;
      renderMessage(cardGrid, "Catalog unavailable", `StaticHub could not fetch ${DATA_URL}. Check your internet connection.`);
    } else {
      updateGrid(cardGrid, statusCopy, statusMeta);
    }
  }

  function updateGrid(cardGrid, statusCopy, statusMeta) {
    const query = state.query.trim().toLowerCase();
    const filtered = query
      ? state.packages.filter((p) => p.searchIndex.includes(query))
      : state.packages;
    const sorted = sortPackages(filtered, state.sort);

    statusCopy.textContent = "";
    statusMeta.textContent = "";

    if (state.packages.length === 0) {
      statusCopy.textContent = "No packages found in the catalog.";
      renderMessage(cardGrid, "Empty catalog", "The catalog loaded but contained no packages.");
      return;
    }

    if (sorted.length === 0) {
      statusCopy.textContent = "No packages match your search.";
      statusMeta.textContent = `Query: ${state.query}`;
      renderMessage(cardGrid, "No matches", "Try a different term or browse by tag.");
      return;
    }

    renderCards(cardGrid, sorted);
  }

  function renderMessage(container, title, body) {
    const article = document.createElement("article");
    article.className = "message-card";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const p = document.createElement("p");
    p.textContent = body;
    article.append(strong, p);
    container.replaceChildren(article);
  }

  function renderCards(container, packages) {
    const cardTemplate = document.getElementById("card-template");
    const fragment = document.createDocumentFragment();

    for (const pkg of packages) {
      const card = cardTemplate.content.firstElementChild.cloneNode(true);

      card.querySelector(".card-title").textContent = pkg.title;
      card.querySelector(".card-path").textContent = pkg.path;
      card.querySelector(".card-description").textContent = pkg.description || "No description available.";
      card.querySelector(".card-version").textContent = pkg.version ? `v${pkg.version.replace(/^v/, "")}` : "";

      const starsSlot = card.querySelector(".card-stars");
      if (pkg.stars !== null && pkg.repoUrl) {
        starsSlot.replaceWith(createStarBadge(pkg.stars, pkg.repoUrl));
      } else {
        starsSlot.remove();
      }

      const tagsContainer = card.querySelector(".card-tags");
      if (pkg.tags.length === 0) {
        tagsContainer.remove();
      } else {
        for (const tag of pkg.tags) {
          const pill = document.createElement("span");
          pill.className = "tag";
          pill.textContent = tag;
          pill.addEventListener("click", function (event) {
            event.stopPropagation();
            state.query = tag;
            location.hash = "#catalog";
          });
          tagsContainer.append(pill);
        }
      }

      const iconSlot = card.querySelector(".icon-slot");
      iconSlot.append(createIcon(pkg));

      card.addEventListener("click", function () {
        location.hash = `#pkg/${pkg.path}`;
      });
      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          location.hash = `#pkg/${pkg.path}`;
        }
      });

      fragment.append(card);
    }

    container.replaceChildren(fragment);
  }

  function createStarBadge(stars, repoUrl) {
    const a = document.createElement("a");
    a.className = "star-badge";
    a.href = repoUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", `${stars} stars on repository`);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z");
    svg.append(path);

    const span = document.createElement("span");
    span.textContent = formatStars(stars);

    a.append(svg, span);
    return a;
  }

  // ─── Detail rendering ─────────────────────────────────────

  function renderDetail(pkgPath) {
    const main = document.getElementById("main");

    if (!state.loaded && !state.error) {
      main.replaceChildren();
      const loading = document.createElement("p");
      loading.className = "status-copy";
      loading.style.padding = "40px 0";
      loading.textContent = "Loading…";
      main.append(loading);

      loadData().then(function (payload) {
        const raw = Array.isArray(payload?.packages) ? payload.packages : [];
        state.packages = raw.map(normalizePackage).filter((p) => p.path);
        state.loaded = true;
        renderDetail(pkgPath);
      }).catch(function (err) {
        state.error = err instanceof Error ? err.message : "Unknown error";
        renderDetail(pkgPath);
      });
      return;
    }

    if (state.error) {
      main.replaceChildren();
      const err = document.createElement("p");
      err.textContent = `Could not load package data: ${state.error}`;
      err.style.padding = "40px 0";
      main.append(err);
      return;
    }

    const pkg = state.packages.find((p) => p.path === pkgPath);

    if (!pkg) {
      main.replaceChildren();
      const msg = document.createElement("p");
      msg.textContent = `Package "${pkgPath}" not found.`;
      msg.style.padding = "40px 0";
      main.append(msg);
      return;
    }

    updateNavActive(null);

    const template = document.getElementById("view-detail");
    main.replaceChildren(template.content.cloneNode(true));

    main.querySelector(".detail-title").textContent = pkg.title;
    main.querySelector(".detail-path").textContent = pkg.path;
    main.querySelector(".detail-description").textContent = pkg.description || "";

    // Icon
    const iconSlot = main.querySelector(".icon-slot.large");
    iconSlot.append(createIcon(pkg));

    // Badges (stars)
    const badges = main.querySelector(".detail-badges");
    if (pkg.stars !== null && pkg.repoUrl) {
      badges.append(createStarBadge(pkg.stars, pkg.repoUrl));
    }

    // Tags
    const tagsContainer = main.querySelector(".detail-tags");
    for (const tag of pkg.tags) {
      const pill = document.createElement("span");
      pill.className = "tag";
      pill.textContent = tag;
      pill.addEventListener("click", function () {
        state.query = tag;
        location.hash = "#catalog";
      });
      tagsContainer.append(pill);
    }

    // Install command
    const installCmd = `statichub install ${pkg.path}`;
    const cmdEl = main.querySelector(".detail-install-cmd");
    cmdEl.textContent = installCmd;
    const copyBtn = main.querySelector(".detail-copy-btn");
    copyBtn.dataset.copy = installCmd;
    attachCopyButton(copyBtn);

    // Meta table
    const dl = main.querySelector(".detail-meta");
    const metaFields = [
      ["Version", pkg.version],
      ["License", pkg.license],
      ["Source type", pkg.source?.type ?? ""],
    ].filter(([, v]) => v);

    for (const [label, value] of metaFields) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      dl.append(dt, dd);
    }

    // Links
    const linksContainer = main.querySelector(".detail-links");
    const linkDefs = [
      ["Homepage", pkg.homepage],
      ["Live demo", pkg.liveUrl],
      ["Source repository", pkg.repoUrl],
    ].filter(([, url]) => url);

    for (const [label, url] of linkDefs) {
      const a = document.createElement("a");
      a.className = "detail-link-btn";
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = label;
      linksContainer.append(a);
    }

    // Attach homepage copy buttons
    main.querySelectorAll(".copy-btn[data-copy]").forEach(attachCopyButton);
  }

  // ─── Home rendering ───────────────────────────────────────

  function renderHome() {
    const main = document.getElementById("main");
    const template = document.getElementById("view-home");
    main.replaceChildren(template.content.cloneNode(true));
    updateNavActive("home");
    main.querySelectorAll(".copy-btn[data-copy]").forEach(attachCopyButton);
  }

  // ─── Navigation helpers ───────────────────────────────────

  function updateNavActive(view) {
    const catalogLink = document.getElementById("nav-catalog");
    catalogLink.classList.toggle("active", view === "catalog");
  }

  // ─── Hash router ──────────────────────────────────────────

  function parseRoute(hash) {
    const h = (hash || "").replace(/^#/, "");
    if (!h || h === "home") return { view: "home" };
    if (h === "catalog") return { view: "catalog" };
    const pkgMatch = h.match(/^pkg\/(.+)$/);
    if (pkgMatch) return { view: "detail", path: pkgMatch[1] };
    return { view: "home" };
  }

  function handleRoute() {
    const route = parseRoute(location.hash);
    if (route.view === "home") {
      renderHome();
    } else if (route.view === "catalog") {
      renderCatalog();
    } else if (route.view === "detail") {
      renderDetail(route.path);
    }
  }

  window.addEventListener("hashchange", handleRoute);

  // ─── Boot ─────────────────────────────────────────────────

  if (!location.hash || location.hash === "#") {
    location.replace("#home");
  } else {
    handleRoute();
  }
})();
