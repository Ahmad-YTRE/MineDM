import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Message = { id: string; author: string; text: string; time: string; own?: boolean };
type PresenceStatus = "Online" | "Idle" | "Do not disturb" | "Offline";
type Person = { name: string; online: boolean; status?: PresenceStatus; color: string; preview: string };
type Server = { id: string; name: string; description: string };
type Channel = { id: string; name: string; description: string; serverId?: string };
type SavedState = {
  name: string; status: string; active: string; view: "channel" | "dm" | "friends" | "home";
  channels: Channel[]; servers?: Server[]; activeServer?: string; people: Person[]; messages: Record<string, Message[]>;
  accent: string; compact: boolean; unread?: Record<string, number>;
};

const KEY = "minedm.v2";
const defaultServers: Server[] = [{ id: "block-buddies", name: "Block Buddies", description: "Community space" }];
const defaultChannels: Channel[] = [
  { id: "general", name: "general", description: "The place for everything", serverId: "block-buddies" },
  { id: "minecraft", name: "minecraft", description: "Minecraft chat and builds", serverId: "block-buddies" },
  { id: "screenshots", name: "screenshots", description: "Show off your latest builds", serverId: "block-buddies" },
  { id: "help", name: "help", description: "Ask the community", serverId: "block-buddies" },
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
    { id: "alex1", author: "Alex", text: "Finally finished the castle build!", time: "10:42 AM" },
    { id: "pete1", author: "PixelPete", text: "That looks incredible. How many blocks did it take?", time: "10:44 AM" },
    { id: "me1", author: "CraftyBuilder", text: "We should make a whole village around it!", time: "10:46 AM", own: true },
  ],
  minecraft: [{ id: "mc1", author: "CreeperQueen", text: "Anyone up for a mining run later?", time: "11:02 AM" }],
  screenshots: [{ id: "ss1", author: "Alex", text: "Share your builds here so we can all get inspired!", time: "Yesterday" }],
  help: [{ id: "help1", author: "MineDM", text: "Need a hand? Ask your question and the community will help.", time: "Today" }],
};

function readSaved(): SavedState | null {
  try { const value = localStorage.getItem(KEY); return value ? JSON.parse(value) as SavedState : null; } catch { return null; }
}
const saved = typeof window !== "undefined" ? readSaved() : null;
function initials(name: string) { return name.trim().split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "??"; }
function timeNow() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function keyFor(view: "channel" | "dm", name: string) { return view === "channel" ? "channel:" + name : "dm:" + name.toLowerCase(); }

