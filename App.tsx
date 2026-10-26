import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Message = { id: string; author: string; text: string; time: string; own?: boolean };
type Person = { name: string; online: boolean; color: string; preview: string };
type Channel = { id: string; name: string; description: string };
type SavedState = {
  name: string; status: string; active: string; view: "channel" | "dm" | "friends" | "home";
  channels: Channel[]; people: Person[]; messages: Record<string, Message[]>;
  accent: string; compact: boolean;
};

const KEY = "minedm.v2";
const defaultChannels: Channel[] = [
  { id: "general", name: "general", description: "The place for everything" },
  { id: "minecraft", name: "minecraft", description: "Minecraft chat and builds" },
  { id: "screenshots", name: "screenshots", description: "Show off your latest builds" },
  { id: "help", name: "help", description: "Ask the community" },
];
const defaultPeople: Person[] = [
  { name: "Alex", online: true, color: "green", preview: "That castle looks awesome" },
  { name: "PixelPete", online: true, color: "purple", preview: "See you in the server!" },
  { name: "CreeperQueen", online: true, color: "orange", preview: "Want to go mining later?" },
  { name: "Steve", online: false, color: "blue", preview: "Thanks for the invite" },
  { name: "EnderGirl", online: false, color: "pink", preview: "Sent you a screenshot" },
];
const initialMessages: Record<string, Message[]> = {
  general: [
    { id: "welcome", author: "MineDM", text: "Welcome to Block Buddies! Keep it friendly and have fun.", time: "Today", own: false },
    { id: "alex1", author: "Alex", text: "Finally finished the castle build 🏰", time: "10:42 AM" },
    { id: "pete1", author: "PixelPete", text: "That looks incredible. How many blocks did it take?", time: "10:44 AM" },
    { id: "me1", author: "CraftyBuilder", text: "We should make a whole village around it!", time: "10:46 AM", own: true },
  ],
  minecraft: [{ id: "mc1", author: "CreeperQueen", text: "Anyone up for a mining run later?", time: "11:02 AM" }],
  screenshots: [{ id: "ss1", author: "Alex", text: "Share your builds here so we can all get inspired ✨", time: "Yesterday" }],
  help: [{ id: "help1", author: "MineDM", text: "Need a hand? Ask your question and the community will help.", time: "Today" }],
};

function readSaved(): SavedState | null {
  try { const value = localStorage.getItem(KEY); return value ? JSON.parse(value) as SavedState : null; } catch { return null; }
}
const saved = typeof window !== "undefined" ? readSaved() : null;
function initials(name: string) { return name.trim().split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "??"; }
function timeNow() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function keyFor(view: "channel" | "dm", name: string) { return view === "channel" ? "channel:" + name : "dm:" + name.toLowerCase(); }

function Landing({ openApp }: { openApp: () => void }) {
  return <div className="landing">
    <header className="landing-header"><a className="wordmark" href="/">Mine<span>DM</span></a><nav><a href="#features">Features</a><a href="#community">Community</a></nav><button className="btn primary" onClick={openApp}>Open web app ↗</button></header>
    <section className="hero"><div className="eyebrow"><span className="pulse"/> THE HANGOUT FOR YOUR MINECRAFT CREW</div><h1>Chat. Play.<br/><span>Build together.</span></h1><p>A familiar, lightweight place to chat with your Minecraft friends, organize your crew, and share your next big idea.</p><div className="hero-actions"><button className="btn primary large" onClick={openApp}>Open MineDM <span>→</span></button><a className="btn secondary large" href="#features">Explore features</a></div><div className="hero-note">✦ A Minecraft-inspired chat demo</div></section>
    <section className="landing-features" id="features"><div className="section-kicker">MADE FOR YOUR CREW</div><h2>Everything your squad needs.</h2><div className="feature-grid"><article><div className="feature-icon">💬</div><h3>Channels & DMs</h3><p>Keep server conversations organized and jump into private chats whenever you need.</p></article><article><div className="feature-icon">⛏️</div><h3>Built for builders</h3><p>Talk builds, share ideas, and plan your next adventure with your crew.</p></article><article><div className="feature-icon">⚡</div><h3>Lightweight by design</h3><p>A clean, responsive interface that works on desktop, tablet, and mobile.</p></article></div></section>
    <footer className="landing-footer" id="community"><span className="wordmark">Mine<span>DM</span></span><span>© 2026 MineDM · An independent community demo, not affiliated with Mojang.</span></footer>
  </div>;
}

