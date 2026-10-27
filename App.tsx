import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { AuthScreen } from "./AuthScreen";
import { Icon } from "./icons.filename";

type Message = { id: string; author: string; text: string; time: string; own?: boolean; reactions?: string[]; replyTo?: { author: string; text: string } };
type PresenceStatus = "Online" | "Idle" | "Do not disturb" | "Offline";
type Person = { id: string; name: string; online: boolean; status?: PresenceStatus; color: string; preview: string; isFriend?: boolean; hasConversation?: boolean };
type Server = { id: string; name: string; description: string; createdBy?: string; inviteCode?: string };
type Channel = { id: string; name: string; description: string; serverId?: string };
type SavedState = {
  name: string; status: string; active: string; view: "channel" | "dm" | "friends" | "home";
  channels: Channel[]; servers?: Server[]; activeServer?: string; people: Person[]; messages: Record<string, Message[]>;
  accent: string; compact: boolean; unread?: Record<string, number>;
};

const KEY = "minedm.v2";
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
  const [name, setName] = useState(String(session.user.user_metadata?.username || session.user.email?.split("@")[0] || "Player"));
  const [status, setStatus] = useState<PresenceStatus>("Online");
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServer, setActiveServer] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [conversationIds, setConversationIds] = useState<Record<string, string>>({});
  const [active, setActive] = useState("");
  const [view, setView] = useState<"channel" | "dm" | "friends" | "home">(path.startsWith("/dms") ? "home" : "channel");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [modal, setModal] = useState<"dm" | "channel" | "server" | "manageServer" | "manageChannel" | "confirmDelete" | "settings" | "inbox" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ type: "server" | "channel"; id: string; name: string } | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [toast, setToast] = useState("");
  const [accent, setAccent] = useState(saved?.accent || "#00e5ff");
  const [compact, setCompact] = useState(saved?.compact || false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [typingPerson, setTypingPerson] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [filter, setFilter] = useState<"all" | "online">("all");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [voiceConnected, setVoiceConnected] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ name, status, accent, compact })); } catch { /* browser storage may be disabled */ }
  }, [name, status, accent, compact]);
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
  useEffect(()=>{
    let cancelled=false;
    (async()=>{try{const p=await supabase.from("profiles").upsert({id:session.user.id,username:String(session.user.user_metadata?.username||session.user.email?.split("@")[0]||"Player").slice(0,32),status:"Online"},{onConflict:"id",ignoreDuplicates:true});if(p.error)throw p.error;await loadWorkspace();}catch(error){if(!cancelled)notify("Couldn't load your MineDM workspace: "+(error instanceof Error?error.message:"Please try again."));}})();
    return()=>{cancelled=true;};
  },[session.user.id]);
  useEffect(()=>{const username=name.trim().slice(0,32)||"Player";void supabase.from("profiles").upsert({id:session.user.id,username,status},{onConflict:"id"}).then(({error})=>{if(error)notify("Profile changes couldn't be synced: "+error.message);});},[name,status,session.user.id]);
  useEffect(()=>{
    const channelId=view==="channel"?active:null,conversationId=view==="dm"&&activePerson?conversationIds[activePerson.id]:null;
    if(!channelId&&!conversationId)return;let cancelled=false;
    const loadMessages=async()=>{
      const result=channelId?await supabase.from("messages").select("id,author_id,body,created_at,reply_to,channel_id,conversation_id").eq("channel_id",channelId).order("created_at",{ascending:true}).limit(200):await supabase.from("messages").select("id,author_id,body,created_at,reply_to,channel_id,conversation_id").eq("conversation_id",conversationId!).order("created_at",{ascending:true}).limit(200);
      if(cancelled)return;if(result.error){notify("Couldn't load messages: "+result.error.message);return;}
      const rows=result.data||[],authorIds=[...new Set(rows.map(row=>row.author_id))];let profiles:any[]=[];
      if(authorIds.length){const p=await supabase.from("profiles").select("id,username").in("id",authorIds);if(p.error){notify("Couldn't load message authors: "+p.error.message);return;}profiles=p.data||[];}
      const names=new Map(profiles.map(p=>[p.id,p.username||"Player"])),byId=new Map(rows.map(row=>[row.id,row])),reactionMap=new Map<string,string[]>();
      if(rows.length){const rr=await supabase.from("message_reactions").select("message_id,emoji").eq("user_id",session.user.id).in("message_id",rows.map(row=>row.id));if(rr.error){notify("Couldn't load your reactions: "+rr.error.message);return;}for(const r of rr.data||[])reactionMap.set(r.message_id,[...(reactionMap.get(r.message_id)||[]),r.emoji]);}
      const mapped:Message[]=rows.map(row=>{const reply=row.reply_to?byId.get(row.reply_to):null;return{id:row.id,author:names.get(row.author_id)||(row.author_id===session.user.id?name:"Member"),text:row.body,time:new Date(row.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),own:row.author_id===session.user.id,...(reply?{replyTo:{author:names.get(reply.author_id)||"Member",text:reply.body}}:{}),...(reactionMap.has(row.id)?{reactions:reactionMap.get(row.id)}:{})};});
      setMessages(old=>({...old,[activeKey]:mapped,[active]:mapped}));
    };
    void loadMessages().catch(error=>{if(!cancelled)notify("Couldn't load messages: "+(error instanceof Error?error.message:"Please try again."));});
    return()=>{cancelled=true;};
  },[active,activeKey,view,session.user.id,conversationIds,activePerson?.id,people,name]);
  useEffect(()=>{
    const channelId=view==="channel"?active:null,conversationId=view==="dm"&&activePerson?conversationIds[activePerson.id]:null;
    if(!channelId&&!conversationId)return;
    const filter=channelId?"channel_id=eq."+channelId:"conversation_id=eq."+conversationId;
    const realtime=supabase.channel("minedm-messages-"+(channelId||conversationId)).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter},payload=>{
      const row=payload.new as {id:string;author_id:string;body:string;created_at:string;reply_to:string|null};
      const message:Message={id:row.id,author:row.author_id===session.user.id?name:(people.find(p=>p.id===row.author_id)?.name||"Member"),text:row.body,time:new Date(row.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),own:row.author_id===session.user.id};
      setMessages(old=>{const list=old[activeKey]||old[active]||[];if(list.some(m=>m.id===message.id))return old;const next=[...list,message];return{...old,[activeKey]:next,[active]:next};});
    }).subscribe();
    return()=>{void supabase.removeChannel(realtime);};
  },[active,activeKey,view,session.user.id,conversationIds,activePerson?.id,people,name]);

  const currentMessages = messages[activeKey] || messages[active] || [];
  const visibleMessages = search.trim() && (view === "channel" || view === "dm")
    ? currentMessages.filter(message => message.text.toLowerCase().includes(search.trim().toLowerCase()) || message.author.toLowerCase().includes(search.trim().toLowerCase()))
    : currentMessages;
  const filteredPeople = useMemo(() => people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || p.online) && (view !== "friends" || p.isFriend) && (view !== "home" || p.hasConversation)), [people, search, filter, view]);
  const filteredChannels = serverChannels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  function notify(text: string) { setToast(text); }
  async function loadWorkspace() {
    const uid=session.user.id;
    const {data:ownMemberships,error:membershipError}=await supabase.from("server_members").select("server_id,role").eq("user_id",uid);
    if(membershipError)throw membershipError;
    const serverIds=[...new Set((ownMemberships||[]).map(row=>row.server_id))];
    let serverRows:any[]=[],channelRows:any[]=[],serverMemberRows:any[]=[];
    if(serverIds.length){
      const [sr,cr,mr]=await Promise.all([
        supabase.from("servers").select("id,name,description,created_by,invite_code").in("id",serverIds).order("created_at"),
        supabase.from("channels").select("id,server_id,name,description").in("server_id",serverIds).order("created_at"),
        supabase.from("server_members").select("server_id,user_id,role").in("server_id",serverIds)]);
      if(sr.error)throw sr.error;if(cr.error)throw cr.error;if(mr.error)throw mr.error;
      serverRows=sr.data||[];channelRows=cr.data||[];serverMemberRows=mr.data||[];
    }
    const {data:friendships,error:friendError}=await supabase.from("friendships").select("requester_id,addressee_id,status").or("requester_id.eq."+uid+",addressee_id.eq."+uid);
    if(friendError)throw friendError;
    const {data:ownConvs,error:convError}=await supabase.from("conversation_members").select("conversation_id").eq("user_id",uid);
    if(convError)throw convError;
    const convIds=[...new Set((ownConvs||[]).map(row=>row.conversation_id))];
    let convMembers:any[]=[];
    if(convIds.length){const {data,error}=await supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id",convIds);if(error)throw error;convMembers=data||[];}
    const related=new Set<string>();
    for(const row of serverMemberRows)if(row.user_id!==uid)related.add(row.user_id);
    for(const row of friendships||[]){const id=row.requester_id===uid?row.addressee_id:row.requester_id;if(id!==uid)related.add(id);}
    for(const row of convMembers)if(row.user_id!==uid)related.add(row.user_id);
    let profiles:any[]=[];
    if(related.size){const {data,error}=await supabase.from("profiles").select("id,username,status").in("id",[...related]);if(error)throw error;profiles=data||[];}
    const friendIds=new Set<string>();
    for(const row of friendships||[])if(row.status==="accepted")friendIds.add(row.requester_id===uid?row.addressee_id:row.requester_id);
    const convMap:Record<string,string>={};
    for(const row of convMembers)if(row.user_id!==uid&&convIds.includes(row.conversation_id)&&!convMap[row.user_id])convMap[row.user_id]=row.conversation_id;
    const colors=["green","purple","orange","blue","pink"];
    setServers(serverRows.map(row=>({id:row.id,name:row.name,description:row.description||"Community server",createdBy:row.created_by,inviteCode:row.invite_code})));
    setChannels(channelRows.map(row=>({id:row.id,serverId:row.server_id,name:row.name,description:row.description||""})));
    setPeople(profiles.map((p,i)=>({id:p.id,name:p.username||"Player",status:(p.status||"Offline") as PresenceStatus,online:p.status==="Online",color:colors[i%colors.length],preview:"Start a conversation",isFriend:friendIds.has(p.id),hasConversation:Boolean(convMap[p.id])})));
    setConversationIds(convMap);
    setActiveServer(prev=>serverIds.includes(prev)?prev:(serverRows[0]?.id||""));
    setActive(prev=>(view==="dm"||view==="home"||view==="friends")?prev:(channelRows.some(row=>row.id===prev)?prev:(channelRows[0]?.id||"")));
  }
  async function toggleReaction(messageId:string,emoji:string){
    const existing=(messages[activeKey]||messages[active]||[]).find(m=>m.id===messageId);if(!existing)return;
    const selected=Boolean(existing.reactions?.includes(emoji));
    const request=selected?supabase.from("message_reactions").delete().eq("message_id",messageId).eq("user_id",session.user.id).eq("emoji",emoji):supabase.from("message_reactions").insert({message_id:messageId,user_id:session.user.id,emoji});
    const {error}=await request;if(error){notify("Couldn't update reaction: "+error.message);return;}
    setMessages(old=>{const list=old[activeKey]||old[active]||[];return{...old,[activeKey]:list.map(m=>m.id!==messageId?m:{...m,reactions:selected?(m.reactions||[]).filter(x=>x!==emoji):[...(m.reactions||[]),emoji]})};});
  }
  function startReply(message:Message){setReplyingTo(message);document.querySelector<HTMLInputElement>(".composer input")?.focus();}
  async function copyMessage(text:string){try{await navigator.clipboard.writeText(text);notify("Message copied.");}catch{notify("Clipboard access is blocked by this browser.");}}
  function openApp(){window.history.pushState({},"","/app");setShowLanding(false);setView("channel");setActive(channels[0]?.id||"");}
  async function openDM(person:Person|string){
    const requestedName=typeof person==="string"?person.trim():person.name;
    let target:Person|null=typeof person==="string"?null:person;
    if(!target){
      const {data,error}=await supabase.from("profiles").select("id,username,status").ilike("username",requestedName).maybeSingle();
      if(error){notify("Couldn't look up that player: "+error.message);return;}
      if(!data){notify("Couldn't find a MineDM account named "+requestedName+".");return;}
      target={id:data.id,name:data.username||"Player",status:(data.status||"Offline") as PresenceStatus,online:data.status==="Online",color:"blue",preview:"Start a conversation",isFriend:false,hasConversation:false};
    }
    if(target.id===session.user.id){notify("That's your own account.");return;}
    let conversationId=conversationIds[target.id];
    if(!conversationId){
      const {data:ownRows,error:ownError}=await supabase.from("conversation_members").select("conversation_id").eq("user_id",session.user.id);
      if(ownError){notify("Couldn't check existing conversations: "+ownError.message);return;}
      const ids=(ownRows||[]).map(row=>row.conversation_id);
      if(ids.length){const {data:targetRows,error:targetError}=await supabase.from("conversation_members").select("conversation_id").eq("user_id",target.id).in("conversation_id",ids);if(targetError){notify("Couldn't check existing conversations: "+targetError.message);return;}conversationId=targetRows?.[0]?.conversation_id;}
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
    setUnread(old=>({...old,[keyFor("dm",target!.name)]:0}));window.history.pushState({},"","/dms");setModal(null);
  }
  function openChannel(channel:Channel){setTypingPerson(null);setActive(channel.id);setView("channel");setUnread(old=>({...old,[keyFor("channel",channel.id)]:0}));setSidebarOpen(false);}
  async function sendMessage(e:FormEvent){
    e.preventDefault();const body=draft.trim();if(!body)return;
    const conversationId=view==="dm"&&activePerson?conversationIds[activePerson.id]:null;
    if(view==="dm"&&!conversationId){notify("Open a conversation with a MineDM player before sending a message.");return;}
    const {data,error}=await supabase.from("messages").insert({channel_id:view==="channel"?active:null,conversation_id:view==="dm"?conversationId:null,author_id:session.user.id,body,reply_to:replyingTo?.id||null}).select("id,author_id,body,created_at,reply_to").single();
    if(error||!data){notify("Message not sent: "+(error?.message||"Please try again."));return;}
    const item:Message={id:data.id,author:name,text:data.body,time:new Date(data.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),own:true,...(replyingTo?{replyTo:{author:replyingTo.author,text:replyingTo.text}}:{})};
    setMessages(old=>{const list=old[activeKey]||old[active]||[];const next=list.some(m=>m.id===item.id)?list:[...list,item];return{...old,[activeKey]:next,[active]:next};});
    setPeople(old=>old.map(p=>p.id===activePerson?.id?{...p,preview:body,hasConversation:true}:p));setDraft("");setReplyingTo(null);notify("Message sent.");
  }
  async function createItem(e:FormEvent){
    e.preventDefault();const value=modalInput.trim();if(!value)return;
    if(modal==="dm"){await openDM(value);setModalInput("");return;}
    if(modal==="channel"){
      const channelName=value.toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
      if(!channelName||!activeServer)return;
      if(serverChannels.some(c=>c.name===channelName)){notify("That channel already exists in this server.");return;}
      const {data,error}=await supabase.from("channels").insert({server_id:activeServer,name:channelName,description:"A new community channel",created_by:session.user.id}).select("id,server_id,name,description").single();
      if(error||!data){notify("Couldn't create the channel: "+(error?.message||"Please try again."));return;}
      await loadWorkspace();setActive(data.id);setView("channel");setShowLanding(false);notify("Channel created.");
    }
    setModal(null);setModalInput("");
  }
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
    const {error}=await supabase.from("channels").update({name:value}).eq("id",activeChannel.id);if(error){notify("Couldn't rename the channel: "+error.message);return;}
    await loadWorkspace();setModal(null);setModalInput("");notify("Channel renamed.");
  }
  function askDeleteServer(){if(!currentServer)return;if(servers.length<=1){notify("Keep at least one server.");return;}setPendingDelete({type:"server",id:currentServer.id,name:currentServer.name});setModal("confirmDelete");}
  function askDeleteChannel(channel:Channel){if(serverChannels.length<=1){notify("Each server must keep at least one channel.");return;}setPendingDelete({type:"channel",id:channel.id,name:channel.name});setModal("confirmDelete");}
  async function confirmDelete(){
    if(!pendingDelete)return;const item=pendingDelete;
    if(item.type==="channel"){const {error}=await supabase.from("channels").delete().eq("id",item.id);if(error){notify("Couldn't delete the channel: "+error.message);return;}setMessages(old=>{const next={...old};delete next[item.id];delete next[keyFor("channel",item.id)];return next;});await loadWorkspace();notify("Channel deleted.");}
    else{const {error}=await supabase.from("servers").delete().eq("id",item.id);if(error){notify("Couldn't delete the server: "+error.message);return;}await loadWorkspace();notify("Server deleted.");}
    setPendingDelete(null);setModal(null);
  }
  function switchToDMHome(){setView("home");setShowLanding(false);setSidebarOpen(false);window.history.pushState({},"","/dms");}
  function switchToServer(server?:Server){const target=server||currentServer;if(!target)return;setActiveServer(target.id);setActive(channels.find(c=>c.serverId===target.id)?.id||"");setView("channel");setShowLanding(false);setSidebarOpen(false);window.history.pushState({},"","/app");}

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
      <header className="topbar"><button className="mobile-toggle" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle sidebar"><Icon name="menu" size={20} /></button><div className="topbar-title"><span className="title-symbol">{view === "channel" ? <Icon name="hash" /> : view === "dm" ? <Icon name="at" /> : <Icon name="users" />}</span><div><strong>{view === "channel" ? activeChannel?.name || active : view === "dm" ? active : view === "home" ? "Direct Messages" : "Friends"}</strong><small>{view === "channel" ? activeChannel?.description : view === "dm" ? (typingPerson === active ? "Typing…" : `${activePerson?.status || (activePerson?.online ? "Online" : "Offline")} · Direct message · Demo`) : view === "home" ? "Your private conversations" : "Your people, all in one place"}</small></div></div><div className="topbar-actions"><span className="demo-pill"><i/> {view === "channel" ? "SUPABASE LIVE" : view === "dm" ? "PRIVATE CHAT" : "MINE DM"}</span>{view === "channel" && <button className={`icon-btn member-toggle ${showMembers ? "active" : ""}`} title={showMembers ? "Hide member list" : "Show member list"} aria-label={showMembers ? "Hide member list" : "Show member list"} aria-pressed={showMembers} onClick={() => setShowMembers(v => !v)}><Icon name="users" size={18} /></button>}<button className="icon-btn" title="Inbox" aria-label="Inbox" onClick={() => setModal("inbox")}><Icon name="inbox" size={18} /></button></div></header>
      {(view === "friends" || view === "home") ? <section className="friends-view"><div className="friends-intro"><span className="section-kicker">{view === "home" ? "YOUR INBOX" : "YOUR COMMUNITY"}</span><h1>{view === "home" ? "Direct Messages" : "Friends"}</h1><p>{view === "home" ? "Pick a conversation or start a new one with your crew." : "Find your people and pick up where you left off."}</p><button className="btn primary" onClick={() => { setModal("dm"); setModalInput(""); }}>＋ Start a conversation</button></div><div className="friend-tools"><div className="filter-tabs">{view === "friends" ? <><button className={filter === "all" ? "chosen" : ""} onClick={() => setFilter("all")}>All friends <span>{people.length}</span></button><button className={filter === "online" ? "chosen" : ""} onClick={() => setFilter("online")}>Online <span>{people.filter(p => p.online).length}</span></button></> : <button className="chosen">All conversations <span>{people.length}</span></button>}</div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a friend..." aria-label="Find a friend"/></div><div className="friend-grid">{filteredPeople.map(p => <article className="friend-card" key={p.name}><div className={`avatar large ${p.color}`}>{initials(p.name)}<i className={p.online ? "online" : ""}/></div><div className="friend-info"><strong>{p.name}</strong><small>{p.online ? "Online now" : "Offline"}</small></div><button className="btn small primary" onClick={() => openDM(p)}>{view === "home" ? "Open DM" : "Message"}</button></article>)}</div>{!filteredPeople.length && <div className="empty-state">No friends match that search.</div>}</section> :
      <><div className="message-scroll" key={activeKey}><div className="date-divider"><span>WELCOME TO {view === "channel" ? "#" + (activeChannel?.name || active) : "YOUR CONVERSATION"}</span></div>{visibleMessages.length ? visibleMessages.map(m => <article className={`message-row message-row-actionable ${compact ? "tight" : ""}`} key={m.id}><div className={`avatar message-avatar ${m.own ? "self" : m.author === "MineDM" ? "bot" : "blue"}`}>{initials(m.author)}</div><div className="message-body"><div className="message-meta"><strong>{m.author}</strong>{m.author === "MineDM" && <span className="bot-tag">BOT</span>}<time>{m.time}</time></div>{m.replyTo && <div className="reply-context"><span>↳ Replying to <strong>{m.replyTo.author}</strong></span><p>{m.replyTo.text}</p></div>}<p>{m.text}</p>{!!m.reactions?.length && <div className="message-reactions">{m.reactions.map(emoji => <button key={emoji} className="reaction-chip selected" onClick={() => toggleReaction(m.id, emoji)} aria-label={`Remove ${emoji} reaction`}>{emoji}<span>1</span></button>)}</div>}<div className="message-actions"><button onClick={() => toggleReaction(m.id, "👍")} title="Add reaction" aria-label="Add thumbs up reaction">👍</button><button onClick={() => startReply(m)} title="Reply" aria-label={`Reply to ${m.author}`}><Icon name="reply" size={14}/></button><button onClick={() => { void copyMessage(m.text); }} title="Copy message" aria-label="Copy message"><Icon name="copy" size={14}/></button></div></div></article>) : <div className="empty-state"><div className="empty-icon"><Icon name="sparkles" size={25} /></div><h3>{search.trim() ? "No matching messages" : "This is the beginning."}</h3><p>{search.trim() ? "Try another keyword or clear the search." : "Send the first message to get the conversation going."}</p></div>}{typingPerson && <div style={{ padding: "0 4vw 8px", color: "#8792a5", fontSize: 11 }} role="status">{typingPerson} is typing<span aria-hidden="true">…</span></div>}</div><div className="composer-area">{replyingTo && <div className="replying-banner"><span><Icon name="reply" size={14}/> Replying to <strong>{replyingTo.author}</strong><small>{replyingTo.text}</small></span><button type="button" className="icon-btn" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><Icon name="close" size={14}/></button></div>}<form className="composer" onSubmit={sendMessage}><button type="button" className="attach-btn" title="Attachments are demo-only" aria-label="Attach file" onClick={() => notify("File uploads need a backend connection.")}><Icon name="paperclip" size={18} /></button><input value={draft} onChange={e => setDraft(e.target.value)} placeholder={view === "channel" ? `Message #${activeChannel?.name || active}` : `Message @${active}`} aria-label="Message" maxLength={4000}/><button className="send-btn" type="submit" disabled={!draft.trim()} aria-label="Send message"><Icon name="send" size={17} /></button></form><div className="composer-foot"><span>Keep it kind. Keep it crafty.</span><span><kbd>Enter</kbd> to send · {view === "channel" ? "Messages sync with Supabase" : "DMs are local demo"}</span></div></div></>}
    </main>

    {showMembers && view === "channel" && <aside className="member-panel" aria-label="Channel members"><div className="member-panel-head"><div><strong>Members</strong><span>{people.length + 1} members</span></div><button className="icon-btn" onClick={() => setShowMembers(false)} aria-label="Hide member list" title="Hide member list"><Icon name="close" size={16}/></button></div><div className="member-group-label"><span className="member-status-dot online"/>ONLINE — {people.filter(p => p.online).length + 1}</div><div className="member-list"><div className="member-entry"><div className="avatar member-avatar self">{initials(name)}<i className="online"/></div><div><strong>{name}</strong><small>{status} · You</small></div><span className="member-you">YOU</span></div>{people.filter(p => p.online).map(p => <button className="member-entry" key={p.name} onClick={() => openDM(p)} title={`Message ${p.name}`}><div className={`avatar member-avatar ${p.color}`}>{initials(p.name)}<i className="online"/></div><div><strong>{p.name}</strong><small>{p.status || "Online"}</small></div><span className="member-entry-action"><Icon name="message" size={15}/></span></button>)}</div><div className="member-group-label"><span className="member-status-dot offline"/>OFFLINE — {people.filter(p => !p.online).length}</div><div className="member-list">{people.filter(p => !p.online).map(p => <button className="member-entry offline" key={p.name} onClick={() => openDM(p)} title={`Message ${p.name}`}><div className={`avatar member-avatar ${p.color}`}>{initials(p.name)}<i/></div><div><strong>{p.name}</strong><small>{p.status || "Offline"}</small></div><span className="member-entry-action"><Icon name="message" size={15}/></span></button>)}</div><div className="member-panel-note">Member list · Local demo data</div></aside>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true"><button className="modal-x" onClick={() => setModal(null)} aria-label="Close"><Icon name="close" size={18} /></button>
      {modal === "dm" && <><span className="section-kicker">DIRECT MESSAGES</span><h2>Start a conversation</h2><p>Enter the username of someone with a MineDM account.</p><form onSubmit={createItem}><label htmlFor="modalInput">Username</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="e.g. AlexTheBuilder" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Create DM</button></div></form></>}
      {modal === "server" && <><span className="section-kicker">NEW COMMUNITY</span><h2>Create a server</h2><p>Give your community a name. We will create a #general channel automatically.</p><form onSubmit={createServer}><label htmlFor="modalInput">Server name</label><input id="modalInput" autoFocus maxLength={40} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="Survival Squad" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Create server</button></div></form></>}
      {modal === "manageServer" && <><span className="section-kicker">SERVER SETTINGS</span><h2>Manage server</h2><p>Change the name of {currentServer?.name || "this server"}, or remove the server.</p><form onSubmit={renameServer}><label htmlFor="modalInput">Server name</label><input id="modalInput" autoFocus maxLength={40} value={modalInput} onChange={e => setModalInput(e.target.value)} required/><div className="modal-actions"><button type="button" className="btn secondary" disabled={servers.length <= 1} onClick={askDeleteServer}>Delete server</button><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Save changes</button></div></form></>}
      {modal === "manageChannel" && <><span className="section-kicker">CHANNEL SETTINGS</span><h2>Manage channel</h2><p>Rename #{activeChannel?.name || "channel"} or delete it and its messages.</p><form onSubmit={renameChannel}><label htmlFor="modalInput">Channel name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} required/><div className="modal-actions"><button type="button" className="btn secondary" disabled={serverChannels.length <= 1} onClick={() => activeChannel && askDeleteChannel(activeChannel)}>Delete channel</button><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Save changes</button></div></form></>}
      {modal === "confirmDelete" && <><span className="section-kicker">CONFIRM DELETION</span><h2>Delete {pendingDelete?.type === "server" ? "server" : "channel"}?</h2><p>{pendingDelete?.type === "server" ? `“${pendingDelete.name}” and all its channels and local messages will be removed from this browser.` : `#${pendingDelete?.name || "channel"} and its local message history will be removed from this browser.`} This cannot be undone.</p><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => { setModal(pendingDelete?.type === "server" ? "manageServer" : "manageChannel"); setPendingDelete(null); }}>Cancel</button><button type="button" className="btn primary" onClick={confirmDelete}>Delete permanently</button></div></>}
      {modal === "channel" && <><span className="section-kicker">{currentServer?.name || "SERVER"}</span><h2>Create a channel</h2><p>Add a text channel to this server.</p><form onSubmit={createItem}><label htmlFor="modalInput">Channel name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="build-plans" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary">Create channel</button></div></form></>}
      {modal === "settings" && <><span className="section-kicker">PERSONALIZE</span><h2>User settings</h2><p>Your display name and preferences are synced to your MineDM profile.</p><form onSubmit={e => { e.preventDefault(); setModal(null); notify("Settings saved."); }}><label htmlFor="displayName">Display name</label><input id="displayName" maxLength={32} value={name} onChange={e => setName(e.target.value)} required/><label htmlFor="status">Status</label><select id="status" value={status} onChange={e => setStatus(e.target.value)}><option>Online</option><option>Idle</option><option>Do not disturb</option><option>Offline</option></select><label htmlFor="accent">Accent color</label><div className="color-row"><input id="accent" type="color" value={accent} onChange={e => setAccent(e.target.value)}/><span>Choose your glow</span></div><label className="check-row"><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)}/> Compact message spacing</label><div className="modal-actions"><button type="button" className="btn secondary" onClick={async () => { const { error } = await supabase.auth.signOut(); if (error) notify("Couldn't sign out: " + error.message); }}>Sign out</button><button type="button" className="btn secondary" onClick={() => { localStorage.removeItem(KEY); window.location.reload(); }}>Reset local data</button><button className="btn primary">Save settings</button></div></form></>}
      {modal === "inbox" && <><span className="section-kicker">NOTIFICATIONS</span><h2>{Object.values(unread).reduce((total, count) => total + count, 0) ? "Unread messages" : "You're all caught up"}</h2><p>{Object.values(unread).reduce((total, count) => total + count, 0) ? "You have " + Object.values(unread).reduce((total, count) => total + count, 0) + " unread message(s). Open a conversation to catch up." : "New messages will show up here as unread counts."}</p><div className="modal-actions"><button className="btn primary" onClick={() => setModal(null)}>Sounds good</button></div></>}
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
