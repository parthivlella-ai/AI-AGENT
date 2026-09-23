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
          // Preload profile & notifications in background
          this.fetchUserProfile();
          this.fetchNotifications();
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

  // Sign in user (Supports email OR username + password)
  async login(identifier, password) {
    try {
      const cleanTarget = (identifier || "").trim().toLowerCase();
      if (!cleanTarget || !password) {
        return { success: false, error: "Please enter your username/email and password." };
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: cleanTarget, password })
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Username, email, or password is incorrect." };
      }

      this.currentUser = data.user;
      this.isAuthenticated = true;
      this.notify();
      this.fetchUserProfile();
      this.fetchNotifications();
      return { success: true, user: data.user };
    } catch (e) {
      console.error("Login request error", e);
      return { success: false, error: "Connection problem. Please check your internet connection and try again." };
    }
  },

  // Register new user account (Stores full details from start)
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

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          username: username ? username.trim().toLowerCase() : undefined,
          password,
          confirmPassword,
          currency: currency || "₹",
          monthlyIncome: monthlyIncome ? parseFloat(monthlyIncome) : 0
        })
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Failed to create account. Please try again." };
      }

      this.currentUser = data.user;
      this.isAuthenticated = true;
      this.notify();
      this.fetchUserProfile();
      this.fetchNotifications();
      return { success: true, user: data.user, isNewUser: true };
    } catch (e) {
      console.error("Register request error", e);
      return { success: false, error: "Connection problem. Please check your internet connection and try again." };
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
