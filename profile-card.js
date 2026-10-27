/* MineDM profile cards: browser-only demo interaction */
(() => {
  const styleLink = document.querySelector('link[href="/profile-card.css"]');
  if (!styleLink) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/profile-card.css";
    document.head.appendChild(link);
  }

  const initials = (name) => String(name || "?").trim().split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "?";
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const statusFrom = (element) => {
    const avatar = element?.closest(".avatar");
    if (avatar?.querySelector("i.online") || avatar?.querySelector(".presence.online")) return "online";
    const presence = element?.closest(".dm-item")?.querySelector(".presence");
    if (presence) {
      if (presence.title === "Idle") return "idle";
      if (presence.title === "Do not disturb") return "do not disturb";
      if (presence.title === "Offline") return "offline";
      if (presence.title === "Online") return "online";
    }
    const label = element?.closest(".friend-card")?.querySelector(".friend-info small")?.textContent || "";
    if (/online/i.test(label)) return "online";
    return "offline";
  };

  const card = document.createElement("section");
  card.className = "profile-card";
  card.hidden = true;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "User profile");
  card.innerHTML = `
    <div class="profile-banner"><button class="profile-close" type="button" aria-label="Close profile card">×</button></div>
    <div class="profile-main">
      <div class="profile-topline">
        <div class="profile-avatar-wrap"><div class="profile-avatar" data-profile-avatar>?</div></div>
        <div class="profile-status" data-status="offline"><span class="profile-status-dot"></span><span data-profile-status>Offline</span></div>
      </div>
      <div class="profile-identity">
        <div class="profile-name-line"><h2 class="profile-name" data-profile-name>User</h2><span class="profile-badge" aria-label="MineDM community member" title="MineDM community member">✦</span></div>
        <div class="profile-handle" data-profile-handle>@user · MineDM member</div>
      </div>
      <div class="profile-divider"></div>
      <section><h3 class="profile-section-label">About me</h3><p class="profile-about">Minecraft player and builder. Here to chat, share builds, and meet the community.</p></section>
      <div class="profile-divider"></div>
      <section><h3 class="profile-section-label">Member</h3><div class="profile-member"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><span>MineDM community</span></div></section>
      <div class="profile-divider"></div>
      <section><h3 class="profile-section-label">Mutual spaces</h3><div class="profile-mutuals"><span class="profile-mutual-dot">M</span><span class="profile-mutual-dot">C</span><span class="profile-mutual-dot">D</span><span class="profile-mutual-caption">MineDM demo spaces</span></div></section>
      <div class="profile-actions">
        <button class="profile-message" type="button" data-action="message"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>Message</button>
        <div class="profile-more-wrap">
          <button class="profile-more" type="button" aria-label="More profile actions" aria-haspopup="true" aria-expanded="false" aria-controls="profile-card-menu">•••</button>
          <div class="profile-menu" id="profile-card-menu" role="menu" aria-hidden="true" hidden inert>
            <button type="button" role="menuitem" data-action="copy-id">Copy profile ID</button>
            <button type="button" role="menuitem" data-action="add-note">Add a note</button>
            <button type="button" role="menuitem" data-action="invite">Invite to a server</button>
            <button type="button" role="menuitem" data-action="block">Block user (demo)</button>
            <button type="button" role="menuitem" data-action="report">Report user (demo)</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(card);

  const toast = document.createElement("div");
  toast.className = "profile-toast";
  toast.hidden = true;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  document.body.appendChild(toast);

  const nameEl = card.querySelector("[data-profile-name]");
  const avatarEl = card.querySelector("[data-profile-avatar]");
  const handleEl = card.querySelector("[data-profile-handle]");
  const statusEl = card.querySelector(".profile-status");
  const statusText = card.querySelector("[data-profile-status]");
  const moreButton = card.querySelector(".profile-more");
  const menu = card.querySelector(".profile-menu");
  let activeName = "";
  let toastTimer;
  let menuOpen = false;

  const notify = (message) => {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2400);
  };
  const closeMenu = (returnFocus = false) => {
    menuOpen = false;
    menu.hidden = true;
    menu.inert = true;
    menu.setAttribute("aria-hidden", "true");
    moreButton.setAttribute("aria-expanded", "false");
    if (returnFocus) moreButton.focus();
  };
  const closeCard = () => {
    closeMenu();
    card.hidden = true;
    document.querySelectorAll(".profile-trigger").forEach(el => el.classList.remove("profile-trigger"));
  };
  const positionCard = (anchor) => {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    const height = Math.min(card.offsetHeight || 500, window.innerHeight - 24);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    let top = rect.bottom + 10;
    if (top + height > window.innerHeight - 12) top = rect.top - height - 10;
    top = Math.max(12, Math.min(top, window.innerHeight - height - 12));
    card.style.left = left + "px";
    card.style.top = top + "px";
  };
  const openCard = (anchor, name) => {
    activeName = String(name || "User").trim().slice(0, 48);
    const status = statusFrom(anchor);
    nameEl.textContent = activeName;
    avatarEl.textContent = initials(activeName);
    handleEl.textContent = "@" + activeName.replace(/\s+/g, "").toLowerCase() + " · MineDM member";
    statusEl.dataset.status = status;
    statusText.textContent = status === "do not disturb" ? "Do not disturb" : status[0].toUpperCase() + status.slice(1);
    card.hidden = false;
    closeMenu();
    document.querySelectorAll(".profile-trigger").forEach(el => el.classList.remove("profile-trigger"));
    anchor.classList.add("profile-trigger");
    requestAnimationFrame(() => positionCard(anchor));
  };

  const getClickableName = (target) => {
    const avatar = target.closest(".avatar");
    if (avatar) {
      const row = avatar.closest(".message-row, .dm-item, .friend-card, .user-bar");
      if (row?.classList.contains("message-row")) return { anchor: avatar, name: row.querySelector(".message-meta strong")?.textContent || avatar.textContent.trim() };
      if (row?.classList.contains("dm-item")) return { anchor: avatar, name: row.querySelector(".dm-label strong")?.textContent || avatar.textContent.trim() };
      if (row?.classList.contains("friend-card")) return { anchor: avatar, name: row.querySelector(".friend-info strong")?.textContent || avatar.textContent.trim() };
      if (row?.classList.contains("user-bar")) return { anchor: avatar, name: row.querySelector(".user-label strong")?.textContent || avatar.textContent.trim() };
    }
    const messageName = target.closest(".message-meta strong");
    if (messageName) return { anchor: messageName, name: messageName.textContent.trim() };
    const friendName = target.closest(".friend-info strong");
    if (friendName) return { anchor: friendName, name: friendName.textContent.trim() };
    const dmName = target.closest(".dm-label strong");
    if (dmName) return { anchor: dmName, name: dmName.textContent.trim() };
    const userName = target.closest(".user-label strong");
    if (userName) return { anchor: userName, name: userName.textContent.trim() };
    return null;
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (card.contains(target)) return;
    const clicked = getClickableName(target);
    if (clicked) {
      event.preventDefault();
      event.stopPropagation();
      if (!card.hidden && activeName.toLowerCase() === clicked.name.toLowerCase() && card.contains(document.activeElement)) {
        closeCard();
      } else {
        openCard(clicked.anchor, clicked.name);
      }
      return;
    }
    if (!card.hidden) closeCard();
  }, true);

  card.querySelector(".profile-close").addEventListener("click", closeCard);
  card.querySelector(".profile-message").addEventListener("click", () => {
    if (activeName.toLowerCase() === (document.querySelector(".user-label strong")?.textContent || "").trim().toLowerCase()) {
      notify("This is your profile in the local demo.");
      return;
    }
    const match = [...document.querySelectorAll(".dm-item")].find(item => item.querySelector(".dm-label strong")?.textContent.trim().toLowerCase() === activeName.toLowerCase());
    if (match) {
      closeCard();
      match.click();
    } else {
      notify("Start a DM with this username using the + button in Direct Messages.");
    }
  });
  moreButton.addEventListener("click", (event) => {
    event.stopPropagation();
    menuOpen = !menuOpen;
    menu.hidden = !menuOpen;
    menu.inert = !menuOpen;
    menu.setAttribute("aria-hidden", String(!menuOpen));
    moreButton.setAttribute("aria-expanded", String(menuOpen));
    if (menuOpen) menu.querySelector('[role="menuitem"]')?.focus();
  });
  menu.addEventListener("keydown", (event) => {
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") { event.preventDefault(); closeMenu(true); }
    if (event.key === "ArrowDown") { event.preventDefault(); items[(index + 1 + items.length) % items.length]?.focus(); }
    if (event.key === "ArrowUp") { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
    if (event.key === "Home") { event.preventDefault(); items[0]?.focus(); }
    if (event.key === "End") { event.preventDefault(); items[items.length - 1]?.focus(); }
  });
  menu.addEventListener("click", async (event) => {
    const item = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!item) return;
    const action = item.dataset.action;
    closeMenu(true);
    if (action === "copy-id") {
      const id = "minedm:" + activeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      try { await navigator.clipboard.writeText(id); notify("Copied local demo profile ID: " + id); }
      catch { notify("Local demo profile ID: " + id); }
    } else if (action === "add-note") {
      const note = window.prompt("Add a private note for " + activeName + " (saved only in this browser):", "");
      if (note !== null) {
        try { localStorage.setItem("minedm.profile-note." + activeName.toLowerCase(), note); notify("Private note saved in this browser."); }
        catch { notify("Browser storage is unavailable; note was not saved."); }
      }
    } else if (action === "invite") {
      notify("Server invites need a backend; this is a local demo.");
    } else if (action === "block") {
      notify("Blocking needs a backend; no account was blocked.");
    } else if (action === "report") {
      notify("Reporting needs a backend; no report was sent.");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !card.hidden) closeCard();
  });
  window.addEventListener("resize", () => { if (!card.hidden) closeCard(); });
  window.addEventListener("scroll", () => { if (!card.hidden) closeCard(); }, true);
})();
