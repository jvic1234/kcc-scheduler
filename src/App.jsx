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
// Shared row key — all users share the same schedule row
const SHARED_KEY = "shared:kcc-v1";

function installStorageShim(userId) {
  window.storage = {
    get: async (key) => {
      const { data, error } = await supabase
        .from("schedule")
        .select("data")
        .eq("id", SHARED_KEY)
        .maybeSingle();
      if (error || !data) throw new Error("key not found");
      return { key, value: JSON.stringify(data.data) };
    },
    set: async (key, value) => {
      // Fetch latest first, then merge at location/schedule level to avoid overwriting concurrent changes
      const { data: existing } = await supabase
        .from("schedule")
        .select("data")
        .eq("id", SHARED_KEY)
        .maybeSingle();

      const incoming = JSON.parse(value);

      let merged = incoming;
      if (existing?.data) {
        // Deep merge: keep all locations, merge schedule cells per location
        const base = existing.data;
        merged = { ...base, ...incoming, activeLocId: incoming.activeLocId };

        // Merge locations array
        const mergedLocs = [...(incoming.locations || [])];
        for (const baseLoc of (base.locations || [])) {
          const idx = mergedLocs.findIndex(l => l.id === baseLoc.id);
          if (idx >= 0) {
            // Merge schedule cells — incoming wins per cell (last write wins)
            mergedLocs[idx] = {
              ...baseLoc,
              ...mergedLocs[idx],
              schedule: { ...(baseLoc.schedule || {}), ...(mergedLocs[idx].schedule || {}) }
            };
          } else {
            mergedLocs.push(baseLoc);
          }
        }
        merged.locations = mergedLocs;
      }

      const { error } = await supabase
        .from("schedule")
        .upsert({ id: SHARED_KEY, data: merged, updated_at: new Date().toISOString() });
      if (error) { console.error("Storage save error:", error); return null; }
      return { key, value };
    },
    delete: async (key) => {
      await supabase.from("schedule").delete().eq("id", SHARED_KEY);
      return { key, deleted: true };
    },
    list: async () => {
      const { data } = await supabase.from("schedule").select("id").eq("id", SHARED_KEY);
      return { keys: data?.length ? ["kcc-v1"] : [] };
    },
  };
}

// Real-time sync — call this after shim is installed to subscribe to remote changes
function subscribeToRealtimeChanges(onRemoteChange) {
  return supabase
    .channel("schedule-changes")
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "schedule",
      filter: `id=eq.${SHARED_KEY}`,
    }, (payload) => {
      if (payload.new?.data) onRemoteChange(payload.new.data);
    })
    .subscribe();
}

// ─── Login / Sign-up screen ───────────────────────────────────────────────────
function AuthScreen() {
  const { signIn, signUp } = useAuth();
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
      const { error } = await signIn(email, password);
      if (error) throw error;
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.center}>
        <div style={S.card}>
          <div style={S.logo}>🌱 Kids Connection Childcare</div>
          <p style={S.sub}>Welcome back — sign in to continue.</p>
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
            {busy ? "Please wait…" : "Sign In"}
          </button>

        </div>
      </div>
    </div>
  );
}

// ─── Authenticated shell ──────────────────────────────────────────────────────
function SchedulerShell() {
  const { session, signOut } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [remoteData, setRemoteData]   = useState(null);
  const realtimeRef = useRef(null);
  const presenceRef = useRef(null);

  // Install shim SYNCHRONOUSLY during render — before scheduler's useEffect fires
  const shimInstalledRef = useRef(false);
  if (!shimInstalledRef.current) {
    installStorageShim(session.user.id);
    shimInstalledRef.current = true;
  }

  useEffect(() => {
    // Subscribe to live schedule changes from other users
    realtimeRef.current = subscribeToRealtimeChanges((data) => {
      setRemoteData(data);
    });

    // Presence — show who's online
    const shortName = session.user.email.split("@")[0];
    presenceRef.current = supabase
      .channel("kcc-presence")
      .on("presence", { event: "sync" }, () => {
        const state = presenceRef.current.presenceState();
        const users = Object.values(state).flat().map(u => u.name).filter(Boolean);
        setOnlineUsers([...new Set(users)]);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceRef.current.track({ name: shortName });
        }
      });

    return () => {
      realtimeRef.current?.unsubscribe();
      presenceRef.current?.unsubscribe();
    };
  }, []);

  return (
    <>
      {onlineUsers.length > 1 && (
        <div style={{ background:"#1B4332", padding:"6px 20px", display:"flex", alignItems:"center", gap:10, fontSize:12, fontFamily:"'Nunito',sans-serif" }}>
          <span style={{ color:"#95D5B2", fontWeight:800 }}>🟢 Live:</span>
          {onlineUsers.map((u,i) => (
            <span key={i} style={{ background:"rgba(255,255,255,0.15)", color:"white", padding:"2px 10px", borderRadius:20, fontWeight:700 }}>{u}</span>
          ))}
          <span style={{ color:"rgba(255,255,255,0.5)", fontSize:11 }}>· Changes sync automatically</span>
        </div>
      )}
      <KidsConnectionScheduler
        userEmail={session.user.email}
        onSignOut={signOut}
        remoteData={remoteData}
        onRemoteDataConsumed={() => setRemoteData(null)}
      />
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
