import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { AuthScreen } from "./AuthScreen";
import { Icon } from "./icons.filename";

type Message = { id: string; author: string; text: string; time: string; own?: boolean; reactions?: string[]; replyTo?: { author: string; text: string } };
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
const defaultServers: Server[] = [{ id: "block-buddies", name: "Block Buddies", description: "Community server" }];
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

function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return <span className={`logo-mark ${className}`} style={{ "--logo-size": `${size}px` } as React.CSSProperties} aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><use href="#logo-gem-bubble" /></svg></span>;
}

function Landing({ openApp }: { openApp: () => void }) {
  return <div className="landing">
    <header className="landing-header"><a className="wordmark" href="/"><Logo size={28} />Mine<span>DM</span></a><nav><a href="#features">Features</a><a href="#community">Community</a></nav><button className="btn primary" onClick={openApp}>Open web app <Icon name="arrowUpRight" size={15} /></button></header>
    <section className="hero"><Logo size={96} className="is-hero" /><div className="eyebrow"><span className="pulse"/> THE HANGOUT FOR YOUR MINECRAFT CREW</div><h1>Chat. Play.<br/><span>Build together.</span></h1><p>A familiar, lightweight place to chat with your Minecraft friends, organize your crew, and share your next big idea.</p><div className="hero-actions"><button className="btn primary large" onClick={openApp}>Open MineDM <Icon name="arrowRight" size={16} /></button><a className="btn secondary large" href="#features">Explore features</a></div><div className="hero-note"><Icon name="sparkles" size={15} /> A Minecraft-inspired chat demo</div></section>
    <section className="landing-features" id="features"><div className="section-kicker">MADE FOR YOUR CREW</div><h2>Everything your squad needs.</h2><div className="feature-grid"><article><div className="feature-icon"><Icon name="message" size={24} /></div><h3>Channels & DMs</h3><p>Keep server conversations organized and jump into private chats whenever you need.</p></article><article><div className="feature-icon"><Icon name="pickaxe" size={24} /></div><h3>Built for builders</h3><p>Talk builds, share ideas, and plan your next adventure with your crew.</p></article><article><div className="feature-icon"><Icon name="zap" size={24} /></div><h3>Lightweight by design</h3><p>A clean, responsive interface that works on desktop, tablet, and mobile.</p></article></div></section>
    <footer className="landing-footer" id="community"><span className="wordmark"><Logo size={20} />Mine<span>DM</span></span><span>© 2026 MineDM · An independent community demo, not affiliated with Mojang.</span></footer>
  </div>;
}