const iconPaths: Record<string, React.ReactNode> = {
  pickaxe: <><path d="m3 7 8-4 8 4-3 3-5-3-5 3z"/><path d="m10 8-5 13"/><path d="m12 11 5 10"/></>,
  tree: <><path d="m12 3-5 8h3l-4 6h12l-4-6h3z"/><path d="M12 17v4"/></>,
  flask: <><path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M8 15h8"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2z"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/></>,
  inbox: <><path d="M4 4h16v16H4z"/><path d="M4 13h4l2 3h4l2-3h4"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
  paperclip: <><path d="m21 11.5-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></>,
  sparkles: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2z"/><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1z"/></>,
  message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></>,
  zap: <><path d="m13 2-3 9h7l-6 11 1-9H5z"/></>,
  close: <><path d="m18 6-12 12M6 6l12 12"/></>,
  arrowUpRight: <><path d="M7 17 17 7M7 7h10v10"/></>,
  arrowRight: <><path d="M5 12h14M12 5l7 7-7 7"/></>,
  hash: <><path d="M4 9h16M3 15h16M10 3 8 21M16 3l-2 18"/></>,
  at: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M16 12v2a2 2 0 0 0 4 0v-2"/></>,
};
function Icon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  return <svg className={`ui-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{iconPaths[name] || iconPaths.sparkles}</svg>;
}

function Landing({ openApp }: { openApp: () => void }) {
  return <div className="landing">
    <header className="landing-header"><a className="wordmark" href="/">Mine<span>DM</span></a><nav><a href="#features">Features</a><a href="#community">Community</a></nav><button className="btn primary" onClick={openApp}>Open web app <Icon name="arrowUpRight" size={15} /></button></header>
    <section className="hero"><div className="eyebrow"><span className="pulse"/> THE HANGOUT FOR YOUR MINECRAFT CREW</div><h1>Chat. Play.<br/><span>Build together.</span></h1><p>A familiar, lightweight place to chat with your Minecraft friends, organize your crew, and share your next big idea.</p><div className="hero-actions"><button className="btn primary large" onClick={openApp}>Open MineDM <span>→</span></button><a className="btn secondary large" href="#features">Explore features</a></div><div className="hero-note"><Icon name="sparkles" size={15} /> A Minecraft-inspired chat demo</div></section>
    <section className="landing-features" id="features"><div className="section-kicker">MADE FOR YOUR CREW</div><h2>Everything your squad needs.</h2><div className="feature-grid"><article><div className="feature-icon"><Icon name="message" size={24} /></div><h3>Channels & DMs</h3><p>Keep server conversations organized and jump into private chats whenever you need.</p></article><article><div className="feature-icon"><Icon name="pickaxe" size={24} /></div><h3>Built for builders</h3><p>Talk builds, share ideas, and plan your next adventure with your crew.</p></article><article><div className="feature-icon"><Icon name="zap" size={24} /></div><h3>Lightweight by design</h3><p>A clean, responsive interface that works on desktop, tablet, and mobile.</p></article></div></section>
    <footer className="landing-footer" id="community"><span className="wordmark">Mine<span>DM</span></span><span>© 2026 MineDM · An independent community demo, not affiliated with Mojang.</span></footer>
  </div>;
}

function App() {
  const path = window.location.pathname;
  const [showLanding, setShowLanding] = useState(path !== "/app" && path !== "/app/" && path !== "/dms" && path !== "/dms/");
  const [name, setName] = useState(saved?.name || "CraftyBuilder");
  const [status, setStatus] = useState(saved?.status || "Online");
  const [servers, setServers] = useState<Server[]>(saved?.servers?.length ? saved.servers : defaultServers);
  const [activeServer, setActiveServer] = useState(saved?.activeServer || "block-buddies");
  const [channels, setChannels] = useState<Channel[]>(saved?.channels?.length ? saved.channels.map(c => ({ ...c, serverId: c.serverId || "block-buddies" })) : defaultChannels);
  const [people, setPeople] = useState<Person[]>(saved?.people?.length ? saved.people : defaultPeople);
  const [messages, setMessages] = useState<Record<string, Message[]>>({ ...initialMessages, ...(saved?.messages || {}) });
  const [active, setActive] = useState(saved?.active || "general");
  const [view, setView] = useState<"channel" | "dm" | "friends" | "home">(path.startsWith("/dms") ? "home" : saved?.view || "channel");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [modal, setModal] = useState<"dm" | "channel" | "server" | "manageServer" | "manageChannel" | "confirmDelete" | "settings" | "inbox" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ type: "server" | "channel"; id: string; name: string } | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [toast, setToast] = useState("");
  const [accent, setAccent] = useState(saved?.accent || "#00e5ff");
  const [compact, setCompact] = useState(saved?.compact || false);
  const [unread, setUnread] = useState<Record<string, number>>(saved?.unread || {});
  const [typingPerson, setTypingPerson] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "online">("all");

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ name, status, active, view, channels, servers, activeServer, people, messages, accent, compact, unread } satisfies SavedState)); } catch { /* browser storage may be disabled */ }
  }, [name, status, active, view, channels, servers, activeServer, people, messages, accent, compact, unread]);
  useEffect(() => { document.documentElement.style.setProperty("--accent", accent); }, [accent]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(t); }, [toast]);

  const currentServer = servers.find(s => s.id === activeServer) || servers[0];
  const serverChannels = channels.filter(c => (c.serverId || "block-buddies") === activeServer);
  const activeChannel = serverChannels.find(c => c.id === active) || serverChannels[0];
  const activePerson = people.find(p => p.name.toLowerCase() === active.toLowerCase());
  const activeKey = keyFor(view === "dm" ? "dm" : "channel", active);
  const activeKeyRef = useRef(activeKey);
  useEffect(() => { activeKeyRef.current = activeKey; }, [activeKey]);
  const currentMessages = messages[activeKey] || messages[active] || [];
  const filteredPeople = useMemo(() => people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || p.online)), [people, search, filter]);
  const filteredChannels = serverChannels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  function notify(text: string) { setToast(text); }
  function openApp() { window.history.pushState({}, "", "/app"); setShowLanding(false); setView("channel"); setActive(channels[0]?.id || "general"); }
  function openDM(person: Person | string) {
    const personName = typeof person === "string" ? person : person.name;
    if (!people.some(p => p.name.toLowerCase() === personName.toLowerCase())) setPeople(old => [...old, { name: personName, online: false, color: "blue", preview: "New conversation" }]);
    setActive(personName); setView("dm"); setTypingPerson(null); setShowLanding(false); setSidebarOpen(false); setUnread(old => ({ ...old, [keyFor("dm", personName)]: 0 })); window.history.pushState({}, "", "/dms"); setModal(null);
  }
  function openChannel(channel: Channel) { setTypingPerson(null); setActive(channel.id); setView("channel"); setUnread(old => ({ ...old, [keyFor("channel", channel.id)]: 0 })); setSidebarOpen(false); }
  function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const item: Message = {
      id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      author: name,
      text,
      time: timeNow(),
      own: true,
    };
    const nextMessages = {
      ...messages,
      [activeKey]: [...(messages[activeKey] || messages[active] || []), item],
    };

    // Write the message before acknowledging success. The effect below also
    // persists subsequent app state changes, but a send should not rely on it.
    let persisted = false;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        name, status, active, view, channels, servers, activeServer, people, messages: nextMessages, accent, compact, unread,
      } satisfies SavedState));
      persisted = true;
    } catch {
      // Keep the message visible in this session, but never claim it was saved.
    }

    setMessages(nextMessages);
    setPeople(old => old.map(p =>
      p.name.toLowerCase() === active.toLowerCase() && view === "dm"
        ? { ...p, preview: text }
        : p
    ));
    setDraft("");
    notify(persisted
      ? "Message sent and saved in this browser."
      : "Message shown, but browser storage failed. It may not survive a refresh.");

    // Local demo behavior: simulate a DM reply so typing indicators and unread
    // badges can be previewed without implying that another user is connected.
    if (view === "dm" && activePerson) {
      const replyName = activePerson.name;
      const replyKey = activeKey;
      setTypingPerson(replyName);
      window.setTimeout(() => {
        const reply: Message = {
          id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          author: replyName,
          text: "Got your message! (Demo reply)",
          time: timeNow(),
        };
        setMessages(old => ({ ...old, [replyKey]: [...(old[replyKey] || []), reply] }));
        setPeople(old => old.map(p => p.name === replyName ? { ...p, preview: reply.text } : p));
        setTypingPerson(null);
        if (activeKeyRef.current !== replyKey) {
          setUnread(old => ({ ...old, [replyKey]: (old[replyKey] || 0) + 1 }));
        }
      }, 1800);
    }
  }
  function createItem(e: FormEvent) {
    e.preventDefault(); const value = modalInput.trim(); if (!value) return;
    if (modal === "dm") { openDM(value); notify("Conversation created locally."); }
    if (modal === "channel") {
      const channelName = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      if (!channelName) return;
      if (serverChannels.some(c => c.name === channelName)) { notify("That channel already exists in this server."); return; }
      const id = activeServer + "-" + channelName + "-" + Date.now().toString(36);
      const channel = { id, name: channelName, description: "A new community channel", serverId: activeServer };
      setChannels(old => [...old, channel]); setMessages(old => ({ ...old, [id]: [] })); setActive(id); setView("channel"); setShowLanding(false); notify("Channel created locally.");
    }
    setModal(null); setModalInput("");
  }
  function switchToDMHome() { setView("home"); setShowLanding(false); setSidebarOpen(false); window.history.pushState({}, "", "/dms"); }
  function switchToServer(server: Server = currentServer) { setActiveServer(server.id); setActive(channels.find(c => (c.serverId || "block-buddies") === server.id)?.id || ""); setView("channel"); setShowLanding(false); setSidebarOpen(false); window.history.pushState({}, "", "/app"); }
  function createServer(e: FormEvent) {
    e.preventDefault(); const value = modalInput.trim().replace(/\\s+/g, " "); if (!value) return;
    if (servers.some(s => s.name.toLowerCase() === value.toLowerCase())) { notify("A server with that name already exists."); return; }
    const id = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
    const server = { id, name: value, description: "Your community" };
    const channel = { id: id + "-general", name: "general", description: "The place for everything", serverId: id };
    setServers(old => [...old, server]); setChannels(old => [...old, channel]); setMessages(old => ({ ...old, [channel.id]: [] })); setActiveServer(id); setActive(channel.id); setView("channel"); setShowLanding(false); setSidebarOpen(false); setModal(null); setModalInput(""); notify("Server created in this browser.");
  }
  function renameServer(e: FormEvent) {
    e.preventDefault(); const value = modalInput.trim().replace(/\\s+/g, " "); if (!value || !currentServer) return;
    if (servers.some(s => s.id !== currentServer.id && s.name.toLowerCase() === value.toLowerCase())) { notify("A server with that name already exists."); return; }
    setServers(old => old.map(s => s.id === currentServer.id ? { ...s, name: value } : s)); setModal(null); setModalInput(""); notify("Server renamed in this browser.");
  }
  function renameChannel(e: FormEvent) {
    e.preventDefault(); const value = modalInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); if (!value || !activeChannel) return;
    if (serverChannels.some(ch => ch.id !== activeChannel.id && ch.name.toLowerCase() === value)) { notify("That channel already exists in this server."); return; }
    setChannels(old => old.map(ch => ch.id === activeChannel.id ? { ...ch, name: value } : ch)); setModal(null); setModalInput(""); notify("Channel renamed in this browser.");
  }
  function askDeleteServer() {
    if (!currentServer) return;
    if (servers.length <= 1) { notify("Keep at least one server."); return; }
    setPendingDelete({ type: "server", id: currentServer.id, name: currentServer.name }); setModal("confirmDelete");
  }
  function askDeleteChannel(channel: Channel) {
    if (serverChannels.length <= 1) { notify("Each server must keep at least one channel."); return; }
    setPendingDelete({ type: "channel", id: channel.id, name: channel.name }); setModal("confirmDelete");
  }
  function confirmDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.type === "channel") {
      const id = pendingDelete.id;
      setChannels(old => old.filter(ch => ch.id !== id)); setMessages(old => { const next = { ...old }; delete next[id]; delete next[keyFor("channel", id)]; return next; });
      setUnread(old => { const next = { ...old }; delete next[keyFor("channel", id)]; return next; });
      if (active === id) setActive(serverChannels.find(ch => ch.id !== id)?.id || "");
      notify("Channel deleted from this browser.");
    } else {
      const id = pendingDelete.id;
      const removed = channels.filter(ch => (ch.serverId || "block-buddies") === id);
      const remaining = servers.filter(s => s.id !== id);
      setChannels(old => old.filter(ch => (ch.serverId || "block-buddies") !== id));
      setMessages(old => { const next = { ...old }; for (const ch of removed) { delete next[ch.id]; delete next[keyFor("channel", ch.id)]; } return next; });
      setServers(remaining); setActiveServer(remaining[0].id); setActive(channels.find(ch => (ch.serverId || "block-buddies") === remaining[0].id)?.id || ""); setView("channel");
      notify("Server deleted from this browser.");
    }
    setPendingDelete(null); setModal(null);
  }
  function switchToFriends() { setView("friends"); setShowLanding(false); setSidebarOpen(false); window.history.pushState({}, "", "/app"); }
  function switchToChannel(channel: Channel) { openChannel(channel); window.history.pushState({}, "", "/app"); }
  function deleteCurrentDM() {
    if (!activePerson) return;
    setPeople(old => old.filter(p => p.name !== activePerson.name));
    setMessages(old => { const next = { ...old }; delete next["dm:" + activePerson.name.toLowerCase()]; return next; });
    setActive(channels[0]?.id || "general"); setView("channel"); notify("Conversation removed from this browser.");
  }

  if (showLanding) return <Landing openApp={openApp} />;
  return <div className={`app-shell ${compact ? "compact" : ""}`}>
    <aside className="server-rail"><button className={`brand-mark ${view === "home" ? "brand-active" : ""}`} title="Open direct messages" aria-label="Open direct messages" onClick={switchToDMHome}>M</button><div className="rail-separator"/>{servers.map((server, index) => <button key={server.id} className={`server-icon ${activeServer === server.id && view !== "home" && view !== "dm" ? "selected" : ""}`} title={server.name} aria-label={`Open ${server.name}`} onClick={() => switchToServer(server)}>{index === 0 ? <Icon name="pickaxe" size={23} /> : index === 1 ? <Icon name="tree" size={22} /> : <span style={{fontWeight:900,fontSize:12}}>{initials(server.name)}</span>}</button>)}<button className="server-icon add" title="Create server" aria-label="Create server" onClick={() => { setModalInput(""); setModal("server"); }}><Icon name="plus" size={20} /></button><div className="rail-spacer"/><button className="server-icon" title="Settings" onClick={() => setModal("settings")}><Icon name="settings" size={18} /></button></aside>
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="workspace-head"><div><strong>{view === "home" || view === "dm" ? "Direct Messages" : currentServer?.name || "Server"}</strong><small><i className="online-dot"/> {view === "home" || view === "dm" ? "Private conversations" : currentServer?.description || "Community space"}</small></div>{view !== "home" && view !== "dm" && <div style={{display:"flex",gap:2}}><button className="icon-btn" onClick={() => { setModalInput(currentServer?.name || ""); setModal("manageServer"); }} title="Rename server"><Icon name="settings" size={17} /></button><button className="icon-btn" onClick={() => { setModal("channel"); setModalInput(""); }} title="Add channel"><Icon name="plus" size={20} /></button></div>}</div>
      <div className="search-wrap"><span><Icon name="search" size={17} /></span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..." aria-label="Search conversations"/></div>
      <>{view !== "home" && view !== "dm" ? <><button className={`side-link ${view === "friends" ? "active" : ""}`} onClick={switchToFriends}><span><Icon name="users" size={17} /></span> Friends <span className="side-count">{people.length}</span></button><div className="side-heading"><span>TEXT CHANNELS</span><button onClick={() => { setModal("channel"); setModalInput(""); }} aria-label="Add channel"><Icon name="plus" size={20} /></button></div><div className="nav-list">{filteredChannels.map(c => <div key={c.id} style={{display:"flex",alignItems:"center",minWidth:0}}><button className={`nav-item ${view === "channel" && active === c.id ? "active" : ""}`} style={{flex:1,minWidth:0}} onClick={() => switchToChannel(c)}><span className="hash"><Icon name="hash" size={15} /></span><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span>{(unread[keyFor("channel", c.id)] || 0) > 0 && <span style={{ marginLeft: "auto", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#ed4245", color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center" }}>{unread[keyFor("channel", c.id)]}</span>}</button><button className="icon-btn" style={{width:25,height:30,flexShrink:0}} title={"Manage #" + c.name} aria-label={"Manage #" + c.name} onClick={() => { setActive(c.id); setModalInput(c.name); setModal("manageChannel"); }}><Icon name="settings" size={14}/></button></div>)}</div></> : <><div className="side-heading"><span>DIRECT MESSAGES</span><button onClick={() => { setModal("dm"); setModalInput(""); }} aria-label="New direct message"><Icon name="plus" size={20} /></button></div><div className="dm-list">{filteredPeople.map(p => <button key={p.name.toLowerCase()} className={`dm-item ${view === "dm" && active.toLowerCase() === p.name.toLowerCase() ? "active" : ""}`} onClick={() => openDM(p)}><span className={`avatar ${p.color}`}>{initials(p.name)}{p.online && <i/>}</span><span className="dm-label"><strong>{p.name}</strong><small>{p.preview}</small></span><span className={`presence ${((p.status || (p.online ? "Online" : "Offline")) === "Online") ? "online" : ""}`} title={p.status || (p.online ? "Online" : "Offline")} style={{ background: (p.status || (p.online ? "Online" : "Offline")) === "Do not disturb" ? "#ed4245" : (p.status || (p.online ? "Online" : "Offline")) === "Idle" ? "#f0b232" : (p.status || (p.online ? "Online" : "Offline")) === "Offline" ? "#667184" : undefined }}/>{(unread[keyFor("dm", p.name)] || 0) > 0 && <span style={{ marginLeft: "auto", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#ed4245", color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center" }}>{unread[keyFor("dm", p.name)]}</span>}</button>)}</div></>}</>
      <div className="user-bar"><div className="avatar self">{initials(name)}</div><div className="user-label"><strong>{name}</strong><small>{status}</small></div><button className="icon-btn" title="User settings" onClick={() => setModal("settings")}><Icon name="settings" size={18} /></button></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><button className="mobile-toggle" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle sidebar"><Icon name="menu" size={20} /></button><div className="topbar-title"><span className="title-symbol">{view === "channel" ? <Icon name="hash" /> : view === "dm" ? <Icon name="at" /> : <Icon name="users" />}</span><div><strong>{view === "channel" ? activeChannel?.name || active : view === "dm" ? active : view === "home" ? "Direct Messages" : "Friends"}</strong><small>{view === "channel" ? activeChannel?.description : view === "dm" ? (typingPerson === active ? "Typing…" : `${activePerson?.status || (activePerson?.online ? "Online" : "Offline")} · Direct message · Demo`) : view === "home" ? "Your private conversations" : "Your people, all in one place"}</small></div></div><div className="topbar-actions"><span className="demo-pill"><i/> LOCAL DEMO</span><button className="icon-btn" title="Inbox" onClick={() => setModal("inbox")}><Icon name="inbox" size={18} /></button><button className="icon-btn" title="Settings" onClick={() => setModal("settings")}><Icon name="settings" size={18} /></button></div></header>
      {(view === "friends" || view === "home") ? <section className="friends-view"><div className="friends-intro"><span className="section-kicker">{view === "home" ? "YOUR INBOX" : "YOUR COMMUNITY"}</span><h1>{view === "home" ? "Direct Messages" : "Friends"}</h1><p>{view === "home" ? "Pick a conversation or start a new one with your crew." : "Find your people and pick up where you left off."}</p><button className="btn primary" onClick={() => { setModal("dm"); setModalInput(""); }}>＋ Start a conversation</button></div><div className="friend-tools"><div className="filter-tabs">{view === "friends" ? <><button className={filter === "all" ? "chosen" : ""} onClick={() => setFilter("all")}>All friends <span>{people.length}</span></button><button className={filter === "online" ? "chosen" : ""} onClick={() => setFilter("online")}>Online <span>{people.filter(p => p.online).length}</span></button></> : <button className="chosen">All conversations <span>{people.length}</span></button>}</div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a friend..." aria-label="Find a friend"/></div><div className="friend-grid">{filteredPeople.map(p => <article className="friend-card" key={p.name}><div className={`avatar large ${p.color}`}>{initials(p.name)}<i className={p.online ? "online" : ""}/></div><div className="friend-info"><strong>{p.name}</strong><small>{p.online ? "Online now" : "Offline"}</small></div><button className="btn small primary" onClick={() => openDM(p)}>{view === "home" ? "Open DM" : "Message"}</button></article>)}</div>{!filteredPeople.length && <div className="empty-state">No friends match that search.</div>}</section> :
      <><div className="message-scroll" key={activeKey}><div className="date-divider"><span>WELCOME TO {view === "channel" ? "#" + (activeChannel?.name || active) : "YOUR CONVERSATION"}</span></div>{currentMessages.length ? currentMessages.map(m => <article className={`message-row ${compact ? "tight" : ""}`} key={m.id}><div className={`avatar message-avatar ${m.own ? "self" : m.author === "MineDM" ? "bot" : "blue"}`}>{initials(m.author)}</div><div className="message-body"><div className="message-meta"><strong>{m.author}</strong>{m.author === "MineDM" && <span className="bot-tag">BOT</span>}<time>{m.time}</time></div><p>{m.text}</p></div></article>) : <div className="empty-state"><div className="empty-icon"><Icon name="sparkles" size={25} /></div><h3>This is the beginning.</h3><p>Send the first message to get the conversation going.</p></div>}{typingPerson && <div style={{ padding: "0 4vw 8px", color: "#8792a5", fontSize: 11 }} role="status">{typingPerson} is typing<span aria-hidden="true">…</span></div>}</div><div className="composer-area"><form className="composer" onSubmit={sendMessage}><button type="button" className="attach-btn" title="Attachments are demo-only" onClick={() => notify("File uploads need a backend connection.")}><Icon name="plus" size={20} /></button><input value={draft} onChange={e => setDraft(e.target.value)} placeholder={view === "channel" ? `Message #${activeChannel?.name || active}` : `Message @${active}`} aria-label="Message" maxLength={4000}/><button className="send-btn" type="submit" disabled={!draft.trim()} aria-label="Send message"><Icon name="send" size={17} /></button></form><div className="composer-foot"><span>Keep it kind. Keep it crafty.</span><span><kbd>Enter</kbd> to send · Browser-only storage</span></div></div></>}
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true"><button className="modal-x" onClick={() => setModal(null)} aria-label="Close"><Icon name="close" size={18} /></button>
      {modal === "dm" && <><span className="section-kicker">DIRECT MESSAGES</span><h2>Start a conversation</h2><p>Enter a username to add a local demo conversation.</p><form onSubmit={createItem}><label htmlFor="modalInput">Username</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="e.g. AlexTheBuilder" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Create DM</button></div></form></>}
      {modal === "server" && <><span className="section-kicker">NEW COMMUNITY</span><h2>Create a server</h2><p>Give your community a name. We will create a #general channel automatically.</p><form onSubmit={createServer}><label htmlFor="modalInput">Server name</label><input id="modalInput" autoFocus maxLength={40} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="Survival Squad" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Create server</button></div></form></>}
      {modal === "manageServer" && <><span className="section-kicker">SERVER SETTINGS</span><h2>Manage server</h2><p>Change the name of {currentServer?.name || "this server"}, or remove it from this browser.</p><form onSubmit={renameServer}><label htmlFor="modalInput">Server name</label><input id="modalInput" autoFocus maxLength={40} value={modalInput} onChange={e => setModalInput(e.target.value)} required/><div className="modal-actions"><button type="button" className="btn secondary" disabled={servers.length <= 1} onClick={askDeleteServer}>Delete server</button><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Save changes</button></div></form></>}
      {modal === "manageChannel" && <><span className="section-kicker">CHANNEL SETTINGS</span><h2>Manage channel</h2><p>Rename #{activeChannel?.name || "channel"} or delete it and its local message history.</p><form onSubmit={renameChannel}><label htmlFor="modalInput">Channel name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} required/><div className="modal-actions"><button type="button" className="btn secondary" disabled={serverChannels.length <= 1} onClick={() => activeChannel && askDeleteChannel(activeChannel)}>Delete channel</button><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Save changes</button></div></form></>}
      {modal === "confirmDelete" && <><span className="section-kicker">CONFIRM DELETION</span><h2>Delete {pendingDelete?.type === "server" ? "server" : "channel"}?</h2><p>{pendingDelete?.type === "server" ? `“${pendingDelete.name}” and all its channels and local messages will be removed from this browser.` : `#${pendingDelete?.name || "channel"} and its local message history will be removed from this browser.`} This cannot be undone.</p><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => { setModal(pendingDelete?.type === "server" ? "manageServer" : "manageChannel"); setPendingDelete(null); }}>Cancel</button><button type="button" className="btn primary" onClick={confirmDelete}>Delete permanently</button></div></>}
      {modal === "channel" && <><span className="section-kicker">{currentServer?.name || "SERVER"}</span><h2>Create a channel</h2><p>Add a text channel to this server.</p><form onSubmit={createItem}><label htmlFor="modalInput">Channel name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="build-plans" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Create channel</button></div></form></>}
      {modal === "settings" && <><span className="section-kicker">PERSONALIZE</span><h2>User settings</h2><p>These preferences are saved only in this browser.</p><form onSubmit={e => { e.preventDefault(); setModal(null); notify("Settings saved."); }}><label htmlFor="displayName">Display name</label><input id="displayName" maxLength={32} value={name} onChange={e => setName(e.target.value)} required/><label htmlFor="status">Status</label><select id="status" value={status} onChange={e => setStatus(e.target.value)}><option>Online</option><option>Idle</option><option>Do not disturb</option><option>Offline</option></select><label htmlFor="accent">Accent color</label><div className="color-row"><input id="accent" type="color" value={accent} onChange={e => setAccent(e.target.value)}/><span>Choose your glow</span></div><label className="check-row"><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)}/> Compact message spacing</label><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => { localStorage.removeItem(KEY); window.location.reload(); }}>Reset local data</button><button className="btn primary">Save settings</button></div></form></>}
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
