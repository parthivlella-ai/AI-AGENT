/**
 * state.js - Central State Management & Server Synchronization
 * Handles user-isolated data fetching, CRUD operations, profile synchronization,
 * complete user data trail, and reactive UI subscriptions.
 */

window.AppState = {
  transactions: [],
  savingGoals: {
    target: 2500,
    habits: []
  },
  settings: {
    userName: "User",
    username: "",
    email: "",
    currency: "₹",
    theme: "dark",
    apiKey: "",
    monthlyIncome: 0,
    monthlyBudget: 0
  },
  userProfile: null,
  activityLogs: [],
  notifications: [],
  chatHistory: [],
  listeners: [],
  isLoading: false,

  // Subscribe to state updates
  subscribe(callback) {
    this.listeners.push(callback);
  },

  // Broadcast state changes
  notify() {
    this.listeners.forEach(callback => {
      try {
        callback(this);
      } catch (e) {
        console.error("Error in state subscriber callback:", e);
      }
    });
  },

  // Clear state from memory (called upon logout)
  clearLocalMemory() {
    this.transactions = [];
    this.savingGoals = { target: 2500, habits: [] };
    this.settings = { userName: "User", username: "", email: "", currency: "₹", theme: "dark", apiKey: "", monthlyIncome: 0, monthlyBudget: 0 };
    this.userProfile = null;
    this.activityLogs = [];
    this.notifications = [];
    this.chatHistory = [];
    this.notify();
  },

  getUserId() {
    return (window.AppAuth && window.AppAuth.currentUser && window.AppAuth.currentUser.id) ? window.AppAuth.currentUser.id : "default_user";
  },

  // Save full state mirror in localStorage
  saveLocalMirror() {
    try {
      const uid = this.getUserId();
      localStorage.setItem("wdmmg_tx_" + uid, JSON.stringify(this.transactions));
      localStorage.setItem("wdmmg_goals_" + uid, JSON.stringify(this.savingGoals));
      localStorage.setItem("wdmmg_settings_" + uid, JSON.stringify(this.settings));
      localStorage.setItem("wdmmg_chat_" + uid, JSON.stringify(this.chatHistory));
    } catch (e) {}
  },

  // Fetch all user-isolated data from the backend with local fallback
  async loadUserData() {
    if (!window.AppAuth || !window.AppAuth.isAuthenticated) {
      this.clearLocalMemory();
      return;
    }

    const uid = this.getUserId();

    // 1. Immediately hydrate from local mirror so data is never lost or blank
    try {
      const rawTx = localStorage.getItem("wdmmg_tx_" + uid);
      if (rawTx) {
        this.transactions = JSON.parse(rawTx);
        this.sortTransactions();
      }
      const rawGoals = localStorage.getItem("wdmmg_goals_" + uid);
      if (rawGoals) {
        this.savingGoals = JSON.parse(rawGoals);
      }
      const rawSettings = localStorage.getItem("wdmmg_settings_" + uid);
      if (rawSettings) {
        this.settings = { ...this.settings, ...JSON.parse(rawSettings) };
      }
    } catch (err) {}

    this.isLoading = true;
    try {
      // Parallel fetch for current authenticated user
      const [txRes, goalsRes, settingsRes, chatRes, profRes, notifRes] = await Promise.all([
        fetch("/api/transactions"),
        fetch("/api/goals"),
        fetch("/api/settings"),
        fetch("/api/chat"),
        fetch("/api/user/profile"),
        fetch("/api/notifications")
      ]);

      if (txRes && txRes.ok) {
        const fetchedTx = await txRes.json();
        if (Array.isArray(fetchedTx) && fetchedTx.length > 0) {
          this.transactions = fetchedTx;
          this.sortTransactions();
        } else if (this.transactions.length > 0 && uid !== "guest_demo") {
          // If server database reset, sync our local transactions back to server!
          this.loadDemoTransactions(this.transactions).catch(() => {});
        }
      }

      if (goalsRes && goalsRes.ok) {
        const goalsData = await goalsRes.json();
        this.savingGoals = {
          target: goalsData.target || this.savingGoals.target || 2500,
          habits: Array.isArray(goalsData.habits) ? goalsData.habits : (this.savingGoals.habits || [])
        };
      }

      if (settingsRes && settingsRes.ok) {
        const settingsData = await settingsRes.json();
        this.settings = {
          ...this.settings,
          userName: settingsData.userName || (window.AppAuth.currentUser && window.AppAuth.currentUser.name) || this.settings.userName || "User",
          username: (window.AppAuth.currentUser && window.AppAuth.currentUser.username) || this.settings.username || "",
          email: settingsData.email || (window.AppAuth.currentUser && window.AppAuth.currentUser.email) || this.settings.email || "",
          currency: settingsData.currency || this.settings.currency || "₹",
          theme: settingsData.theme || this.settings.theme || "dark"
        };
        if (this.settings.theme === "light") {
          document.body.classList.remove("dark-mode");
        } else {
          document.body.classList.add("dark-mode");
        }
      }

      if (profRes && profRes.ok) {
        this.userProfile = await profRes.json();
        if (this.userProfile && this.userProfile.user) {
          this.settings.username = this.userProfile.user.username || this.settings.username;
          this.settings.monthlyIncome = this.userProfile.user.monthly_income || 0;
          if (this.userProfile.settings) {
            this.settings.monthlyBudget = this.userProfile.settings.monthly_budget || 0;
          }
        }
      }

      if (notifRes && notifRes.ok) {
        this.notifications = await notifRes.json();
      }

      if (chatRes && chatRes.ok) {
        const serverChat = await chatRes.json();
        if (Array.isArray(serverChat) && serverChat.length > 0) {
          this.chatHistory = serverChat;
        }
      }
    } catch (e) {
      console.warn("Backend load warning, running from local mirror:", e);
    } finally {
      this.saveLocalMirror();
      this.isLoading = false;
      this.notify();
    }
  },

  // Fetch Activity Logs (User trail from start to end)
  async loadActivityLogs(limit = 40) {
    try {
      const res = await fetch(`/api/user/activity?limit=${limit}`);
      if (res.ok) {
        this.activityLogs = await res.json();
        this.notify();
        return this.activityLogs;
      }
    } catch (e) {
      console.error("Error loading activity logs:", e);
    }
    return [];
  },

  // Update Profile details
  async updateProfile(profileData) {
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile.");
      }
      if (data.user) {
        this.settings.userName = data.user.name;
        this.settings.username = data.user.username;
        this.settings.monthlyIncome = data.user.monthly_income;
      }
      await this.loadUserData();
      await this.loadActivityLogs();
      return { success: true, user: data.user };
    } catch (e) {
      console.error("Profile update error:", e);
      throw e;
    }
  },

  // Clear all data for current user
  async clearAllData() {
    try {
      await fetch("/api/transactions/all/user", { method: "DELETE" });
      await fetch("/api/chat", { method: "DELETE" });
    } catch (e) {
      console.error("Error clearing user data on server", e);
    }
    this.transactions = [];
    this.savingGoals = { target: 2500, habits: [] };
    this.chatHistory = [];
    await this.loadActivityLogs();
    this.notify();
  },

  // CRUD: Add Transaction
  async addTransaction(tx) {
    const payload = {
      amount: parseFloat(tx.amount),
      date: tx.date,
      time: tx.time || "12:00",
      merchant: tx.merchant.trim(),
      category: tx.category || "Other",
      type: tx.type || "expense",
      payment_method: tx.payment_method || "UPI",
      notes: (tx.notes || "").trim()
    };

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const createdTx = await res.json();
        this.transactions.push(createdTx);
        this.sortTransactions();
        this.saveLocalMirror();
        this.loadActivityLogs();
        this.notify();
        return createdTx;
      }
    } catch (e) {
      console.warn("Backend add transaction error, falling back locally:", e);
    }

    // Local fallback creation to ensure user never loses data
    const localTx = {
      ...payload,
      id: "tx_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
      created_at: new Date().toISOString()
    };
    this.transactions.push(localTx);
    this.sortTransactions();
    this.saveLocalMirror();
    this.notify();
    return localTx;
  },

  // CRUD: Edit Transaction
  async editTransaction(id, updatedFields) {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      this.transactions[index] = {
        ...this.transactions[index],
        ...updatedFields,
        amount: parseFloat(updatedFields.amount || this.transactions[index].amount)
      };
      this.sortTransactions();
      this.saveLocalMirror();
      this.notify();
    }

    try {
      await fetch(`/api/transactions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields)
      });
      this.loadActivityLogs();
    } catch (e) {
      console.warn("Backend edit transaction notice:", e);
    }
    return true;
  },

  // CRUD: Delete Transaction
  async deleteTransaction(id) {
    this.transactions = this.transactions.filter(t => t.id !== id);
    this.saveLocalMirror();
    this.notify();

    try {
      await fetch(`/api/transactions/${id}`, {
        method: "DELETE"
      });
      this.loadActivityLogs();
    } catch (e) {
      console.warn("Backend delete transaction notice:", e);
    }
    return true;
  },

  // Bulk Import CSV Transactions
  async importTransactions(txList) {
    try {
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: txList })
      });

      if (res.ok) {
        await this.loadUserData();
        await this.loadActivityLogs();
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error executing CSV import", e);
      return false;
    }
  },

  // Bulk Load Demo Data for User
  async loadDemoTransactions(demoList) {
    try {
      const res = await fetch("/api/transactions/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: demoList })
      });

      if (res.ok) {
        await this.loadUserData();
        await this.loadActivityLogs();
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error loading demo data", e);
      return false;
    }
  },

  // Sort transactions by date (newest first), then by time
  sortTransactions() {
    this.transactions.sort((a, b) => {
      const dateA = new Date(a.date + "T" + (a.time || "00:00"));
      const dateB = new Date(b.date + "T" + (b.time || "00:00"));
      return dateB - dateA;
    });
  },

  // Action Plan: Add custom habit
  async addHabitGoal(habit) {
    if (habit.patternId && this.savingGoals.habits.some(h => h.patternId === habit.patternId)) {
      return false;
    }

    try {
      const res = await fetch("/api/goals/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(habit)
      });

      if (res.ok) {
        const newHabit = await res.json();
        this.savingGoals.habits.push(newHabit);
        this.loadActivityLogs();
        this.notify();
        return newHabit;
      }
      return false;
    } catch (e) {
      console.error("Error adding habit", e);
      return false;
    }
  },

  // Action Plan: Update habit status
  async updateHabitStatus(habitId, status) {
    try {
      const res = await fetch(`/api/goals/habits/${habitId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });

      if (res.ok) {
        const habit = this.savingGoals.habits.find(h => h.id === habitId);
        if (habit) {
          habit.status = status;
          this.loadActivityLogs();
          this.notify();
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error updating habit status", e);
      return false;
    }
  },

  // Action Plan: Remove habit
  async removeHabitGoal(habitId) {
    try {
      const res = await fetch(`/api/goals/habits/${habitId}`, {
        method: "DELETE"
      });

      if (res.ok) {
        this.savingGoals.habits = this.savingGoals.habits.filter(h => h.id !== habitId);
        this.loadActivityLogs();
        this.notify();
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error deleting habit", e);
      return false;
    }
  },

  // Action Plan: Update Saving Target Goal
  async updateSavingsTarget(target) {
    const val = parseFloat(target) || 0;
    this.savingGoals.target = val;
    try {
      await fetch("/api/goals/target", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: val })
      });
      this.loadActivityLogs();
    } catch (e) {
      console.error("Error updating savings target", e);
    }
    this.notify();
  },

  // Chat: Add Message
  async addChatMessage(sender, text) {
    const msg = {
      sender,
      text,
      timestamp: new Date().toISOString()
    };
    this.chatHistory.push(msg);
    if (this.chatHistory.length > 100) {
      this.chatHistory.shift();
    }
    this.notify();

    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, text })
      });
      if (sender === "user") {
        this.loadActivityLogs();
      }
    } catch (e) {
      console.error("Error saving chat message to server", e);
    }
  },

  // Settings: Update
  async updateSettings(newSettings) {
    this.settings = {
      ...this.settings,
      ...newSettings
    };
    this.notify();

    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: this.settings.currency,
          theme: this.settings.theme,
          savingTarget: this.savingGoals.target
        })
      });
    } catch (e) {
      console.error("Error saving settings to server", e);
    }
  }
};
