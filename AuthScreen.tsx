import { FormEvent, useState } from "react";
import { supabase } from "./supabase";

const fieldStyle: React.CSSProperties = { width:"100%",boxSizing:"border-box",padding:"12px 13px",border:"1px solid #ffffff20",borderRadius:8,background:"#090c11",color:"#edf4ff",font:"inherit" };

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function signInWithDiscord() {
    setBusy(true); setError(""); setNotice("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: window.location.origin, scopes: "identify email" } });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discord sign-in couldn't start. Please try again.");
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: username.trim().replace(/\s+/g," ").slice(0,32) || email.split("@")[0] } } });
        if (error) throw error;
        if (!data.session) setNotice("Account created. Check your email to confirm it, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Authentication failed. Please try again."); }
    finally { setBusy(false); }
  }

  return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",padding:24,background:"radial-gradient(ellipse at 50% 0%,#132b3c 0,transparent 50%),#090b10",color:"#e5ebf5",fontFamily:"Inter,system-ui,sans-serif"}}>
    <section style={{width:"min(100%,420px)",padding:32,border:"1px solid #ffffff18",borderRadius:18,background:"#10151eee",boxShadow:"0 24px 80px #0006"}}>
      <div style={{fontWeight:950,letterSpacing:2,fontSize:22,color:"#fff",marginBottom:8}}>Mine<span style={{color:"#00e5ff"}}>DM</span></div>
      <p style={{color:"#9aa8bc",lineHeight:1.6,margin:"0 0 24px"}}>{mode === "login" ? "Sign in to join your crew. Your channels and messages sync across devices." : "Create your account to start chatting with your crew."}</p>
      <form onSubmit={submit} style={{display:"grid",gap:13}}>
        {mode === "signup" && <label style={{display:"grid",gap:6,fontSize:12,color:"#aeb9ca"}}>Username<input value={username} onChange={e=>setUsername(e.target.value)} maxLength={32} placeholder="CraftyBuilder" style={fieldStyle}/></label>}
        <label style={{display:"grid",gap:6,fontSize:12,color:"#aeb9ca"}}>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={fieldStyle}/></label>
        <label style={{display:"grid",gap:6,fontSize:12,color:"#aeb9ca"}}>Password<input type="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" style={fieldStyle}/></label>
        {error && <p role="alert" style={{color:"#ff9292",fontSize:12,margin:0}}>{error}</p>}{notice && <p role="status" style={{color:"#5eead4",fontSize:12,margin:0}}>{notice}</p>}
        <button disabled={busy} className="btn primary large" style={{marginTop:4}}>{busy ? "Please wait…" : mode==="login" ? "Sign in" : "Create account"}</button>
        <div style={{display:"flex",alignItems:"center",gap:12,color:"#66758b",fontSize:11,margin:"4px 0"}}>
          <span style={{height:1,flex:1,background:"#ffffff18"}}/><span>OR</span><span style={{height:1,flex:1,background:"#ffffff18"}}/>
        </div>
        <button type="button" className="btn secondary large" style={{width:"100%"}} disabled={busy} onClick={signInWithDiscord}>
          {busy ? "Please wait…" : "Continue with Discord"}
        </button>
      </form>
      <p style={{fontSize:12,color:"#8792a5",margin:"20px 0 0",textAlign:"center"}}>{mode==="login" ? "New to MineDM?" : "Already have an account?"} <button type="button" onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");setNotice("");}} style={{background:"none",border:0,color:"#5eead4",fontWeight:750,padding:4}}>{mode==="login"?"Create an account":"Sign in"}</button></p>
    </section>
  </main>;
}