function App({ session }: { session: Session }) {
  const path = window.location.pathname;
  const [showLanding, setShowLanding] = useState(path !== "/app" && path !== "/app/" && path !== "/dms" && path !== "/dms/");
  const [name, setName] = useState(saved?.name || String(session.user.user_metadata?.username || session.user.email?.split("@")[0] || "Player"));
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
  const [showMembers, setShowMembers] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [filter, setFilter] = useState<"all" | "online">("all");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [voiceConnected, setVoiceConnected] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ name, status, active, view, channels, servers, activeServer, people, messages, accent, compact, unread } satisfies SavedState)); } catch { /* browser storage may be disabled */ }
  }, [name, status, active, view, channels, servers, activeServer, people, messages, accent, compact, unread]);
  useEffect(() => {
    const styleId = "minedm-micro-animations";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes mdm-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes mdm-pop-in { 0% { opacity: 0; transform: translateY(7px) scale(.985); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes mdm-slide-up { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
      @keyframes mdm-soft-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent); } 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 10%, transparent); } }
      @keyframes mdm-icon-hop { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(-4px); } 70% { transform: translateY(1px); } }
      @keyframes mdm-icon-nudge { 0%, 100% { transform: translateX(0); } 35% { transform: translateX(-2px); } 70% { transform: translateX(2px); } }
      @keyframes mdm-icon-wiggle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-7deg); } 65% { transform: rotate(7deg); } }
      @keyframes mdm-icon-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes mdm-icon-plus { 0% { transform: rotate(0) scale(1); } 60% { transform: rotate(100deg) scale(1.16); } 100% { transform: rotate(90deg) scale(1); } }
      @keyframes mdm-voice-ping { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 35%, transparent); } 100% { box-shadow: 0 0 0 8px transparent; } }
      @keyframes mdm-mic-wobble { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-8deg); } 70% { transform: rotate(8deg); } }
      .icon-btn:hover .icon-settings, .workspace-head button:hover .icon-settings, .user-bar button:hover .icon-settings { animation: mdm-icon-spin .9s cubic-bezier(.4, 0, .2, 1); }
      .server-icon:hover .icon-pickaxe, .server-icon:hover .icon-tree { animation: mdm-icon-hop .42s ease-out; }
      .server-icon.add:hover .icon-plus, .side-heading button:hover .icon-plus, .workspace-head button:hover .icon-plus { animation: mdm-icon-plus .4s cubic-bezier(.2,.8,.2,1); }
      .nav-item:hover .icon-hash { animation: mdm-icon-nudge .32s ease-in-out; }
      .side-link:hover .icon-users, .dm-item:hover .icon-message { animation: mdm-icon-wiggle .38s ease-in-out; }
      .search-wrap:focus-within .icon-search { animation: mdm-icon-wiggle .42s ease-in-out; color: var(--accent); }
      .topbar-title .icon-hash, .topbar-title .icon-at, .topbar-title .icon-users { transition: transform .25s ease, filter .25s ease; }
      .topbar-title:hover .icon-hash { transform: translateY(-2px); filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 55%, transparent)); }
      .voice-toggle { position: relative; overflow: visible; }
      .voice-toggle .ui-icon { transition: transform .22s ease, color .22s ease, filter .22s ease; }
      .voice-toggle:hover .ui-icon { transform: scale(1.12); filter: drop-shadow(0 0 5px currentColor); }
      .voice-toggle[aria-pressed="true"] { color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); border-color: color-mix(in srgb, var(--accent) 22%, transparent); }
      .voice-toggle[aria-pressed="true"].voice-connected { color: #5eead4; border-color: #5eead455; animation: mdm-voice-ping .7s ease-out; }
      .voice-toggle[aria-pressed="false"] { color: #ef7777; background: #ef444410; border-color: #ef444425; }
      .voice-toggle[aria-pressed="false"] .icon-micOff { animation: mdm-mic-wobble .42s ease-in-out; }
      .voice-toggle[aria-pressed="false"] .icon-headphonesOff { animation: mdm-icon-wiggle .38s ease-in-out; }
      .voice-toggle[aria-pressed="true"].voice-connected::after { content: ""; position: absolute; inset: -4px; border: 1px solid #5eead466; border-radius: 10px; animation: mdm-soft-pulse 1.8s ease-in-out infinite; pointer-events: none; }
      .landing-header, .hero .eyebrow, .hero h1, .hero > p, .hero-actions, .hero-note { animation: mdm-fade-up .55s cubic-bezier(.2,.7,.2,1) both; }
      .hero h1 { animation-delay: .06s; } .hero > p { animation-delay: .12s; } .hero-actions { animation-delay: .18s; } .hero-note { animation-delay: .24s; }
      .feature-grid article { transition: transform .22s ease, border-color .22s ease, background .22s ease; }
      .feature-grid article:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--accent) 28%, transparent); background: #151e29; }
      .btn, .icon-btn, .server-icon, .nav-item, .dm-item, .side-link, .filter-tabs button, .friend-card, .attach-btn, .send-btn { transition: transform .16s ease, color .16s ease, background-color .16s ease, border-color .16s ease, box-shadow .16s ease, filter .16s ease; }
      .btn:active, .icon-btn:active, .server-icon:active, .nav-item:active, .dm-item:active, .side-link:active, .send-btn:active { transform: scale(.96); }
      .server-icon:hover, .brand-mark:hover { transform: translateY(-2px); }
      .nav-item:hover, .dm-item:hover, .side-link:hover { transform: translateX(2px); }
      .icon-btn:hover, .attach-btn:hover { transform: scale(1.06); }
      .send-btn:not(:disabled):hover { transform: translateY(-1px) scale(1.04); box-shadow: 0 5px 18px color-mix(in srgb, var(--accent) 28%, transparent); }
      .message-row { animation: mdm-fade-up .24s ease-out both; }
      .message-row:hover .message-avatar { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent); }
      .composer { transition: border-color .2s ease, box-shadow .2s ease; }
      .composer:focus-within { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 7%, transparent); }
      .modal-backdrop { animation: mdm-pop-in .18s ease-out both; }
      .modal { animation: mdm-pop-in .22s cubic-bezier(.2,.8,.2,1) both; }
      .toast { animation: mdm-slide-up .22s ease-out both; }
      .pulse, .demo-pill i { animation: mdm-soft-pulse 2s ease-in-out infinite; }
      .avatar { transition: transform .18s ease, box-shadow .18s ease; }
      .friend-card:hover .avatar { transform: scale(1.05); }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById(styleId)?.remove(); };
  }, []);
  useEffect(() => { document.documentElement.style.setProperty("--accent", accent); }, [accent]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(t); }, [toast]);

  const currentServer = servers.find(s => s.id === activeServer) || servers[0];
  const serverChannels = channels.filter(c => (c.serverId || "block-buddies") === activeServer);
  const activeChannel = serverChannels.find(c => c.id === active) || serverChannels[0];
  const activePerson = people.find(p => p.name.toLowerCase() === active.toLowerCase());
  const activeKey = keyFor(view === "dm" ? "dm" : "channel", active);
  const activeKeyRef = useRef(activeKey);
  useEffect(() => { activeKeyRef.current = activeKey; }, [activeKey]);
  useEffect(() => {
    if (view !== "channel" || !active) return;
    let cancelled = false;
    supabase.from("channel_messages").select("id, author_id, author_name, body, created_at, reply_to")
      .eq("channel_id", active).order("created_at", { ascending: true }).limit(200)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { notify("Could not load shared messages: " + error.message); return; }
        const rows = (data || []).map(row => ({
          id: row.id, author: row.author_name, text: row.body,
          time: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          own: row.author_id === session.user.id,
          ...(row.reply_to ? { replyTo: row.reply_to as { author: string; text: string } } : {}),
        } satisfies Message));
        setMessages(old => ({ ...old, [keyFor("channel", active)]: rows, [active]: rows }));
      });
    return () => { cancelled = true; };
  }, [active, view, session.user.id]);

  useEffect(() => {
    if (view !== "channel" || !active) return;
    const channelId = active;
    const realtime = supabase.channel("minedm-" + channelId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "channel_messages", filter: "channel_id=eq." + channelId }, payload => {
        const row = payload.new as { id: string; author_id: string; author_name: string; body: string; created_at: string };
        const message: Message = { id: row.id, author: row.author_name, text: row.body, time: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), own: row.author_id === session.user.id };
        setMessages(old => {
          const list = old[keyFor("channel", channelId)] || [];
          if (list.some(item => item.id === message.id)) return old;
          const next = [...list, message];
          return { ...old, [keyFor("channel", channelId)]: next, [channelId]: next };
        });
      }).subscribe();
    return () => { void supabase.removeChannel(realtime); };
  }, [active, view, session.user.id]);
  const currentMessages = messages[activeKey] || messages[active] || [];
  const visibleMessages = search.trim() && (view === "channel" || view === "dm")
    ? currentMessages.filter(message => message.text.toLowerCase().includes(search.trim().toLowerCase()) || message.author.toLowerCase().includes(search.trim().toLowerCase()))
    : currentMessages;
  const filteredPeople = useMemo(() => people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || p.online)), [people, search, filter]);
  const filteredChannels = serverChannels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  function notify(text: string) { setToast(text); }
  function toggleReaction(messageId: string, emoji: string) {
    setMessages(old => {
      const list = old[activeKey] || old[active] || [];
      return { ...old, [activeKey]: list.map(message => message.id !== messageId ? message : { ...message, reactions: message.reactions?.includes(emoji) ? message.reactions.filter(item => item !== emoji) : [...(message.reactions || []), emoji] }) };
    });
  }
  function startReply(message: Message) {
    setReplyingTo(message);
    const input = document.querySelector<HTMLInputElement>(".composer input");
    input?.focus();
  }
  async function copyMessage(text: string) {
    try { await navigator.clipboard.writeText(text); notify("Message copied."); }
    catch { notify("Clipboard access is blocked by this browser."); }
  }
  function openApp() { window.history.pushState({}, "", "/app"); setShowLanding(false); setView("channel"); setActive(channels[0]?.id || "general"); }
  function openDM(person: Person | string) {
    const personName = typeof person === "string" ? person : person.name;
    if (!people.some(p => p.name.toLowerCase() === personName.toLowerCase())) setPeople(old => [...old, { name: personName, online: false, color: "blue", preview: "New conversation" }]);
    setActive(personName); setView("dm"); setTypingPerson(null); setShowLanding(false); setSidebarOpen(false); setUnread(old => ({ ...old, [keyFor("dm", personName)]: 0 })); window.history.pushState({}, "", "/dms"); setModal(null);
  }
  function openChannel(channel: Channel) { setTypingPerson(null); setActive(channel.id); setView("channel"); setUnread(old => ({ ...old, [keyFor("channel", channel.id)]: 0 })); setSidebarOpen(false); }
  async function sendMessage(e: FormEvent) {
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
      ...(replyingTo ? { replyTo: { author: replyingTo.author, text: replyingTo.text } } : {}),
    };
    if (view === "channel") {
      const { data, error } = await supabase.from("channel_messages").insert({
        channel_id: active, author_id: session.user.id, author_name: name, body: text,
        reply_to: replyingTo ? { author: replyingTo.author, text: replyingTo.text } : null,
      }).select("id, author_id, author_name, body, created_at, reply_to").single();
      if (error) { notify("Message not sent: " + error.message); return; }
      const savedMessage: Message = {
        id: data.id, author: data.author_name, text: data.body,
        time: new Date(data.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        own: data.author_id === session.user.id,
        ...(data.reply_to ? { replyTo: data.reply_to as { author: string; text: string } } : {}),
      };
      setMessages(old => {
        const list = old[keyFor("channel", active)] || [];
        const next = list.some(message => message.id === savedMessage.id) ? list : [...list, savedMessage];
        return { ...old, [keyFor("channel", active)]: next, [active]: next };
      });
      setDraft(""); setReplyingTo(null); notify("Message sent to the shared channel."); return;
    }
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
    setReplyingTo(null);
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
  return <div className={`app-shell ${compact ? "compact" : ""} ${showMembers && view === "channel" ? "has-members" : ""}`}>
    <aside className="server-rail"><button className={`brand-mark ${view === "home" ? "brand-active" : ""}`} title="Open direct messages" aria-label="Open direct messages" onClick={switchToDMHome}><Logo size={28} /></button><div className="rail-separator"/>{servers.map((server, index) => <button key={server.id} className={`server-icon ${activeServer === server.id && view !== "home" && view !== "dm" ? "selected" : ""}`} title={server.name} aria-label={`Open ${server.name}`} onClick={() => switchToServer(server)}>{index === 0 ? <Icon name="pickaxe" size={23} /> : index === 1 ? <Icon name="tree" size={22} /> : <span style={{fontWeight:900,fontSize:12}}>{initials(server.name)}</span>}</button>)}<button className="server-icon add" title="Create server" aria-label="Create server" onClick={() => { setModalInput(""); setModal("server"); }}><Icon name="plus" size={20} /></button><div className="rail-spacer"/></aside>
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="workspace-head"><div><strong>{view === "home" || view === "dm" ? "Direct Messages" : currentServer?.name || "Server"}</strong><small><i className="online-dot"/> {view === "home" || view === "dm" ? "Private conversations" : currentServer?.description || "Community server"}</small></div>{view !== "home" && view !== "dm" && <div style={{display:"flex",gap:2}}><button className="icon-btn" onClick={() => { setModalInput(currentServer?.name || ""); setModal("manageServer"); }} title="Rename server"><Icon name="settings" size={17} /></button><button className="icon-btn" onClick={() => { setModal("channel"); setModalInput(""); }} title="Add channel"><Icon name="plus" size={20} /></button></div>}</div>
      <div className="search-wrap"><span><Icon name="search" size={17} /></span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..." aria-label="Search conversations"/></div>
      <>{view !== "home" && view !== "dm" ? <>{view !== "channel" && <button className={`side-link ${view === "friends" ? "active" : ""}`} onClick={switchToFriends}><span><Icon name="users" size={17} /></span> Friends <span className="side-count">{people.length}</span></button>}<div className="side-heading"><span>TEXT CHANNELS</span><button onClick={() => { setModal("channel"); setModalInput(""); }} aria-label="Add channel"><Icon name="plus" size={20} /></button></div><div className="nav-list">{filteredChannels.map(c => <div key={c.id} className="channel-row"><button className={`nav-item ${view === "channel" && active === c.id ? "active" : ""}`} style={{flex:1,minWidth:0}} onClick={() => switchToChannel(c)}><span className="hash"><Icon name="hash" size={15} /></span><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span>{(unread[keyFor("channel", c.id)] || 0) > 0 && <span style={{ marginLeft: "auto", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#ed4245", color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center" }}>{unread[keyFor("channel", c.id)]}</span>}</button><button className="icon-btn channel-settings" title={"Manage #" + c.name} aria-label={"Manage #" + c.name} onClick={() => { setActive(c.id); setModalInput(c.name); setModal("manageChannel"); }}><Icon name="settings" size={14}/></button></div>)}</div></> : <><div className="side-heading"><span>DIRECT MESSAGES</span><button onClick={() => { setModal("dm"); setModalInput(""); }} aria-label="New direct message"><Icon name="plus" size={20} /></button></div><div className="dm-list">{filteredPeople.map(p => <button key={p.name.toLowerCase()} className={`dm-item ${view === "dm" && active.toLowerCase() === p.name.toLowerCase() ? "active" : ""}`} onClick={() => openDM(p)}><span className={`avatar ${p.color}`}>{initials(p.name)}{p.online && <i/>}</span><span className="dm-label"><strong>{p.name}</strong><small>{p.preview}</small></span><span className={`presence ${((p.status || (p.online ? "Online" : "Offline")) === "Online") ? "online" : ""}`} title={p.status || (p.online ? "Online" : "Offline")} style={{ background: (p.status || (p.online ? "Online" : "Offline")) === "Do not disturb" ? "#ed4245" : (p.status || (p.online ? "Online" : "Offline")) === "Idle" ? "#f0b232" : (p.status || (p.online ? "Online" : "Offline")) === "Offline" ? "#667184" : undefined }}/>{(unread[keyFor("dm", p.name)] || 0) > 0 && <span style={{ marginLeft: "auto", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#ed4245", color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center" }}>{unread[keyFor("dm", p.name)]}</span>}</button>)}</div></>}</>
      <div className="user-bar"><div className="avatar self">{initials(name)}</div><div className="user-account"><div className="user-account-top"><div className="user-label"><strong>{name}</strong><small>{status}</small></div><button className="icon-btn user-settings" title="User settings" aria-label="User settings" onClick={() => setModal("settings")}><Icon name="settings" size={17} /></button></div><div className="user-voice-controls"><button type="button" className={`icon-btn voice-toggle ${voiceConnected ? "voice-connected" : ""}`} title={voiceConnected ? "Disconnect demo voice" : "Connect demo voice"} aria-label={voiceConnected ? "Disconnect demo voice" : "Connect demo voice"} aria-pressed={voiceConnected} onClick={() => { setVoiceConnected(v => !v); notify(voiceConnected ? "Demo voice disconnected." : "Demo voice connected visually — live voice needs a backend."); }}><Icon name="voice" size={16} /></button><button type="button" className="icon-btn voice-toggle" title={microphoneEnabled ? "Mute microphone (demo)" : "Unmute microphone (demo)"} aria-label={microphoneEnabled ? "Mute microphone (demo)" : "Unmute microphone (demo)"} aria-pressed={microphoneEnabled} onClick={() => { setMicrophoneEnabled(v => !v); notify(microphoneEnabled ? "Microphone muted in the demo UI." : "Microphone unmuted in the demo UI."); }}><Icon name={microphoneEnabled ? "mic" : "micOff"} size={16} /></button><button type="button" className="icon-btn voice-toggle" title={audioEnabled ? "Turn audio off (demo)" : "Turn audio on (demo)"} aria-label={audioEnabled ? "Turn audio off (demo)" : "Turn audio on (demo)"} aria-pressed={audioEnabled} onClick={() => { setAudioEnabled(v => !v); notify(audioEnabled ? "Audio turned off in the demo UI." : "Audio turned on in the demo UI."); }}><Icon name={audioEnabled ? "headphones" : "headphonesOff"} size={16} /></button></div></div></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><button className="mobile-toggle" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle sidebar"><Icon name="menu" size={20} /></button><div className="topbar-title"><span className="title-symbol">{view === "channel" ? <Icon name="hash" /> : view === "dm" ? <Icon name="at" /> : <Icon name="users" />}</span><div><strong>{view === "channel" ? activeChannel?.name || active : view === "dm" ? active : view === "home" ? "Direct Messages" : "Friends"}</strong><small>{view === "channel" ? activeChannel?.description : view === "dm" ? (typingPerson === active ? "Typing…" : `${activePerson?.status || (activePerson?.online ? "Online" : "Offline")} · Direct message · Demo`) : view === "home" ? "Your private conversations" : "Your people, all in one place"}</small></div></div><div className="topbar-actions"><span className="demo-pill"><i/> LOCAL DEMO</span>{view === "channel" && <button className={`icon-btn member-toggle ${showMembers ? "active" : ""}`} title={showMembers ? "Hide member list" : "Show member list"} aria-label={showMembers ? "Hide member list" : "Show member list"} aria-pressed={showMembers} onClick={() => setShowMembers(v => !v)}><Icon name="users" size={18} /></button>}<button className="icon-btn" title="Inbox" aria-label="Inbox" onClick={() => setModal("inbox")}><Icon name="inbox" size={18} /></button></div></header>
      {(view === "friends" || view === "home") ? <section className="friends-view"><div className="friends-intro"><span className="section-kicker">{view === "home" ? "YOUR INBOX" : "YOUR COMMUNITY"}</span><h1>{view === "home" ? "Direct Messages" : "Friends"}</h1><p>{view === "home" ? "Pick a conversation or start a new one with your crew." : "Find your people and pick up where you left off."}</p><button className="btn primary" onClick={() => { setModal("dm"); setModalInput(""); }}>＋ Start a conversation</button></div><div className="friend-tools"><div className="filter-tabs">{view === "friends" ? <><button className={filter === "all" ? "chosen" : ""} onClick={() => setFilter("all")}>All friends <span>{people.length}</span></button><button className={filter === "online" ? "chosen" : ""} onClick={() => setFilter("online")}>Online <span>{people.filter(p => p.online).length}</span></button></> : <button className="chosen">All conversations <span>{people.length}</span></button>}</div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a friend..." aria-label="Find a friend"/></div><div className="friend-grid">{filteredPeople.map(p => <article className="friend-card" key={p.name}><div className={`avatar large ${p.color}`}>{initials(p.name)}<i className={p.online ? "online" : ""}/></div><div className="friend-info"><strong>{p.name}</strong><small>{p.online ? "Online now" : "Offline"}</small></div><button className="btn small primary" onClick={() => openDM(p)}>{view === "home" ? "Open DM" : "Message"}</button></article>)}</div>{!filteredPeople.length && <div className="empty-state">No friends match that search.</div>}</section> :
      <><div className="message-scroll" key={activeKey}><div className="date-divider"><span>WELCOME TO {view === "channel" ? "#" + (activeChannel?.name || active) : "YOUR CONVERSATION"}</span></div>{visibleMessages.length ? visibleMessages.map(m => <article className={`message-row message-row-actionable ${compact ? "tight" : ""}`} key={m.id}><div className={`avatar message-avatar ${m.own ? "self" : m.author === "MineDM" ? "bot" : "blue"}`}>{initials(m.author)}</div><div className="message-body"><div className="message-meta"><strong>{m.author}</strong>{m.author === "MineDM" && <span className="bot-tag">BOT</span>}<time>{m.time}</time></div>{m.replyTo && <div className="reply-context"><span>↳ Replying to <strong>{m.replyTo.author}</strong></span><p>{m.replyTo.text}</p></div>}<p>{m.text}</p>{!!m.reactions?.length && <div className="message-reactions">{m.reactions.map(emoji => <button key={emoji} className="reaction-chip selected" onClick={() => toggleReaction(m.id, emoji)} aria-label={`Remove ${emoji} reaction`}>{emoji}<span>1</span></button>)}</div>}<div className="message-actions"><button onClick={() => toggleReaction(m.id, "👍")} title="Add reaction" aria-label="Add thumbs up reaction">👍</button><button onClick={() => startReply(m)} title="Reply" aria-label={`Reply to ${m.author}`}><Icon name="reply" size={14}/></button><button onClick={() => { void copyMessage(m.text); }} title="Copy message" aria-label="Copy message"><Icon name="copy" size={14}/></button></div></div></article>) : <div className="empty-state"><div className="empty-icon"><Icon name="sparkles" size={25} /></div><h3>{search.trim() ? "No matching messages" : "This is the beginning."}</h3><p>{search.trim() ? "Try another keyword or clear the search." : "Send the first message to get the conversation going."}</p></div>}{typingPerson && <div style={{ padding: "0 4vw 8px", color: "#8792a5", fontSize: 11 }} role="status">{typingPerson} is typing<span aria-hidden="true">…</span></div>}</div><div className="composer-area">{replyingTo && <div className="replying-banner"><span><Icon name="reply" size={14}/> Replying to <strong>{replyingTo.author}</strong><small>{replyingTo.text}</small></span><button type="button" className="icon-btn" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><Icon name="close" size={14}/></button></div>}<form className="composer" onSubmit={sendMessage}><button type="button" className="attach-btn" title="Attachments are demo-only" aria-label="Attach file" onClick={() => notify("File uploads need a backend connection.")}><Icon name="paperclip" size={18} /></button><input value={draft} onChange={e => setDraft(e.target.value)} placeholder={view === "channel" ? `Message #${activeChannel?.name || active}` : `Message @${active}`} aria-label="Message" maxLength={4000}/><button className="send-btn" type="submit" disabled={!draft.trim()} aria-label="Send message"><Icon name="send" size={17} /></button></form><div className="composer-foot"><span>Keep it kind. Keep it crafty.</span><span><kbd>Enter</kbd> to send · Browser-only storage</span></div></div></>}
    </main>

    {showMembers && view === "channel" && <aside className="member-panel" aria-label="Channel members"><div className="member-panel-head"><div><strong>Members</strong><span>{people.length + 1} members</span></div><button className="icon-btn" onClick={() => setShowMembers(false)} aria-label="Hide member list" title="Hide member list"><Icon name="close" size={16}/></button></div><div className="member-group-label"><span className="member-status-dot online"/>ONLINE — {people.filter(p => p.online).length + 1}</div><div className="member-list"><div className="member-entry"><div className="avatar member-avatar self">{initials(name)}<i className="online"/></div><div><strong>{name}</strong><small>{status} · You</small></div><span className="member-you">YOU</span></div>{people.filter(p => p.online).map(p => <button className="member-entry" key={p.name} onClick={() => openDM(p)} title={`Message ${p.name}`}><div className={`avatar member-avatar ${p.color}`}>{initials(p.name)}<i className="online"/></div><div><strong>{p.name}</strong><small>{p.status || "Online"}</small></div><span className="member-entry-action"><Icon name="message" size={15}/></span></button>)}</div><div className="member-group-label"><span className="member-status-dot offline"/>OFFLINE — {people.filter(p => !p.online).length}</div><div className="member-list">{people.filter(p => !p.online).map(p => <button className="member-entry offline" key={p.name} onClick={() => openDM(p)} title={`Message ${p.name}`}><div className={`avatar member-avatar ${p.color}`}>{initials(p.name)}<i/></div><div><strong>{p.name}</strong><small>{p.status || "Offline"}</small></div><span className="member-entry-action"><Icon name="message" size={15}/></span></button>)}</div><div className="member-panel-note">Member list · Local demo data</div></aside>}
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
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSession(data.session); setAuthReady(true); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  if (!authReady) return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",background:"#090b10",color:"#5eead4",fontFamily:"system-ui"}}>Connecting to MineDM…</main>;
  if (!session) return <AuthScreen />;
  return <App session={session}/>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Root/></React.StrictMode>);