function App() {
  const path = window.location.pathname;
  const [showLanding, setShowLanding] = useState(path !== "/app" && path !== "/app/" && path !== "/dms" && path !== "/dms/");
  const [name, setName] = useState(saved?.name || "CraftyBuilder");
  const [status, setStatus] = useState(saved?.status || "Online");
  const [channels, setChannels] = useState<Channel[]>(saved?.channels?.length ? saved.channels : defaultChannels);
  const [people, setPeople] = useState<Person[]>(saved?.people?.length ? saved.people : defaultPeople);
  const [messages, setMessages] = useState<Record<string, Message[]>>({ ...initialMessages, ...(saved?.messages || {}) });
  const [active, setActive] = useState(saved?.active || "general");
  const [view, setView] = useState<"channel" | "dm" | "friends" | "home>(path.startsWith("/dms") ? "home" : saved?.view || "channel");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [modal, setModal] = useState<"dm" | "channel" | "settings" | "inbox" | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [toast, setToast] = useState("");
  const [accent, setAccent] = useState(saved?.accent || "#00e5ff");
  const [compact, setCompact] = useState(saved?.compact || false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "online">("all");

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ name, status, active, view, channels, people, messages, accent, compact } satisfies SavedState)); } catch { /* browser storage may be disabled */ }
  }, [name, status, active, view, channels, people, messages, accent, compact]);
  useEffect(() => { document.documentElement.style.setProperty("--accent", accent); }, [accent]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(t); }, [toast]);

  const activeChannel = channels.find(c => c.id === active) || channels[0];
  const activePerson = people.find(p => p.name.toLowerCase() === active.toLowerCase());
  const activeKey = keyFor(view === "dm" ? "dm" : "channel", active);
  const currentMessages = messages[activeKey] || messages[active] || [];
  const filteredPeople = useMemo(() => people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || p.online)), [people, search, filter]);
  const filteredChannels = channels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  function notify(text: string) { setToast(text); }
  function openApp() { window.history.pushState({}, "", "/app"); setShowLanding(false); setView("channel"); setActive(channels[0]?.id || "general"); }
  function openDM(person: Person | string) {
    const personName = typeof person === "string" ? person : person.name;
    if (!people.some(p => p.name.toLowerCase() === personName.toLowerCase())) setPeople(old => [...old, { name: personName, online: false, color: "blue", preview: "New conversation" }]);
    setActive(personName); setView("dm"); setShowLanding(false); setSidebarOpen(false); window.history.pushState({}, "", "/app"); setModal(null);
  }
  function openChannel(channel: Channel) { setActive(channel.id); setView("channel"); setSidebarOpen(false); }
  function sendMessage(e: FormEvent) {
    e.preventDefault(); const text = draft.trim(); if (!text) return;
    const item: Message = { id: crypto.randomUUID?.() || String(Date.now()), author: name, text, time: timeNow(), own: true };
    setMessages(old => ({ ...old, [activeKey]: [...(old[activeKey] || old[active] || []), item] }));
    setPeople(old => old.map(p => p.name.toLowerCase() === active.toLowerCase() && view === "dm" ? { ...p, preview: text } : p));
    setDraft("");
  }
  function createItem(e: FormEvent) {
    e.preventDefault(); const value = modalInput.trim(); if (!value) return;
    if (modal === "dm") { openDM(value); notify("Conversation created locally."); }
    if (modal === "channel") {
      const id = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      if (!id) return;
      if (channels.some(c => c.id === id)) { notify("That channel already exists."); return; }
      const channel = { id, name: id, description: "A new community channel" };
      setChannels(old => [...old, channel]); setMessages(old => ({ ...old, [id]: [] })); setActive(id); setView("channel"); setShowLanding(false); notify("Channel created locally.");
    }
    setModal(null); setModalInput("");
  }
  function switchToDMHome() { setView("home"); setShowLanding(false); setSidebarOpen(false); window.history.pushState({}, "", "/dms"); }\n  function switchToFriends() { setView("friends"); setShowLanding(false); setSidebarOpen(false); window.history.pushState({}, "", "/app"); }
  function switchToChannel(channel: Channel) { openChannel(channel); window.history.pushState({}, "", "/app"); }
  function deleteCurrentDM() {
    if (!activePerson) return;
    setPeople(old => old.filter(p => p.name !== activePerson.name));
    setMessages(old => { const next = { ...old }; delete next["dm:" + activePerson.name.toLowerCase()]; return next; });
    setActive(channels[0]?.id || "general"); setView("channel"); notify("Conversation removed from this browser.");
  }

  if (showLanding) return <Landing openApp={openApp} />;
  return <div className={`app-shell ${compact ? "compact" : ""}`}>
    <aside className="server-rail"><button className={`brand-mark ${view === "home" ? "brand-active" : ""}`} title="Open direct messages" aria-label="Open direct messages" onClick={switchToDMHome}>M</button><div className="rail-separator"/><button className="server-icon selected" title="Block Buddies">⛏</button><button className="server-icon" title="Survival Squad" onClick={() => notify("More servers are coming soon.")}>🌲</button><button className="server-icon" title="Redstone Lab" onClick={() => notify("More servers are coming soon.")}>R</button><button className="server-icon add" title="Create channel" onClick={() => { setModal("channel"); setModalInput(""); }}>＋</button><div className="rail-spacer"/><button className="server-icon" title="Settings" onClick={() => setModal("settings")}>⚙</button></aside>
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="workspace-head"><div><strong>Block Buddies</strong><small><i className="online-dot"/> Community space</small></div><button className="icon-btn" onClick={() => setModal("channel")} title="Add channel">＋</button></div>
      <div className="search-wrap"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..." aria-label="Search conversations"/></div>
      <button className={`side-link ${view === "friends" ? "active" : ""}`} onClick={switchToFriends}><span>♧</span> Friends <span className="side-count">{people.length}</span></button>
      <div className="side-heading"><span>TEXT CHANNELS</span><button onClick={() => { setModal("channel"); setModalInput(""); }} aria-label="Add channel">＋</button></div>
      <div className="nav-list">{filteredChannels.map(c => <button key={c.id} className={`nav-item ${view === "channel" && active === c.id ? "active" : ""}`} onClick={() => switchToChannel(c)}><span className="hash">#</span><span>{c.name}</span></button>)}</div>
      <div className="side-heading"><span>DIRECT MESSAGES</span><button onClick={() => { setModal("dm"); setModalInput(""); }} aria-label="New direct message">＋</button></div>
      <div className="dm-list">{filteredPeople.map(p => <button key={p.name.toLowerCase()} className={`dm-item ${view === "dm" && active.toLowerCase() === p.name.toLowerCase() ? "active" : ""}`} onClick={() => openDM(p)}><span className={`avatar ${p.color}`}>{initials(p.name)}{p.online && <i/>}</span><span className="dm-label"><strong>{p.name}</strong><small>{p.preview}</small></span><span className={`presence ${p.online ? "online" : ""}`}/></button>)}</div>
      <div className="user-bar"><div className="avatar self">{initials(name)}</div><div className="user-label"><strong>{name}</strong><small>{status}</small></div><button className="icon-btn" title="User settings" onClick={() => setModal("settings")}>⚙</button></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><button className="mobile-toggle" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle sidebar">☰</button><div className="topbar-title"><span className="title-symbol">{view === "channel" ? "#" : view === "dm" ? "@" : "♧"}</span><div><strong>{view === "channel" ? activeChannel?.name || active : view === "dm" ? active : view === "home" ? "Direct Messages" : "Friends"}</strong><small>{view === "channel" ? activeChannel?.description : view === "dm" ? (activePerson?.online ? "Online · Direct message" : "Direct message · Local demo") : view === "home" ? "Your private conversations" : "Your people, all in one place"}</small></div></div><div className="topbar-actions"><span className="demo-pill"><i/> LOCAL DEMO</span><button className="icon-btn" title="Inbox" onClick={() => setModal("inbox")}>▤</button><button className="icon-btn" title="Settings" onClick={() => setModal("settings")}>⚙</button></div></header>
      {(view === "friends" || view === "home") ? <section className="friends-view"><div className="friends-intro"><span className="section-kicker">{view === "home" ? "YOUR INBOX" : "YOUR COMMUNITY"}</span><h1>{view === "home" ? "Direct Messages" : "Friends"}</h1><p>{view === "home" ? "Pick a conversation or start a new one with your crew." : "Find your people and pick up where you left off."}</p><button className="btn primary" onClick={() => { setModal("dm"); setModalInput(""); }}>＋ Start a conversation</button></div><div className="friend-tools"><div className="filter-tabs">{view === "friends" ? <><button className={filter === "all" ? "chosen" : ""} onClick={() => setFilter("all")}>All friends <span>{people.length}</span></button><button className={filter === "online" ? "chosen" : ""} onClick={() => setFilter("online")}>Online <span>{people.filter(p => p.online).length}</span></button></> : <button className="chosen">All conversations <span>{people.length}</span></button>}</div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a friend..." aria-label="Find a friend"/></div><div className="friend-grid">{filteredPeople.map(p => <article className="friend-card" key={p.name}><div className={`avatar large ${p.color}`}>{initials(p.name)}<i className={p.online ? "online" : ""}/></div><div className="friend-info"><strong>{p.name}</strong><small>{p.online ? "Online now" : "Offline"}</small></div><button className="btn small primary" onClick={() => openDM(p)}>{view === "home" ? "Open DM" : "Message"}</button></article>)}</div>{!filteredPeople.length && <div className="empty-state">No friends match that search.</div>}</section> :
      <><div className="message-scroll" key={activeKey}><div className="date-divider"><span>WELCOME TO {view === "channel" ? "#" + (activeChannel?.name || active) : "YOUR CONVERSATION"}</span></div>{currentMessages.length ? currentMessages.map(m => <article className={`message-row ${compact ? "tight" : ""}`} key={m.id}><div className={`avatar message-avatar ${m.own ? "self" : m.author === "MineDM" ? "bot" : "blue"}`}>{initials(m.author)}</div><div className="message-body"><div className="message-meta"><strong>{m.author}</strong>{m.author === "MineDM" && <span className="bot-tag">BOT</span>}<time>{m.time}</time></div><p>{m.text}</p></div></article>) : <div className="empty-state"><div className="empty-icon">✦</div><h3>This is the beginning.</h3><p>Send the first message to get the conversation going.</p></div>}</div><div className="composer-area"><form className="composer" onSubmit={sendMessage}><button type="button" className="attach-btn" title="Attachments are demo-only" onClick={() => notify("File uploads need a backend connection.")}>＋</button><input value={draft} onChange={e => setDraft(e.target.value)} placeholder={view === "channel" ? `Message #${activeChannel?.name || active}` : `Message @${active}`} aria-label="Message" maxLength={4000}/><button className="send-btn" type="submit" disabled={!draft.trim()} aria-label="Send message">➤</button></form><div className="composer-foot"><span>Keep it kind. Keep it crafty.</span><span><kbd>Enter</kbd> to send · Saved in this browser</span></div></div></>}
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true"><button className="modal-x" onClick={() => setModal(null)} aria-label="Close">×</button>
      {modal === "dm" && <><span className="section-kicker">DIRECT MESSAGES</span><h2>Start a conversation</h2><p>Enter a username to add a local demo conversation.</p><form onSubmit={createItem}><label htmlFor="modalInput">Username</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="e.g. AlexTheBuilder" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Create DM</button></div></form></>}
      {modal === "channel" && <><span className="section-kicker">BLOCK BUDDIES</span><h2>Create a channel</h2><p>Give your new text channel a name.</p><form onSubmit={createItem}><label htmlFor="modalInput">Channel name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="build-plans" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Create channel</button></div></form></>}
      {modal === "settings" && <><span className="section-kicker">PERSONALIZE</span><h2>User settings</h2><p>These preferences are saved only in this browser.</p><form onSubmit={e => { e.preventDefault(); setModal(null); notify("Settings saved."); }}><label htmlFor="displayName">Display name</label><input id="displayName" maxLength={32} value={name} onChange={e => setName(e.target.value)} required/><label htmlFor="status">Status</label><select id="status" value={status} onChange={e => setStatus(e.target.value)}><option>Online</option><option>Idle</option><option>Do not disturb</option><option>Invisible</option></select><label htmlFor="accent">Accent color</label><div className="color-row"><input id="accent" type="color" value={accent} onChange={e => setAccent(e.target.value)}/><span>Choose your glow</span></div><label className="check-row"><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)}/> Compact message spacing</label><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => { localStorage.removeItem(KEY); window.location.reload(); }}>Reset local data</button><button className="btn primary">Save settings</button></div></form></>}
      {modal === "inbox" && <><span className="section-kicker">NOTIFICATIONS</span><h2>You're all caught up</h2><p>This local prototype has no server inbox or real-time notifications yet.</p><div className="modal-actions"><button className="btn primary" onClick={() => setModal(null)}>Sounds good</button></div></>}
    </section></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

function Root() {
  useEffect(() => {
    const onPop = () => window.location.pathname === "/" ? window.location.reload() : window.location.reload();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return <App/>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Root/></React.StrictMode>);
