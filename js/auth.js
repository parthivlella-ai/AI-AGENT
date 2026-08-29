/**
 * auth.js - Client-Side Authentication Controller
 * Manages user sessions, registration, login, logout, and validation.
 */

window.AppAuth = {
  currentUser: null,
  isAuthenticated: false,
  isInitialized: false,
  authListeners: [],

  // Subscribe to auth state updates
  subscribe(callback) {
    this.authListeners.push(callback);
  },

  // Notify listeners
  notify() {
    this.authListeners.forEach(cb => cb(this.currentUser, this.isAuthenticated));
  },

  // Email format validator
  validateEmail(email) {
    if (!email || typeof email !== "string") return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim());
  },

  // Password validation (8+ chars, letters + numbers or symbols)
  validatePassword(password) {
    if (!password || typeof password !== "string") return { valid: false, message: "Password is required." };
    if (password.length < 8) return { valid: false, message: "Password must be at least 8 characters long." };
    
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
    
    if (!hasLetter || !hasNumberOrSpecial) {
      return { valid: false, message: "Password must combine letters with numbers or symbols." };
    }
    return { valid: true };
  },

  // Name validation
  validateName(name) {
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return { valid: false, message: "Please enter your full name (at least 2 characters)." };
    }
    return { valid: true };
  },

  // Check active session on initial load
  async checkSession() {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { "Accept": "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          this.currentUser = data.user;
          this.isAuthenticated = true;
        } else {
          this.currentUser = null;
          this.isAuthenticated = false;
        }
      } else {
        this.currentUser = null;
        this.isAuthenticated = false;
      }
    } catch (e) {
      console.warn("Auth check failed (network or offline)", e);
      this.currentUser = null;
      this.isAuthenticated = false;
    } finally {
      this.isInitialized = true;
      this.notify();
      return this.isAuthenticated;
    }
  },

  // Sign in user
  async login(email, password) {
    try {
      const cleanEmail = (email || "").trim().toLowerCase();
      if (!cleanEmail || !password) {
        return { success: false, error: "Please enter both email and password." };
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password })
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Email or password is incorrect." };
      }

      this.currentUser = data.user;
      this.isAuthenticated = true;
      this.notify();
      return { success: true, user: data.user };
    } catch (e) {
      console.error("Login request error", e);
      return { success: false, error: "Connection problem. Please check your internet connection and try again." };
    }
  },

  // Register new user account
  async register(name, email, password, confirmPassword) {
    try {
      // Client-side validations
      const nameVal = this.validateName(name);
      if (!nameVal.valid) return { success: false, error: nameVal.message };

      if (!this.validateEmail(email)) {
        return { success: false, error: "Please enter a valid email address." };
      }

      const passVal = this.validatePassword(password);
      if (!passVal.valid) return { success: false, error: passVal.message };

      if (password !== confirmPassword) {
        return { success: false, error: "Passwords do not match." };
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          confirmPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Failed to create account. Please try again." };
      }

      this.currentUser = data.user;
      this.isAuthenticated = true;
      this.notify();
      return { success: true, user: data.user, isNewUser: true };
    } catch (e) {
      console.error("Register request error", e);
      return { success: false, error: "Connection problem. Please check your internet connection and try again." };
    }
  },

  // Logout current user
  async logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.warn("Logout error", e);
    } finally {
      this.currentUser = null;
      this.isAuthenticated = false;
      // Wipe state memory
      if (window.AppState) {
        window.AppState.clearLocalMemory();
      }
      this.notify();
    }
  },

  // Delete current user account and data
  async deleteAccount() {
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Failed to delete account." };
      }

      this.currentUser = null;
      this.isAuthenticated = false;
      if (window.AppState) {
        window.AppState.clearLocalMemory();
      }
      this.notify();
      return { success: true };
    } catch (e) {
      console.error("Delete account error", e);
      return { success: false, error: "Connection problem. Unable to delete account." };
    }
  }
};
