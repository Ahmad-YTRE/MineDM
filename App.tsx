import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { AuthScreen } from "./AuthScreen";
import { censorProfanity } from "./profanity";
import { Icon } from "./icons.filename";

type Reaction = { emoji: string; count: number; reacted: boolean };
type Attachment = { path: string; name: string; mimeType: string; size: number; url?: string };
type Message = { id: string; publicId?: string; author: string; text: string; time: string; timestamp?: string; own?: boolean; reactions?: Reaction[]; replyTo?: { author: string; text: string }; attachments?: Attachment[] };
type PresenceStatus = "Online" | "Idle" | "Do not disturb" | "Offline";
type Person = { id: string; publicId?: string; name: string; online: boolean; status?: PresenceStatus; color: string; preview: string; avatarUrl?: string | null; isFriend?: boolean; hasConversation?: boolean };
type Server = { id: string; publicId?: string; name: string; description: string; createdBy?: string; inviteCode?: string; iconUrl?: string | null; role?: "owner" | "admin" | "member" };
type ServerRole = { id: string; server_id: string; name: string; color: string; position: number; permissions: { manage_server?: boolean; manage_roles?: boolean; manage_channels?: boolean; kick_members?: boolean; manage_messages?: boolean } };
type FriendRequest = { id: string; requester_id: string; addressee_id: string; name: string; avatarUrl?: string | null };
type AppNotification = { id: string; actor_id: string | null; type: string; title: string; body: string; entity_id: string | null; read_at: string | null; created_at: string };
type Channel = { id: string; publicId?: string; name: string; description: string; serverId?: string; category?: string };
type ContextMenuTarget = { kind: "person"; person: Person } | { kind: "server"; server: Server } | { kind: "channel"; channel: Channel } | { kind: "message"; message: Message } | { kind: "channels" };
type ContextMenuState = { x: number; y: number } & ContextMenuTarget;
type SavedState = {
  name: string; status: string; active: string; view: "channel" | "dm" | "friends" | "home";
  channels: Channel[]; servers?: Server[]; activeServer?: string; people: Person[]; messages: Record<string, Message[]>;
  compact: boolean; unread?: Record<string, number>;
};

const KEY = "voax.v2";
function readSaved(): SavedState | null {
  try { const value = localStorage.getItem(KEY) ?? localStorage.getItem("minedm.v2"); if (!value) return null; if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, value); return JSON.parse(value) as SavedState; } catch { return null; }
}
const saved = typeof window !== "undefined" ? readSaved() : null;
function initials(name: string) { return name.trim().split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "??"; }
function formatClock(date: Date, format: "12h" | "24h") { return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: format === "12h" }); }
async function signMessageAttachments(value: unknown): Promise<Attachment[]> {
  const attachments = Array.isArray(value) ? value as Omit<Attachment, "url">[] : [];
  if (!attachments.length) return [];
  const paths = [...new Set(attachments.map(attachment => attachment.path))];
  const { data } = await supabase.storage.from("message-attachments").createSignedUrls(paths, 3600);
  const urls = new Map((data || []).map(item => [item.path, item.signedUrl] as const));
  return attachments.map(attachment => ({ ...attachment, url: urls.get(attachment.path) ?? undefined }));
}
function keyFor(view: "channel" | "dm", name: string) { return view === "channel" ? "channel:" + name : "dm:" + name.toLowerCase(); }

function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return <span className={`logo-mark ${className}`} style={{ "--logo-size": `${size}px` } as React.CSSProperties} aria-hidden="true"><img src="/logo.png" alt="" /></span>;
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <span className={`skeleton-bar ${className}`} aria-hidden="true" />;
}

function WorkspaceSkeleton({ variant = "server" }: { variant?: "dm-home" | "server" }) {
  const dmHome = variant === "dm-home";
  return <div className={`app-shell workspace-loading ${dmHome ? "loading-dm-home" : "has-members loading-server"}`} aria-label={dmHome ? "Loading direct messages home" : "Loading server"} aria-busy="true">
    <aside className="server-rail"><SkeletonBar className="skeleton-server" /><div className="rail-separator" />{Array.from({ length: 4 }, (_, i) => <SkeletonBar key={i} className="skeleton-server" />)}<div className="rail-spacer" /></aside>
    <aside className="sidebar"><div className="workspace-head"><div className="skeleton-stack"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="skeleton-line wide" /></div></div><div className="search-wrap"><SkeletonBar className="skeleton-line wide" /></div>
      {dmHome ? <><div className="side-heading"><SkeletonBar className="skeleton-line medium" /></div><div className="dm-list">{Array.from({ length: 7 }, (_, i) => <div className="skeleton-person-row" key={i}><SkeletonBar className="skeleton-avatar" /><div className="skeleton-stack"><SkeletonBar className={`skeleton-line ${i % 3 ? "medium" : "wide"}`} /><SkeletonBar className="skeleton-line short" /></div></div>)}</div></> : <><div className="side-heading"><SkeletonBar className="skeleton-line short" /></div><div className="nav-list">{Array.from({ length: 5 }, (_, i) => <div className="skeleton-nav-row" key={i}><SkeletonBar className="skeleton-square" /><SkeletonBar className={`skeleton-line ${i % 2 ? "medium" : "wide"}`} /></div>)}</div><div className="side-heading"><SkeletonBar className="skeleton-line short" /></div><div className="dm-list">{Array.from({ length: 4 }, (_, i) => <div className="skeleton-person-row" key={i}><SkeletonBar className="skeleton-avatar" /><div className="skeleton-stack"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="skeleton-line short" /></div></div>)}</div></>}
      <div className="user-bar"><SkeletonBar className="skeleton-avatar" /><div className="skeleton-stack"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="skeleton-line short" /></div></div>
    </aside>
    <main className="main-panel"><header className="topbar"><div className="topbar-title"><SkeletonBar className="skeleton-square" /><div className="skeleton-stack"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="skeleton-line wide" /></div></div><SkeletonBar className="skeleton-square" /><SkeletonBar className="skeleton-square" /></header>
      {dmHome ? <div className="dm-home-skeleton-content"><div className="skeleton-stack dm-home-skeleton-intro"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="skeleton-line dm-home-skeleton-title" /><SkeletonBar className="skeleton-line dm-home-skeleton-copy" /><div className="dm-home-skeleton-actions"><SkeletonBar className="skeleton-line" /><SkeletonBar className="skeleton-line" /></div></div><div className="dm-home-skeleton-section"><SkeletonBar className="skeleton-line medium" />{Array.from({ length: 5 }, (_, i) => <div className="dm-home-skeleton-card" key={i}><SkeletonBar className="skeleton-avatar" /><div className="skeleton-stack"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className={`skeleton-line ${i % 2 ? "wide" : "message-line"}`} /></div><SkeletonBar className="skeleton-square" /></div>)}</div></div> : <><div className="message-scroll skeleton-message-list server-loading-messages">{Array.from({ length: 6 }, (_, i) => <div className="skeleton-message-row" key={i}><SkeletonBar className="skeleton-avatar" /><div className="skeleton-stack"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className={`skeleton-line ${i % 2 ? "wide" : "message-line"}`} /><SkeletonBar className="skeleton-line message-line-short" /></div></div>)}</div><div className="composer-area"><SkeletonBar className="skeleton-composer" /></div></>}
    </main>
    {!dmHome && <aside className="member-panel skeleton-member-panel"><div className="member-panel-head"><div className="skeleton-stack"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="skeleton-line short" /></div></div>{Array.from({ length: 7 }, (_, i) => <div className="skeleton-person-row" key={i}><SkeletonBar className="skeleton-avatar" /><div className="skeleton-stack"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="skeleton-line short" /></div></div>)}</aside>}
  </div>;
}

function DmConversationSkeleton() {
  return <div className="skeleton-message-list dm-conversation-skeleton" role="status" aria-label="Loading direct messages" aria-busy="true">{Array.from({ length: 7 }, (_, i) => <div className={`skeleton-message-row dm-skeleton-row ${i % 3 === 1 ? "indented" : ""}`} key={i}><SkeletonBar className="skeleton-avatar" /><div className="skeleton-stack"><div className="dm-skeleton-author"><SkeletonBar className={`skeleton-line ${i % 2 ? "medium" : "wide"}`} /><SkeletonBar className="skeleton-line short" /></div><SkeletonBar className={`skeleton-line ${i % 2 ? "message-line" : "dm-message-line"}`} /><SkeletonBar className="skeleton-line message-line-short" />{i % 3 === 0 && <SkeletonBar className="dm-skeleton-attachment" />}</div></div>)}</div>;
}

function SettingsSkeleton() {
  return <div className="settings-skeleton discord-settings-layout" aria-label="Loading settings" aria-busy="true"><nav className="discord-settings-nav"><SkeletonBar className="skeleton-line wide" />{Array.from({ length: 5 }, (_, i) => <div className="settings-skeleton-nav-row" key={i}><SkeletonBar className="skeleton-square" /><SkeletonBar className={`skeleton-line ${i % 2 ? "medium" : "wide"}`} /></div>)}</nav><div className="discord-settings-content"><div className="settings-skeleton-heading"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="settings-skeleton-title" /><SkeletonBar className="settings-skeleton-copy" /></div><div className="settings-skeleton-profile"><SkeletonBar className="settings-skeleton-avatar" /><div className="skeleton-stack"><SkeletonBar className="skeleton-line wide" /><SkeletonBar className="skeleton-line short" /></div></div>{Array.from({ length: 4 }, (_, i) => <div className="settings-skeleton-field" key={i}><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="settings-skeleton-input" /></div>)}<div className="settings-skeleton-save"><SkeletonBar className="skeleton-line wide" /></div></div></div>;
}

function Landing({ openApp }: { openApp: () => void }) {
  return <div className="landing">
    <header className="landing-header"><a className="wordmark" href="/"><Logo size={32} />Voax</a><nav><a href="#features">Features</a><a href="#community">Community</a><a href="/docs">User guide</a></nav><button className="btn primary" onClick={openApp}>Open web app <Icon name="arrowUpRight" size={15} /></button></header>
    <section className="hero"><Logo size={96} className="is-hero" /><h1>Chat. Chill.<br/><span>Have Fun.</span></h1><p>A familiar, friendly place to chat with your friends, organize your teams, and share your opinions.</p><div className="hero-actions"><button className="btn primary large" onClick={openApp}>Open Voax <Icon name="arrowRight" size={16} /></button><a className="btn secondary large" href="#features">Explore features</a></div><div className="hero-note"><Icon name="sparkles" size={15} /> A friendly space for your people</div></section>
    <section className="landing-features" id="features"><div className="section-kicker">MADE FOR YOUR CREW</div><h2>Everything your squad needs.</h2><div className="feature-grid"><article><div className="feature-icon"><Icon name="message" size={24} /></div><h3>Channels & DMs</h3><p>Keep server conversations organized and jump into private chats whenever you need.</p></article><article><div className="feature-icon"><Icon name="pickaxe" size={24} /></div><h3>Built for builders</h3><p>Talk about builds, share ideas, and plan your next adventure with your crew.</p></article><article><div className="feature-icon"><Icon name="zap" size={24} /></div><h3>Lightweight by design</h3><p>A clean, responsive interface that works on desktop, tablet, and mobile.</p></article></div></section>
    <footer className="landing-footer" id="community"><span className="wordmark"><Logo size={20} />Voax</span><span>© 2026 Voax · An independent community demo, not affiliated with Mojang.</span></footer>
  </div>;
}

