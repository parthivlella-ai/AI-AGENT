/**
 * auth.js - Enhanced Authentication & User Profile Client Controller
 * Manages user sessions, registration with username, login with identifier,
 * password strength scoring, profile updates, and audit trail data.
 */

window.AppAuth = {
  currentUser: null,
  isAuthenticated: false,
  isInitialized: false,
  authListeners: [],
  userProfile: null,
  activityLogs: [],
  notifications: [],

  // Subscribe to auth state updates
  subscribe(callback) {
    this.authListeners.push(callback);
  },

  // Notify listeners
  notify() {
    this.authListeners.forEach(cb => {
      try {
        cb(this.currentUser, this.isAuthenticated);
      } catch (e) {
        console.error("Auth listener callback error:", e);
      }
    });
  },

  // Email format validator
  validateEmail(email) {
    if (!email || typeof email !== "string") return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim());
  },

  // Username validator
  validateUsername(username) {
    if (!username || typeof username !== "string") {
      return { valid: false, message: "Username is required." };
    }
    const clean = username.trim().toLowerCase();
    if (clean.length < 3 || clean.length > 25) {
      return { valid: false, message: "Username must be between 3 and 25 characters." };
    }
    if (!/^[a-z0-9_]+$/.test(clean)) {
      return { valid: false, message: "Username can only contain letters, numbers, and underscores." };
    }
    return { valid: true, username: clean };
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

  // Comprehensive Password Strength Calculator
  calculatePasswordStrength(password) {
    if (!password) {
      return { score: 0, label: "Empty", color: "var(--text-muted)", percent: 0, tips: ["Enter at least 8 characters"] };
    }

    let score = 0;
    const tips = [];

    if (password.length >= 8) score += 1;
    else tips.push("At least 8 characters");

    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    else tips.push("Uppercase & lowercase letters");

    if (/[0-9]/.test(password)) score += 1;
    else tips.push("At least one number");

    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    else tips.push("At least one special symbol (!@#$%)");

    if (password.length >= 14 && score === 4) score = 5;

    const strengthMap = [
      { score: 0, label: "Very Weak", color: "var(--danger)", percent: 15 },
      { score: 1, label: "Weak", color: "var(--danger)", percent: 28 },
      { score: 2, label: "Fair", color: "var(--warning)", percent: 55 },
      { score: 3, label: "Good", color: "var(--cyan)", percent: 78 },
      { score: 4, label: "Strong", color: "var(--success)", percent: 92 },
      { score: 5, label: "Fortified", color: "var(--accent)", percent: 100 }
    ];

    const current = strengthMap[Math.min(score, 5)];
    return {
      score,
      label: current.label,
      color: current.color,
      percent: current.percent,
      tips
    };
  },

  // Name validation
  validateName(name) {
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return { valid: false, message: "Please enter your full name (at least 2 characters)." };
    }
    return { valid: true };
  },

  // Pre-seeded vault accounts to ensure immediate availability
  getDefaultSeedAccounts() {
    return [
      {
        id: "usr_492ff79cad14b596",
        name: "PARTHIV",
        username: "klm_89",
        email: "parthivreddylella@gmail.com",
        currency: "₹",
        monthly_income: 0,
        phone: "",
        bio: "",
        avatar: "",
        created_at: "2026-09-23T14:09:19.863Z"
      },
      {
        id: "usr_e0d5eb602ae6f4f5",
        name: "PARTHIV",
        username: "parthiv",
        email: "parthivlella@gmail.com",
        currency: "₹",
        monthly_income: 0,
        phone: "",
        bio: "",
        avatar: "",
        created_at: "2026-08-29T01:44:16.702Z"
      }
    ];
  },

  // Retrieve persistent accounts vault from localStorage
  getAccountsVault() {
    try {
      const raw = localStorage.getItem("wdmmg_accounts_vault");
      let list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list) || list.length === 0) {
        list = this.getDefaultSeedAccounts();
        localStorage.setItem("wdmmg_accounts_vault", JSON.stringify(list));
      }
      return list;
    } catch (e) {
      return this.getDefaultSeedAccounts();
    }
  },

  // Save account to persistent local vault
  saveToAccountsVault(user, password = null) {
    if (!user || (!user.email && !user.name)) return;
    try {
      const vault = this.getAccountsVault();
      const cleanEmail = (user.email || "").trim().toLowerCase();
      const cleanUsername = (user.username || "").trim().toLowerCase();
      const cleanName = (user.name || "").trim().toLowerCase();

      const existingIdx = vault.findIndex(u => 
        (cleanEmail && u.email && u.email.trim().toLowerCase() === cleanEmail) ||
        (cleanUsername && u.username && u.username.trim().toLowerCase() === cleanUsername) ||
        (u.id && user.id && u.id === user.id)
      );

      const entry = {
        ...user,
        password: password || (existingIdx >= 0 ? vault[existingIdx].password : null),
        updatedAt: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        vault[existingIdx] = { ...vault[existingIdx], ...entry };
      } else {
        vault.push(entry);
      }
      localStorage.setItem("wdmmg_accounts_vault", JSON.stringify(vault));
      localStorage.setItem("wdmmg_active_user", JSON.stringify(entry));

      // Sync vault to server in background
      this.syncVaultToServer(vault);
    } catch (e) {
      console.warn("Could not save to accounts vault", e);
    }
  },

  // Find account in vault by username, email, or full name
  findInVault(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();
    const vault = this.getAccountsVault();
    return vault.find(u => 
      (u.email && u.email.trim().toLowerCase() === clean) ||
      (u.username && u.username.trim().toLowerCase() === clean) ||
      (u.name && u.name.trim().toLowerCase() === clean)
    ) || null;
  },

  // Background sync vault accounts to server
  async syncVaultToServer(vaultList) {
    try {
      await fetch("/api/auth/sync-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: vaultList })
      });
    } catch (e) {
      // Offline or network error - ignore silently
    }
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
          this.saveToAccountsVault(data.user);
          this.fetchUserProfile();
          this.fetchNotifications();
          this.isInitialized = true;
          this.notify();
          return true;
        }
      }
    } catch (e) {
      console.warn("Backend auth check offline or network issue", e);
    }

    // Fallback to active user session in localStorage
    try {
      const activeRaw = localStorage.getItem("wdmmg_active_user");
      if (activeRaw) {
        const localUser = JSON.parse(activeRaw);
        if (localUser && (localUser.id || localUser.email)) {
          this.currentUser = localUser;
          this.isAuthenticated = true;
          this.isInitialized = true;
          this.notify();
          return true;
        }
      }
    } catch (err) {}

    this.currentUser = null;
    this.isAuthenticated = false;
    this.isInitialized = true;
    this.notify();
    return false;
  },

  // Sign in user (Supports email, username, or full name + password)
  async login(identifier, password) {
    try {
      const cleanTarget = (identifier || "").trim();
      if (!cleanTarget || !password) {
        return { success: false, error: "Please enter your username/email/name and password." };
      }

      let backendUser = null;
      let backendError = null;

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: cleanTarget, password })
        });
        const data = await res.json();
        if (res.ok && data && data.user) {
          backendUser = data.user;
        } else if (data && data.error) {
          backendError = data.error;
        }
      } catch (netErr) {
        console.warn("Backend login network error, falling back to local vault:", netErr);
      }

      // If backend succeeded
      if (backendUser) {
        this.currentUser = backendUser;
        this.isAuthenticated = true;
        this.saveToAccountsVault(backendUser, password);
        this.notify();
        this.fetchUserProfile();
        this.fetchNotifications();
        return { success: true, user: backendUser };
      }

      // If backend says Account not found or backend was unreachable/serverless reset:
      // Search persistent local accounts vault!
      const vaultUser = this.findInVault(cleanTarget);
      if (vaultUser) {
        // If password is stored in vault, verify it
        if (!vaultUser.password || vaultUser.password === password) {
          this.currentUser = vaultUser;
          this.isAuthenticated = true;
          localStorage.setItem("wdmmg_active_user", JSON.stringify(vaultUser));
          this.notify();

          // Silently re-register account on server in background
          fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: vaultUser.name,
              email: vaultUser.email,
              username: vaultUser.username,
              password: password,
              confirmPassword: password,
              currency: vaultUser.currency || "₹",
              monthlyIncome: vaultUser.monthly_income || 0
            })
          }).catch(() => {});

          return { success: true, user: vaultUser };
        } else {
          return { success: false, error: "Incorrect password. Please try again." };
        }
      }

      return {
        success: false,
        error: backendError || "Account not found. Please check your username, email, or name."
      };
    } catch (e) {
      console.error("Login request error", e);
      return { success: false, error: "Connection problem. Please try again." };
    }
  },

  // Register new user account (Stores full details permanently in vault & backend)
  async register(name, email, password, confirmPassword, username, currency, monthlyIncome) {
    try {
      // Client-side validations
      const nameVal = this.validateName(name);
      if (!nameVal.valid) return { success: false, error: nameVal.message };

      if (!this.validateEmail(email)) {
        return { success: false, error: "Please enter a valid email address." };
      }

      if (username) {
        const userVal = this.validateUsername(username);
        if (!userVal.valid) return { success: false, error: userVal.message };
      }

      const passVal = this.validatePassword(password);
      if (!passVal.valid) return { success: false, error: passVal.message };

      if (password !== confirmPassword) {
        return { success: false, error: "Passwords do not match." };
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanUsername = username ? username.trim().toLowerCase() : cleanEmail.split('@')[0].replace(/[^a-z0-9_]/g, '');
      const incomeVal = monthlyIncome ? parseFloat(monthlyIncome) || 0 : 0;
      const currVal = currency || "₹";

      // 1. Instantly construct full local user record
      const localUser = {
        id: "usr_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now().toString(36),
        name: name.trim(),
        username: cleanUsername,
        email: cleanEmail,
        currency: currVal,
        monthly_income: incomeVal,
        phone: "",
        bio: "",
        avatar: "",
        created_at: new Date().toISOString()
      };

      // 2. Save all details permanently to accounts vault immediately
      this.saveToAccountsVault(localUser, password);

      // 3. Sync to backend API
      let serverUser = null;
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: cleanEmail,
            username: cleanUsername,
            password,
            confirmPassword,
            currency: currVal,
            monthlyIncome: incomeVal
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.user) {
            serverUser = data.user;
            this.saveToAccountsVault(serverUser, password);
          }
        }
      } catch (netErr) {
        console.warn("Backend register network error, using local vault:", netErr);
      }

      const finalUser = serverUser || localUser;
      this.currentUser = finalUser;
      this.isAuthenticated = true;
      localStorage.setItem("wdmmg_active_user", JSON.stringify(finalUser));
      this.notify();
      this.fetchUserProfile();
      this.fetchNotifications();
      return { success: true, user: finalUser, isNewUser: true };
    } catch (e) {
      console.error("Register request error", e);
      return { success: false, error: "Failed to create account. Please try again." };
    }
  },

  // Reset user password (by username, email, or full name)
  async resetPassword(identifier, newPassword, confirmPassword) {
    try {
      const cleanTarget = (identifier || "").trim();
      if (!cleanTarget) {
        return { success: false, error: "Please enter your username, email, or name." };
      }
      const passVal = this.validatePassword(newPassword);
      if (!passVal.valid) return { success: false, error: passVal.message };
      if (newPassword !== confirmPassword) {
        return { success: false, error: "Passwords do not match." };
      }

      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: cleanTarget, newPassword, confirmPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Failed to reset password." };
      }
      return { success: true, message: data.message, identifier: data.identifier };
    } catch (e) {
      console.error("Reset password request error", e);
      return { success: false, error: "Connection error. Please try again." };
    }
  },

  // Fetch complete user profile & account stats
  async fetchUserProfile() {
    if (!this.isAuthenticated) return null;
    try {
      const res = await fetch("/api/user/profile");
      if (res.ok) {
        const data = await res.json();
        this.userProfile = data;
        if (data.user) {
          this.currentUser = { ...this.currentUser, ...data.user };
        }
        return data;
      }
    } catch (e) {
      console.warn("Could not fetch user profile", e);
    }
    return null;
  },

  // Update profile details
  async updateProfile(profileData) {
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData)
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Failed to update profile." };
      }
      this.currentUser = { ...this.currentUser, ...data.user };
      await this.fetchUserProfile();
      this.notify();
      return { success: true, user: data.user };
    } catch (e) {
      console.error("Update profile error", e);
      return { success: false, error: "Network error updating profile." };
    }
  },

  // Fetch Complete Activity Audit Trail (Stored From Start to End)
  async fetchActivityLogs(limit = 40) {
    if (!this.isAuthenticated) return [];
    try {
      const res = await fetch(`/api/user/activity?limit=${limit}`);
      if (res.ok) {
        const logs = await res.json();
        this.activityLogs = logs;
        return logs;
      }
    } catch (e) {
      console.warn("Could not fetch activity trail", e);
    }
    return [];
  },

  // Fetch Notifications
  async fetchNotifications() {
    if (!this.isAuthenticated) return [];
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const notifs = await res.json();
        this.notifications = notifs;
        return notifs;
      }
    } catch (e) {
      console.warn("Could not fetch notifications", e);
    }
    return [];
  },

  // Mark notification read
  async markNotificationRead(id) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
      if (this.notifications) {
        const target = this.notifications.find(n => n.id === id);
        if (target) target.is_read = 1;
      }
    } catch (e) {
      console.warn("Could not mark notification read", e);
    }
  },

  // Mark all notifications read
  async markAllNotificationsRead() {
    try {
      await fetch("/api/notifications/read-all", { method: "PUT" });
      if (this.notifications) {
        this.notifications.forEach(n => n.is_read = 1);
      }
    } catch (e) {
      console.warn("Could not mark all notifications read", e);
    }
  },

  // Full 1-Click Data Archive Export (Download JSON file)
  async exportUserData() {
    try {
      const res = await fetch("/api/user/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const username = (this.currentUser && this.currentUser.username) || "user";
      a.download = `wdmmg_data_${username}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      return { success: true };
    } catch (e) {
      console.error("Export error", e);
      return { success: false, error: "Failed to download data archive." };
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
      this.userProfile = null;
      this.activityLogs = [];
      this.notifications = [];
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
      this.userProfile = null;
      this.activityLogs = [];
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
