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

  // Fetch all user-isolated data from the backend
  async loadUserData() {
    if (!window.AppAuth || !window.AppAuth.isAuthenticated) {
      this.clearLocalMemory();
      return;
    }

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

      if (txRes.ok) {
        this.transactions = await txRes.json();
        this.sortTransactions();
      }

      if (goalsRes.ok) {
        const goalsData = await goalsRes.json();
        this.savingGoals = {
          target: goalsData.target || 2500,
          habits: Array.isArray(goalsData.habits) ? goalsData.habits : []
        };
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        this.settings = {
          ...this.settings,
          userName: settingsData.userName || (window.AppAuth.currentUser && window.AppAuth.currentUser.name) || "User",
          username: (window.AppAuth.currentUser && window.AppAuth.currentUser.username) || "",
          email: settingsData.email || (window.AppAuth.currentUser && window.AppAuth.currentUser.email) || "",
          currency: settingsData.currency || "₹",
          theme: settingsData.theme || "dark"
        };
        if (this.settings.theme === "light") {
          document.body.classList.remove("dark-mode");
        } else {
          document.body.classList.add("dark-mode");
        }
      }

      if (profRes.ok) {
        this.userProfile = await profRes.json();
        if (this.userProfile && this.userProfile.user) {
          this.settings.username = this.userProfile.user.username || this.settings.username;
          this.settings.monthlyIncome = this.userProfile.user.monthly_income || 0;
          if (this.userProfile.settings) {
            this.settings.monthlyBudget = this.userProfile.settings.monthly_budget || 0;
          }
        }
      }

      if (notifRes.ok) {
        this.notifications = await notifRes.json();
      }

      if (chatRes.ok) {
        this.chatHistory = await chatRes.json();
      }
    } catch (e) {
      console.error("Failed to load user state from server", e);
    } finally {
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
        this.loadActivityLogs();
        this.notify();
        return createdTx;
      } else {
        const err = await res.json();
        throw new Error(err.error || "Failed to add transaction.");
      }
    } catch (e) {
      console.error("Error adding transaction", e);
      throw e;
    }
  },

  // CRUD: Edit Transaction
  async editTransaction(id, updatedFields) {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields)
      });

      if (res.ok) {
        const index = this.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
          this.transactions[index] = {
            ...this.transactions[index],
            ...updatedFields,
            amount: parseFloat(updatedFields.amount)
          };
          this.sortTransactions();
          this.loadActivityLogs();
          this.notify();
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error updating transaction", e);
      return false;
    }
  },

  // CRUD: Delete Transaction
  async deleteTransaction(id) {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "DELETE"
      });

      if (res.ok) {
        this.transactions = this.transactions.filter(t => t.id !== id);
        this.loadActivityLogs();
        this.notify();
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error deleting transaction", e);
      return false;
    }
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
