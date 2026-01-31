import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import { auth, db } from './lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, type User, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { initializeUser } from './services/api';

// Helper to generate random string
const generateCaptcha = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, 1, O, 0 for clarity
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  // Captcha State
  const [captchaChallenge, setCaptchaChallenge] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [rememberMe, setRememberMe] = useState(true); // Default to checked

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Regenerate captcha on init and mode switch
  useEffect(() => {
    setCaptchaChallenge(generateCaptcha());
    setCaptchaAnswer('');
    setError('');
    // Clear inputs on switch
    if (!isRegistering) setConfirmPassword('');
  }, [isRegistering]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // --- SECURITY CHECKS ---

    // 1. Captcha Validation (Case Insensitive)
    if (captchaAnswer.toUpperCase() !== captchaChallenge) {
      setError('Incorrect security code. Please try again.');
      setCaptchaChallenge(generateCaptcha());
      setCaptchaAnswer('');
      return;
    }

    // 2. Registration Specific Checks
    if (isRegistering) {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
    }

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Create user in Realtime Database
        await set(ref(db, 'users/' + userCredential.user.uid), {
          email: email,
          createdAt: new Date().toISOString()
        });

        // Manual Init ensuring Backend Drive Folder is created
        await initializeUser();

        // Refresh to clear state
        window.location.reload();

      } else {
        // Set persistence based on Remember Me checkbox
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        // Refresh to clear state
        window.location.reload();
      }
    } catch (err: any) {
      // Improve Error Messages
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already in use.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak.');
      } else if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else {
        setError(err.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#050505]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (user) {
    return <Dashboard />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#050505] selection:bg-cyan-500/30">

      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-500/30 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob"></div>
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/30 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[50%] h-[50%] bg-blue-500/30 rounded-full mix-blend-multiply filter blur-[128px] opacity-50 animate-blob animation-delay-4000"></div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md p-8 glass-panel rounded-2xl animate-[fadeIn_0.5s_ease-out]">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">
            JNIS Data
          </h1>
          <p className="text-slate-400">
            {isRegistering ? 'Join the secure data network' : 'Welcome back to your workspace'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-4">

            {/* Email Field */}
            <div className="relative group">
              <input
                type="email"
                required
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-transparent focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all peer"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                id="email"
              />
              <label
                htmlFor="email"
                className="absolute left-4 -top-2.5 text-xs text-slate-500 bg-[#050505] px-1 transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-3 peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-cyan-400 peer-focus:bg-[#050505] peer-focus:px-1 pointer-events-none"
              >
                Email Address
              </label>
            </div>

            {/* Password Field */}
            <div className="relative group">
              <input
                type="password"
                required
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-transparent focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all peer"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                id="password"
              />
              <label
                htmlFor="password"
                className="absolute left-4 -top-2.5 text-xs text-slate-500 bg-[#050505] px-1 transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-3 peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-cyan-400 peer-focus:bg-[#050505] peer-focus:px-1 pointer-events-none"
              >
                Password
              </label>
            </div>

            {/* Confirm Password (Register Only) */}
            {isRegistering && (
              <div className="relative group animate-[fadeIn_0.2s_ease-out]">
                <input
                  type="password"
                  required
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-transparent focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all peer"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  id="confirmPassword"
                />
                <label
                  htmlFor="confirmPassword"
                  className="absolute left-4 -top-2.5 text-xs text-slate-500 bg-[#050505] px-1 transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-3 peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-cyan-400 peer-focus:bg-[#050505] peer-focus:px-1 pointer-events-none"
                >
                  Confirm Password
                </label>
              </div>
            )}

            {/* Security Check */}
            <div className="bg-black/30 border border-white/5 rounded-xl p-4 animate-[fadeIn_0.2s_ease-out]">
              <div className="flex justify-between items-center mb-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Security Check</label>
                <button
                  type="button"
                  onClick={() => {
                    setCaptchaChallenge(generateCaptcha());
                    setCaptchaAnswer('');
                  }}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Refresh
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-center select-none" style={{ letterSpacing: '0.25em' }}>
                  <span className="font-mono text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
                    {captchaChallenge}
                  </span>
                </div>
                <input
                  type="text"
                  required
                  className="flex-1 w-24 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-center text-white placeholder-slate-700 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono text-lg uppercase"
                  placeholder="CODE"
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  maxLength={6}
                />
              </div>
            </div>

          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm text-center animate-[shake_0.5s_ease-in-out]">
              {error}
            </div>
          )}

          {/* Remember Me - Only for Login */}
          {!isRegistering && (
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer hover:text-slate-300 transition-colors">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded bg-black/20 border border-white/10 text-cyan-500 focus:ring-2 focus:ring-cyan-500/50 cursor-pointer"
              />
              Remember me
            </label>
          )}

          <button
            type="submit"
            className="w-full btn-primary py-3 text-lg font-semibold tracking-wide shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]"
          >
            {isRegistering ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-slate-400 text-sm">
            {isRegistering ? 'Already have an account?' : "Don't have an account?"}
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="ml-2 text-cyan-400 hover:text-cyan-300 font-medium transition-colors hover:underline"
            >
              {isRegistering ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
