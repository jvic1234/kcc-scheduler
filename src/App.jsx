import { useState, useEffect, useRef, createContext, useContext } from "react";
import { createClient } from "@supabase/supabase-js";
import KidsConnectionScheduler from "./daycare-scheduler";

// ─── Supabase client ──────────────────────────────────────────────────────────
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Auth context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      signIn:  (email, pw) => supabase.auth.signInWithPassword({ email, password: pw }),
      signUp:  (email, pw) => supabase.auth.signUp({ email, password: pw }),
      signOut: ()          => supabase.auth.signOut(),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

const useAuth = () => useContext(AuthContext);

// ─── Supabase storage shim ────────────────────────────────────────────────────
// Install synchronously so window.storage is ready before scheduler mounts.
function installStorageShim(userId) {
  window.storage = {
    get: async (key) => {
      const scopedKey = `${userId}:${key}`;
      const { data, error } = await supabase
        .from("schedule")
        .select("data")
        .eq("id", scopedKey)
        .maybeSingle();
      if (error || !data) throw new Error("key not found");
      return { key, value: JSON.stringify(data.data) };
    },
    set: async (key, value) => {
      const scopedKey = `${userId}:${key}`;
      const parsed = JSON.parse(value);
      const { error } = await supabase
        .from("schedule")
        .upsert({ id: scopedKey, data: parsed, updated_at: new Date().toISOString() });
      if (error) {
        console.error("Storage save error:", error);
        return null;
      }
      return { key, value };
    },
    delete: async (key) => {
      const scopedKey = `${userId}:${key}`;
      await supabase.from("schedule").delete().eq("id", scopedKey);
      return { key, deleted: true };
    },
    list: async (prefix) => {
      const scopedPrefix = `${userId}:${prefix || ""}`;
      const { data } = await supabase
        .from("schedule")
        .select("id")
        .like("id", `${scopedPrefix}%`);
      const keys = (data || []).map(r => r.id.replace(`${userId}:`, ""));
      return { keys };
    },
  };
}