type LinkPreviewData = { url: string; title?: string; description?: string; image?: string; siteName?: string; hostname?: string };
function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/link-preview?url=" + encodeURIComponent(url)).then(response => response.ok ? response.json() : null).then(value => {
      if (!cancelled && value && typeof value === "object") setData(value as LinkPreviewData);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [url]);
  let hostname = "Website";
  try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { /* invalid URL */ }
  return <a className="link-preview-card" href={url} target="_blank" rel="noopener noreferrer">
    {data?.image && <img className="link-preview-image" src={data.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = "none"; }} />}
    <span className="link-preview-copy"><span className="link-preview-site">{data?.siteName || data?.hostname || hostname}</span><strong>{data?.title || hostname}</strong>{data?.description && <span className="link-preview-description">{data.description}</span>}<span className="link-preview-url">{hostname}</span></span>
  </a>;
}
function MessageContent({ text, onJoinInvite }: { text: string; onJoinInvite: (code: string) => void }) {
  const tokens = text.split(/(https?:\/\/[^\s<>()]+|\/invite\/[A-Za-z0-9_-]+)/gi).filter(Boolean);
  const invites = [...new Set((text.match(/(?:https?:\/\/[^\s<>()]+)?\/invite\/([A-Za-z0-9_-]+)/gi) || []).map(value => value.match(/\/invite\/([A-Za-z0-9_-]+)/i)?.[1]).filter((value): value is string => Boolean(value)))];
  const urls = [...new Set((text.match(/https?:\/\/[^\s<>()]+/gi) || []).map(value => value.replace(/[.,!?;:]+$/, "")))].filter(value => !/\/invite\//i.test(value));
  return <div className="message-content"><p>{tokens.map((token, index) => {
    const invite = token.match(/(?:https?:\/\/[^/]+)?\/invite\/([A-Za-z0-9_-]+)/i);
    if (invite) return <a key={index} href={"/invite/" + invite[1]} onClick={event => { event.preventDefault(); window.location.assign("/invite/" + invite[1]); }}>voax invite: {invite[1]}</a>;
    if (/^https?:\/\//i.test(token)) return <a key={index} href={token} target="_blank" rel="noopener noreferrer">{token}</a>;
    return <React.Fragment key={index}>{token}</React.Fragment>;
  })}</p>
    {invites.map(code => <div className="invite-preview-card" key={code}><div className="invite-preview-icon"><Icon name="users" size={24} /></div><div className="invite-preview-copy"><strong>Voax server invite</strong><span>Join this community on Voax</span><small>Invite: {code}</small></div><button type="button" className="btn primary invite-join-button" onClick={() => onJoinInvite(code)}>Join server</button></div>)}
    {urls.map(url => <LinkPreview key={url} url={url} />)}
  </div>;
}

function App({ session }: { session: Session }) {
  const path = window.location.pathname;
  const [showLanding, setShowLanding] = useState(!(path === "/app" || path === "/app/" || path === "/dms" || path === "/dms/" || path.startsWith("/dm/") || path.startsWith("/channel/") || path.startsWith("/channels/") || path.startsWith("/invite/")));
  const [name, setName] = useState("Player");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [serverIconBusy, setServerIconBusy] = useState(false);
  const [categoryInput, setCategoryInput] = useState("Text Channels");
  const [categoryCreationMode, setCategoryCreationMode] = useState(false);
  const [serverMemberRoles, setServerMemberRoles] = useState<Record<string, Record<string, "owner" | "admin" | "member">>>({});
  const [customServerRoles, setCustomServerRoles] = useState<ServerRole[]>([]);
  const [customRoleAssignments, setCustomRoleAssignments] = useState<Record<string, Record<string, string[]>>>({});
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#5865f2");
  const [newRolePermissions, setNewRolePermissions] = useState<ServerRole["permissions"]>({manage_channels:false,manage_messages:false,kick_members:false,manage_roles:false,manage_server:false});
  const [status, setStatus] = useState<PresenceStatus>("Online");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"account" | "appearance">("account");
  const [profileBio, setProfileBio] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("voax.theme") ?? localStorage.getItem("minedm.theme")) === "light" ? "light" : "dark");
  const [clockFormat, setClockFormat] = useState<"12h" | "24h">(() => localStorage.getItem("voax.clockFormat") === "24h" ? "24h" : "12h");
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServer, setActiveServer] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [conversationIds, setConversationIds] = useState<Record<string, string>>({});
  const [active, setActive] = useState("");
  const initialRouteHandled = useRef(false);
  const [view, setView] = useState<"channel" | "dm" | "friends" | "home">(path.startsWith("/dm/") ? "dm" : path.startsWith("/channels/") ? "channel" : window.location.search === "?view=friends" ? "friends" : "home");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [modal, setModal] = useState<"dm" | "friend" | "channel" | "server" | "joinServer" | "manageServer" | "manageRoles" | "manageChannel" | "confirmDelete" | "settings" | "inbox" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ type: "server" | "channel"; id: string; name: string } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Person | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [toast, setToast] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [compact, setCompact] = useState(saved?.compact || false);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("voax.theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("voax.clockFormat", clockFormat); }, [clockFormat]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [typingPerson, setTypingPerson] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [filter, setFilter] = useState<"all" | "online">("all");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [incomingVoiceOffer, setIncomingVoiceOffer] = useState<{from:string;description:RTCSessionDescriptionInit}|null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection|null>(null);
  const localStreamRef = useRef<MediaStream|null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement|null>(null);
  const voiceChannelRef = useRef<ReturnType<typeof supabase.channel>|null>(null);
  const queuedIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [presenceByUser, setPresenceByUser] = useState<Record<string, PresenceStatus>>({});
  const [serverMembersByServer, setServerMembersByServer] = useState<Record<string, string[]>>({});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messageEventsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeRef = useRef(active);
  const viewRef = useRef(view);
  const peopleRef = useRef(people);
  const nameRef = useRef(name);
  const currentMessageIdsRef = useRef<string[]>([]);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ compact })); } catch { /* browser storage may be disabled */ }
  }, [compact]);
  useEffect(() => {
    const styleId = "voax-micro-animations";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes voax-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes voax-button-spinner { to { transform: rotate(360deg); } }
      .button-spinner { display: inline-block; width: 12px; height: 12px; flex: 0 0 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; vertical-align: -2px; animation: voax-button-spinner .7s linear infinite; margin-left: 5px; }
      .btn:disabled, .send-btn:disabled { cursor: wait; opacity: .72; }
      @media (prefers-reduced-motion: reduce) { .button-spinner { animation-duration: 1.8s; } }
      @keyframes voax-pop-in { 0% { opacity: 0; transform: translateY(7px) scale(.985); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes voax-slide-up { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
      @keyframes voax-soft-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent); } 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 10%, transparent); } }
      @keyframes voax-icon-hop { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(-4px); } 70% { transform: translateY(1px); } }
      @keyframes voax-icon-nudge { 0%, 100% { transform: translateX(0); } 35% { transform: translateX(-2px); } 70% { transform: translateX(2px); } }
      @keyframes voax-icon-wiggle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-7deg); } 65% { transform: rotate(7deg); } }
      @keyframes voax-icon-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes voax-icon-plus { 0% { transform: rotate(0) scale(1); } 60% { transform: rotate(100deg) scale(1.16); } 100% { transform: rotate(90deg) scale(1); } }
      @keyframes voax-voice-ping { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 35%, transparent); } 100% { box-shadow: 0 0 0 8px transparent; } }
      @keyframes voax-mic-wobble { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-8deg); } 70% { transform: rotate(8deg); } }
      .icon-btn:hover .icon-settings, .workspace-head button:hover .icon-settings, .user-bar button:hover .icon-settings { animation: voax-icon-spin .9s cubic-bezier(.4, 0, .2, 1); }
      .server-icon:hover .icon-pickaxe, .server-icon:hover .icon-tree { animation: voax-icon-hop .42s ease-out; }
      .server-icon.add:hover .icon-plus, .side-heading button:hover .icon-plus, .workspace-head button:hover .icon-plus { animation: voax-icon-plus .4s cubic-bezier(.2,.8,.2,1); }
      .nav-item:hover .icon-hash { animation: voax-icon-nudge .32s ease-in-out; }
      .side-link:hover .icon-users, .dm-item:hover .icon-message { animation: voax-icon-wiggle .38s ease-in-out; }
      .search-wrap:focus-within .icon-search { animation: voax-icon-wiggle .42s ease-in-out; color: var(--accent); }
      .topbar-title .icon-hash, .topbar-title .icon-at, .topbar-title .icon-users { transition: transform .25s ease, filter .25s ease; }
      .topbar-title:hover .icon-hash { transform: translateY(-2px); filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 55%, transparent)); }
      .voice-toggle { position: relative; overflow: visible; }
      .voice-toggle .ui-icon { transition: transform .22s ease, color .22s ease, filter .22s ease; }
      .voice-toggle:hover .ui-icon { transform: scale(1.12); filter: drop-shadow(0 0 5px currentColor); }
      .voice-toggle[aria-pressed="true"] { color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); border-color: color-mix(in srgb, var(--accent) 22%, transparent); }
      .voice-toggle[aria-pressed="true"].voice-connected { color: #5eead4; border-color: #5eead455; animation: voax-voice-ping .7s ease-out; }
      .voice-toggle[aria-pressed="false"] { color: #ef7777; background: #ef444410; border-color: #ef444425; }
      .voice-toggle[aria-pressed="false"] .icon-micOff { animation: voax-mic-wobble .42s ease-in-out; }
      .voice-toggle[aria-pressed="false"] .icon-headphonesOff { animation: voax-icon-wiggle .38s ease-in-out; }
      .voice-toggle[aria-pressed="true"].voice-connected::after { content: ""; position: absolute; inset: -4px; border: 1px solid #5eead466; border-radius: 10px; animation: voax-soft-pulse 1.8s ease-in-out infinite; pointer-events: none; }
      .landing-header, .hero .eyebrow, .hero h1, .hero > p, .hero-actions, .hero-note { animation: voax-fade-up .55s cubic-bezier(.2,.7,.2,1) both; }
      .hero h1 { animation-delay: .06s; } .hero > p { animation-delay: .12s; } .hero-actions { animation-delay: .18s; } .hero-note { animation-delay: .24s; }
      .feature-grid article { transition: transform .22s ease, border-color .22s ease, background .22s ease; }
      .feature-grid article:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--accent) 28%, transparent); background: #151e29; }
      .btn, .icon-btn, .server-icon, .nav-item, .dm-item, .side-link, .filter-tabs button, .friend-card, .attach-btn, .send-btn { transition: transform .16s ease, color .16s ease, background-color .16s ease, border-color .16s ease, box-shadow .16s ease, filter .16s ease; }
      .btn:active, .icon-btn:active, .server-icon:active, .nav-item:active, .dm-item:active, .side-link:active, .send-btn:active { transform: scale(.96); }
      .server-icon:hover, .brand-mark:hover { transform: translateY(-2px); }
      .nav-item:hover, .dm-item:hover, .side-link:hover { transform: translateX(2px); }
      .icon-btn:hover, .attach-btn:hover { transform: scale(1.06); }
      .send-btn:not(:disabled):hover { transform: translateY(-1px) scale(1.04); box-shadow: 0 5px 18px color-mix(in srgb, var(--accent) 28%, transparent); }
      .message-row { animation: voax-fade-up .24s ease-out both; }
      .message-row:hover .message-avatar { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent); }
      .composer { transition: border-color .2s ease, box-shadow .2s ease; }
      .composer:focus-within { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 7%, transparent); }
      .modal-backdrop { animation: voax-pop-in .18s ease-out both; }
      .modal { animation: voax-pop-in .22s cubic-bezier(.2,.8,.2,1) both; }
      .toast { animation: voax-slide-up .22s ease-out both; }
      .pulse, .demo-pill i { animation: voax-soft-pulse 2s ease-in-out infinite; }
      .avatar { transition: transform .18s ease, box-shadow .18s ease; }
      .avatar img { width: 100%; height: 100%; display: block; object-fit: cover; border-radius: inherit; }
      .friend-card:hover .avatar { transform: scale(1.05); }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById(styleId)?.remove(); };
  }, []);
  useEffect(() => { document.documentElement.style.setProperty("--accent", "#00e5ff"); }, []);
  useEffect(() => { if (activeServer) void loadCustomServerRoles(activeServer); }, [activeServer]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(t); }, [toast]);

  const currentServer = servers.find(s => s.id === activeServer) || servers[0];
  const serverMemberIds = serverMembersByServer[activeServer] || [];
  const serverMemberPeople = serverMemberIds.filter(id => id !== session.user.id).map(id => {
    const person = people.find(p => p.id === id);
    const presence = presenceByUser[id];
    return person
      ? { ...person, online: Boolean(presence && presence !== "Offline"), status: (presence && presence !== "Offline" ? presence : "Offline") as PresenceStatus }
      : { id, name: "Player", online: false, status: "Offline" as PresenceStatus, color: "blue", preview: "Server member", avatarUrl: null };
  });
  const onlineServerMembers = serverMemberPeople.filter(person => person.online);
  const offlineServerMembers = serverMemberPeople.filter(person => !person.online);
  const isOwnerOrAdmin = currentServer?.role === "owner" || currentServer?.role === "admin";
  const myCustomRoleIds = customRoleAssignments[activeServer]?.[session.user.id] || [];
  const myCustomPermissions = customServerRoles.filter(role => myCustomRoleIds.includes(role.id)).reduce((permissions, role) => ({...permissions, ...Object.fromEntries(Object.entries(role.permissions||{}).map(([key,enabled])=>[key,Boolean(permissions[key as keyof typeof permissions]||enabled)]))}), {} as ServerRole["permissions"]);
  const canManageRoles = Boolean(isOwnerOrAdmin || myCustomPermissions.manage_roles);
  const canManageChannels = Boolean(isOwnerOrAdmin || myCustomPermissions.manage_channels);
  const canManageMessages = Boolean(isOwnerOrAdmin || myCustomPermissions.manage_messages);
  const canKickMembers = Boolean(isOwnerOrAdmin || myCustomPermissions.kick_members);
  const canManageServer = Boolean(isOwnerOrAdmin || myCustomPermissions.manage_server);
  const serverChannels = channels.filter(c => (c.serverId || "block-buddies") === activeServer);
  const activeChannel = serverChannels.find(c => c.id === active) || serverChannels[0];
  const activePerson = people.find(p => p.name.toLowerCase() === active.toLowerCase());
  const activeKey = keyFor(view === "dm" ? "dm" : "channel", active);
  const activeKeyRef = useRef(activeKey);
  useEffect(() => { activeKeyRef.current = activeKey; activeRef.current = active; viewRef.current = view; peopleRef.current = people; nameRef.current = name; }, [activeKey, active, view, people, name]);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{try{let profile=await supabase.from("profiles").select("username,status,avatar_url,public_id").eq("id",session.user.id).maybeSingle();if(profile.error)throw profile.error;if(!profile.data){const p=await supabase.from("profiles").upsert({id:session.user.id,username:String(session.user.user_metadata?.username||session.user.user_metadata?.global_name||session.user.user_metadata?.full_name||session.user.user_metadata?.name||session.user.user_metadata?.preferred_username||session.user.email?.split("@")[0]||"Player").slice(0,32),status:"Online",avatar_url:session.user.user_metadata?.avatar_url||null},{onConflict:"id",ignoreDuplicates:true});if(p.error)throw p.error;profile=await supabase.from("profiles").select("username,status,avatar_url,public_id").eq("id",session.user.id).maybeSingle();if(profile.error)throw profile.error;}if(profile.data){const oauthName=String(session.user.user_metadata?.username||session.user.user_metadata?.global_name||session.user.user_metadata?.full_name||session.user.user_metadata?.name||session.user.user_metadata?.preferred_username||"").trim().replace(/\s+/g," ").slice(0,32);const resolvedName=profile.data.username==="Player"&&oauthName?oauthName:(profile.data.username||oauthName||"Player");setName(resolvedName);setStatus((profile.data.status||"Online") as PresenceStatus);let resolvedAvatar=profile.data.avatar_url||null;const providerAvatar=session.user.user_metadata?.avatar_url;if(!resolvedAvatar&&typeof providerAvatar==="string"&&providerAvatar.startsWith("https://")){const {error:avatarSyncError}=await supabase.from("profiles").update({avatar_url:providerAvatar,...(profile.data.username==="Player"&&oauthName?{username:oauthName}:{})}).eq("id",session.user.id);if(!avatarSyncError)resolvedAvatar=providerAvatar;}else if(profile.data.username==="Player"&&oauthName){await supabase.from("profiles").update({username:oauthName}).eq("id",session.user.id);}setAvatarUrl(resolvedAvatar);}await loadWorkspace();}catch(error){if(!cancelled)notify("Couldn't load your Voax workspace: "+(error instanceof Error?error.message:"Please try again."));}finally{if(!cancelled)setWorkspaceLoading(false);}})();
    return()=>{cancelled=true;};
  },[session.user.id]);
  useEffect(()=>{
    const channelId=view==="channel"?active:null,conversationId=view==="dm"&&activePerson?conversationIds[activePerson.id]:null;
    if(!channelId&&!conversationId){setMessagesLoading(false);return;}let cancelled=false;setMessagesLoading(true);
    const loadMessages=async()=>{
      const result=channelId?await supabase.from("messages").select("id,author_id,body,created_at,reply_to,channel_id,conversation_id,attachments").eq("channel_id",channelId).order("created_at",{ascending:true}).limit(200):await supabase.from("messages").select("id,author_id,body,created_at,reply_to,channel_id,conversation_id,attachments").eq("conversation_id",conversationId!).order("created_at",{ascending:true}).limit(200);
      if(cancelled)return;if(result.error){notify("Couldn't load messages: "+result.error.message);setMessagesLoading(false);return;}
      const rows=result.data||[],authorIds=[...new Set(rows.map(row=>row.author_id))];
      const names=new Map<string,string>(peopleRef.current.map(person=>[person.id,person.name] as const));names.set(session.user.id,nameRef.current);
      const missingAuthorIds=authorIds.filter(id=>!names.has(id));
      if(missingAuthorIds.length){const p=await supabase.from("profiles").select("id,username").in("id",missingAuthorIds);if(p.error){notify("Couldn't load message authors: "+p.error.message);setMessagesLoading(false);return;}for(const profile of p.data||[])names.set(profile.id,profile.username||"Player");}
      const byId=new Map(rows.map(row=>[row.id,row]));
      const reactionMap=new Map<string,Reaction[]>();
      if(rows.length){const rr=await supabase.from("message_reactions").select("message_id,user_id,emoji").in("message_id",rows.map(row=>row.id));if(rr.error){notify("Unable to load reactions: "+rr.error.message);setMessagesLoading(false);return;}for(const r of rr.data||[]){const list=reactionMap.get(r.message_id)||[];const existing=list.find(x=>x.emoji===r.emoji);if(existing){existing.count++;if(r.user_id===session.user.id)existing.reacted=true;}else list.push({emoji:r.emoji,count:1,reacted:r.user_id===session.user.id});reactionMap.set(r.message_id,list);}}
      const mapped:Message[]=await Promise.all(rows.map(async row=>{const reply=row.reply_to?byId.get(row.reply_to):null;const attachments=await signMessageAttachments(row.attachments);return{id:row.id,author:names.get(row.author_id)||(row.author_id===session.user.id?nameRef.current:"Member"),text:row.body,time:formatClock(new Date(row.created_at), clockFormat),timestamp:row.created_at,own:row.author_id===session.user.id,...(reply?{replyTo:{author:names.get(reply.author_id)||"Member",text:reply.body}}:{}),...(reactionMap.has(row.id)?{reactions:reactionMap.get(row.id)}:{}),...(attachments.length?{attachments}:{})};}));
      setMessages(old=>({...old,[activeKey]:mapped,[active]:mapped}));setMessagesLoading(false);
    };
    void loadMessages().catch(error=>{if(!cancelled){notify("Couldn't load messages: "+(error instanceof Error?error.message:"Please try again."));setMessagesLoading(false);}});
    return()=>{cancelled=true;};
  },[active,activeKey,view,session.user.id,conversationIds,activePerson?.id]);
  useEffect(()=>{
    const channelId=view==="channel"?active:null,conversationId=view==="dm"&&activePerson?conversationIds[activePerson.id]:null;
    if(!channelId&&!conversationId)return;
    const filter=channelId?"channel_id=eq."+channelId:"conversation_id=eq."+conversationId;
    const realtime=supabase.channel("voax-messages-"+(channelId||conversationId))
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter},async payload=>{
        const row=payload.new as {id:string;author_id:string;body:string;created_at:string;reply_to:string|null;attachments?:unknown};
        const attachments=await signMessageAttachments(row.attachments);
        const message:Message={id:row.id,author:row.author_id===session.user.id?nameRef.current:(peopleRef.current.find(p=>p.id===row.author_id)?.name||"Member"),text:row.body,time:formatClock(new Date(row.created_at), clockFormat),timestamp:row.created_at,own:row.author_id===session.user.id,...(attachments.length?{attachments}:{})};
        setMessages(old=>{const list=old[activeKey]||old[active]||[];if(list.some(m=>m.id===message.id))return old;const next=[...list,message];return{...old,[activeKey]:next,[active]:next};});
      })
      .on("broadcast",{event:"message-deleted"},payload=>{
        const deletedId=payload.payload?.id;
        if(typeof deletedId!=="string")return;
        setMessages(old=>Object.fromEntries(Object.entries(old).map(([key,list])=>[key,list.filter(message=>message.id!==deletedId)])));
      }).subscribe();
    messageEventsChannelRef.current=realtime;
    return()=>{if(messageEventsChannelRef.current===realtime)messageEventsChannelRef.current=null;void supabase.removeChannel(realtime);};
  },[active,activeKey,view,session.user.id,conversationIds,activePerson?.id]);

  useEffect(()=>{
    const channel=supabase.channel("voax-presence",{config:{presence:{key:session.user.id}}});
    const sync=()=>{const state=channel.presenceState() as Record<string,Array<{userId?:string;status?:PresenceStatus}>>;const next:Record<string,PresenceStatus>={};for(const entries of Object.values(state))for(const entry of entries){if(entry.userId)next[entry.userId]=entry.status||"Online";}setPresenceByUser(next);};
    channel.on("presence",{event:"sync"},sync).subscribe(async state=>{if(state==="SUBSCRIBED"){if(status==="Offline")await channel.untrack();else await channel.track({userId:session.user.id,status,online_at:new Date().toISOString()});sync();}});
    return()=>{void channel.untrack();void supabase.removeChannel(channel);};
  },[session.user.id,status]);
  useEffect(()=>{setPeople(old=>old.map(person=>({...person,online:Boolean(presenceByUser[person.id]&&presenceByUser[person.id]!=="Offline"),status:presenceByUser[person.id]||"Offline"})));},[presenceByUser]);
  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{const {data,error}=await supabase.from("notifications").select("id,actor_id,type,title,body,entity_id,read_at,created_at").order("created_at",{ascending:false}).limit(40);if(cancelled)return;if(error){notify("Unable to load notifications: "+error.message);return;}setNotifications(data||[]);};
    void load();const channel=supabase.channel("voax-notifications-"+session.user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"recipient_id=eq."+session.user.id},payload=>{const row=payload.new as AppNotification;setNotifications(old=>[row,...old.filter(n=>n.id!==row.id)].slice(0,40));notify(row.title);}).subscribe();
    return()=>{cancelled=true;void supabase.removeChannel(channel);};
  },[session.user.id]);
  useEffect(()=>{const channel=supabase.channel("voax-channel-unread-"+session.user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{const row=payload.new as {id:string;channel_id:string|null;author_id:string;created_at:string};if(!row.channel_id||row.author_id===session.user.id||(viewRef.current==="channel"&&activeRef.current===row.channel_id))return;const key=keyFor("channel",row.channel_id);setUnread(old=>({...old,[key]:(old[key]||0)+1}));}).subscribe();return()=>{void supabase.removeChannel(channel);};},[session.user.id]);

  useEffect(()=>{
    const conversationId=view==="dm"&&activePerson?conversationIds[activePerson.id]:null;
    if(!conversationId){voiceChannelRef.current=null;return;}
    const channel=supabase.channel("voax-voice-"+conversationId,{config:{broadcast:{self:false},private:true}});
    voiceChannelRef.current=channel;
    channel.on("broadcast",{event:"voice-signal"},async({payload})=>{
      if(payload?.to!==session.user.id||payload?.from!==activePerson?.id)return;
      try{
        if(payload.kind==="offer"&&payload.description&&!peerConnectionRef.current){setIncomingVoiceOffer({from:payload.from,description:payload.description});notify("Incoming voice call. Press the voice button to answer.");}
        else if(payload.kind==="answer"&&payload.description&&peerConnectionRef.current){await peerConnectionRef.current.setRemoteDescription(payload.description);await applyQueuedIce(peerConnectionRef.current);}
        else if(payload.kind==="ice"&&payload.candidate){if(peerConnectionRef.current?.remoteDescription)await peerConnectionRef.current.addIceCandidate(payload.candidate);else queuedIceCandidatesRef.current.push(payload.candidate);}
        else if(payload.kind==="hangup"){stopVoiceCall(false);notify("The voice call ended.");}
      }catch(error){notify("Voice connection error: "+(error instanceof Error?error.message:"Please try again."));}
    }).subscribe();
    return()=>{if(voiceChannelRef.current===channel)voiceChannelRef.current=null;void supabase.removeChannel(channel);if(peerConnectionRef.current)stopVoiceCall(false);};
  },[view,activePerson?.id,conversationIds,session.user.id]);
  useEffect(()=>{
    if(typingTimeoutRef.current!==null)window.clearTimeout(typingTimeoutRef.current);
    const channel=supabase.channel("voax-typing-"+activeKey);
    typingChannelRef.current=channel;
    channel.on("broadcast",{event:"typing"},({payload})=>{if(payload?.userId===session.user.id||payload?.activeKey!==activeKey)return;setTypingPerson(payload?.typing?String(payload?.name||"Someone"):null);if(payload?.typing){if(typingTimeoutRef.current!==null)window.clearTimeout(typingTimeoutRef.current);typingTimeoutRef.current=window.setTimeout(()=>setTypingPerson(null),1800);}}).subscribe();
    return()=>{if(typingTimeoutRef.current!==null)window.clearTimeout(typingTimeoutRef.current);typingChannelRef.current=null;void supabase.removeChannel(channel);};
  },[activeKey,session.user.id]);

  const currentMessages = messages[activeKey] || messages[active] || [];
  const currentMessageIds = currentMessages.map(message=>message.id).join(",");
  useEffect(()=>{currentMessageIdsRef.current=currentMessageIds?currentMessageIds.split(","):[];},[currentMessageIds]);
  useEffect(()=>{const channel=supabase.channel("voax-reactions-"+activeKey).on("postgres_changes",{event:"*",schema:"public",table:"message_reactions"},payload=>{const eventType=(payload as any).eventType as string;const row=((eventType==="DELETE"?(payload as any).old:(payload as any).new)||{}) as {message_id?:string;user_id?:string;emoji?:string};if(!row.message_id||!row.emoji||row.user_id===session.user.id||!currentMessageIdsRef.current.includes(row.message_id))return;const delta=eventType==="DELETE"?-1:1;setMessages(old=>{const key=activeKeyRef.current;const list=old[key]||old[activeRef.current]||[];return{...old,[key]:list.map(message=>{if(message.id!==row.message_id)return message;const reactions=[...(message.reactions||[])];const index=reactions.findIndex(reaction=>reaction.emoji===row.emoji);if(index<0){if(delta<0)return message;reactions.push({emoji:row.emoji!,count:1,reacted:false});}else{const count=reactions[index].count+delta;if(count<=0)reactions.splice(index,1);else reactions[index]={...reactions[index],count};}return{...message,reactions};})};});}).subscribe();return()=>{void supabase.removeChannel(channel);};},[activeKey,session.user.id]);

  const visibleMessages = search.trim() && (view === "channel" || view === "dm")
    ? currentMessages.filter(message => message.text.toLowerCase().includes(search.trim().toLowerCase()) || message.author.toLowerCase().includes(search.trim().toLowerCase()))
    : currentMessages;
  const filteredPeople = useMemo(() => people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || p.online) && (view !== "friends" || p.isFriend) && (view !== "home" || p.hasConversation)), [people, search, filter, view]);
  const filteredChannels = serverChannels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const channelGroups = useMemo(() => { const groups: Record<string, Channel[]> = {}; for (const channel of filteredChannels) (groups[channel.category || "Text Channels"] ||= []).push(channel); return Object.entries(groups); }, [filteredChannels]);

  function notify(text: string) { setToast(text); }
  async function withBusyAction(key: string, action: () => Promise<unknown>) {
    if (busyAction) return;
    setBusyAction(key);
    try { await action(); } finally { setBusyAction(null); }
  }
  function stopVoiceCall(notifyPeer=true){
    if(notifyPeer&&activePerson&&voiceChannelRef.current)void voiceChannelRef.current.send({type:"broadcast",event:"voice-signal",payload:{kind:"hangup",from:session.user.id,to:activePerson.id}});
    peerConnectionRef.current?.close();peerConnectionRef.current=null;
    localStreamRef.current?.getTracks().forEach(track=>track.stop());localStreamRef.current=null;
    if(remoteAudioRef.current)remoteAudioRef.current.srcObject=null;
    queuedIceCandidatesRef.current=[];setVoiceConnected(false);setIncomingVoiceOffer(null);
  }
  function createVoicePeer(remoteUserId:string){
    const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    peerConnectionRef.current=pc;
    pc.onicecandidate=event=>{if(event.candidate&&voiceChannelRef.current)void voiceChannelRef.current.send({type:"broadcast",event:"voice-signal",payload:{kind:"ice",from:session.user.id,to:remoteUserId,candidate:event.candidate.toJSON()}});};
    pc.ontrack=event=>{if(remoteAudioRef.current){remoteAudioRef.current.srcObject=event.streams[0];remoteAudioRef.current.muted=!audioEnabled;void remoteAudioRef.current.play().catch(()=>{});}};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==="connected"){setVoiceConnected(true);notify("Voice call connected.");}else if(pc.connectionState==="failed"||pc.connectionState==="closed"){if(peerConnectionRef.current===pc)stopVoiceCall(false);}};
    return pc;
  }
  async function applyQueuedIce(pc:RTCPeerConnection){const queued=queuedIceCandidatesRef.current.splice(0);for(const candidate of queued){try{await pc.addIceCandidate(candidate);}catch{/* stale ICE candidates can be ignored */}}}
  async function startVoiceCall(){
    if(view!=="dm"||!activePerson||!conversationIds[activePerson.id]){notify("Open a direct message before starting a voice call.");return;}
    if(!voiceChannelRef.current){notify("Voice signaling is still connecting. Try again in a moment.");return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});localStreamRef.current=stream;
      const pc=createVoicePeer(activePerson.id);stream.getAudioTracks().forEach(track=>{track.enabled=microphoneEnabled;pc.addTrack(track,stream);});
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      await voiceChannelRef.current.send({type:"broadcast",event:"voice-signal",payload:{kind:"offer",from:session.user.id,to:activePerson.id,description:pc.localDescription?.toJSON()}});
      setVoiceConnected(true);notify("Calling "+activePerson.name+"… Keep this DM open so they can receive the call.");
    }catch(error){stopVoiceCall(false);notify("Unable to start voice call: "+(error instanceof Error?error.message:"Allow microphone access and try again."));}
  }
  async function answerVoiceCall(){
    const incoming=incomingVoiceOffer;if(!incoming||!voiceChannelRef.current)return;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});localStreamRef.current=stream;
      const pc=createVoicePeer(incoming.from);stream.getAudioTracks().forEach(track=>{track.enabled=microphoneEnabled;pc.addTrack(track,stream);});
      await pc.setRemoteDescription(incoming.description);await applyQueuedIce(pc);
      const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
      await voiceChannelRef.current.send({type:"broadcast",event:"voice-signal",payload:{kind:"answer",from:session.user.id,to:incoming.from,description:pc.localDescription?.toJSON()}});
      setIncomingVoiceOffer(null);setVoiceConnected(true);notify("Joining voice call…");
    }catch(error){stopVoiceCall(false);notify("Unable to answer voice call: "+(error instanceof Error?error.message:"Allow microphone access and try again."));}
  }
  async function toggleVoiceCall(){if(peerConnectionRef.current||voiceConnected){stopVoiceCall();notify("Voice call ended.");return;}if(incomingVoiceOffer){await answerVoiceCall();return;}await startVoiceCall();}
  async function changeStatus(nextStatus: PresenceStatus) {
    setStatusMenuOpen(false);
    if (nextStatus === status) return;
    const { error } = await supabase.from("profiles").update({ status: nextStatus }).eq("id", session.user.id);
    if (error) { notify("Could not update your status: " + error.message); return; }
    setStatus(nextStatus);
    notify("Status set to " + nextStatus + ".");
  }
  async function saveProfile(e:FormEvent){
    e.preventDefault();
    const displayName=name.trim().replace(/\s+/g," ");
    if(displayName.length<2){notify("Your display name must be at least 2 characters.");return;}
    const {error}=await supabase.from("profiles").update({username:displayName,status,avatar_url:avatarUrl,bio:profileBio.trim().slice(0,190)}).eq("id",session.user.id);
    if(error){if(error.code==="23505"||error.message.includes("profiles_username_lower_unique")){notify("That display name is already taken. Please choose another.");return;}notify("Couldn't save your profile: "+error.message);return;}
    setName(displayName);setModal(null);notify("Profile saved.");
  }
  async function uploadAvatar(file:File|null){
    if(!file)return;
    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){notify("Choose a JPG, PNG, WebP, or GIF image.");return;}
    if(file.size>5*1024*1024){notify("Profile pictures must be 5 MB or smaller.");return;}
    setAvatarBusy(true);
    try{
      const extension=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"} as Record<string,string>)[file.type];
      const path=session.user.id+"/"+crypto.randomUUID()+"."+extension;
      const {error:uploadError}=await supabase.storage.from("avatars").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
      if(uploadError)throw uploadError;
      const {data}=supabase.storage.from("avatars").getPublicUrl(path);
      const {error:profileError}=await supabase.from("profiles").update({avatar_url:data.publicUrl}).eq("id",session.user.id);
      if(profileError){await supabase.storage.from("avatars").remove([path]);throw profileError;}
      setAvatarUrl(data.publicUrl);notify("Profile picture updated.");
    }catch(error){notify("Couldn't upload your picture: "+(error instanceof Error?error.message:"Please try again."));}
    finally{setAvatarBusy(false);}
  }
  async function uploadServerIcon(file:File|null){
    if(!file||!currentServer)return;
    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){notify("Choose a JPG, PNG, WebP, or GIF image.");return;}
    if(file.size>5*1024*1024){notify("Server icons must be 5 MB or smaller.");return;}
    setServerIconBusy(true);
    try{
      const extension=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"} as Record<string,string>)[file.type];
      const path=currentServer.id+"/"+crypto.randomUUID()+"."+extension;
      const {error:uploadError}=await supabase.storage.from("server-icons").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
      if(uploadError)throw uploadError;
      const {data}=supabase.storage.from("server-icons").getPublicUrl(path);
      const {error:updateError}=await supabase.from("servers").update({icon_url:data.publicUrl}).eq("id",currentServer.id);
      if(updateError){await supabase.storage.from("server-icons").remove([path]);throw updateError;}
      setServers(old=>old.map(server=>server.id===currentServer.id?{...server,iconUrl:data.publicUrl}:server));
      notify("Server image updated.");
    }catch(error){notify("Couldn't upload the server image: "+(error instanceof Error?error.message:"Please try again."));}
    finally{setServerIconBusy(false);}
  }
  async function removeServerMember(userId:string){
    if(!currentServer||!canKickMembers||userId===currentServer.createdBy||userId===session.user.id)return;
    const person=people.find(item=>item.id===userId);
    if(!window.confirm("Remove "+(person?.name||"this member")+" from "+currentServer.name+"?"))return;
    const {error}=await supabase.from("server_members").delete().eq("server_id",currentServer.id).eq("user_id",userId);
    if(error){notify("Couldn't remove member: "+error.message);return;}
    setServerMembersByServer(old=>({...old,[currentServer.id]:(old[currentServer.id]||[]).filter(id=>id!==userId)}));
    setCustomRoleAssignments(old=>({...old,[currentServer.id]:{...(old[currentServer.id]||{})}}));
    notify("Member removed from server.");
    void loadWorkspace();
  }
  async function updateMemberRole(userId:string,role:"admin"|"member"){
    if(!currentServer||!isOwnerOrAdmin||userId===currentServer.createdBy||userId===session.user.id)return;
    if(currentServer.role!=="owner"&&role==="admin"){notify("Only the server owner can assign admin roles.");return;}
    const {error}=await supabase.from("server_members").update({role}).eq("server_id",currentServer.id).eq("user_id",userId);
    if(error){notify("Couldn't update the member role: "+error.message);return;}
    setServerMemberRoles(old=>({...old,[currentServer.id]:{...(old[currentServer.id]||{}),[userId]:role}}));
    notify("Member role updated.");
  }
  async function loadCustomServerRoles(serverId:string){
    const [{data:roles,error:rolesError},{data:assignments,error:assignError}]=await Promise.all([
      supabase.from("server_roles").select("id,server_id,name,color,position,permissions").eq("server_id",serverId).order("position",{ascending:false}).order("created_at"),
      supabase.from("server_member_roles").select("server_id,user_id,role_id").eq("server_id",serverId)
    ]);
    if(rolesError||assignError){notify("Couldn't load custom roles: "+(rolesError?.message||assignError?.message));return;}
    setCustomServerRoles(roles||[]);
    const map:Record<string,string[]>={};
    for(const row of assignments||[])(map[row.user_id] ||= []).push(row.role_id);
    setCustomRoleAssignments(old=>({...old,[serverId]:map}));
  }
  async function createCustomServerRole(e:FormEvent){
    e.preventDefault();
    if(!currentServer||!canManageRoles)return;
    const value=newRoleName.trim().replace(/\\s+/g," ");
    if(!value)return;
    const permissions={...newRolePermissions};
    if(currentServer.role!=="owner"){permissions.manage_roles=false;permissions.manage_server=false;}
    const {data,error}=await supabase.from("server_roles").insert({server_id:currentServer.id,name:value,color:newRoleColor,permissions,position:customServerRoles.length}).select("id,server_id,name,color,position,permissions").single();
    if(error||!data){notify("Couldn't create role: "+(error?.message||"Please try again."));return;}
    setCustomServerRoles(old=>[...old,data as ServerRole]);
    setNewRoleName("");
    notify("Role created.");
  }
  async function assignCustomServerRole(userId:string,roleId:string){
    if(!currentServer||!canManageRoles||userId===currentServer.createdBy||userId===session.user.id)return;
    const previous=customRoleAssignments[currentServer.id]?.[userId]||[];
    const {error:removeError}=await supabase.from("server_member_roles").delete().eq("server_id",currentServer.id).eq("user_id",userId);
    if(removeError){notify("Couldn't update role assignment: "+removeError.message);return;}
    if(roleId){
      const {error:insertError}=await supabase.from("server_member_roles").insert({server_id:currentServer.id,user_id:userId,role_id:roleId});
      if(insertError){
        if(previous.length)await supabase.from("server_member_roles").insert(previous.map(id=>({server_id:currentServer.id,user_id:userId,role_id:id})));
        notify("Couldn't assign role: "+insertError.message);return;
      }
    }
    setCustomRoleAssignments(old=>({...old,[currentServer.id]:{...(old[currentServer.id]||{}),[userId]:roleId?[roleId]:[]}}));
    notify(roleId?"Role assigned.":"Custom role removed.");
  }
  async function deleteCustomServerRole(roleId:string){
    if(!currentServer||!canManageRoles)return;
    const role=customServerRoles.find(item=>item.id===roleId);
    if(!role||!window.confirm("Delete the "+role.name+" role and remove it from members?"))return;
    const {error}=await supabase.from("server_roles").delete().eq("id",roleId).eq("server_id",currentServer.id);
    if(error){notify("Couldn't delete role: "+error.message);return;}
    setCustomServerRoles(old=>old.filter(item=>item.id!==roleId));
    await loadCustomServerRoles(currentServer.id);
    notify("Role deleted.");
  }
  async function loadWorkspace() {
    const uid=session.user.id;
    const {data:ownMemberships,error:membershipError}=await supabase.from("server_members").select("server_id,role").eq("user_id",uid);
    if(membershipError)throw membershipError;
    const serverIds=[...new Set((ownMemberships||[]).map(row=>row.server_id))];
    let serverRows:any[]=[],channelRows:any[]=[],serverMemberRows:any[]=[];
    if(serverIds.length){
      const [sr,cr,mr]=await Promise.all([
        supabase.from("servers").select("id,public_id,name,description,created_by,invite_code,icon_url").in("id",serverIds).order("created_at"),
        supabase.from("channels").select("id,public_id,server_id,name,description,category").in("server_id",serverIds).order("created_at"),
        supabase.from("server_members").select("server_id,user_id,role").in("server_id",serverIds)]);
      if(sr.error)throw sr.error;if(cr.error)throw cr.error;if(mr.error)throw mr.error;
      serverRows=sr.data||[];channelRows=cr.data||[];serverMemberRows=mr.data||[];
    }
    const [friendResult,ownConvResult]=await Promise.all([
      supabase.from("friendships").select("id,requester_id,addressee_id,status").or("requester_id.eq."+uid+",addressee_id.eq."+uid),
      supabase.from("conversation_members").select("conversation_id,hidden_at").eq("user_id",uid)
    ]);
    const {data:friendships,error:friendError}=friendResult;
    const {data:ownConvs,error:convError}=ownConvResult;
    if(friendError)throw friendError;if(convError)throw convError;
    const convIds=[...new Set((ownConvs||[]).filter(row=>!row.hidden_at).map(row=>row.conversation_id))];
    const convMembersPromise=convIds.length
      ?supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id",convIds)
      :Promise.resolve({data:[],error:null});
    const unreadCountsPromise=channelRows.length
      ?supabase.rpc("get_unread_channel_counts")
      :Promise.resolve({data:[],error:null});
    const [convMembersResult,unreadCountsResult]=await Promise.all([convMembersPromise,unreadCountsPromise]);
    if(convMembersResult.error)throw convMembersResult.error;
    if(unreadCountsResult.error)throw unreadCountsResult.error;
    const convMembers:any[]=convMembersResult.data||[];
    const unreadByChannel:Record<string,number>=Object.fromEntries((unreadCountsResult.data||[]).map((row:{channel_id:string;unread_count:number|string})=>[keyFor("channel",row.channel_id),Number(row.unread_count)||0]));
    const related=new Set<string>();
    for(const row of serverMemberRows)if(row.user_id!==uid)related.add(row.user_id);
    for(const row of friendships||[]){const id=row.requester_id===uid?row.addressee_id:row.requester_id;if(id!==uid)related.add(id);}
    for(const row of convMembers)if(row.user_id!==uid)related.add(row.user_id);
    let profiles:any[]=[];
    if(related.size){const {data,error}=await supabase.from("profiles").select("id,public_id,username,status,avatar_url").in("id",[...related]);if(error)throw error;profiles=data||[];}
    const friendIds=new Set<string>();
    for(const row of friendships||[])if(row.status==="accepted")friendIds.add(row.requester_id===uid?row.addressee_id:row.requester_id);
    const convMap:Record<string,string>={};
    for(const row of convMembers)if(row.user_id!==uid&&convIds.includes(row.conversation_id)&&!convMap[row.user_id])convMap[row.user_id]=row.conversation_id;
    const colors=["green","purple","orange","blue","pink"];
    setServers(serverRows.map(row=>({id:row.id,publicId:row.public_id,name:row.name,description:row.description||"Community server",createdBy:row.created_by,inviteCode:row.invite_code,iconUrl:row.icon_url||null,role:ownMemberships?.find(m=>m.server_id===row.id)?.role||"member"})));
    const membersByServer:Record<string,string[]>={},rolesByServer:Record<string,Record<string,"owner"|"admin"|"member">>={};for(const row of serverMemberRows){(membersByServer[row.server_id] ||= []).push(row.user_id);(rolesByServer[row.server_id] ||= {})[row.user_id]=row.role;}setServerMembersByServer(membersByServer);setServerMemberRoles(rolesByServer);
    setFriendRequests((friendships||[]).filter(row=>row.status==="pending"&&row.addressee_id===uid).map(row=>({id:row.id,requester_id:row.requester_id,addressee_id:row.addressee_id,name:profiles.find(p=>p.id===row.requester_id)?.username||"Player",avatarUrl:profiles.find(p=>p.id===row.requester_id)?.avatar_url||null})));
    setChannels(channelRows.map(row=>({id:row.id,publicId:row.public_id,serverId:row.server_id,name:row.name,description:row.description||"",category:row.category||"Text Channels"})));
    if(channelRows.length)setUnread(old=>({...old,...unreadByChannel}));
    setPeople(profiles.map((p,i)=>({id:p.id,publicId:p.public_id,name:p.username||"Player",status:presenceByUser[p.id]||(p.status||"Offline") as PresenceStatus,online:Boolean(presenceByUser[p.id]&&presenceByUser[p.id]!=="Offline"),color:colors[i%colors.length],preview:"",avatarUrl:p.avatar_url||null,isFriend:friendIds.has(p.id),hasConversation:Boolean(convMap[p.id])})));
    setConversationIds(convMap);
    setActiveServer(prev=>serverIds.includes(prev)?prev:(serverRows[0]?.id||""));
    setActive(prev=>(view==="dm"||view==="home"||view==="friends")?prev:(channelRows.some(row=>row.id===prev)?prev:(channelRows[0]?.id||"")));
  }
  async function toggleReaction(messageId:string,emoji:string){
    const existing=(messages[activeKey]||messages[active]||[]).find(m=>m.id===messageId);if(!existing)return;
    const existingReaction=existing.reactions?.find(r=>r.emoji===emoji);const selected=Boolean(existingReaction?.reacted);
    const request=selected?supabase.from("message_reactions").delete().eq("message_id",messageId).eq("user_id",session.user.id).eq("emoji",emoji):supabase.from("message_reactions").insert({message_id:messageId,user_id:session.user.id,emoji});
    const {error}=await request;if(error){notify("Unable to update reaction: "+error.message);return;}
    const grouped:Reaction[]=(existing.reactions||[]).map(reaction=>reaction.emoji!==emoji?reaction:{...reaction,count:reaction.count+(selected?-1:1),reacted:!selected}).filter(reaction=>reaction.count>0);if(!selected&&!existingReaction)grouped.push({emoji,count:1,reacted:true});
    setMessages(old=>{const list=old[activeKey]||old[active]||[];return{...old,[activeKey]:list.map(m=>m.id!==messageId?m:{...m,reactions:grouped})};});
  }
  async function sendFriendRequest(e:FormEvent){
    e.preventDefault();
    const requested=modalInput.trim();
    if(!requested)return;
    const {data:target,error:lookupError}=await supabase.from("profiles").select("id,username").ilike("username",requested).maybeSingle();
    if(lookupError||!target){notify(lookupError?"Unable to find player: "+lookupError.message:"No Voax username \""+requested+"\" was found.");return;}
    if(target.id===session.user.id){notify("You cannot add yourself as a friend.");return;}

    const pairFilter="and(requester_id.eq."+session.user.id+",addressee_id.eq."+target.id+"),and(requester_id.eq."+target.id+",addressee_id.eq."+session.user.id+")";
    const {data:activeRequest,error:activeError}=await supabase.from("friendships").select("id,requester_id,addressee_id,status").in("status",["pending","accepted"]).or(pairFilter).maybeSingle();
    if(activeError){notify("Unable to check friendship: "+activeError.message);return;}
    if(activeRequest?.status==="accepted"){notify("You are already friends.");return;}
    if(activeRequest?.status==="pending"){notify(activeRequest.addressee_id===session.user.id?"That player already sent you a request. Accept it from Friends.":"You already sent a request to that player.");return;}

    // Reuse a rejected row from this same requester/recipient pair. The DB unique
    // constraint intentionally keeps one row per direction, so inserting again fails.
    const {data:rejected,error:rejectedError}=await supabase.from("friendships").select("id").eq("requester_id",session.user.id).eq("addressee_id",target.id).eq("status","rejected").maybeSingle();
    if(rejectedError){notify("Unable to check previous request: "+rejectedError.message);return;}
    if(rejected){
      const {error}=await supabase.from("friendships").update({status:"pending",updated_at:new Date().toISOString()}).eq("id",rejected.id).eq("requester_id",session.user.id).eq("status","rejected");
      if(error){notify("Unable to resend friend request: "+error.message);return;}
    }else{
      const {error}=await supabase.from("friendships").insert({requester_id:session.user.id,addressee_id:target.id,status:"pending"});
      if(error){notify("Unable to send friend request: "+error.message);return;}
    }
    setModal(null);setModalInput("");notify("Friend request sent to "+(target.username||"Player")+".");await loadWorkspace();
  }
  async function respondToFriendRequest(request:FriendRequest,accept:boolean){const {error}=await supabase.from("friendships").update({status:accept?"accepted":"rejected"}).eq("id",request.id).eq("addressee_id",session.user.id).eq("status","pending");if(error){notify("Unable to update friend request: "+error.message);return;}notify(accept?"Friend request accepted.":"Friend request declined.");await loadWorkspace();}
  async function markNotificationRead(id:string){const readAt=new Date().toISOString();const {error}=await supabase.from("notifications").update({read_at:readAt}).eq("id",id);if(error){notify("Unable to update notification: "+error.message);return;}setNotifications(old=>old.map(n=>n.id===id?{...n,read_at:readAt}:n));}
  function sendTyping(typing:boolean){const channel=typingChannelRef.current;if(!channel)return;void channel.send({type:"broadcast",event:"typing",payload:{userId:session.user.id,name,typing,activeKey}});}
  function startReply(message:Message){setReplyingTo(message);document.querySelector<HTMLInputElement>(".composer input")?.focus();}
  async function copyMessage(text:string){try{await navigator.clipboard.writeText(text);notify("Message copied.");}catch{notify("Clipboard access is blocked by this browser.");}}
  async function deleteMessage(message:Message){
    if(!message.own&&!canManageMessages){notify("You don't have permission to delete this message.");return;}
    let deletion=supabase.from("messages").delete().eq("id",message.id);
    if(message.own)deletion=deletion.eq("author_id",session.user.id);
    const {data,error}=await deletion.select("id,attachments").maybeSingle();
    if(error){notify("Couldn't delete your message: "+error.message);return;}
    if(!data){notify("This message could not be deleted. Refresh and try again.");return;}
    setMessages(old=>Object.fromEntries(Object.entries(old).map(([key,list])=>[key,list.filter(item=>item.id!==message.id)])));
    void messageEventsChannelRef.current?.send({type:"broadcast",event:"message-deleted",payload:{id:message.id}});
    const attachmentPaths=Array.isArray(data.attachments)?data.attachments.map((item:any)=>item?.path).filter((path:any):path is string=>typeof path==="string"):[];
    if(attachmentPaths.length){const {error:storageError}=await supabase.storage.from("message-attachments").remove(attachmentPaths);if(storageError){notify("Message deleted, but its attachment files could not be cleaned up: "+storageError.message);return;}}
    notify("Message deleted.");
  }
  function openApp(){window.history.pushState({},"","/app");setShowLanding(false);setView("home");setActive("");setSidebarOpen(false);}
  function openProfile(person:Person){setContextMenu(null);setSelectedProfile(person);}
  function showContextMenu(event:React.MouseEvent, target:ContextMenuTarget){event.preventDefault();event.stopPropagation();setStatusMenuOpen(false);setContextMenu({x:event.clientX,y:event.clientY,...target} as ContextMenuState);}
  async function copyContextText(value:string,label:string){try{await navigator.clipboard.writeText(value);notify(label+" copied.");}catch{notify("Clipboard access is blocked by this browser.");}setContextMenu(null);}
  function contextPersonForMessage(message:Message):Person|null{return message.own?{id:session.user.id,name,status,online:status!=="Offline",color:"self",preview:"Your profile",avatarUrl}:people.find(person=>person.name===message.author)||null;}
  async function hideDMForPerson(person:Person){const personId=person.id;const conversationId=conversationIds[personId];if(!conversationId){notify("This conversation is no longer available.");setContextMenu(null);return;}const {error}=await supabase.from("conversation_members").update({hidden_at:new Date().toISOString()}).eq("conversation_id",conversationId).eq("user_id",session.user.id);if(error){notify("Unable to remove this conversation: "+error.message);setContextMenu(null);return;}setPeople(old=>old.map(item=>item.id===personId?{...item,hasConversation:false,preview:""}:item));setConversationIds(old=>{const next={...old};delete next[personId];return next;});setContextMenu(null);if(activePerson?.id===personId){const fallbackChannel=channels.find(channel=>channel.serverId===activeServer)||channels[0];setActive(fallbackChannel?.id||"");setView(fallbackChannel?"channel":"home");setShowLanding(false);setSidebarOpen(false);window.history.pushState({},"",fallbackChannel?`/channels/${servers.find(server=>server.id===(fallbackChannel.serverId||activeServer))?.publicId||fallbackChannel.serverId||activeServer}/${fallbackChannel.publicId||fallbackChannel.id}`:"/app");}notify("Conversation hidden from your inbox. Messages are kept.");}
  async function openDM(person:Person|string){
    const requestedName=typeof person==="string"?person.trim():person.name;
    let target:Person|null=typeof person==="string"?null:person;
    if(!target){
      const {data,error}=await supabase.from("profiles").select("id,public_id,username,status").ilike("username",requestedName).maybeSingle();
      if(error){notify("Couldn't look up that player: "+error.message);return;}
      if(!data){notify("Couldn't find a Voax account named "+requestedName+".");return;}
      target={id:data.id,publicId:data.public_id,name:data.username||"Player",status:(data.status||"Offline") as PresenceStatus,online:data.status==="Online",color:"blue",preview:"",isFriend:false,hasConversation:false};
    }
    if(target.id===session.user.id){notify("That's your own account.");return;}
    let conversationId=conversationIds[target.id];
    let ownRows:{conversation_id:string;hidden_at:string|null}[]=[];
    if(!conversationId){
      const {data:rows,error:ownError}=await supabase.from("conversation_members").select("conversation_id,hidden_at").eq("user_id",session.user.id);
      if(ownError){notify("Couldn't check existing conversations: "+ownError.message);return;}
      ownRows=(rows||[]) as typeof ownRows;
      const ids=ownRows.map(row=>row.conversation_id);
      if(ids.length){const {data:targetRows,error:targetError}=await supabase.from("conversation_members").select("conversation_id").eq("user_id",target.id).in("conversation_id",ids);if(targetError){notify("Couldn't check existing conversations: "+targetError.message);return;}conversationId=targetRows?.[0]?.conversation_id;}
      if(conversationId&&ownRows.some(row=>row.conversation_id===conversationId&&row.hidden_at)){
        const {error:restoreError}=await supabase.from("conversation_members").update({hidden_at:null}).eq("conversation_id",conversationId).eq("user_id",session.user.id);
        if(restoreError){notify("Couldn't reopen this conversation: "+restoreError.message);return;}
      }
    }
    if(!conversationId){
      const {data:conversation,error:createError}=await supabase.from("conversations").insert({created_by:session.user.id}).select("id").single();
      if(createError||!conversation){notify("Couldn't start the conversation: "+(createError?.message||"Please try again."));return;}
      const {error:memberError}=await supabase.from("conversation_members").insert([{conversation_id:conversation.id,user_id:session.user.id},{conversation_id:conversation.id,user_id:target.id}]);
      if(memberError){notify("Couldn't add the conversation participants: "+memberError.message);return;}
      conversationId=conversation.id;
    }
    setConversationIds(old=>({...old,[target!.id]:conversationId!}));
    setPeople(old=>old.some(p=>p.id===target!.id)?old.map(p=>p.id===target!.id?{...p,hasConversation:true}:p):[...old,{...target!,hasConversation:true}]);
    setActive(target.name);setView("dm");setTypingPerson(null);setShowLanding(false);setSidebarOpen(false);
    setUnread(old=>({...old,[keyFor("dm",target!.name)]:0}));const readAt=new Date().toISOString();void supabase.from("notifications").update({read_at:readAt}).eq("recipient_id",session.user.id).eq("entity_id",conversationId).is("read_at",null).then(({error})=>{if(!error)setNotifications(old=>old.map(n=>n.entity_id===conversationId&&!n.read_at?{...n,read_at:readAt}:n));});window.history.pushState({},"",`/dm/${target.publicId||target.id}`);setModal(null);
  }
  async function markChannelRead(channelId:string){const readAt=new Date().toISOString();const {error}=await supabase.from("channel_read_states").upsert({user_id:session.user.id,channel_id:channelId,last_read_at:readAt},{onConflict:"user_id,channel_id"});if(error){notify("Unable to mark channel as read: "+error.message);return;}setUnread(old=>({...old,[keyFor("channel",channelId)]:0}));}
  function openChannel(channel:Channel){setTypingPerson(null);setActive(channel.id);setView("channel");void markChannelRead(channel.id);setSidebarOpen(false);window.history.pushState({},"",`/channel/${servers.find(server=>server.id===(channel.serverId||activeServer))?.publicId||channel.serverId||activeServer}/${channel.publicId||channel.id}`);}
  async function uploadMessageAttachment(file:File|null){
    if(!file)return;
    const allowedTypes=["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","audio/mpeg","audio/ogg","audio/wav","application/pdf","text/plain","application/zip","application/x-zip-compressed"];
    if(!allowedTypes.includes(file.type)){notify("Choose an image, supported audio/video, PDF, text, or ZIP file.");return;}
    if(file.size>20*1024*1024){notify("Attachments must be 20 MB or smaller.");return;}
    if(view!=="channel"&&view!=="dm"){notify("Open a channel or direct message before attaching a file.");return;}
    const scopeType=view==="channel"?"channels":"conversations";
    const scopeId=view==="channel"?activeChannel?.id:(activePerson?conversationIds[activePerson.id]:null);
    if(!scopeId){notify("Open a valid conversation before attaching a file.");return;}
    setAttachmentBusy(true);
    try{
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-80)||"attachment";
      const path=scopeType+"/"+scopeId+"/"+session.user.id+"/"+crypto.randomUUID()+"_"+safeName;
      const {error}=await supabase.storage.from("message-attachments").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
      if(error)throw error;
      setPendingAttachments(old=>[...old,{path,name:file.name,mimeType:file.type,size:file.size}]);
      notify("Attachment ready to send.");
    }catch(error){notify("Unable to upload attachment: "+(error instanceof Error?error.message:"Please try again."));}
    finally{setAttachmentBusy(false);}
  }
  async function removePendingAttachment(attachment:Attachment){
    const {error}=await supabase.storage.from("message-attachments").remove([attachment.path]);
    if(error){notify("Unable to remove the uploaded attachment: "+error.message);return;}
    setPendingAttachments(old=>old.filter(item=>item.path!==attachment.path));
  }
  async function sendMessage(e:FormEvent){
    e.preventDefault();const body=censorProfanity(draft.trim());if(!body&&!pendingAttachments.length)return;
    if(view==="channel"&&!activeChannel){notify("Create a server and channel before sending messages.");return;}
    const conversationId=view==="dm"&&activePerson?conversationIds[activePerson.id]:null;
    if(view==="dm"&&!conversationId){notify("Open a conversation with a Voax player before sending a message.");return;}
    const scopePrefix=(view==="channel"?"channels/"+activeChannel?.id:"conversations/"+conversationId)+"/";
    if(pendingAttachments.some(attachment=>!attachment.path.startsWith(scopePrefix))){notify("Your attachment belongs to a different conversation. Remove it and attach it again here.");return;}
    const attachmentRows=pendingAttachments.map(({path,name,mimeType,size})=>({path,name,mimeType,size}));
    const {data,error}=await supabase.from("messages").insert({channel_id:view==="channel"?active:null,conversation_id:view==="dm"?conversationId:null,author_id:session.user.id,body:body||"Shared an attachment",attachments:attachmentRows,reply_to:replyingTo?.id||null}).select("id,author_id,body,created_at,reply_to,attachments").single();
    if(error||!data){notify("Message not sent: "+(error?.message||"Please try again."));return;}
    const signedAttachments=await signMessageAttachments(data.attachments);
    const item:Message={id:data.id,author:name,text:data.body,time:formatClock(new Date(data.created_at), clockFormat),timestamp:data.created_at,own:true,...(replyingTo?{replyTo:{author:replyingTo.author,text:replyingTo.text}}:{}),...(signedAttachments.length?{attachments:signedAttachments}:{})};
    setMessages(old=>{const list=old[activeKey]||old[active]||[];const next=list.some(m=>m.id===item.id)?list:[...list,item];return{...old,[activeKey]:next,[active]:next};});
    setPeople(old=>old.map(p=>p.id===activePerson?.id?{...p,preview:body||"Shared an attachment",hasConversation:true}:p));setDraft("");setReplyingTo(null);setPendingAttachments([]);notify("Message sent.");
  }
  async function createItem(e:FormEvent){
    e.preventDefault();const value=modalInput.trim();if(!value)return;
    if(modal==="dm"){await openDM(value);setModalInput("");return;}
    if(modal==="channel"){
      const channelName=value.toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
      if(!channelName||!activeServer)return;
      if(serverChannels.some(c=>c.name===channelName)){notify("That channel already exists in this server.");return;}
      const category=(categoryInput.trim().replace(/\s+/g," ").slice(0,32)||"Text Channels");
      const {data,error}=await supabase.from("channels").insert({server_id:activeServer,name:channelName,category,description:"A new community channel",created_by:session.user.id}).select("id,server_id,name,description,category").single();
      if(error||!data){notify("Couldn't create the channel: "+(error?.message||"Please try again."));return;}
      await loadWorkspace();setActive(data.id);setView("channel");setShowLanding(false);setCategoryInput("Text Channels");setCategoryCreationMode(false);notify(categoryCreationMode ? "Category and its first channel created." : "Channel created.");
    }
    setModal(null);setModalInput("");
  }
  async function joinServerByCode(rawCode:string){
    const inviteCode=rawCode.trim().replace(/^https?:\/\/[^/]+\/invite\//i,"").replace(/^\/invite\//i,"").replace(/\/$/,"");
    if(!inviteCode)return false;
    const {data:serverId,error}=await supabase.rpc("join_server_by_invite",{p_invite_code:inviteCode});
    if(error||!serverId){notify("Couldn't join that server: "+(error?.message||"Check the invite link and try again."));return false;}
    await loadWorkspace();
    const [{data:server},{data:channel}]=await Promise.all([
      supabase.from("servers").select("id,public_id").eq("id",serverId).maybeSingle(),
      supabase.from("channels").select("id,public_id").eq("server_id",serverId).order("created_at").limit(1).maybeSingle()
    ]);
    if(server){setActiveServer(server.id);setActive(channel?.id||"");setView("channel");setShowLanding(false);window.history.pushState({},"",channel?"/channel/"+(server.public_id||server.id)+"/"+(channel.public_id||channel.id):"/app");}
    setModal(null);setModalInput("");notify("You've joined the server.");return true;
  }
  async function joinServer(e:FormEvent){e.preventDefault();await joinServerByCode(modalInput);}

  async function createServer(e:FormEvent){
    e.preventDefault();const value=modalInput.trim().replace(/\s+/g," ");if(!value)return;
    if(servers.some(s=>s.name.toLowerCase()===value.toLowerCase())){notify("A server with that name already exists.");return;}
    const {data:server,error}=await supabase.from("servers").insert({name:value,description:"Your community",created_by:session.user.id}).select("id,name,description,created_by,invite_code").single();
    if(error||!server){notify("Couldn't create the server: "+(error?.message||"Please try again."));return;}
    const {error:memberError}=await supabase.from("server_members").insert({server_id:server.id,user_id:session.user.id,role:"owner"});
    if(memberError){await supabase.from("servers").delete().eq("id",server.id);notify("Couldn't add you to the new server: "+memberError.message);return;}
    const {data:channel,error:channelError}=await supabase.from("channels").insert({server_id:server.id,name:"general",description:"The place for everything",created_by:session.user.id}).select("id,server_id,name,description").single();
    if(channelError||!channel){notify("Server created, but its first channel couldn't be created: "+(channelError?.message||"Please try again."));await loadWorkspace();return;}
    await loadWorkspace();setActiveServer(server.id);setActive(channel.id);setView("channel");setShowLanding(false);setSidebarOpen(false);setModal(null);setModalInput("");notify("Server created.");
  }
  async function renameServer(e:FormEvent){
    e.preventDefault();const value=modalInput.trim().replace(/\s+/g," ");if(!value||!currentServer)return;
    if(servers.some(s=>s.id!==currentServer.id&&s.name.toLowerCase()===value.toLowerCase())){notify("A server with that name already exists.");return;}
    const {error}=await supabase.from("servers").update({name:value}).eq("id",currentServer.id);if(error){notify("Couldn't rename the server: "+error.message);return;}
    await loadWorkspace();setModal(null);setModalInput("");notify("Server renamed.");
  }
  async function renameChannel(e:FormEvent){
    e.preventDefault();const value=modalInput.trim().toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");if(!value||!activeChannel)return;
    if(serverChannels.some(c=>c.id!==activeChannel.id&&c.name.toLowerCase()===value)){notify("That channel already exists in this server.");return;}
    const category=categoryInput.trim().replace(/\s+/g," ").slice(0,32)||"Text Channels";
    const {error}=await supabase.from("channels").update({name:value,category}).eq("id",activeChannel.id);if(error){notify("Couldn't rename the channel: "+error.message);return;}
    await loadWorkspace();setModal(null);setModalInput("");setCategoryInput("Text Channels");notify("Channel updated.");
  }
  function askDeleteServer(){if(!currentServer)return;if(servers.length<=1){notify("Keep at least one server.");return;}setPendingDelete({type:"server",id:currentServer.id,name:currentServer.name});setModal("confirmDelete");}
  function askDeleteChannel(channel:Channel){if(serverChannels.length<=1){notify("Each server must keep at least one channel.");return;}setPendingDelete({type:"channel",id:channel.id,name:channel.name});setModal("confirmDelete");}
  async function confirmDelete(){
    if(!pendingDelete)return;const item=pendingDelete;
    if(item.type==="channel"){const {error}=await supabase.from("channels").delete().eq("id",item.id);if(error){notify("Couldn't delete the channel: "+error.message);return;}setMessages(old=>{const next={...old};delete next[item.id];delete next[keyFor("channel",item.id)];return next;});await loadWorkspace();notify("Channel deleted.");}
    else{const {error}=await supabase.from("servers").delete().eq("id",item.id);if(error){notify("Couldn't delete the server: "+error.message);return;}await loadWorkspace();notify("Server deleted.");}
    setPendingDelete(null);setModal(null);
  }
  function switchToDMHome(){setView("home");setActive("");setShowLanding(false);setSidebarOpen(false);window.history.pushState({},"","/app");}
  function switchToServer(server?:Server){const target=server||currentServer;if(!target)return;const targetChannel=channels.find(c=>c.serverId===target.id);setActiveServer(target.id);setActive(targetChannel?.id||"");setView("channel");if(targetChannel)void markChannelRead(targetChannel.id);setShowLanding(false);setSidebarOpen(false);window.history.pushState({},"",targetChannel?`/channel/${target.publicId||target.id}/${targetChannel.publicId||targetChannel.id}`:"/app");}

  function switchToFriends() { setView("friends"); setShowLanding(false); setSidebarOpen(false); window.history.pushState({}, "", "/app?view=friends"); }
  function switchToChannel(channel: Channel) { openChannel(channel); }
  async function deleteCurrentDM() { if(activePerson) await hideDMForPerson(activePerson); }


  useEffect(() => {
    if (workspaceLoading || initialRouteHandled.current) return;
    initialRouteHandled.current = true;
    const path = window.location.pathname;
    if (path.startsWith("/invite/")) { const inviteCode = decodeURIComponent(path.split("/")[2] || ""); if (inviteCode) { setModalInput(inviteCode); setModal("joinServer"); setShowLanding(false); return; } window.history.replaceState({}, "", "/app"); setShowLanding(false); return; }
    if (path === "/dms" || path === "/dms/") {
      window.history.replaceState({}, "", "/app");
      setView("home");
      setActive("");
      setShowLanding(false);
      return;
    }
    if (path === "/app" || path === "/app/") {
      setView(window.location.search === "?view=friends" ? "friends" : "home");
      setActive("");
      setShowLanding(false);
      return;
    }
    if (path.startsWith("/dm/")) {
      const userId = decodeURIComponent(path.split("/")[2] || "");
      if (!userId) { window.history.replaceState({}, "", "/app"); setView("home"); return; }
      const knownPerson = people.find(person => person.id === userId || person.publicId === userId);
      if (knownPerson) { void openDM(knownPerson); return; }
      void (async () => {
        let { data, error } = await supabase.from("profiles").select("id,public_id,username,status,avatar_url").eq("public_id", userId).maybeSingle();
        if (!data) { const fallback = await supabase.from("profiles").select("id,public_id,username,status,avatar_url").eq("id", userId).maybeSingle(); data = fallback.data; error = fallback.error; }
        if (error || !data) { window.history.replaceState({}, "", "/app"); setView("home"); return; }
        const status = (data.status || "Offline") as PresenceStatus;
        void openDM({ id: data.id, publicId: data.public_id, name: data.username || "Player", status, online: status === "Online", color: "blue", preview: "Start a conversation", avatarUrl: data.avatar_url || null, isFriend: false, hasConversation: false });
      })();
      return;
    }
    if (path.startsWith("/channels/") || path.startsWith("/channel/")) {
      const [, , serverId, channelId] = path.split("/");
      const channel = channels.find(item => (item.publicId === channelId || item.id === channelId) && (servers.find(server => server.id === item.serverId)?.publicId === serverId || item.serverId === serverId));
      if (channel) {
        setActiveServer(channel.serverId || serverId);
        setActive(channel.id);
        setView("channel");
        setShowLanding(false);
        void markChannelRead(channel.id);
        return;
      }
      window.history.replaceState({}, "", "/app");
      setView("home");
      return;
    }
    if (path === "/") { setShowLanding(true); return; }
    window.history.replaceState({}, "", "/app");
    setView("home");
    setShowLanding(false);
  }, [workspaceLoading]);

  if (showLanding) return <Landing openApp={openApp} />;
  if (workspaceLoading) return <WorkspaceSkeleton variant={view === "home" ? "dm-home" : "server"} />;
  return <div className={`app-shell ${compact ? "compact" : ""} ${showMembers && view === "channel" ? "has-members" : ""}`}>
    <audio ref={remoteAudioRef} autoPlay playsInline style={{display:"none"}} aria-label="Remote voice audio" />
    <aside className="server-rail"><button className={`brand-mark ${view === "home" ? "brand-active" : ""}`} title="Open direct messages" aria-label="Open direct messages" onClick={switchToDMHome}><Logo size={36} /></button><div className="rail-separator"/>{servers.map((server) => <button key={server.id} className={`server-icon ${activeServer === server.id && view !== "home" && view !== "dm" ? "selected" : ""}`} title={server.name} aria-label={`Open ${server.name}`} onClick={() => switchToServer(server)} onContextMenu={e=>showContextMenu(e,{kind:"server",server})}>{server.iconUrl ? <img className="server-icon-image" src={server.iconUrl} alt="" /> : <span style={{fontWeight:900,fontSize:12}}>{initials(server.name)}</span>}</button>)}<button className="server-icon add" title="Create server" aria-label="Create server" onClick={() => { setModalInput(""); setModal("server"); }}><Icon name="plus" size={20} /></button><div className="rail-spacer"/></aside>
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="workspace-head"><div><strong>{view === "home" || view === "dm" ? "Direct Messages" : currentServer?.name || "Server"}</strong><small>{view !== "home" && view !== "dm" ? currentServer?.description || "" : ""}</small></div>{view !== "home" && view !== "dm" && <div style={{display:"flex",gap:2}}>{(canManageServer||canManageChannels)&&<>{canManageServer&&<button className="icon-btn" onClick={() => { setModalInput(currentServer?.name || ""); setModal("manageServer"); }} title="Manage server"><Icon name="settings" size={17} /></button>}{canManageChannels&&<button className="icon-btn" onClick={() => { setModal("channel"); setModalInput(""); setCategoryInput("Text Channels"); setCategoryCreationMode(false); }} title="Add channel"><Icon name="plus" size={20} /></button>}</>}</div>}</div>
      <div className="search-wrap"><span><Icon name="search" size={17} /></span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..." aria-label="Search conversations"/></div>
      <>{view !== "home" && view !== "dm" ? <>{view !== "channel" && <button className={`side-link ${view === "friends" ? "active" : ""}`} onClick={switchToFriends}><span><Icon name="users" size={17} /></span> Friends <span className="side-count">{people.length}</span></button>}<div className="side-heading"><span>TEXT CHANNELS</span>{canManageChannels&&<button onClick={() => { setModal("channel"); setModalInput(""); setCategoryInput("Text Channels"); setCategoryCreationMode(false); }} aria-label="Add channel"><Icon name="plus" size={20} /></button>}</div><div className="nav-list" onContextMenu={e=>showContextMenu(e,{kind:"channels"})}>{channelGroups.map(([category, groupedChannels]) => <React.Fragment key={category}><div className="channel-category-label">{category}</div>{groupedChannels.map(c => <div key={c.id} className="channel-row" onContextMenu={e=>{e.preventDefault();e.stopPropagation();}}><button className={`nav-item ${view === "channel" && active === c.id ? "active" : ""} `} style={{flex:1,minWidth:0}} onClick={() => switchToChannel(c)} onContextMenu={e=>showContextMenu(e,{kind:"channel",channel:c})}><span className="hash"><Icon name="hash" size={15} /></span><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span>{(unread[keyFor("channel", c.id)] || 0) > 0 && <span style={{ marginLeft: "auto", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#ed4245", color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center" }}>{unread[keyFor("channel", c.id)]}</span>}</button>{canManageServer&&<button className="icon-btn channel-settings" title={"Manage #" + c.name} aria-label={"Manage #" + c.name} onClick={() => { setActive(c.id); setModalInput(c.name); setCategoryInput(c.category || "Text Channels"); setModal("manageChannel"); }}><Icon name="settings" size={14}/></button>}</div>)}</React.Fragment>)}</div></> : <><div className="side-heading"><span>DIRECT MESSAGES</span><button onClick={() => { setModal("dm"); setModalInput(""); }} aria-label="New direct message"><Icon name="plus" size={20} /></button></div><div className="dm-list">{filteredPeople.map(p => <button key={p.name.toLowerCase()} className={`dm-item ${view === "dm" && active.toLowerCase() === p.name.toLowerCase() ? "active" : ""}`} onClick={() => openDM(p)} onContextMenu={e=>showContextMenu(e,{kind:"person",person:p})}><span className={`avatar ${p.color}`}>{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p.name)}{p.online && <i/>}</span><span className="dm-label"><strong>{p.name}</strong>{p.preview && <small>{p.preview}</small>}</span>{((unread[keyFor("dm", p.name)] || 0)+notifications.filter(n=>!n.read_at&&n.type==="message"&&n.entity_id===conversationIds[p.id]).length) > 0 && <span style={{ marginLeft: "auto", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#ed4245", color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center" }}>{(unread[keyFor("dm", p.name)] || 0)+notifications.filter(n=>!n.read_at&&n.type==="message"&&n.entity_id===conversationIds[p.id]).length}</span>}</button>)}</div></>}</>
      <div className="user-bar"><div className="user-avatar-wrap"><div className="avatar self">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}</div><button type="button" className={"user-status-indicator status-" + status.toLowerCase().replace(/\s+/g, "-")} aria-label={"Change status, currently " + status} title={"Status: " + status} onClick={() => setStatusMenuOpen(v => !v)} /></div>{statusMenuOpen && <div className="user-status-menu" role="menu" aria-label="Set your status"><div className="user-status-menu-title">Set your status</div>{([{value:"Online",label:"Online",description:"You’re active",color:"online"},{value:"Idle",label:"Idle",description:"You may be away",color:"idle"},{value:"Do not disturb",label:"Do Not Disturb",description:"Mute notifications",color:"dnd"},{value:"Offline",label:"Invisible",description:"Appear offline",color:"offline"}] as const).map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={status===option.value} className={"user-status-option " + (status===option.value?"selected":"")} onClick={() => { void changeStatus(option.value); }}><i className={"status-option-dot " + option.color} /><span><strong>{option.label}</strong><small>{option.description}</small></span>{status===option.value&&<span aria-hidden="true">✓</span>}</button>)}</div>}<div className="user-account"><div className="user-account-top"><div className="user-label"><strong>{name}</strong><small>{status}</small></div><button className="icon-btn user-settings" title="User settings" aria-label="User settings" onClick={() => {setModal("settings");setSettingsLoading(true);void (async()=>{try{const {data,error}=await supabase.from("profiles").select("username,status,avatar_url,public_id,bio").eq("id",session.user.id).maybeSingle();if(error)throw error;if(data){if(data.username)setName(data.username);if(data.status)setStatus(data.status as PresenceStatus);setAvatarUrl(data.avatar_url||null);setProfileBio(data.bio||"");}}catch(error){notify("Couldn't load settings: "+(error instanceof Error?error.message:"Please try again."));}finally{setSettingsLoading(false);}})();}}><Icon name="settings" size={17} /></button></div><div className="user-voice-controls"><button type="button" className={`icon-btn voice-toggle ${voiceConnected ? "voice-connected" : ""}`} title={voiceConnected ? "End voice call" : incomingVoiceOffer ? "Answer voice call" : "Start voice call (direct messages)"} aria-label={voiceConnected ? "End voice call" : incomingVoiceOffer ? "Answer voice call" : "Start voice call (direct messages)"} aria-pressed={voiceConnected} onClick={() => { void toggleVoiceCall(); }}><Icon name="voice" size={16} /></button><button type="button" className="icon-btn voice-toggle" title={microphoneEnabled ? "Mute microphone" : "Unmute microphone"} aria-label={microphoneEnabled ? "Mute microphone" : "Unmute microphone"} aria-pressed={microphoneEnabled} onClick={() => { const next=!microphoneEnabled;setMicrophoneEnabled(next);localStreamRef.current?.getAudioTracks().forEach(track=>track.enabled=next);notify(next ? "Microphone unmuted." : "Microphone muted."); }}><Icon name={microphoneEnabled ? "mic" : "micOff"} size={16} /></button><button type="button" className="icon-btn voice-toggle" title={audioEnabled ? "Turn audio off" : "Turn audio on"} aria-label={audioEnabled ? "Turn audio off" : "Turn audio on"} aria-pressed={audioEnabled} onClick={() => { const next=!audioEnabled;setAudioEnabled(next);if(remoteAudioRef.current)remoteAudioRef.current.muted=!next;notify(next ? "Call audio enabled." : "Call audio muted."); }}><Icon name={audioEnabled ? "headphones" : "headphonesOff"} size={16} /></button></div></div></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><button className="mobile-toggle" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle sidebar"><Icon name="menu" size={20} /></button><div className="topbar-title"><span className="title-symbol">{view === "channel" ? <Icon name="hash" /> : view === "dm" ? <Icon name="at" /> : <Icon name="users" />}</span><div><strong>{view === "channel" ? activeChannel?.name || active : view === "dm" ? active : view === "home" ? "Direct Messages" : "Friends"}</strong><small>{view === "channel" ? activeChannel?.description : view === "dm" && typingPerson === active ? "Typing…" : ""}</small></div></div><div className="topbar-actions">{view === "channel" && <button className={`icon-btn member-toggle ${showMembers ? "active" : ""}`} title={showMembers ? "Hide member list" : "Show member list"} aria-label={showMembers ? "Hide member list" : "Show member list"} aria-pressed={showMembers} onClick={() => setShowMembers(v => !v)}><Icon name="users" size={18} /></button>}{view==="dm"&&<button className="icon-btn" title="Remove conversation from inbox" aria-label="Remove conversation from inbox" onClick={()=>void deleteCurrentDM()}><Icon name="close" size={18}/></button>}<button className="icon-btn" title="Inbox" aria-label="Inbox" onClick={() => setModal("inbox")}><Icon name="inbox" size={18} />{notifications.some(n=>!n.read_at)&&<span style={{position:"absolute",top:2,right:2,width:7,height:7,borderRadius:"50%",background:"#ed4245"}}/>}</button></div></header>
      {(view === "friends" || view === "home") ? <section className="friends-view"><div className="friends-intro"><h1>{view === "home" ? "Direct Messages" : "Friends"}</h1><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn primary" onClick={() => { setModal("dm"); setModalInput(""); }}>＋ Start a conversation</button><button className="btn secondary" onClick={() => { setModal("friend"); setModalInput(""); }}>＋ Add friend</button></div>{view==="friends"&&friendRequests.length>0&&<div style={{marginTop:20}}><h3>Friend requests</h3>{friendRequests.map(request=><div key={request.id} className="friend-card" style={{marginBottom:8}}><div className="avatar">{request.avatarUrl?<img src={request.avatarUrl} alt=""/>:initials(request.name)}</div><div className="friend-info"><strong>{request.name}</strong><small>Wants to be your friend</small></div><button className="btn small primary" disabled={busyAction !== null} onClick={()=>void withBusyAction("friend-request-"+request.id,()=>respondToFriendRequest(request,true))}>{busyAction === "friend-request-"+request.id ? <>Accepting <span className="button-spinner" aria-hidden="true" /></> : "Accept"}</button><button className="btn small secondary" disabled={busyAction !== null} onClick={()=>void withBusyAction("friend-request-"+request.id,()=>respondToFriendRequest(request,false))}>{busyAction === "friend-request-"+request.id ? <>Updating <span className="button-spinner" aria-hidden="true" /></> : "Decline"}</button></div>)}</div>}</div><div className="friend-tools"><div className="filter-tabs">{view === "friends" ? <><button className={filter === "all" ? "chosen" : ""} onClick={() => setFilter("all")}>All friends <span>{people.length}</span></button><button className={filter === "online" ? "chosen" : ""} onClick={() => setFilter("online")}>Online <span>{people.filter(p => p.online).length}</span></button></> : <button className="chosen"><span>{people.length}</span></button>}</div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a friend..." aria-label="Find a friend"/></div><div className="friend-grid">{filteredPeople.map(p => <article className="friend-card" key={p.name} onClick={() => openProfile(p)} onContextMenu={e=>showContextMenu(e,{kind:"person",person:p})} style={{cursor:"pointer"}}><div className={`avatar large ${p.color}`} role="button" aria-label={`View ${p.name} profile`}>{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p.name)}<i className={p.online ? "online" : ""}/></div><div className="friend-info"><strong>{p.name}</strong></div><button className="btn small primary" onClick={e => {e.stopPropagation();void openDM(p);}}>{view === "home" ? "Open DM" : "Message"}</button></article>)}</div>{!filteredPeople.length && <div className="empty-state">No friends match that search.</div>}</section> :
      <><div className={`message-scroll ${view === "dm" ? "dm-open-message-scroll" : ""}`} key={activeKey}><div className="date-divider"><span>WELCOME TO {view === "channel" ? "#" + (activeChannel?.name || active) : "YOUR CONVERSATION"}</span></div>{messagesLoading ? (view === "dm" ? <DmConversationSkeleton /> : <div className="skeleton-message-list server-loading-messages" role="status" aria-label="Loading channel messages">{Array.from({ length: 5 }, (_, i) => <div className="skeleton-message-row" key={i}><SkeletonBar className="skeleton-avatar" /><div className="skeleton-stack"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className={`skeleton-line ${i % 2 ? "wide" : "message-line"}`} /><SkeletonBar className="skeleton-line message-line-short" /></div></div>)}</div>) : visibleMessages.length ? visibleMessages.map(m => <article className={`message-row message-row-actionable ${compact ? "tight" : ""}`} key={m.id} onContextMenu={e=>showContextMenu(e,{kind:"message",message:m})}><div className={`avatar message-avatar ${m.own ? "self" : (m.author === "Voax" || m.author === "voax") ? "bot" : "blue"}`} role="button" tabIndex={0} style={{cursor:"pointer"}} onClick={() => {const p=m.own?{id:session.user.id,name,status,online:status!=="Offline",color:"self",preview:"Your profile",avatarUrl}:people.find(p=>p.name===m.author);if(p)openProfile(p);}}>{(m.own ? avatarUrl : people.find(p=>p.name===m.author)?.avatarUrl) ? <img src={(m.own ? avatarUrl : people.find(p=>p.name===m.author)?.avatarUrl) || ""} alt="" /> : initials(m.author)}</div><div className="message-body"><div className="message-meta"><strong role="button" tabIndex={0} style={{cursor:"pointer"}} onClick={() => {const p=m.own?{id:session.user.id,name,status,online:status!=="Offline",color:"self",preview:"Your profile",avatarUrl}:people.find(p=>p.name===m.author);if(p)openProfile(p);}}>{m.author === "voax" ? "Voax" : m.author}</strong>{(m.author === "Voax" || m.author === "voax") && <span className="bot-tag">BOT</span>}<time>{m.timestamp ? formatClock(new Date(m.timestamp), clockFormat) : m.time}</time></div>{m.replyTo && <div className="reply-context"><span>↳ Replying to <strong>{m.replyTo.author}</strong></span><p>{m.replyTo.text}</p></div>}<MessageContent text={m.text} onJoinInvite={(code)=>void withBusyAction("join-invite-"+code,()=>joinServerByCode(code))} />{!!m.attachments?.length && <div className="message-attachments">{m.attachments.map(attachment=><a key={attachment.path} href={attachment.url} target="_blank" rel="noreferrer" className="message-attachment" download={attachment.name}>{attachment.mimeType.startsWith("image/")&&attachment.url?<img src={attachment.url} alt={attachment.name} loading="lazy"/>:<span className="message-attachment-icon">📎</span>}<span><strong>{attachment.name}</strong><small>{(attachment.size/1024/1024).toFixed(2)} MB</small></span></a>)}</div>}{!!m.reactions?.length && <div className="message-reactions">{m.reactions.map(reaction => <button key={reaction.emoji} className={`reaction-chip ${reaction.reacted?"selected":""}`} onClick={() => toggleReaction(m.id, reaction.emoji)} aria-label={`${reaction.reacted?"Remove":"Add"} ${reaction.emoji} reaction`}>{reaction.emoji}<span>{reaction.count}</span></button>)}</div>}<div className="message-actions"><button onClick={() => toggleReaction(m.id, "👍")} title="Add reaction" aria-label="Add thumbs up reaction">👍</button><button onClick={() => startReply(m)} title="Reply" aria-label={`Reply to ${m.author}`}><Icon name="reply" size={14}/></button><button onClick={() => { void copyMessage(m.text); }} title="Copy message" aria-label="Copy message"><Icon name="copy" size={14}/></button>{m.own&&<button onClick={()=>void deleteMessage(m)} title="Delete your message" aria-label="Delete your message"><Icon name="delete" size={14}/></button>}</div></div></article>) : <div className="empty-state"><div className="empty-icon"><Icon name="sparkles" size={25} /></div><h3>{search.trim() ? "No matching messages" : "This is the beginning."}</h3><p>{search.trim() ? "Try another keyword or clear the search." : "Send the first message to get the conversation going."}</p></div>}{typingPerson && <div style={{ padding: "0 4vw 8px", color: "#8792a5", fontSize: 11 }} role="status">{typingPerson} is typing<span aria-hidden="true">…</span></div>}</div><div className="composer-area">{replyingTo && <div className="replying-banner"><span><Icon name="reply" size={14}/> Replying to <strong>{replyingTo.author}</strong><small>{replyingTo.text}</small></span><button type="button" className="icon-btn" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><Icon name="close" size={14}/></button></div>}{pendingAttachments.length>0&&<div className="pending-attachments">{pendingAttachments.map(attachment=><div className="pending-attachment" key={attachment.path}><span>📎 {attachment.name}</span><button type="button" className="icon-btn" aria-label={"Remove "+attachment.name} onClick={()=>void removePendingAttachment(attachment)}><Icon name="close" size={13}/></button></div>)}</div>}<form className="composer" onSubmit={e => { e.preventDefault(); void withBusyAction("send-message", () => sendMessage(e)); }}><button type="button" className="attach-btn" title={attachmentBusy?"Uploading attachment…":"Attach file"} aria-label="Attach file" disabled={attachmentBusy} onClick={() => attachmentInputRef.current?.click()}><Icon name="paperclip" size={18} /></button><input ref={attachmentInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,application/pdf,text/plain,application/zip,application/x-zip-compressed" multiple hidden onChange={e=>{const files=Array.from(e.currentTarget.files||[]);e.currentTarget.value="";void(async()=>{for(const file of files)await uploadMessageAttachment(file);})();}}/><input value={draft} onChange={e => {setDraft(e.target.value);sendTyping(Boolean(e.target.value.trim()));}} onBlur={()=>sendTyping(false)} placeholder={view === "channel" ? `Message #${activeChannel?.name || active}` : `Message @${active}`} aria-label="Message" maxLength={4000}/><button className="send-btn" type="submit" disabled={(!draft.trim() && !pendingAttachments.length) || busyAction !== null} aria-label={busyAction === "send-message" ? "Sending message" : "Send message"}>{busyAction === "send-message" ? <span className="button-spinner" aria-hidden="true" /> : <Icon name="send" size={17} />}</button></form></div></>}
    </main>

    {showMembers && view === "channel" && <aside className="member-panel" aria-label="Channel members"><div className="member-panel-head"><div><strong>Members</strong><span>{serverMemberIds.length} members</span></div><button className="icon-btn" onClick={() => setShowMembers(false)} aria-label="Hide member list" title="Hide member list"><Icon name="close" size={16}/></button></div><div className="member-group-label"><span className="member-status-dot online"/>ONLINE — {onlineServerMembers.length + (status !== "Offline" ? 1 : 0)}</div><div className="member-list">{status !== "Offline" && <div className="member-entry"><div className="avatar member-avatar self">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}<i className="online"/></div><div><strong>{name}</strong><small>{status}</small></div></div>}{onlineServerMembers.map(p => <button className="member-entry" key={p.id} onClick={() => openProfile(p)} onContextMenu={e=>showContextMenu(e,{kind:"person",person:p})} title={`View ${p.name} profile`}><span className={`avatar member-avatar ${p.color}`} role="button" tabIndex={0} aria-label={`View ${p.name} profile`} onClick={e=>{e.stopPropagation();openProfile(p);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();openProfile(p);}}}>{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p.name)}<i className="online"/></span><span><strong role="button" tabIndex={0} onClick={e=>{e.stopPropagation();openProfile(p);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();openProfile(p);}}}>{p.name}</strong><small>{p.status || "Online"}</small></span><span className="member-entry-action"><button type="button" aria-label={`Message ${p.name}`} title={`Message ${p.name}`} onClick={e=>{e.stopPropagation();void openDM(p);}}><Icon name="message" size={15}/></button></span></button>)}</div><div className="member-group-label"><span className="member-status-dot offline"/>OFFLINE — {offlineServerMembers.length + (status === "Offline" ? 1 : 0)}</div><div className="member-list">{status === "Offline" && <div className="member-entry offline"><div className="avatar member-avatar self">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}<i/></div><div><strong>{name}</strong><small>Offline</small></div></div>}{offlineServerMembers.map(p => <button className="member-entry offline" key={p.id} onClick={() => openProfile(p)} onContextMenu={e=>showContextMenu(e,{kind:"person",person:p})} title={`View ${p.name} profile`}><span className={`avatar member-avatar ${p.color}`} role="button" tabIndex={0} aria-label={`View ${p.name} profile`} onClick={e=>{e.stopPropagation();openProfile(p);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();openProfile(p);}}}>{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p.name)}<i/></span><span><strong role="button" tabIndex={0} onClick={e=>{e.stopPropagation();openProfile(p);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();openProfile(p);}}}>{p.name}</strong><small>{p.status || "Offline"}</small></span><span className="member-entry-action"><button type="button" aria-label={`Message ${p.name}`} title={`Message ${p.name}`} onClick={e=>{e.stopPropagation();void openDM(p);}}><Icon name="message" size={15}/></button></span></button>)}</div><div className="member-panel-note">Server members · Live presence</div></aside>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) { setModal(null); setCategoryCreationMode(false); } }}><section className={"modal " + (modal === "settings" ? "discord-settings-modal" : modal === "manageServer" || modal === "manageRoles" ? "discord-server-settings-modal" : "")} role="dialog" aria-modal="true"><button className="modal-x" onClick={() => {setModal(null);setCategoryCreationMode(false);}} aria-label="Close"><Icon name="close" size={18} /></button>
      {modal === "dm" && <><span className="section-kicker">DIRECT MESSAGES</span><h2>New direct message</h2><p>Enter the username of someone with a Voax account.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("create-dm", () => createItem(e)); }}><label htmlFor="modalInput">Username</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="e.g. AlexTheBuilder" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "create-dm" ? <>Creating <span className="button-spinner" aria-hidden="true" /></> : "Create DM"}</button></div></form></>}
      {modal === "friend" && <><h2>Add a friend</h2><p>Send a request using the player’s exact Voax username.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("send-friend-request", () => sendFriendRequest(e)); }}><label htmlFor="modalInput">Voax username</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e=>setModalInput(e.target.value)} placeholder="e.g. AlexTheBuilder" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "send-friend-request" ? <>Sending <span className="button-spinner" aria-hidden="true" /></> : "Send request"}</button></div></form></>}
      {modal === "server" && <><span className="section-kicker">NEW COMMUNITY</span><h2>Create a server</h2><p>Give your community a name. We will create a #general channel automatically.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("create-server", () => createServer(e)); }}><label htmlFor="modalInput">Server name</label><input id="modalInput" autoFocus maxLength={40} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="Survival Squad" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => {setModalInput("");setModal("joinServer");}}>Join with invite</button><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "create-server" ? <>Creating <span className="button-spinner" aria-hidden="true" /></> : "Create server"}</button></div></form></>}
      {modal === "joinServer" && <><span className="section-kicker">JOIN COMMUNITY</span><h2>Join a server</h2><p>Paste an invite code from someone in the community.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("join-server", () => joinServer(e)); }}><label htmlFor="modalInput">Invite code</label><input id="modalInput" autoFocus maxLength={128} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="Paste invite code" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => {setModalInput("");setModal("server");}}>Back</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "join-server" ? <>Joining <span className="button-spinner" aria-hidden="true" /></> : "Join server"}</button></div></form></>}
      {modal === "manageServer" && <div className="discord-server-settings-layout"><nav className="discord-server-settings-nav" aria-label="Server settings sections"><div className="discord-settings-nav-title">SERVER SETTINGS</div><div className="discord-server-nav-server">{currentServer?.iconUrl ? <img src={currentServer.iconUrl} alt="" /> : <span>{initials(currentServer?.name || "Server")}</span>}<strong>{currentServer?.name || "Server"}</strong></div><button type="button" className="active"><Icon name="settings" size={16}/> Overview</button><button type="button" onClick={() => setModal("manageRoles")}><Icon name="users" size={16}/> Members &amp; Roles</button><button type="button" onClick={async () => {if(!currentServer?.inviteCode)return;try{await navigator.clipboard.writeText(window.location.origin+"/invite/"+currentServer.inviteCode);notify("Invite link copied.");}catch{notify("Clipboard access is blocked by this browser.");}}}><Icon name="link" size={16}/> Invite people</button><div className="discord-settings-nav-spacer"/><div className="discord-settings-nav-title">DANGER ZONE</div><button type="button" className="discord-server-danger" disabled={servers.length <= 1 || currentServer?.role !== "owner"} onClick={askDeleteServer}><Icon name="delete" size={16}/> Delete server</button></nav><div className="discord-settings-content"><div className="discord-settings-heading"><span className="section-kicker">SERVER SETTINGS</span><h2>Server Overview</h2><p>Customize {currentServer?.name || "this server"}’s identity and manage access.</p></div><form onSubmit={e => { e.preventDefault(); void withBusyAction("save-server", () => renameServer(e)); }}><label htmlFor="modalInput">Server name</label><input id="modalInput" autoFocus maxLength={60} value={modalInput} onChange={e => setModalInput(e.target.value)} required/><label htmlFor="serverIconFile">Server image</label><div className="server-icon-upload-row"><div className="server-icon-preview">{currentServer?.iconUrl ? <img src={currentServer.iconUrl} alt="" /> : <span>{initials(currentServer?.name || "Server")}</span>}</div><div className="server-icon-upload-control"><input id="serverIconFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={serverIconBusy} onChange={e => {void uploadServerIcon(e.target.files?.[0]||null);e.currentTarget.value="";}}/><small>{serverIconBusy ? "Uploading image…" : "JPG, PNG, WebP or GIF · max 5 MB"}</small></div></div><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "save-server" ? <>Saving <span className="button-spinner" aria-hidden="true" /></> : "Save changes"}</button></div></form></div></div>}
      {modal === "manageRoles" && <><span className="section-kicker">SERVER PERMISSIONS</span><h2>Members &amp; roles</h2><p>Create color-coded roles, assign them to members, and configure server permissions. Owner and Admin remain built-in roles.</p>
      <div className="custom-roles-section"><h3>Custom roles</h3>{customServerRoles.map(role=><div className="custom-role-row" key={role.id}><span className="custom-role-dot" style={{background:role.color}}/><strong style={{color:role.color}}>{role.name}</strong><small>{Object.entries(role.permissions||{}).filter(([,enabled])=>enabled).map(([permission])=>permission.replaceAll("_"," ")).join(", ")||"No extra permissions"}</small>{canManageRoles&&<button type="button" className="icon-btn" aria-label={"Delete "+role.name} onClick={()=>void deleteCustomServerRole(role.id)}><Icon name="delete" size={15}/></button>}</div>)}
      {canManageRoles&&<form className="custom-role-form" onSubmit={createCustomServerRole}><label htmlFor="newRoleName">Role name</label><div className="custom-role-create-row"><input id="newRoleName" value={newRoleName} onChange={e=>setNewRoleName(e.target.value)} maxLength={32} placeholder="e.g. Moderator" required/><input aria-label="Role color" type="color" value={newRoleColor} onChange={e=>setNewRoleColor(e.target.value)}/><button className="btn primary" type="submit">Create role</button></div><div className="role-permission-options">{([{key:"manage_channels",label:"Manage channels"},{key:"manage_messages",label:"Manage messages"},{key:"kick_members",label:"Kick members"},{key:"manage_roles",label:"Manage roles"},{key:"manage_server",label:"Manage server"}] as const).map(permission=><label key={permission.key} className="role-permission-option"><input type="checkbox" checked={Boolean(newRolePermissions[permission.key])} disabled={currentServer?.role!=="owner"&&(permission.key==="manage_roles"||permission.key==="manage_server")} onChange={e=>setNewRolePermissions(old=>({...old,[permission.key]:e.target.checked}))}/>{permission.label}</label>)}</div><small>Only the owner can grant Manage roles or Manage server.</small></form>}</div>
      <div className="role-member-list"><h3>Members</h3>{serverMemberIds.map(id => {const person=people.find(p=>p.id===id);const self=id===session.user.id;const role=serverMemberRoles[activeServer]?.[id]||"member";const customRole=customServerRoles.find(item=>item.id===(customRoleAssignments[activeServer]?.[id]?.[0]||""));const label=self?name:(person?.name||"Player");const image=self?avatarUrl:person?.avatarUrl;const owner=id===currentServer?.createdBy;return <div className="role-member-row" key={id}><button type="button" className="avatar role-member-avatar role-member-profile-trigger" aria-label={`View ${label} profile`} onClick={()=>openProfile(self?{id:session.user.id,name,status,online:status!=="Offline",color:"self",preview:"Your profile",avatarUrl}:person||{id,name:label,online:false,color:"blue",preview:""})}>{image?<img src={image} alt="" />:initials(label)}</button><div className="role-member-info"><strong role="button" tabIndex={0} onClick={()=>openProfile(self?{id:session.user.id,name,status,online:status!=="Offline",color:"self",preview:"Your profile",avatarUrl}:person||{id,name:label,online:false,color:"blue",preview:""})} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openProfile(self?{id:session.user.id,name,status,online:status!=="Offline",color:"self",preview:"Your profile",avatarUrl}:person||{id,name:label,online:false,color:"blue",preview:""});}}}>{label}</strong><small>{owner?"Server owner":role==="admin"?"Administrator":"Member"}</small>{customRole&&<small className="assigned-custom-role" style={{color:customRole.color}}><span className="custom-role-dot" style={{background:customRole.color}}/>{customRole.name}</small>}</div>{owner?<span className="role-owner-pill">OWNER</span>:<><select aria-label={`Built-in role for ${label}`} value={role} disabled={!isOwnerOrAdmin||self||(currentServer?.role!=="owner"&&role==="admin")} onChange={e=>void updateMemberRole(id,e.target.value as "admin"|"member")}><option value="member">Member</option>{currentServer?.role==="owner"&&<option value="admin">Admin</option>}</select>{customServerRoles.length>0&&<select aria-label={`Custom role for ${label}`} value={customRoleAssignments[activeServer]?.[id]?.[0]||""} disabled={!canManageRoles||self} onChange={e=>void assignCustomServerRole(id,e.target.value)}><option value="">No custom role</option>{customServerRoles.map(customRole=><option key={customRole.id} value={customRole.id}>{customRole.name}</option>)}</select>}{canKickMembers&&!self&&<button type="button" className="icon-btn role-kick-button" title={"Remove "+label} aria-label={"Remove "+label} onClick={()=>void removeServerMember(id)}><Icon name="close" size={15}/></button>}</>}</div>})}</div><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setModal("manageServer")}>Back to server settings</button><button type="button" className="btn primary" onClick={()=>setModal(null)}>Done</button></div></>}
      {modal === "manageChannel" && <><span className="section-kicker">CHANNEL SETTINGS</span><h2>Manage channel</h2><p>Rename #{activeChannel?.name || "channel"} and change its category.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("save-channel", () => renameChannel(e)); }}><label htmlFor="modalInput">Channel name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} required/><label htmlFor="categoryInput">Category</label><input id="categoryInput" maxLength={32} value={categoryInput} onChange={e=>setCategoryInput(e.target.value)} placeholder="Text Channels"/><div className="modal-actions"><button type="button" className="btn secondary" disabled={serverChannels.length <= 1} onClick={() => activeChannel && askDeleteChannel(activeChannel)}>Delete channel</button><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "save-channel" ? <>Saving <span className="button-spinner" aria-hidden="true" /></> : "Save changes"}</button></div></form></>}
      {modal === "confirmDelete" && <><span className="section-kicker">CONFIRM DELETION</span><h2>Delete {pendingDelete?.type === "server" ? "server" : "channel"}?</h2><p>{pendingDelete?.type === "server" ? `“${pendingDelete.name}” and all its channels and local messages will be removed from this browser.` : `#${pendingDelete?.name || "channel"} and its local message history will be removed from this browser.`} This cannot be undone.</p><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => { setModal(pendingDelete?.type === "server" ? "manageServer" : "manageChannel"); setPendingDelete(null); }}>Cancel</button><button type="button" className="btn primary" disabled={busyAction !== null} onClick={() => void withBusyAction("delete", confirmDelete)}>{busyAction === "delete" ? <>Deleting <span className="button-spinner" aria-hidden="true" /></> : "Delete permanently"}</button></div></>}
      {modal === "channel" && <><span className="section-kicker">{currentServer?.name || "SERVER"}</span><h2>{categoryCreationMode ? "Create category & channel" : "Create a channel"}</h2><p>{categoryCreationMode ? "Categories appear in the list when they contain a channel. Create the first channel in this category." : "Add a text channel and place it in a category."}</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("create-channel", () => createItem(e)); }}><label htmlFor="modalInput">Channel name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="build-plans" required/><label htmlFor="categoryInput">Category</label><input id="categoryInput" maxLength={32} value={categoryInput} onChange={e=>setCategoryInput(e.target.value)} placeholder="Text Channels"/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => {setModal(null);setCategoryCreationMode(false);}}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "create-channel" ? <>Creating <span className="button-spinner" aria-hidden="true" /></>  : categoryCreationMode ? "Create category & channel" : "Create channel"}</button></div></form></>}
      {modal === "settings" && (settingsLoading ? <SettingsSkeleton /> : <div className="discord-settings-layout"><nav className="discord-settings-nav" aria-label="User settings sections"><div className="discord-settings-nav-title">USER SETTINGS</div><button type="button" className={settingsSection === "account" ? "active" : ""} onClick={() => setSettingsSection("account")}><Icon name="user" size={16}/> My Account</button><div className="discord-settings-nav-divider"/><div className="discord-settings-nav-title">APP SETTINGS</div><button type="button" className={settingsSection === "appearance" ? "active" : ""} onClick={() => setSettingsSection("appearance")}><Icon name="palette" size={16}/> Appearance</button><div className="discord-settings-nav-spacer"/><button type="button" className="discord-settings-signout" onClick={async () => { const { error } = await supabase.auth.signOut(); if (error) notify("Could not sign out: " + error.message); }}><Icon name="close" size={16}/> Log Out</button></nav><div className="discord-settings-content">{settingsSection === "account" ? <><div className="discord-settings-heading"><span className="section-kicker">USER SETTINGS</span><h2>My Account</h2><p>Manage your Voax profile and how other people see you.</p></div><form onSubmit={e => { e.preventDefault(); void withBusyAction("save-profile", () => saveProfile(e)); }}><div className="settings-profile-banner"><div className="avatar large self">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}</div><div><strong>{name}</strong><small>{status}</small></div></div><label htmlFor="displayName">Display name</label><input id="displayName" maxLength={32} minLength={2} value={name} onChange={e => setName(e.target.value)} required/><label htmlFor="profileBio">Bio</label><textarea id="profileBio" maxLength={190} rows={3} value={profileBio} onChange={e => setProfileBio(e.target.value)} placeholder="A little about you…"/><small className="settings-help">{profileBio.length}/190 characters</small><label htmlFor="status">Status</label><select id="status" value={status} onChange={e => setStatus(e.target.value as PresenceStatus)}><option>Online</option><option>Idle</option><option>Do not disturb</option><option>Offline</option></select><label htmlFor="avatarFile">Profile picture</label><input id="avatarFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={avatarBusy} onChange={e => {void uploadAvatar(e.target.files?.[0]||null);e.currentTarget.value="";}}/><small className="settings-help">{avatarBusy ? "Uploading picture…" : "JPG, PNG, WebP or GIF · max 5 MB"}</small><div className="modal-actions"><button className="btn primary" disabled={busyAction !== null}>{busyAction === "save-profile" ? <>Saving <span className="button-spinner" aria-hidden="true" /></> : "Save changes"}</button></div></form></> : <><div className="discord-settings-heading"><span className="section-kicker">APP SETTINGS</span><h2>Appearance</h2><p>Adjust how conversations are displayed in Voax.</p></div><div className="settings-preference-row"><span><strong>Color theme</strong><small>Choose the look that feels right for you.</small></span><div className="theme-choice-group"><button type="button" className={"btn " + (theme === "dark" ? "primary" : "secondary")} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Dark</button><button type="button" className={"btn " + (theme === "light" ? "primary" : "secondary")} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Light</button></div></div><div className="settings-preference-row"><span><strong>Clock format</strong><small>Choose how message timestamps are displayed.</small></span><div className="theme-choice-group clock-format-choice"><button type="button" className={"btn " + (clockFormat === "12h" ? "primary" : "secondary")} aria-pressed={clockFormat === "12h"} onClick={() => setClockFormat("12h")}>12-hour <small>AM / PM</small></button><button type="button" className={"btn " + (clockFormat === "24h" ? "primary" : "secondary")} aria-pressed={clockFormat === "24h"} onClick={() => setClockFormat("24h")}>24-hour <small>13:00</small></button></div></div><label className="settings-preference-row"><span><strong>Compact message spacing</strong><small>Reduce the vertical space between messages.</small></span><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)}/></label><div className="settings-preference-row"><span><strong>Reset local preferences</strong><small>Restore local display preferences to their defaults.</small></span><button type="button" className="btn secondary" onClick={() => { localStorage.removeItem(KEY); localStorage.removeItem("voax.theme"); localStorage.removeItem("voax.clockFormat"); localStorage.removeItem("minedm.v2"); localStorage.removeItem("minedm.theme"); window.location.reload(); }}>Reset</button></div></>}</div></div>)}
      {modal === "inbox" && <><span className="section-kicker">NOTIFICATIONS</span><h2>Notifications</h2><p>Friend requests and direct-message activity show up here.</p><div style={{display:"grid",gap:8,maxHeight:"50vh",overflowY:"auto"}}>{notifications.length?notifications.map(n=><div key={n.id} style={{padding:12,border:"1px solid #ffffff18",borderRadius:10,background:n.read_at?"transparent":"#00e5ff0b"}}><strong>{n.title}</strong><p style={{margin:"5px 0",color:"#aab4c4",fontSize:12}}>{n.body}</p><small style={{color:"#8792a5"}}>{new Date(n.created_at).toLocaleString()}</small>{!n.read_at&&<div style={{marginTop:8}}><button className="btn small secondary" onClick={()=>void markNotificationRead(n.id)}>Mark read</button>{n.type==="friend_request"&&n.actor_id&&friendRequests.some(r=>r.requester_id===n.actor_id)&&<button className="btn small primary" style={{marginLeft:6}} onClick={()=>void respondToFriendRequest(friendRequests.find(r=>r.requester_id===n.actor_id)!,true)}>Accept request</button>}</div>}</div>):<div className="empty-state">You're all caught up.</div>}</div><div className="modal-actions"><button className="btn primary" onClick={() => setModal(null)}>Close</button></div></>}
    </section></div>}
    {selectedProfile && <div className="profile-popout-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedProfile(null);}}><section className="profile-popout" role="dialog" aria-modal="true" aria-label={`${selectedProfile.name} profile`}><div className="profile-popout-banner"><button className="profile-close" onClick={()=>setSelectedProfile(null)} aria-label="Close profile"><Icon name="close" size={17}/></button></div><div className="profile-popout-identity"><div className={`profile-popout-avatar avatar ${selectedProfile.color}`}>{selectedProfile.avatarUrl?<img src={selectedProfile.avatarUrl} alt=""/>:initials(selectedProfile.name)}<i className={selectedProfile.online?"online":""}/></div><div className="profile-popout-quick-actions">{selectedProfile.id!==session.user.id&&<><button className="profile-icon-action" title="Message" aria-label="Message" onClick={()=>{const person=selectedProfile;setSelectedProfile(null);void openDM(person);}}><Icon name="message" size={17}/></button><button className="profile-icon-action" title="More actions" aria-label="More actions" onClick={e=>showContextMenu(e,{kind:"person",person:selectedProfile})}><Icon name="moreHorizontal" size={17}/></button></>}</div></div><div className="profile-popout-body"><h2>{selectedProfile.name}</h2><div className="profile-popout-handle">{selectedProfile.name.replace(/\s+/g,"").toLowerCase()} <span>·</span> Voax</div><div className="profile-popout-status"><i className={selectedProfile.online?"online":""}/>{selectedProfile.status|| (selectedProfile.online?"Online":"Offline")}</div>{view==="channel"&&serverMemberIds.includes(selectedProfile.id)&&<section className="profile-server-roles"><h3>ROLES</h3><div className="profile-server-role-list">{(()=>{const builtin=serverMemberRoles[activeServer]?.[selectedProfile.id]||"member";const isOwner=selectedProfile.id===currentServer?.createdBy;const assigned=(customRoleAssignments[activeServer]?.[selectedProfile.id]||[]).map(roleId=>customServerRoles.find(role=>role.id===roleId)).filter((role):role is ServerRole=>Boolean(role));return <>{(isOwner?[{name:"Owner",color:"#e9bd68"}]:builtin==="admin"?[{name:"Admin",color:"#ed4245"}]:[{name:"Member",color:"#8b95a7"}]).map(role=><span key={role.name} className="profile-server-role" style={{"--role-color":role.color} as React.CSSProperties}><i/>{role.name}</span>)}{assigned.map(role=><span key={role.id} className="profile-server-role" style={{"--role-color":role.color} as React.CSSProperties}><i/>{role.name}</span>)}</>;})()}</div></section>}<div className="profile-popout-divider"/><section className="profile-about"><h3>ABOUT ME</h3><p>{selectedProfile.id===session.user.id?"This is your Voax profile.":"A Voax community member."}</p></section><section className="profile-mutual"><h3>MUTUAL SERVERS</h3><div className="profile-mutual-row profile-mutual-icons" aria-label="Mutual servers" title={currentServer?.name||"Voax"}>{currentServer?.iconUrl?<img src={currentServer.iconUrl} alt={currentServer.name||"Server icon"}/>:<span aria-hidden="true">{initials(currentServer?.name||"Voax")}</span>}</div></section><div className="profile-popout-actions">{selectedProfile.id!==session.user.id&&<><button className="btn secondary" onClick={()=>{setModalInput(selectedProfile.name);setModal("friend");setSelectedProfile(null);}}>Add Friend</button><button className="btn primary" onClick={()=>{const person=selectedProfile;setSelectedProfile(null);void openDM(person);}}>Message</button></>}</div></div></section></div>}
    {contextMenu && <div className="context-menu-dismiss" onMouseDown={e=>{if(e.target===e.currentTarget)setContextMenu(null);}} onContextMenu={e=>{e.preventDefault();setContextMenu(null);}}><div className="context-menu" role="menu" aria-label="Context actions" style={{left:Math.max(8,Math.min(contextMenu.x,window.innerWidth-228)),top:Math.max(8,Math.min(contextMenu.y,window.innerHeight-330))}} onMouseDown={e=>e.stopPropagation()}>{contextMenu.kind==="person"&&<><div className="context-menu-label">{contextMenu.person.name}</div><button role="menuitem" onClick={()=>openProfile(contextMenu.person)}><Icon name="user" size={15}/> View Profile</button><button role="menuitem" onClick={()=>{const person=contextMenu.person;setContextMenu(null);void openDM(person);}}><Icon name="message" size={15}/> Message</button>{!contextMenu.person.isFriend&&contextMenu.person.id!==session.user.id&&<button role="menuitem" onClick={()=>{setModalInput(contextMenu.person.name);setModal("friend");setContextMenu(null);}}><Icon name="userPlus" size={15}/> Add Friend</button>}<button role="menuitem" onClick={()=>void copyContextText(contextMenu.person.name,"Username")}><Icon name="copy" size={15}/> Copy Username</button>{contextMenu.person.hasConversation&&<><div className="context-menu-divider"/><button role="menuitem" className="danger" onClick={()=>void hideDMForPerson(contextMenu.person)}><Icon name="close" size={15}/> Close DM</button></>}</>}{contextMenu.kind==="server"&&<><div className="context-menu-label">{contextMenu.server.name}</div><button role="menuitem" onClick={()=>{switchToServer(contextMenu.server);setContextMenu(null);}}><Icon name="message" size={15}/> Open Server</button>{(contextMenu.server.role==="owner"||contextMenu.server.role==="admin")&&<><button role="menuitem" onClick={()=>{setActiveServer(contextMenu.server.id);setModalInput(contextMenu.server.name);setModal("manageServer");setContextMenu(null);}}><Icon name="settings" size={15}/> Server Settings</button><button role="menuitem" onClick={()=>{setActiveServer(contextMenu.server.id);setModalInput("");setCategoryInput("Text Channels");setCategoryCreationMode(false);setModal("channel");setContextMenu(null);}}><Icon name="plus" size={15}/> Create Channel</button></>}{contextMenu.server.inviteCode&&<button role="menuitem" onClick={()=>void copyContextText(contextMenu.server.inviteCode!,"Invite code")}><Icon name="copy" size={15}/> Copy Invite Code</button>}</>}{contextMenu.kind==="channel"&&<><div className="context-menu-label">#{contextMenu.channel.name}</div><button role="menuitem" onClick={()=>{switchToChannel(contextMenu.channel);setContextMenu(null);}}><Icon name="message" size={15}/> Open Channel</button><button role="menuitem" onClick={()=>void copyContextText("#"+contextMenu.channel.name,"Channel name")}><Icon name="copy" size={15}/> Copy Channel Name</button><button role="menuitem" onClick={()=>{void markChannelRead(contextMenu.channel.id);setContextMenu(null);}}><Icon name="check" size={15}/> Mark As Read</button>{canManageServer&&<button role="menuitem" onClick={()=>{setActive(contextMenu.channel.id);setModalInput(contextMenu.channel.name);setCategoryInput(contextMenu.channel.category||"Text Channels");setModal("manageChannel");setContextMenu(null);}}><Icon name="settings" size={15}/> Edit Channel</button>}</>}{contextMenu.kind==="channels"&&<><div className="context-menu-label">{currentServer?.name||"CHANNELS"}</div>{canManageServer&&<><button role="menuitem" onClick={()=>{setModalInput("");setCategoryInput("New Category");setCategoryCreationMode(true);setModal("channel");setContextMenu(null);}}><Icon name="folderPlus" size={15}/> Create Category</button><button role="menuitem" onClick={()=>{setModalInput("");setCategoryInput("Text Channels");setCategoryCreationMode(false);setModal("channel");setContextMenu(null);}}><Icon name="plus" size={15}/> Create Channel</button></>}</>}{contextMenu.kind==="message"&&<><div className="context-menu-label">MESSAGE ACTIONS</div><div className="context-quick-reactions">{["👍","❤️","😂","🎉","👀"].map(emoji=><button key={emoji} title={"React "+emoji} onClick={()=>{void toggleReaction(contextMenu.message.id,emoji);setContextMenu(null);}}>{emoji}</button>)}</div><button role="menuitem" onClick={()=>{startReply(contextMenu.message);setContextMenu(null);}}><Icon name="reply" size={15}/> Reply</button><button role="menuitem" onClick={()=>void copyContextText(contextMenu.message.text,"Message")}><Icon name="copy" size={15}/> Copy Message Text</button>{contextPersonForMessage(contextMenu.message)&&<button role="menuitem" onClick={()=>openProfile(contextPersonForMessage(contextMenu.message)!)}><Icon name="user" size={15}/> View Author Profile</button>}{(contextMenu.message.own||canManageMessages&&view==="channel")&&<><div className="context-menu-divider"/><button role="menuitem" className="danger" onClick={()=>{const message=contextMenu.message;setContextMenu(null);void deleteMessage(message);}}><Icon name="delete" size={15}/> Delete Message</button></>}</>}</div></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}


function DocsPage() {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState("getting-started");
  const sections = [
    { id: "getting-started", label: "Getting started", icon: "sparkles" },
    { id: "friends", label: "Friends & DMs", icon: "users" },
    { id: "servers", label: "Servers & channels", icon: "message" },
    { id: "messages", label: "Messaging", icon: "send" },
    { id: "profiles", label: "Profile & presence", icon: "user" },
    { id: "settings", label: "Settings & appearance", icon: "settings" },
    { id: "moderation", label: "Server management", icon: "shield" },
    { id: "troubleshooting", label: "Troubleshooting", icon: "helpCircle" },
  ];
  const entries = [
    { id: "getting-started", title: "Welcome to Voax", intro: "Voax is a place to chat with friends and organize communities in servers. Start by creating an account or signing in, then make your profile your own.", steps: ["Open Voax and choose the sign-up or sign-in option.", "Complete the requested account details and verify your email if prompted.", "Once signed in, use the sidebar to move between your conversations, friends, servers, and channels."] },
    { id: "friends", title: "Add friends and start private chats", intro: "Friends make it easier to find people and continue conversations outside a server.", steps: ["Open the Friends area and choose the add-friend action.", "Enter the person's exact Voax username, then send the request.", "The other person can accept or reject the request from their incoming requests.", "Open a friend's profile or use the Message action to start a direct conversation."] },
    { id: "servers", title: "Servers and channels", intro: "Servers group a community together. Channels keep different topics organized so conversations are easier to follow.", steps: ["Create a server for your community, or use Join Server to join with an invite code or link.", "Select a server from the server rail to view its channels.", "Choose a channel to read and send messages in that space.", "If you have permission, open server settings to manage the server, channels, and member roles.", "Share the server's invite code with people you want to invite. Treat invite links as shareable access links."] },
    { id: "messages", title: "Send messages and share links", intro: "Use channel chat for group discussions and direct messages for one-to-one conversations.", steps: ["Select a channel or direct message, type into the message composer, and send.", "Use message actions to reply, react with an emoji, copy text, or delete a message when allowed.", "Paste a web link to show a link preview when available.", "Use the attachment button when available to attach a file. Only share files and links you are comfortable showing to that conversation."] },
    { id: "profiles", title: "Profiles and online status", intro: "Your profile helps other members recognize you and understand when you are available.", steps: ["Open your profile or account settings to update supported profile details and your avatar.", "Choose a presence status such as Online, Idle, Do not disturb, or Offline when the status control is available.", "Select another member to view their profile and use the available actions, such as Message or Add Friend."] },
    { id: "settings", title: "Settings and appearance", intro: "Tune the app to your preferences from the user settings panel.", steps: ["Open user settings from your profile or account menu.", "Use Appearance to switch between dark and light themes.", "Review account and profile options before leaving the settings panel.", "On a smaller screen, use the navigation controls to open the sidebar and move between spaces."] },
    { id: "moderation", title: "Server management and roles", intro: "Server owners and authorized moderators have additional tools to keep a community organized.", steps: ["Open the server settings from the server menu.", "Create or organize channels when you have the required permission.", "Manage member roles and their permissions carefully; grant only the access people need.", "Use member-management actions and message moderation options only when you have permission.", "If a control is missing or disabled, your current role may not have permission to use it."] },
    { id: "troubleshooting", title: "Troubleshooting", intro: "Most common issues can be resolved by checking the selected space, account, and connection.", steps: ["If you cannot find someone, check the spelling of their exact Voax username.", "If a friend request is already pending or the two of you are already friends, check your existing requests and friend list first.", "If messages or channels do not load, check your internet connection and reload Voax.", "If a server action is unavailable, ask the server owner to check your role and permissions.", "Never share your password or verification codes. If sign-in still fails, use the account recovery option shown on the sign-in screen if available."] },
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = entries.filter(entry => !normalizedQuery || (entry.title + " " + entry.intro + " " + entry.steps.join(" ")).toLowerCase().includes(normalizedQuery));
  return <main className="docs-page">
    <header className="docs-topbar"><a className="docs-brand" href="/"><Logo size={34}/> <span>Voax</span><span className="docs-brand-divider">/</span><span className="docs-brand-label">Help center</span></a><div className="docs-top-actions"><a href="/">Home</a><a className="btn primary" href="/app">Open Voax <Icon name="arrowUpRight" size={15}/></a></div></header>
    <section className="docs-hero"><div className="docs-eyebrow"><span className="pulse"/> VOAX HELP CENTER</div><h1>Make yourself<br/><span>at home.</span></h1><p>Everything you need to start chatting, find your people, and build a community on Voax.</p><label className="docs-search"><Icon name="search" size={19}/><input aria-label="Search the user guide" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the guide, e.g. add a friend"/></label><div className="docs-hero-meta"><span><Icon name="bookOpen" size={14}/> User guide</span><span><Icon name="clock" size={14}/> Quick, practical answers</span></div></section>
    <div className="docs-layout"><aside className="docs-sidebar"><div className="docs-sidebar-label">ON THIS PAGE</div>{sections.map(section => <a key={section.id} className={activeSection===section.id?"active":""} href={"#"+section.id} onClick={()=>setActiveSection(section.id)}><Icon name={section.icon} size={16}/>{section.label}</a>)}<div className="docs-sidebar-tip"><Icon name="lightbulb" size={18}/><strong>Quick tip</strong><p>Use the exact Voax username when sending a friend request.</p></div></aside>
      <div className="docs-content">{normalizedQuery && <div className="docs-results-count">{filteredEntries.length} {filteredEntries.length===1?"topic":"topics"} matching “{query}”</div>}{filteredEntries.length===0 ? <div className="docs-no-results"><Icon name="search" size={26}/><h2>No matching topics</h2><p>Try a different keyword, like “server”, “theme”, or “friend”.</p><button className="btn secondary" onClick={()=>setQuery("")}>Clear search</button></div> : filteredEntries.map((entry,index) => <section className="docs-article" id={entry.id} key={entry.id}><div className="docs-article-index">{String(index+1).padStart(2,"0")}</div><div className="docs-article-main"><div className="docs-section-kicker">VOAX GUIDE / {String(index+1).padStart(2,"0")}</div><h2>{entry.title}</h2><p className="docs-intro">{entry.intro}</p><ol>{entry.steps.map((step,i)=><li key={step}><span className="docs-step-number">{i+1}</span><span>{step}</span></li>)}</ol></div></section>)}
      <section className="docs-help-card"><div className="docs-help-icon"><Icon name="messageCircle" size={22}/></div><div><h3>Still need a hand?</h3><p>Try the troubleshooting guide above or ask a server owner for help with community permissions.</p></div><a href="/app" className="btn secondary">Back to Voax <Icon name="arrowUpRight" size={14}/></a></section>
      <footer className="docs-footer"><span>© 2026 Voax</span><span>Built for your people, your space.</span><a href="/">Back to home ↑</a></footer></div></div>
  </main>;
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
  if (window.location.pathname === "/docs" || window.location.pathname === "/docs/") return <DocsPage />;
  if (!authReady) return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",background:"#090b10",color:"#5eead4",fontFamily:"system-ui"}}>Connecting to Voax…</main>;
  if (!session) return <AuthScreen />;
  return <App session={session}/>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Root/></React.StrictMode>);
