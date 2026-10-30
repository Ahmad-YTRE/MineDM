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

  async function signInWithGoogle() {
    setBusy(true); setError(""); setNotice("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { access_type: "offline", prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in couldn't start. Please try again.");
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
      <div style={{display:"flex",alignItems:"center",gap:12,fontWeight:950,letterSpacing:2,fontSize:22,color:"#fff",marginBottom:16}}><img src="/logo.png" alt="" width={48} height={48} style={{objectFit:"contain"}} />Voax</div>
      
      <form onSubmit={submit} style={{display:"grid",gap:13}}>
        {mode === "signup" && <label style={{display:"grid",gap:6,fontSize:12,color:"#aeb9ca"}}>Username<input value={username} onChange={e=>setUsername(e.target.value)} maxLength={32} placeholder="CraftyBuilder" style={fieldStyle}/></label>}
        <label style={{display:"grid",gap:6,fontSize:12,color:"#aeb9ca"}}>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={fieldStyle}/></label>
        <label style={{display:"grid",gap:6,fontSize:12,color:"#aeb9ca"}}>Password<input type="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" style={fieldStyle}/></label>
        {error && <p role="alert" style={{color:"#ff9292",fontSize:12,margin:0}}>{error}</p>}{notice && <p role="status" style={{color:"#5eead4",fontSize:12,margin:0}}>{notice}</p>}
        <button disabled={busy} className="btn primary large" style={{marginTop:4}}>{busy ? "Please wait…" : mode==="login" ? "Sign in" : "Create account"}</button>
        <div style={{display:"flex",alignItems:"center",gap:12,color:"#66758b",fontSize:11,margin:"4px 0"}}>
          <span style={{height:1,flex:1,background:"#ffffff18"}}/><span>OR</span><span style={{height:1,flex:1,background:"#ffffff18"}}/>
        </div>
        <button type="button" className="btn secondary large" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10}} disabled={busy} onClick={signInWithGoogle}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48" style={{flexShrink:0}}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.97 46.98 31.81 46.98 24.55Z"/>
            <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 43.62 14.62 48 24 48Z"/>
          </svg>
          {busy ? "Please wait…" : "Continue with Google"}
        </button>
        <button type="button" className="btn secondary large" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10}} disabled={busy} onClick={signInWithDiscord}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><path d="M19.73 5.14A18.2 18.2 0 0 0 15.2 3.75l-.57 1.16a16.8 16.8 0 0 0-5.26 0L8.8 3.75a18.2 18.2 0 0 0-4.53 1.39C1.4 9.35.62 13.46 1.01 17.52a18.3 18.3 0 0 0 5.56 2.8l1.2-1.95c-.66-.24-1.3-.55-1.9-.91l.47-.37c3.66 1.7 7.64 1.7 11.26 0l.48.37c-.61.36-1.25.67-1.91.91l1.2 1.95a18.2 18.2 0 0 0 5.56-2.8c.46-4.71-.79-8.78-3.2-12.38ZM8.55 15.1c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2 2.02.99 2 2.2c0 1.21-.88 2.2-2 2.2Zm6.9 0c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2 2.02.99 2 2.2c0 1.21-.88 2.2-2 2.2Z"/></svg>
          {busy ? "Please wait…" : "Continue with Discord"}
        </button>
      </form>
      <p style={{fontSize:12,color:"#8792a5",margin:"20px 0 0",textAlign:"center"}}>{mode==="login" ? "New to Voax?" : "Already have an account?"} <button type="button" onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");setNotice("");}} style={{background:"none",border:0,color:"#5eead4",fontWeight:750,padding:4}}>{mode==="login"?"Create an account":"Sign in"}</button></p>
    </section>
  </main>;
}
