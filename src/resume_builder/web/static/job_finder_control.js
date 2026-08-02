(function () {
  const PROVIDERS = [
    { id: "github", name: "GitHub", kind: "identity" },
    { id: "google", name: "Google", kind: "identity" },
    { id: "microsoft", name: "Microsoft", kind: "identity" },
    { id: "facebook", name: "Facebook", kind: "social" },
    { id: "linkedin", name: "LinkedIn", kind: "social" },
    { id: "indeed", name: "Indeed", kind: "job_site" },
  ];
  const ACTIONS = [
    ["captcha", "CAPTCHA"],
    ["human_verification", "Are you human?"],
    ["unknown_question", "Unknown questions"],
    ["sign_in", "Sign in required"],
    ["external_application", "External applications"],
    ["other", "Other manual work"],
  ];
  const preferenceKey = "jobFinder.disconnectPreference";
  const sessionsNode = document.querySelector("[data-sessions]");
  const automaticNode = document.querySelector("[data-automatic-list]");
  const interventionsNode = document.querySelector("[data-intervention-groups]");
  const toastNode = document.querySelector("[data-toast]");
  const livePagesNode = document.querySelector("[data-live-pages]");
  const goalItemsNode = document.querySelector("[data-goal-items]");
  const goalInterventionItemsNode = document.querySelector("[data-goal-intervention-items]");
  const resumeRoutesNode = document.querySelector("[data-resume-routes]");
  const disconnectDialog = document.querySelector("[data-disconnect-dialog]");
  const settingsDialog = document.querySelector("[data-settings-dialog]");
  let pendingDisconnect = "";
  let activeGoalId = "";
  let livePagesSignature = "";
  let toastTimer;
  const autoRecheckedAt = new Map();

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => selectTab(button.dataset.tab));
  });
  document.querySelector("[data-refresh]").addEventListener("click", refresh);
  document.querySelector("[data-goal-form]").addEventListener("submit", startGoal);
  document.querySelector("[data-resume-goal]").addEventListener("click", resumeGoal);
  document.querySelector("[data-cancel-goal]").addEventListener("click", cancelGoal);
  document.querySelector("[data-open-settings]").addEventListener("click", openSettings);
  document.querySelector("[data-disconnect-form]").addEventListener("submit", confirmDisconnect);
  document.querySelector("[data-disconnect-setting]").addEventListener("change", (event) => {
    const value = event.target.value;
    if (value === "ask") localStorage.removeItem(preferenceKey);
    else localStorage.setItem(preferenceKey, value);
    showToast("Disconnect preference updated.");
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });

  function selectTab(name) {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      const active = button.dataset.tab === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  async function refresh() {
    try {
      const response = await fetch("/api/job-finder/control-state", { cache: "no-store" });
      const state = await response.json();
      if (!response.ok) throw new Error(state.error || "Control state is unavailable.");
      render(state);
      const connection = document.querySelector("[data-connection]");
      connection.classList.add("online");
      connection.lastChild.textContent = " Connected";
    } catch (error) {
      const connection = document.querySelector("[data-connection]");
      connection.classList.remove("online");
      connection.lastChild.textContent = " Offline";
      showToast(error.message);
    }
  }

  function render(state) {
    const counts = state.counts || {};
    setText("[data-count-automatic]", counts.automatic || 0);
    setText("[data-count-interventions]", counts.interventions || 0);
    setText("[data-tab-automatic-count]", counts.automatic || 0);
    setText("[data-tab-intervention-count]", counts.interventions || 0);
    const goal = state.goal || {};
    activeGoalId = goal.id || "";
    setText("[data-goal-target]", goal.target || 0);
    setText("[data-count-confirmed]", goal.confirmed || 0);
    setText("[data-goal-remaining]", goal.remaining || 0);
    setText("[data-goal-reserved]", goal.reserved || 0);
    setText("[data-run-status]", String(goal.status || state.run?.status || "not started").replaceAll("_", " "));
    setText("[data-process-status]", goal.process?.running ? "Running" : "Stopped");
    setText("[data-goal-id]", goal.id ? `Goal ${goal.id} · ${goal.sites.join(", ")}` : "No active goal.");
    const siteSummary = Object.entries(goal.site_counts || {}).map(([site, counts]) =>
      `${site}: ${counts.confirmed} confirmed · ${counts.reserved} reserved · ${counts.human} human · ${counts.skipped} skipped`,
    ).join(" | ");
    setText("[data-site-counts]", siteSummary);
    setText(
      "[data-run-detail]",
      state.run?.error || state.run?.artifact || "No run artifact yet.",
    );
    renderSessions(state.sessions || {});
    renderResumeRoutes(state.resume_catalog || [], state.resume_artifact_directory || "");
    renderAutomatic(state.automatic || []);
    renderInterventions(state.interventions || []);
    autoRecheck(state.interventions || []);
    renderLivePages(state.live_pages || []);
    const goalItems = state.goal_items || [];
    renderGoalItems(
      goalItemsNode,
      goalItems.filter((item) => !["reserved", "human_handoff"].includes(item.state)),
      goal,
    );
    renderGoalItems(
      goalInterventionItemsNode,
      goalItems.filter((item) => ["reserved", "human_handoff"].includes(item.state)),
      goal,
    );
  }

  async function startGoal(event) {
    event.preventDefault();
    const target = Number(document.querySelector("[data-goal-input]").value);
    const targetCountries = [...document.querySelectorAll("[data-country]:checked")].map((node) => node.value);
    if (!targetCountries.length) {
      showToast("Select at least one target country.");
      return;
    }
    try {
      await postJSON("/api/job-finder/goals", {
        target,
        target_countries: targetCountries,
        work_mode: "remote",
        employment_type: "contract",
      });
      showToast(`Started a goal for ${target} confirmed applications.`);
      refresh();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function resumeGoal() {
    const id = currentGoalId();
    if (!id) return showToast("No goal is available to resume.");
    try {
      await post(`/api/job-finder/goals/${encodeURIComponent(id)}/resume`);
      showToast("Goal runner resumed.");
      refresh();
    } catch (error) { showToast(error.message); }
  }

  async function cancelGoal() {
    const id = currentGoalId();
    if (!id) return showToast("No goal is available to cancel.");
    try {
      await post(`/api/job-finder/goals/${encodeURIComponent(id)}/cancel`);
      showToast("Owned automation process tree stopped.");
      refresh();
    } catch (error) { showToast(error.message); }
  }

  function currentGoalId() {
    return activeGoalId;
  }

  function providerState(provider, sessions) {
    if (provider.kind === "identity") return sessions.identity?.[provider.id] || {};
    if (provider.kind === "social") return sessions.social?.[provider.id] || {};
    return sessions.job_sites?.[provider.id] || {};
  }

  function renderSessions(sessions) {
    sessionsNode.replaceChildren(...PROVIDERS.map((provider) => {
      const state = providerState(provider, sessions);
      const configured = sessions.oauth_setup?.[provider.id]?.configured !== false;
      const connected = Boolean(state.connected);
      const card = element("article", "session-card");
      const meta = element("div", "session-meta");
      const heading = element("div");
      heading.append(element("h3", "", provider.name));
      const description = connected
        ? provider.kind === "identity"
          ? state.profile?.email || state.profile?.display_name || "Connected"
          : state.status || "Reusable session ready"
        : configured ? "Not connected" : "OAuth setup required";
      heading.append(element("p", "", description));
      meta.append(heading, element("span", `pill ${connected ? "connected" : ""}`, connected ? "Connected" : "Signed out"));
      const actions = element("div", "session-actions");
      const signIn = element("button", "button", "Sign in");
      signIn.type = "button";
      signIn.disabled = provider.kind === "identity" && !configured;
      signIn.addEventListener("click", () => signInProvider(provider));
      const disconnect = element("button", "button ghost", "Sign out / Disconnect");
      disconnect.type = "button";
      disconnect.addEventListener("click", () => requestDisconnect(provider));
      actions.append(signIn, disconnect);
      card.append(meta, actions);
      return card;
    }));
  }

  async function signInProvider(provider) {
    if (provider.kind === "identity") {
      window.open(`/auth/${provider.id}/start`, "_blank", "noopener");
      showToast(`${provider.name} OAuth opened in a separate tab.`);
      return;
    }
    const url = provider.kind === "social"
      ? `/api/social-login/${provider.id}`
      : `/api/job-finder/sessions/${provider.id}/sign-in`;
    try {
      await post(url);
      showToast(`${provider.name} sign-in opened in the visible browser.`);
      window.setTimeout(refresh, 1500);
    } catch (error) {
      showToast(error.message);
    }
  }

  function requestDisconnect(provider) {
    const preference = localStorage.getItem(preferenceKey);
    if (preference === "local" || preference === "website") {
      runDisconnect(provider, preference === "website");
      return;
    }
    pendingDisconnect = provider.id;
    document.querySelector("[data-disconnect-name]").textContent = provider.name;
    document.querySelector("[data-remember-disconnect]").checked = false;
    disconnectDialog.showModal();
  }

  function confirmDisconnect(event) {
    const submitter = event.submitter;
    if (!submitter || submitter.value !== "confirm" || !pendingDisconnect) return;
    event.preventDefault();
    const mode = new FormData(event.currentTarget).get("disconnect-mode") || "local";
    if (document.querySelector("[data-remember-disconnect]").checked) {
      localStorage.setItem(preferenceKey, mode);
    }
    const provider = PROVIDERS.find((item) => item.id === pendingDisconnect);
    pendingDisconnect = "";
    disconnectDialog.close();
    runDisconnect(provider, mode === "website");
  }

  async function runDisconnect(provider, websiteLogout) {
    if (!provider) return;
    try {
      await post(`/api/job-finder/sessions/${provider.id}/disconnect?website_logout=${websiteLogout}`);
      showToast(`${provider.name} disconnected${websiteLogout ? "; logout page opened" : ""}.`);
      refresh();
    } catch (error) {
      showToast(error.message);
    }
  }

  function openSettings() {
    document.querySelector("[data-disconnect-setting]").value = localStorage.getItem(preferenceKey) || "ask";
    settingsDialog.showModal();
  }

  function renderAutomatic(items) {
    if (!items.length) {
      automaticNode.replaceChildren(element("div", "empty", "No automatic work is active."));
      return;
    }
    automaticNode.replaceChildren(...items.map((item) => {
      const card = element("article", "work-card");
      const title = element("div");
      title.append(element("h3", "", item.job_title || "Untitled job"));
      title.append(element("p", "", `${item.company || "Unknown company"} · ${item.site}`));
      appendResumeTag(title, item.resume_file);
      card.append(title, element("span", `pill ${item.status}`, item.status.replaceAll("_", " ")));
      card.append(element("p", "detail", item.detail || "Working."));
      return card;
    }));
  }

  function renderResumeRoutes(items, directory) {
    setText("[data-resume-directory]", directory || "No artifact directory configured.");
    if (!items.length) {
      resumeRoutesNode.replaceChildren(element("div", "empty", "No generated resume artifacts found."));
      return;
    }
    resumeRoutesNode.replaceChildren(...items.map((item) => {
      const card = element("article", "resume-route-card");
      const heading = element("div", "resume-route-heading");
      heading.append(element("h3", "", item.label || item.filename));
      const state = item.artifact_ready && item.routing_ready ? "ready" : "needs setup";
      heading.append(element("span", `pill ${state === "ready" ? "submitted" : "failed"}`, state));
      card.append(heading, element("p", "resume-filename", item.filename));
      card.append(element(
        "p",
        "detail",
        item.terms?.length ? `Search matches: ${item.terms.join(" · ")}` : "No search terms configured; this resume will not be selected automatically.",
      ));
      if (item.is_default) card.append(element("span", "pill queued", "default fallback"));
      return card;
    }));
  }

  function appendResumeTag(node, filename) {
    if (!filename) return;
    node.append(element("p", "resume-tag", `Resume to use: ${filename}`));
  }

  function renderInterventions(items) {
    if (!items.length) {
      interventionsNode.replaceChildren(element("div", "empty", "Nothing needs human intervention."));
      return;
    }
    const groups = ACTIONS.map(([action, label]) => {
      const actionItems = items.filter((item) => item.action === action);
      if (!actionItems.length) return null;
      const section = element("section", "action-group");
      const heading = element("div", "action-heading");
      heading.append(element("h3", "", label), element("span", "", actionItems.length));
      section.append(heading);
      [...new Set(actionItems.map((item) => item.site))].forEach((site) => {
        const siteGroup = element("div", "site-group");
        siteGroup.append(element("h4", "site-heading", site));
        actionItems.filter((item) => item.site === site).forEach((item) => siteGroup.append(interventionCard(item)));
        section.append(siteGroup);
      });
      return section;
    }).filter(Boolean);
    interventionsNode.replaceChildren(...groups);
  }

  function renderLivePages(items) {
    const signature = JSON.stringify(items.map((item) => [
      item.target_id, item.group, item.action, item.status, item.title, item.safe_path,
    ]));
    if (signature === livePagesSignature) return;
    livePagesSignature = signature;
    if (!items.length) {
      livePagesNode.replaceChildren(element("div", "empty", "No registered Indeed pages are open."));
      return;
    }
    const groups = ["automatic", "human_intervention"].map((group) => {
      const matching = items.filter((item) => item.group === group);
      if (!matching.length) return null;
      const section = element("section", "live-group");
      section.append(element("h3", "live-group-title", group === "automatic" ? "Automatic work" : "Human intervention"));
      const grid = element("div", "preview-grid");
      matching.forEach((item) => grid.append(liveCard(item)));
      section.append(grid);
      return section;
    }).filter(Boolean);
    livePagesNode.replaceChildren(...groups);
  }

  function liveCard(item) {
    const card = element("article", "preview-card");
    const image = document.createElement("img");
    image.alt = `Live preview: ${item.title || item.site}`;
    image.loading = "lazy";
    image.dataset.previewUrl = item.preview_url;
    image.src = `${item.preview_url}?revision=${Date.now()}`;
    image.addEventListener("click", () => focusTarget(item.target_id));
    const body = element("div", "preview-body");
    body.append(element("h3", "", item.application_reference || item.title || "Indeed page"));
    body.append(element("p", "", `${item.site} · ${item.safe_path}`));
    body.append(element("span", `pill ${item.status}`, String(item.action || item.status).replaceAll("_", " ")));
    if (item.question_labels?.length) {
      body.append(element("p", "detail", item.question_labels.join(" · ")));
    }
    const focus = element("button", "button ghost", "Open / Focus tab");
    focus.type = "button";
    focus.addEventListener("click", () => focusTarget(item.target_id));
    body.append(focus);
    card.append(image, body);
    return card;
  }

  async function focusTarget(targetId) {
    try {
      await post(`/api/job-finder/targets/${encodeURIComponent(targetId)}/focus`);
      showToast("Browser tab focused.");
    } catch (error) { showToast(error.message); }
  }

  function renderGoalItems(node, items, goal) {
    if (!items.length) {
      node.replaceChildren();
      return;
    }
    node.replaceChildren(...items.map((item) => {
      const card = element("article", "work-card goal-item");
      const body = element("div");
      body.append(element("h3", "", item.job_title));
      body.append(element("p", "", `${item.company} · ${item.site}`));
      appendResumeTag(body, item.resume_file);
      body.append(element("p", "detail", item.detail || "Goal item updated."));
      const badge = element("span", `pill ${item.state}`, item.state.replaceAll("_", " "));
      card.append(body, badge);
      if (item.state === "reserved") {
        const actions = element("div", "work-actions");
        const confirm = element("button", "button", "Confirm submitted");
        confirm.type = "button";
        confirm.addEventListener("click", () => goalItemAction(goal.id, item.task_id, "confirm"));
        const release = element("button", "button ghost", "Abandon / Release token");
        release.type = "button";
        release.addEventListener("click", () => goalItemAction(goal.id, item.task_id, "release"));
        actions.append(confirm, release);
        card.append(actions);
      }
      return card;
    }));
  }

  async function goalItemAction(goalId, taskId, action) {
    try {
      await post(`/api/job-finder/goals/${encodeURIComponent(goalId)}/items/${encodeURIComponent(taskId)}/${action}`);
      showToast(action === "confirm" ? "Submission confirmed; quota decremented." : "Token released.");
      refresh();
    } catch (error) { showToast(error.message); }
  }

  function interventionCard(item) {
    const card = element("article", "work-card");
    const body = element("div");
    body.append(element("h3", "", item.application_reference || "Application"));
    body.append(element("p", "", item.instruction || item.reason));
    appendResumeTag(body, item.resume_file);
    if (item.question_labels?.length) {
      const list = element("ul", "question-list");
      item.question_labels.forEach((label) => list.append(element("li", "", label)));
      body.append(list);
    }
    const actions = element("div", "work-actions");
    const focus = element("button", "button", "Open / Focus tab");
    focus.type = "button";
    focus.disabled = !item.can_focus;
    focus.addEventListener("click", () => interventionAction(item.id, "focus"));
    const recheck = element("button", "button ghost", "Recheck");
    recheck.type = "button";
    recheck.disabled = !item.can_focus;
    recheck.addEventListener("click", () => interventionAction(item.id, "recheck"));
    actions.append(focus, recheck);
    card.append(body, actions);
    return card;
  }

  function autoRecheck(items) {
    const now = Date.now();
    items.filter((item) => item.can_focus && ["captcha", "human_verification", "sign_in", "unknown_question"].includes(item.action))
      .forEach((item) => {
        const previous = autoRecheckedAt.get(item.id) || 0;
        if (now - previous < 10000) return;
        autoRecheckedAt.set(item.id, now);
        post(`/api/job-finder/interventions/${encodeURIComponent(item.id)}/recheck`)
          .then((result) => { if (result.resolved) refresh(); })
          .catch(() => {});
      });
  }

  async function interventionAction(id, action) {
    try {
      const result = await post(`/api/job-finder/interventions/${encodeURIComponent(id)}/${action}`);
      showToast(action === "focus" ? "Browser tab focused." : result.reason || "Intervention rechecked.");
      window.setTimeout(refresh, 600);
    } catch (error) {
      showToast(error.message);
    }
  }

  async function post(url) {
    const response = await fetch(url, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  async function postJSON(url, value) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = text;
    return node;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toastNode.textContent = message;
    toastNode.classList.add("show");
    toastTimer = window.setTimeout(() => toastNode.classList.remove("show"), 3500);
  }

  refresh();
  window.setInterval(() => {
    if (!document.hidden) refresh();
  }, 2000);
  window.setInterval(() => {
    if (document.hidden) return;
    document.querySelectorAll("img[data-preview-url]").forEach((image) => {
      image.src = `${image.dataset.previewUrl}?revision=${Date.now()}`;
    });
  }, 15000);
})();
