import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, googleProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail, sendEmailVerification, fetchSignInMethodsForEmail } from '../firebase';
import { createUserProfile } from '../firebaseService';
import { 
  Sparkles, 
  BookOpen, 
  Loader2, 
  Mail, 
  Lock, 
  User, 
  ArrowRight, 
  Chrome, 
  ShieldCheck, 
  Zap, 
  Globe, 
  Database,
  Eye,
  EyeOff,
  CheckCircle2,
  Users
} from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isVerificationSent, setIsVerificationSent] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [configError, setConfigError] = useState(null);

  const [isRefreshing, setIsRefreshing] = useState(false);

  React.useEffect(() => {
    // Check if there is an unverified user on mount
    const user = auth.currentUser;
    if (user && !user.emailVerified && user.providerData.some(p => p.providerId === 'password')) {
      console.log('Login: Found unverified user on mount:', user.uid);
      setUnverifiedUser(user);
      setIsVerificationSent(true);
      setEmail(user.email || '');
    }
  }, []);

  const handleCheckVerification = async () => {
    const user = unverifiedUser || auth.currentUser;
    if (!user) return;

    setIsRefreshing(true);
    try {
      await user.reload();
      if (user.emailVerified) {
        toast.success('Email verified! Please log in with your credentials.');
        
        // Remove the pending verification flag
        localStorage.removeItem(`pending_verification_${user.uid}`);
        
        // Sign out the user to force a fresh login as requested
        await signOut(auth);
        
        // Reset local state to show the login form
        setIsVerificationSent(false);
        setUnverifiedUser(null);
        setIsRegister(false);
        setEmail(user.email || '');
        setPassword('');
      } else {
        toast.info('Email not verified yet. Please check your inbox.');
      }
    } catch (error) {
      console.error('Refresh error:', error);
      toast.error('Failed to check status. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResendVerification = async () => {
    const user = unverifiedUser || auth.currentUser;
    if (!user) {
      toast.error('Session expired. Please try logging in again.');
      setIsVerificationSent(false);
      setUnverifiedUser(null);
      return;
    }

    setResendLoading(true);
    try {
      const actionCodeSettings = {
        url: window.location.origin,
        handleCodeInApp: false,
      };
      await sendEmailVerification(user, actionCodeSettings);
      toast.success('Verification email resent!');
      startResendTimer();
    } catch (error) {
      console.error('Resend error:', error);
      if (error.code === 'auth/too-many-requests') {
        toast.error('Too many requests. Please wait a moment.');
      } else {
        toast.error('Failed to resend email. Please try again.');
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      console.log('Login: Starting Google login...', { 
        auth: !!auth, 
        authType: typeof auth,
        provider: !!googleProvider,
        providerType: typeof googleProvider
      });
      
      if (!auth || !googleProvider) {
        throw new Error('Firebase Auth or Google Provider not initialized. Please refresh the page.');
      }

      const result = await signInWithPopup(auth, googleProvider);
      // Create user profile in Firestore
      await createUserProfile(result.user);
      toast.success('Successfully logged in!');
    } catch (error) {
      // Gracefully handle user-initiated popup closing
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        console.log('Login: User closed the popup.');
        return; // Don't show an error toast or console.error for intentional user action
      }

      console.error('Login error:', error);
      let message = 'Failed to login. Please try again.';
      if (error.code === 'auth/operation-not-allowed') {
        message = 'Google Sign-In is not enabled. Please enable it in the Firebase Console.';
        setConfigError('google');
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        message = 'One user per email id. This email is already registered with a different method (e.g., password).';
      } else if (error.code === 'auth/network-request-failed') {
        message = 'Network error. This often happens due to ad-blockers, restricted networks, or if you are in a sandboxed environment. Please try disabling ad-blockers or using a different network.';
      } else if (error.code === 'auth/unauthorized-domain') {
        message = 'This domain is not authorized for Firebase Auth. Please add it in the Firebase Console.';
      }
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success('Password reset email sent!', {
        description: 'Please check your inbox and spam folder for the recovery link.',
        duration: 8000,
      });
      setIsForgotPassword(false);
    } catch (error) {
      console.error('Reset error:', error);
      let message = 'Failed to send reset email. Please try again.';
      
      switch (error.code) {
        case 'auth/user-not-found':
          message = 'No account found with this email address.';
          break;
        case 'auth/invalid-email':
          message = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
          message = 'Too many requests. Please wait a moment before trying again.';
          break;
        default:
          message = error.message || 'An unexpected error occurred.';
      }
      
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || (!isForgotPassword && !password) || (isRegister && !name)) {
      toast.error('Please fill in all fields');
      return;
    }

    if (isRegister && password.length < 6) {
      toast.error('Password too short', {
        description: 'Password should be at least 6 characters.'
      });
      return;
    }

    setIsLoading(true);

    try {
      let methods = [];
      try {
        methods = await fetchSignInMethodsForEmail(auth, trimmedEmail);
      } catch (err) {
        console.warn('fetchSignInMethodsForEmail failed:', err);
      }

      const accountExists = methods.length > 0;

      // =========================
      // ✅ REGISTER FLOW
      // =========================
      if (isRegister) {
        if (accountExists) {
          toast.error('Account already exists, please login.');
          setIsRegister(false); // ✅ redirect to login
          setIsLoading(false);
          return;
        }

        try {
          const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);

          await updateProfile(userCredential.user, { displayName: name });

          await createUserProfile(userCredential.user, name);

          const actionCodeSettings = {
            url: window.location.origin,
            handleCodeInApp: false,
          };

          await sendEmailVerification(userCredential.user, actionCodeSettings);

          localStorage.setItem(`pending_verification_${userCredential.user.uid}`, 'true');

          setUnverifiedUser(userCredential.user);
          setIsVerificationSent(true);
          startResendTimer();

          toast.success('Account created! Please verify your email.');
        } catch (error) {
          if (error.code === 'auth/email-already-in-use') {
            toast.error('Account already exists, please login.');
            setIsRegister(false);
          } else {
            throw error;
          }
        }
      }

      // =========================
      // ✅ LOGIN FLOW
      // =========================
      else {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);

          if (!userCredential.user.emailVerified) {
            localStorage.setItem(`pending_verification_${userCredential.user.uid}`, 'true');

            setUnverifiedUser(userCredential.user);
            setIsVerificationSent(true);
            startResendTimer();

            toast.error('Please verify your email.', {
              description: 'Check your inbox.',
              action: {
                label: 'Resend',
                onClick: () => handleResendVerification(),
              }
            });

            setIsLoading(false);
            return;
          }

          toast.success('Logged in successfully!');
        } catch (error) {
          console.log('Login error code:', error.code);

          // ❌ USER NOT FOUND → REGISTER
          if (error.code === 'auth/user-not-found') {
            toast.error('No account found, please register.');
            setIsRegister(true); // ✅ FIX
            return;
          }

          // ❌ WRONG PASSWORD
          else if (error.code === 'auth/wrong-password') {
            toast.error("Wrong password. You can use 'Forgot Password?' option.", {
              duration: 5000,
              action: {
                label: 'Forgot Password?',
                onClick: () => {
                  setIsForgotPassword(true);
                  setIsRegister(false);
                },
              },
            });

            return; // ✅ stay on login
          }

          // ⚠️ IMPORTANT CASE (FIREBASE)
          else if (error.code === 'auth/invalid-credential') {
            if (accountExists) {
              // ✅ EMAIL EXISTS → WRONG PASSWORD
              toast.error("Wrong password. You can use 'Forgot Password?' option.", {
                duration: 5000,
                action: {
                  label: 'Forgot Password?',
                  onClick: () => {
                    setIsForgotPassword(true);
                    setIsRegister(false);
                  },
                },
              });

              return; // ✅ stay on login
            } else {
              // ❌ EMAIL DOES NOT EXIST
              toast.error('No account found, please register.');
              setIsRegister(true);
              return;
            }
          }

          else if (error.code === 'auth/invalid-email') {
            toast.error('Invalid email address.');
            return;
          }

          else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('Auth error:', error);

      let message = 'Authentication failed';

      if (error.code === 'auth/operation-not-allowed') {
        message = 'Enable Email/Password in Firebase Console.';
        setConfigError('email');
      } else if (error.code === 'auth/network-request-failed') {
        message = 'Network error. Check connection.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Try later.';
      } else {
        message = error.message || 'Unexpected error';
      }

      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      {/* Left Side: Product Showcase */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-[#F8F9FB] items-center justify-center p-8 overflow-hidden border-r border-zinc-100">
        {/* Subtle Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-100/40 rounded-full blur-[120px] animate-pulse-subtle" />
          <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-violet-100/40 rounded-full blur-[120px] animate-pulse-subtle" style={{ animationDelay: '2s' }} />
        </div>

        <div className="relative z-10 w-full max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-6"
          >
            <div className="h-7 w-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200">
              <BookOpen size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight text-zinc-900">AI Doubt Solver</span>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <h1 className="text-4xl font-bold text-zinc-900 tracking-tight leading-tight mb-4">
              Start learning smarter
            </h1>
            <p className="text-base text-zinc-500 font-medium leading-relaxed max-w-sm">
              Upload PDFs or notes and get instant, context-aware answers. Ask anything from your study materials instantly.
            </p>
          </motion.div>

          {/* Mock UI Preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative mb-10 max-w-md group"
          >
            <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-zinc-200/60 overflow-hidden aspect-[16/10] flex flex-col transform transition-transform duration-500 group-hover:scale-[1.01]">
              <div className="h-10 border-b border-zinc-100 bg-zinc-50/50 flex items-center px-4 gap-1.5">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-400/40" />
                  <div className="w-2 h-2 rounded-full bg-yellow-400/40" />
                  <div className="w-2 h-2 rounded-full bg-green-400/40" />
                </div>
              </div>
              <div className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 animate-pulse">
                    <Sparkles size={14} className="text-indigo-600" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="h-2.5 bg-zinc-100 rounded-full w-[85%]" />
                    <div className="h-2.5 bg-zinc-100 rounded-full w-[60%]" />
                  </div>
                </div>
                <div className="flex gap-3 flex-row-reverse">
                  <div className="w-7 h-7 rounded-lg bg-zinc-50 flex items-center justify-center flex-shrink-0">
                    <User size={14} className="text-zinc-400" />
                  </div>
                  <div className="space-y-2 flex-1 flex flex-col items-end">
                    <div className="h-10 bg-indigo-50 rounded-xl border border-indigo-100 p-3 flex items-center w-full max-w-[80%]">
                      <span className="text-[10px] text-indigo-600/70 font-medium">Explain the concept of...</span>
                      <span className="w-0.5 h-3.5 bg-indigo-400 ml-1 animate-blink" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={14} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100/50">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
                      <span className="text-[9px] text-indigo-600 uppercase tracking-widest font-bold ml-1">AI is thinking...</span>
                    </div>
                    <div className="space-y-2">
                      <div className="h-2 bg-indigo-200/40 rounded-full w-full" />
                      <div className="h-2 bg-indigo-200/40 rounded-full w-4/5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Floating Elements */}
            <div className="absolute -right-4 top-1/4 bg-white p-3 rounded-xl shadow-xl border border-zinc-100 flex items-center gap-2 animate-bounce-slow">
              <div className="h-8 w-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                <Zap size={16} />
              </div>
              <div className="text-[10px] font-bold text-zinc-900">Deep Analysis...</div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { title: 'PDF Intelligence', desc: 'Ask questions from your PDFs instantly', icon: Zap, color: 'text-amber-500' },
              { title: 'Multi-Format', desc: 'Works with notes, PDFs & docs', icon: Globe, color: 'text-indigo-500' },
              { title: 'Deep Context', desc: 'Understands context, not just keywords', icon: Database, color: 'text-emerald-500' },
              { title: 'Privacy First', desc: 'Your data stays private', icon: ShieldCheck, color: 'text-rose-500' }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + (i * 0.1) }}
                className="flex gap-3.5 group"
              >
                <div className={`flex-shrink-0 h-10 w-10 rounded-xl bg-white border border-zinc-100 flex items-center justify-center ${feature.color} shadow-sm group-hover:scale-110 transition-transform`}>
                  <feature.icon size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 mb-1 tracking-wide">{feature.title}</h4>
                  <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side: Auth Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 bg-white">
        <div className="w-full max-w-[340px]">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="h-7 w-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200">
              <BookOpen size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight text-zinc-900">AI Doubt Solver</span>
          </div>

          <div className="mb-6 text-center lg:text-left">
            <AnimatePresence mode="wait">
              {configError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-left"
                >
                  <div className="flex gap-2">
                    <Zap size={12} className="text-amber-600 mt-0.5" />
                    <div>
                      <h4 className="text-[9px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Setup Required</h4>
                      <p className="text-[9px] text-amber-700 font-medium leading-tight mb-1.5">
                        Enable {configError === 'google' ? 'Google' : 'Email'} Auth in Firebase.
                      </p>
                      <a 
                        href={`https://console.firebase.google.com/project/${auth.app.options.projectId}/authentication/providers`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[8px] font-bold text-amber-900 uppercase tracking-widest hover:underline"
                      >
                        Open Console <ArrowRight size={8} />
                      </a>
                    </div>
                  </div>
                </motion.div>
              )}

              {isVerificationSent ? (
                <motion.div
                  key="verification"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center space-y-3"
                >
                  <div className="h-10 w-10 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Mail size={20} className="text-emerald-500" />
                  </div>
                  <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Check email</h2>
                  <p className="text-zinc-500 font-medium text-[11px] leading-relaxed">
                    Sent to <span className="text-indigo-600 font-bold">{email}</span>.
                  </p>
                  
                  <div className="space-y-2">
                    <button
                      disabled={isRefreshing}
                      onClick={handleCheckVerification}
                      className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-[11px] shadow-md shadow-emerald-200/40 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                    >
                      {isRefreshing ? <Loader2 size={12} className="animate-spin" /> : 'Verified My Email'}
                    </button>

                    <button
                      disabled={resendLoading || resendTimer > 0}
                      onClick={handleResendVerification}
                      className="w-full py-2.5 bg-white border border-zinc-200 text-zinc-600 rounded-lg font-bold text-[11px] hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {resendLoading ? <Loader2 size={12} className="animate-spin" /> : resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Verification Email'}
                    </button>

                    <button
                      onClick={async () => {
                        await signOut(auth);
                        setIsVerificationSent(false);
                        setIsRegister(false);
                        setUnverifiedUser(null);
                      }}
                      className="w-full py-2.5 bg-zinc-100 text-zinc-900 rounded-lg font-bold text-[11px] hover:bg-zinc-200 transition-all"
                    >
                      Back to Login
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={isForgotPassword ? 'forgot' : isRegister ? 'reg' : 'login'}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    {!isForgotPassword && (
                      <div className="flex p-1 bg-zinc-100 rounded-xl w-fit">
                        <button
                          onClick={() => setIsRegister(false)}
                          className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                            !isRegister 
                              ? 'bg-white text-indigo-600 shadow-sm' 
                              : 'text-zinc-400 hover:text-zinc-600'
                          }`}
                        >
                          Login
                        </button>
                        <button
                          onClick={() => setIsRegister(true)}
                          className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                            isRegister 
                              ? 'bg-white text-indigo-600 shadow-sm' 
                              : 'text-zinc-400 hover:text-zinc-600'
                          }`}
                        >
                          Register
                        </button>
                      </div>
                    )}
                  </div>

                  <h2 className="text-3xl font-bold text-zinc-900 tracking-tight mb-2">
                    {isForgotPassword ? 'Reset password' : isRegister ? 'Create account' : 'Welcome back'}
                  </h2>
                  <p className="text-zinc-500 font-medium text-sm leading-relaxed">
                    {isForgotPassword 
                      ? 'Enter email for recovery link.' 
                      : isRegister 
                        ? 'Join thousands of students mastering their studies.' 
                        : 'Sign in to continue your learning journey.'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!isVerificationSent && (
            <div className="space-y-5">
              {/* Primary Action: Google Login */}
              {!isForgotPassword && (
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.15)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2.5 py-4 bg-white border-2 border-zinc-100 text-zinc-700 rounded-2xl text-sm font-bold transition-all shadow-sm hover:border-indigo-100 hover:bg-indigo-50/30 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <svg aria-hidden="true" className="w-[18px] h-[18px] relative z-10" viewBox="0 0 18 18">
                    <path
                      fill="#4285F4"
                      d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.71-1.58 2.69-3.9 2.69-6.62z"
                    />
                    <path
                      fill="#34A853"
                      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.83.85-3.05.85-2.34 0-4.32-1.58-5.03-3.71H.95v2.35A9 9 0 0 0 9 18z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M3.97 10.71c-.18-.54-.28-1.12-.28-1.71s.1-1.17.28-1.71V4.94H.95A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.95 4.06l3.02-2.35z"
                    />
                    <path
                      fill="#EA4335"
                      d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A8.96 8.96 0 0 0 9 0A9 9 0 0 0 .95 4.94l3.02 2.35C4.68 5.15 6.66 3.58 9 3.58z"
                    />
                  </svg>
                  <span className="relative z-10">Continue with Google (Recommended)</span>
                </motion.button>
              )}

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-100"></div>
                </div>
                <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-[0.2em]">
                  <span className="bg-white px-4 text-zinc-400">or use email</span>
                </div>
              </div>

              <form onSubmit={isForgotPassword ? handleForgotPassword : handleEmailAuth} className="space-y-6">
                {isForgotPassword && (
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(false)}
                    className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 hover:text-indigo-600 transition-colors uppercase tracking-wider mb-2"
                  >
                    <ArrowRight size={14} className="rotate-180" />
                    Back to login
                  </button>
                )}
                <AnimatePresence mode="wait">
                  {isRegister && !isForgotPassword && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: -10 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-1.5"
                    >
                      <label className="text-[10px] font-bold text-zinc-500 ml-1 uppercase tracking-wider">Full Name</label>
                      <div className="relative group">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                        <input
                          type="text"
                          placeholder="Jane Doe"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full pl-11 pr-4 py-3.5 bg-zinc-50/50 border-2 border-zinc-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 focus:bg-white transition-all placeholder:text-zinc-300"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 ml-1 uppercase tracking-wider">Email Address</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                    <input
                      type="email"
                      placeholder="name@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-zinc-50/50 border-2 border-zinc-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 focus:bg-white transition-all placeholder:text-zinc-300"
                    />
                  </div>
                </div>

                {!isForgotPassword && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Password</label>
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-11 pr-24 py-3.5 bg-zinc-50/50 border-2 border-zinc-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 focus:bg-white transition-all placeholder:text-zinc-300"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
                          title={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        {!isRegister && (
                          <button
                            type="button"
                            onClick={() => setIsForgotPassword(true)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors uppercase tracking-wider pr-2"
                          >
                            Forgot?
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold text-sm hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-xl shadow-zinc-200"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : (
                    <>
                      <span>{isForgotPassword ? 'Send Reset Link' : isRegister ? 'Create Account' : 'Sign In'}</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </motion.button>
              </form>

              <p className="text-center text-[10px] font-medium text-zinc-500">
                {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => setIsRegister(!isRegister)}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  {isRegister ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-[8px] font-bold text-zinc-400 uppercase tracking-widest">
                <ShieldCheck size={10} className="text-emerald-500" />
                Secure
              </div>
              <div className="h-0.5 w-0.5 bg-zinc-200 rounded-full" />
              <div className="flex items-center gap-1 text-[8px] font-bold text-zinc-400 uppercase tracking-widest">
                <Users size={10} className="text-indigo-400" />
                Students
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


