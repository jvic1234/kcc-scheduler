import { useState, useEffect, createContext, useContext } from "react";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────
// 🔧 CONFIGURATION — replace with your project values
// ─────────────────────────────────────────────
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────
// AUTH CONTEXT
// ─────────────────────────────────────────────
const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signUp = (email, password) =>
    supabase.auth.signUp({ email, password });

  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

const useAuth = () => useContext(AuthContext);

// ─────────────────────────────────────────────
// STYLES (inline CSS-in-JS object map)
// ─────────────────────────────────────────────
const S = {
  // Layout
  page: {
    minHeight: "100vh",
    background: "#0a0a0f",
    color: "#e8e6f0",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    width: "100%",
    maxWidth: 420,
    padding: "0 20px",
  },
  // Auth card
  card: {
    background: "linear-gradient(135deg, #16141f 0%, #1c1929 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: "40px 36px",
    boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
  },
  logo: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-0.5px",
    marginBottom: 6,
    background: "linear-gradient(135deg, #c084fc, #818cf8)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    color: "#6b6880",
    fontSize: 14,
    marginBottom: 32,
  },
  // Form
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#9490a8",
    marginBottom: 8,
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    color: "#e8e6f0",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  inputFocus: {
    borderColor: "rgba(192,132,252,0.5)",
  },
  fieldGroup: {
    marginBottom: 20,
  },
  btn: {
    width: "100%",
    padding: "13px 24px",
    background: "linear-gradient(135deg, #c084fc, #818cf8)",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 8,
    transition: "opacity 0.2s, transform 0.1s",
  },
  btnSecondary: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#9490a8",
    marginTop: 10,
  },
  error: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#fca5a5",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    marginBottom: 16,
  },
  success: {
    background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.3)",
    color: "#86efac",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    marginBottom: 16,
  },
  // Dashboard
  dash: {
    minHeight: "100vh",
    background: "#0a0a0f",
    color: "#e8e6f0",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },
  navbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 40px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(16,14,25,0.8)",
    backdropFilter: "blur(12px)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  navLogo: {
    fontSize: 20,
    fontWeight: 800,
    background: "linear-gradient(135deg, #c084fc, #818cf8)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  userEmail: {
    fontSize: 13,
    color: "#6b6880",
  },
  signOutBtn: {
    padding: "7px 16px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    color: "#9490a8",
    fontSize: 13,
    cursor: "pointer",
  },
  main: {
    maxWidth: 860,
    margin: "0 auto",
    padding: "40px 24px",
  },
  heading: {
    fontSize: 26,
    fontWeight: 800,
    marginBottom: 6,
    letterSpacing: "-0.3px",
  },
  muted: {
    color: "#6b6880",
    fontSize: 14,
    marginBottom: 32,
  },
  // Data section
  addRow: {
    display: "flex",
    gap: 10,
    marginBottom: 24,
  },
  addInput: {
    flex: 1,
    padding: "11px 16px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    color: "#e8e6f0",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  addBtn: {
    padding: "11px 22px",
    background: "linear-gradient(135deg, #c084fc, #818cf8)",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    textAlign: "left",
    padding: "10px 16px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#6b6880",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  td: {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    color: "#d1cfe0",
    verticalAlign: "middle",
  },
  deleteBtn: {
    background: "transparent",
    border: "1px solid rgba(239,68,68,0.25)",
    borderRadius: 6,
    color: "#f87171",
    padding: "4px 12px",
    fontSize: 12,
    cursor: "pointer",
  },
  empty: {
    textAlign: "center",
    padding: "48px 0",
    color: "#4a4760",
  },
  loadingDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#c084fc",
    animation: "pulse 1.2s infinite",
  },
};

// ─────────────────────────────────────────────
// AUTH SCREEN  (Login / Sign-up)
// ─────────────────────────────────────────────
function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState("");

  const handleSubmit = async () => {
    setError("");
    setInfo("");
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.center}>
        <div style={S.card}>
          <div style={S.logo}>YourApp</div>
          <p style={S.subtitle}>
            {mode === "login" ? "Welcome back — sign in to continue." : "Create your account below."}
          </p>

          {error && <div style={S.error}>{error}</div>}
          {info && <div style={S.success}>{info}</div>}

          <div style={S.fieldGroup}>
            <label style={S.label}>Email</label>
            <input
              style={{ ...S.input, ...(focused === "email" ? S.inputFocus : {}) }}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused("")}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
            />
          </div>

          <div style={S.fieldGroup}>
            <label style={S.label}>Password</label>
            <input
              style={{ ...S.input, ...(focused === "pass" ? S.inputFocus : {}) }}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setFocused("pass")}
              onBlur={() => setFocused("")}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
            />
          </div>

          <button
            style={{ ...S.btn, opacity: busy ? 0.7 : 1 }}
            onClick={handleSubmit}
            disabled={busy}
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>

          <button
            style={{ ...S.btn, ...S.btnSecondary }}
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
              setInfo("");
            }}
          >
            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DASHBOARD (authenticated)
// Replace "items" table with your own table name
// ─────────────────────────────────────────────
function Dashboard() {
  const { session, signOut } = useAuth();
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── Fetch rows belonging to the current user ──
  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from("items")               // 🔧 change table name
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    else setItems(data || []);
    setLoading(false);
  }

  // ── Insert a new row ──
  async function addItem() {
    if (!newItem.trim()) return;
    const { error } = await supabase
      .from("items")               // 🔧 change table name
      .insert({ name: newItem.trim(), user_id: session.user.id });

    if (error) return setError(error.message);
    setNewItem("");
    fetchItems();
  }

  // ── Delete a row ──
  async function deleteItem(id) {
    const { error } = await supabase
      .from("items")               // 🔧 change table name
      .delete()
      .eq("id", id);

    if (error) return setError(error.message);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div style={S.dash}>
      <nav style={S.navbar}>
        <div style={S.navLogo}>YourApp</div>
        <div style={S.navRight}>
          <span style={S.userEmail}>{session.user.email}</span>
          <button style={S.signOutBtn} onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <main style={S.main}>
        <h1 style={S.heading}>Dashboard</h1>
        <p style={S.muted}>Manage your items below. Data is stored in Supabase.</p>

        {error && <div style={S.error}>{error}</div>}

        {/* ── Add row ── */}
        <div style={S.addRow}>
          <input
            style={S.addInput}
            placeholder="Enter item name…"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addItem()}
          />
          <button style={S.addBtn} onClick={addItem}>+ Add</button>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div style={S.empty}><span style={S.loadingDot} /> Loading…</div>
        ) : items.length === 0 ? (
          <div style={S.empty}>No items yet — add one above.</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Created</th>
                <th style={{ ...S.th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td style={S.td}>{item.name}</td>
                  <td style={{ ...S.td, color: "#6b6880" }}>
                    {new Date(item.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </td>
                  <td style={{ ...S.td, textAlign: "right" }}>
                    <button style={S.deleteBtn} onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────
function AppInner() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ ...S.page, flexDirection: "column", gap: 16 }}>
        <span style={S.loadingDot} />
      </div>
    );
  }

  return session ? <Dashboard /> : <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0f; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        input::placeholder { color: #3d3a4e; }
      `}</style>
      <AppInner />
    </AuthProvider>
  );
}
