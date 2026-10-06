import React, { useState, useEffect } from "react";

const BACKEND_URL = "http://localhost:3000";

export default function App() {
  const [view, setView] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  // Token sirf IN-MEMORY state mein rahega, localStorage mein NAHI
  const [accessToken, setAccessToken] = useState(null);

  const showNotification = (text, type = "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "" }), 5000);
  };



  // 1. SILENT REFRESH (Page refresh par cookie check karke login restore karega)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/refresh-token`, {
          method: "POST",
          credentials: "include", // Cookie bhejne ke liye lazmi hai
        });
        const data = await res.json();
        if (res.ok && data.accessToken) {
          setAccessToken(data.accessToken);
          setView("dashboard");
        }
      } catch (err) {
        // Agar user login nahi tha toh silently login screen par rehne do
      }
    };
    checkAuth();
  }, []);

  // 2. REGISTER HANDLER
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Registration failed");

      showNotification(data.message, "success");
      setView("verify-otp");
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // 3. VERIFY OTP HANDLER
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // httpOnly cookie set karne ke liye
        body: JSON.stringify({ email, otp }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "OTP Verification failed");

      setAccessToken(data.accessToken);
      showNotification("Account activated successfully!", "success");
      setView("dashboard");
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // 4. LOGIN HANDLER
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // httpOnly cookie set karne ke liye
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");

      // Memory mein access token rakhein
      setAccessToken(data.accessToken);
      showNotification("Login successful!", "success");
      setView("dashboard");
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // 5. LOGOUT HANDLER (Cookie clear karein)
  const handleLogout = async () => {
    try {
      await fetch(`${BACKEND_URL}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error(err);
    }
    setAccessToken(null);
    setEmail("");
    setPassword("");
    setOtp("");
    setView("login");
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8">
        
        {message.text && (
          <div
            className={`mb-6 p-3.5 rounded-xl text-sm font-medium text-center ${
              message.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* REGISTER */}
        {view === "register" && (
          <form onSubmit={handleRegister} className="space-y-5">
            <h2 className="text-2xl font-bold text-white text-center">Create Account</h2>
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl"
            >
              {loading ? "Sending..." : "Register & Get OTP"}
            </button>
            <p className="text-sm text-center text-slate-400">
              Already verified?{" "}
              <button
                type="button"
                onClick={() => setView("login")}
                className="text-indigo-400 underline"
              >
                Login
              </button>
            </p>
          </form>
        )}

        {/* VERIFY OTP */}
        {view === "verify-otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <h2 className="text-2xl font-bold text-white text-center">Verify Email</h2>
            <p className="text-slate-400 text-sm text-center">OTP sent to: {email}</p>
            <input
              type="text"
              required
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full py-3.5 text-center tracking-[0.5em] text-2xl font-bold rounded-xl bg-slate-900/80 border-2 border-indigo-500/50 text-indigo-400 outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl"
            >
              {loading ? "Verifying..." : "Verify & Sign In"}
            </button>
          </form>
        )}

        {/* LOGIN */}
        {view === "login" && (
          <form onSubmit={handleLogin} className="space-y-5">
            <h2 className="text-2xl font-bold text-white text-center">Sign In</h2>
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl"
            >
              {loading ? "Signing in..." : "Login"}
            </button>
            <p className="text-sm text-center text-slate-400">
              New here?{" "}
              <button
                type="button"
                onClick={() => setView("register")}
                className="text-indigo-400 underline"
              >
                Register
              </button>
            </p>
          </form>
        )}

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div className="text-center space-y-6">
            <h2 className="text-2xl font-bold text-white">Dashboard</h2>
            <p className="text-emerald-400 font-medium">Session secured with In-Memory Access Token & httpOnly Cookie</p>
            {accessToken && (
              <div className="text-left bg-slate-900/80 p-4 rounded-xl border border-slate-700">
                <span className="text-xs uppercase font-bold text-slate-400 block mb-1">In-Memory Access Token:</span>
                <p className="text-xs text-indigo-300 font-mono break-all">{accessToken}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl"
            >
              Logout
            </button>
          </div>
        )}

      </div>
    </div>
  );
}