// ─── Login / Sign-up screen ───────────────────────────────────────────────────
function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode,     setMode]     = useState("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [info,     setInfo]     = useState("");
  const [busy,     setBusy]     = useState(false);
  const [focused,  setFocused]  = useState("");

  const S = {
    page:     { minHeight:"100vh", background:"#0a0a0f", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans','Segoe UI',sans-serif" },
    center:   { width:"100%", maxWidth:420, padding:"0 20px" },
    card:     { background:"linear-gradient(135deg,#16141f,#1c1929)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"40px 36px", boxShadow:"0 32px 80px rgba(0,0,0,0.6)" },
    logo:     { fontSize:26, fontWeight:800, marginBottom:6, background:"linear-gradient(135deg,#c084fc,#818cf8)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
    sub:      { color:"#6b6880", fontSize:14, marginBottom:32 },
    label:    { display:"block", fontSize:12, fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase", color:"#9490a8", marginBottom:8 },
    input:    { width:"100%", padding:"12px 16px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#e8e6f0", fontSize:15, outline:"none", boxSizing:"border-box" },
    inputFoc: { borderColor:"rgba(192,132,252,0.5)" },
    group:    { marginBottom:20 },
    btn:      { width:"100%", padding:"13px 24px", background:"linear-gradient(135deg,#c084fc,#818cf8)", border:"none", borderRadius:10, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", marginTop:8 },
    btnSec:   { background:"transparent", border:"1px solid rgba(255,255,255,0.12)", color:"#9490a8" },
    err:      { background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", color:"#fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, marginBottom:16 },
    ok:       { background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)", color:"#86efac", borderRadius:8, padding:"10px 14px", fontSize:13, marginBottom:16 },
  };

  const handle = async () => {
    setError(""); setInfo("");
    if (!email || !password) return setError("Please fill in all fields.");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) throw error;
      } else {
        const { error } = await signUp(email, password);
        if (error) throw error;
        setInfo("Check your email to confirm your account.");
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.center}>
        <div style={S.card}>
          <div style={S.logo}>🌱 Kids Connection Childcare</div>
          <p style={S.sub}>{mode === "login" ? "Welcome back — sign in to continue." : "Create your account below."}</p>
          {error && <div style={S.err}>{error}</div>}
          {info  && <div style={S.ok}>{info}</div>}
          {[["Email","email",email,setEmail,"email"],["Password","pass",password,setPassword,"password"]].map(([label,id,val,set,type]) => (
            <div key={id} style={S.group}>
              <label style={S.label}>{label}</label>
              <input
                style={{ ...S.input, ...(focused===id ? S.inputFoc : {}) }}
                type={type} value={val}
                placeholder={type==="email" ? "you@example.com" : "••••••••"}
                onChange={e => set(e.target.value)}
                onFocus={() => setFocused(id)}
                onBlur={()  => setFocused("")}
                onKeyDown={e => e.key==="Enter" && handle()}
              />
            </div>
          ))}
          <button style={{ ...S.btn, opacity: busy ? 0.7 : 1 }} onClick={handle} disabled={busy}>
            {busy ? "Please wait…" : mode==="login" ? "Sign In" : "Create Account"}
          </button>
          <button style={{ ...S.btn, ...S.btnSec }} onClick={() => { setMode(m => m==="login"?"signup":"login"); setError(""); setInfo(""); }}>
            {mode==="login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Authenticated shell ──────────────────────────────────────────────────────
function SchedulerShell() {
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Install shim SYNCHRONOUSLY during render — before scheduler's useEffect fires
  const shimInstalledRef = useRef(false);
  if (!shimInstalledRef.current) {
    installStorageShim(session.user.id);
    shimInstalledRef.current = true;
  }

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <>
      {/* Hamburger menu — fixed bottom-right */}
      <div ref={menuRef} style={{ position:"fixed", bottom:20, right:20, zIndex:9999, fontFamily:"'Nunito',sans-serif" }}>

        {/* Dropdown panel */}
        {menuOpen && (
          <div style={{
            position:"absolute", bottom:"calc(100% + 10px)", right:0,
            background:"white", borderRadius:14, padding:"14px 16px",
            boxShadow:"0 8px 32px rgba(0,0,0,0.18)", border:"1px solid #E2E8F0",
            minWidth:220,
          }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#94A3B8", letterSpacing:"0.5px", marginBottom:8, textTransform:"uppercase" }}>Signed in as</div>
            <div style={{ fontSize:13, fontWeight:700, color:"#1E293B", marginBottom:14, wordBreak:"break-all" }}>{session.user.email}</div>
            <button
              onClick={() => { setMenuOpen(false); signOut(); }}
              style={{
                width:"100%", padding:"9px 0", borderRadius:9,
                border:"1px solid #E2E8F0", background:"#F8FAFC",
                color:"#DC2626", fontSize:13, fontWeight:800,
                cursor:"pointer", fontFamily:"inherit",
              }}
            >
              🚪 Sign out
            </button>
          </div>
        )}

        {/* Hamburger button */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{
            width:42, height:42, borderRadius:12,
            background: menuOpen ? "#1E3A8A" : "white",
            border:"1px solid #E2E8F0",
            boxShadow:"0 2px 12px rgba(0,0,0,0.15)",
            cursor:"pointer", display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:5,
            transition:"background 0.15s",
          }}
        >
          {[0,1,2].map(i => (
            <span key={i} style={{
              display:"block", width:18, height:2, borderRadius:2,
              background: menuOpen ? "white" : "#475569",
              transition:"background 0.15s",
            }}/>
          ))}
        </button>
      </div>

      <KidsConnectionScheduler userEmail={session.user.email} onSignOut={signOut} />
    </>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function AppInner() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight:"100vh", background:"#0a0a0f", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ width:10, height:10, borderRadius:"50%", background:"#c084fc", animation:"pulse 1.2s infinite" }} />
      </div>
    );
  }

  return session ? <SchedulerShell /> : <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=Nunito:wght@400;600;700;800;900&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#f8fafc; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        input::placeholder { color:#94A3B8; }
      `}</style>
      <AppInner />
    </AuthProvider>
  );
}
