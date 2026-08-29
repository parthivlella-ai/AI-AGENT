/**
 * ui-render.js - Core UI Controller & Renderer
 * Handles SPA navigation, modal triggers, CSV upload events, Chart.js displays, and DOM updates.
 */

window.AppUIRender = {
  activeScreen: "screen-dashboard",
  currentPage: 1,
  pageSize: 12,
  charts: {},

  // Start initialization
  async init() {
    this.setupEventListeners();
    this.setupCSVListeners();
    this.setupSimulatorListeners();
    this.setupAuthListeners();
    
    // Subscribe to state updates
    window.AppState.subscribe((state) => this.renderActiveScreen(state));
    
    // Initial auth check with backend session
    const isAuth = await window.AppAuth.checkSession();
    if (isAuth) {
      await window.AppState.loadUserData();
      this.updateUserProfileDisplays();
      this.showLandingPage(false);
      this.switchScreen("screen-dashboard");
    } else {
      this.showLandingPage(true);
    }
  },

  // Onboarding overlay control
  showLandingPage(show) {
    const landing = document.getElementById("screen-landing");
    const mainApp = document.querySelector(".app-container");
    if (show) {
      landing.classList.remove("hidden");
      landing.style.display = "flex";
      mainApp.style.display = "none";
    } else {
      landing.classList.add("hidden");
      landing.style.display = "none";
      mainApp.style.display = "flex";
    }
  },

  // Switch SPA screen
  switchScreen(screenId) {
    // Route guard: if unauthenticated, force landing page
    if (!window.AppAuth || !window.AppAuth.isAuthenticated) {
      this.showLandingPage(true);
      return;
    }

    this.activeScreen = screenId;
    
    // Update navigation styles
    document.querySelectorAll(".nav-item, .mobile-nav-item").forEach(item => {
      if (item.getAttribute("data-screen") === screenId) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    // Update screen visibility
    document.querySelectorAll(".app-screen").forEach(screen => {
      if (screen.id === screenId) {
        screen.classList.add("active");
      } else {
        screen.classList.remove("active");
      }
    });

    // Close mobile side drawer on screen transition
    const sidebar = document.querySelector(".sidebar");
    if (sidebar) sidebar.classList.remove("open");

    // Close profile dropdown
    const profileDropdown = document.getElementById("profile-dropdown-menu");
    if (profileDropdown) profileDropdown.classList.remove("open");

    // Re-render target screen
    this.renderActiveScreen(window.AppState);
  },

  // Trigger Toast Notification
  showToast(message, type = "success") {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    // Icon map
    const icons = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
      danger: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
      warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
      info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };

    toast.innerHTML = `${icons[type]} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "slideInRight 0.2s ease-in reverse forwards";
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  },

  // Setup Event Listeners for Nav, Buttons, Modals
  setupEventListeners() {
    // Navigation click
    document.querySelectorAll(".nav-item, .mobile-nav-item").forEach(item => {
      item.addEventListener("click", (e) => {
        const screenId = e.currentTarget.getAttribute("data-screen");
        if (screenId) this.switchScreen(screenId);
      });
    });

    // Theme toggle icon click
    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const isDark = document.body.classList.toggle("dark-mode");
        window.AppState.updateSettings({ theme: isDark ? "dark" : "light" });
        this.showToast(`Theme switched to ${isDark ? 'Dark' : 'Light'} mode`, "info");
      });
    }

    // Sidebar Mobile Menu Open
    const mobileMenuOpenBtn = document.getElementById("mobile-menu-btn");
    const sidebar = document.querySelector(".sidebar");
    if (mobileMenuOpenBtn && sidebar) {
      mobileMenuOpenBtn.addEventListener("click", () => {
        sidebar.classList.add("open");
      });
    }

    // Sidebar Mobile Menu Close Overlay
    document.addEventListener("click", (e) => {
      if (sidebar && sidebar.classList.contains("open") && 
          !sidebar.contains(e.target) && 
          !document.getElementById("mobile-menu-btn").contains(e.target)) {
        sidebar.classList.remove("open");
      }
    });

    // Modal Control: Add Transaction Modal Trigger
    const addTxBtn = document.getElementById("add-tx-btn");
    const modalAdd = document.getElementById("modal-add-transaction");
    const closeModals = document.querySelectorAll(".close-modal, .btn-cancel-modal");
    
    if (addTxBtn && modalAdd) {
      addTxBtn.addEventListener("click", () => {
        // Clear form values
        document.getElementById("form-tx-id").value = "";
        document.getElementById("form-tx-merchant").value = "";
        document.getElementById("form-tx-amount").value = "";
        document.getElementById("form-tx-category").value = "Food";
        document.getElementById("form-tx-type").value = "expense";
        document.getElementById("form-tx-payment").value = "UPI";
        
        // Auto default current date and time
        const now = new Date();
        document.getElementById("form-tx-date").value = now.toISOString().split('T')[0];
        document.getElementById("form-tx-time").value = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');
        document.getElementById("form-tx-notes").value = "";

        document.getElementById("modal-tx-title").textContent = "Add Transaction";
        modalAdd.classList.add("open");
      });
    }

    closeModals.forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open"));
      });
    });

    // Save transaction form submit
    const txForm = document.getElementById("form-transaction");
    if (txForm) {
      txForm.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const txId = document.getElementById("form-tx-id").value;
        const merchant = document.getElementById("form-tx-merchant").value;
        const amount = parseFloat(document.getElementById("form-tx-amount").value);
        const category = document.getElementById("form-tx-category").value;
        const type = document.getElementById("form-tx-type").value;
        const date = document.getElementById("form-tx-date").value;
        const time = document.getElementById("form-tx-time").value;
        const payment = document.getElementById("form-tx-payment").value;
        const notes = document.getElementById("form-tx-notes").value;

        if (!merchant || isNaN(amount) || amount <= 0 || !date) {
          this.showToast("Please provide valid values for all required fields.", "danger");
          return;
        }

        const txData = { merchant, amount, category, type, date, time, payment_method: payment, notes };

        if (txId) {
          window.AppState.editTransaction(txId, txData);
          this.showToast("Transaction updated successfully!");
        } else {
          window.AppState.addTransaction(txData);
          this.showToast("Transaction added successfully!");
        }

        document.getElementById("modal-add-transaction").classList.remove("open");
      });
    }

    // Modal Confirmation: Delete Transaction
    const confirmDeleteBtn = document.getElementById("btn-confirm-delete");
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener("click", () => {
        const idToDelete = confirmDeleteBtn.getAttribute("data-tx-id");
        if (idToDelete) {
          window.AppState.deleteTransaction(idToDelete);
          this.showToast("Transaction deleted successfully!", "success");
          document.getElementById("modal-confirm-delete").classList.remove("open");
        }
      });
    }

    // Settings Reset Screen Button
    const clearDataBtn = document.getElementById("settings-clear-data");
    if (clearDataBtn) {
      clearDataBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to delete all transactions and reset your plan? This action cannot be undone.")) {
          window.AppState.clearAllData();
          this.showToast("All data cleared for your account.", "danger");
          this.switchScreen("screen-dashboard");
        }
      });
    }

    // Chat view action send
    const chatInput = document.getElementById("chat-box-input");
    const chatSendBtn = document.getElementById("chat-send-btn");

    const handleSendMessage = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      
      chatInput.value = "";
      window.AppState.addChatMessage("user", text);

      // Render loading state for assistant response
      const historyContainer = document.getElementById("chat-msg-history");
      const bubbleLoader = document.createElement("div");
      bubbleLoader.className = "chat-bubble assistant skeleton";
      bubbleLoader.style.width = "80px";
      bubbleLoader.style.height = "40px";
      bubbleLoader.id = "chat-assistant-loader";
      historyContainer.appendChild(bubbleLoader);
      historyContainer.scrollTop = historyContainer.scrollHeight;

      setTimeout(() => {
        const response = window.AppAIEngine.chatRespond(text, window.AppState.transactions);
        bubbleLoader.remove();
        window.AppState.addChatMessage("assistant", response);
      }, 750);
    };

    if (chatSendBtn) chatSendBtn.addEventListener("click", handleSendMessage);
    if (chatInput) {
      chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSendMessage();
      });
    }
  },

  // Update all user-related profile UI displays
  updateUserProfileDisplays() {
    const user = window.AppAuth.currentUser || { name: window.AppState.settings.userName || "User", email: window.AppState.settings.email || "" };
    const name = user.name || "User";
    const email = user.email || "";
    const initial = (name.charAt(0) || "U").toUpperCase();

    // Top Bar Chip
    const topAvatar = document.getElementById("topbar-avatar");
    const topName = document.getElementById("topbar-user-name");
    const dropName = document.getElementById("dropdown-user-name");
    const dropEmail = document.getElementById("dropdown-user-email");

    if (topAvatar) topAvatar.textContent = initial;
    if (topName) topName.textContent = name;
    if (dropName) dropName.textContent = name;
    if (dropEmail) dropEmail.textContent = email;

    // Greeting Banner
    const greetingEl = document.getElementById("dash-greeting-title");
    if (greetingEl) {
      const hour = new Date().getHours();
      let greeting = "Good morning";
      if (hour >= 12 && hour < 17) greeting = "Good afternoon";
      else if (hour >= 17) greeting = "Good evening";
      greetingEl.textContent = `${greeting}, ${name} 👋`;
    }

    // Onboarding Title
    const onboardingTitle = document.getElementById("onboarding-welcome-title");
    if (onboardingTitle) {
      onboardingTitle.textContent = `Welcome to Where Did My Money Go, ${name}! 👋`;
    }

    // Settings Profile Card
    const setAvatar = document.getElementById("settings-avatar-large");
    const setName = document.getElementById("settings-user-name");
    const setEmail = document.getElementById("settings-user-email");

    if (setAvatar) setAvatar.textContent = initial;
    if (setName) setName.value = name;
    if (setEmail) setEmail.value = email;
  },

  // Setup Authentication Modals & Actions
  setupAuthListeners() {
    const modalLogin = document.getElementById("modal-login");
    const modalSignup = document.getElementById("modal-signup");
    const modalForgot = document.getElementById("modal-forgot-password");
    const modalDeleteAccount = document.getElementById("modal-confirm-delete-account");

    const openLogin = () => {
      document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open"));
      const alertEl = document.getElementById("login-error-alert");
      if (alertEl) alertEl.style.display = "none";
      if (modalLogin) modalLogin.classList.add("open");
    };

    const openSignup = () => {
      document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open"));
      const alertEl = document.getElementById("signup-error-alert");
      if (alertEl) alertEl.style.display = "none";
      if (modalSignup) modalSignup.classList.add("open");
    };

    // Landing Page buttons
    const btnLandingLogin = document.getElementById("landing-login-btn");
    const btnLandingStartLogin = document.getElementById("landing-start-login-btn");
    const btnLandingSignup = document.getElementById("landing-signup-btn");
    const btnLandingStartSignup = document.getElementById("landing-start-signup-btn");
    const btnLandingDemo = document.getElementById("onboarding-load-demo");
    const btnDashDemo = document.getElementById("dash-load-demo-btn");
    const btnSettingsDemo = document.getElementById("settings-load-demo");

    if (btnLandingLogin) btnLandingLogin.addEventListener("click", openLogin);
    if (btnLandingStartLogin) btnLandingStartLogin.addEventListener("click", openLogin);
    if (btnLandingSignup) btnLandingSignup.addEventListener("click", openSignup);
    if (btnLandingStartSignup) btnLandingStartSignup.addEventListener("click", openSignup);

    // Switch between login & signup inside modal
    const linkToSignup = document.getElementById("link-switch-to-signup");
    const linkToLogin = document.getElementById("link-switch-to-login");
    const linkForgot = document.getElementById("link-forgot-password");

    if (linkToSignup) linkToSignup.addEventListener("click", (e) => { e.preventDefault(); openSignup(); });
    if (linkToLogin) linkToLogin.addEventListener("click", (e) => { e.preventDefault(); openLogin(); });
    if (linkForgot) linkForgot.addEventListener("click", (e) => {
      e.preventDefault();
      if (modalLogin) modalLogin.classList.remove("open");
      if (modalForgot) modalForgot.classList.add("open");
    });

    // Password visibility toggles
    const toggleLoginPass = document.getElementById("btn-toggle-login-pass");
    const toggleSignupPass = document.getElementById("btn-toggle-signup-pass");

    if (toggleLoginPass) {
      toggleLoginPass.addEventListener("click", () => {
        const input = document.getElementById("login-password");
        if (input) input.type = input.type === "password" ? "text" : "password";
      });
    }

    if (toggleSignupPass) {
      toggleSignupPass.addEventListener("click", () => {
        const input = document.getElementById("signup-password");
        if (input) input.type = input.type === "password" ? "text" : "password";
      });
    }

    // Login Form Submit
    const formLogin = document.getElementById("form-login");
    if (formLogin) {
      formLogin.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        const alertEl = document.getElementById("login-error-alert");
        const submitBtn = document.getElementById("btn-submit-login");

        if (submitBtn) submitBtn.disabled = true;
        if (alertEl) alertEl.style.display = "none";

        const result = await window.AppAuth.login(email, password);

        if (submitBtn) submitBtn.disabled = false;

        if (!result.success) {
          if (alertEl) {
            alertEl.textContent = result.error || "Email or password is incorrect.";
            alertEl.style.display = "block";
          }
          return;
        }

        // Success: Close modal, sync state, and navigate
        if (modalLogin) modalLogin.classList.remove("open");
        formLogin.reset();
        await window.AppState.loadUserData();
        this.updateUserProfileDisplays();
        this.showLandingPage(false);
        this.switchScreen("screen-dashboard");
        this.showToast(`Welcome back, ${result.user.name}!`, "success");
      });
    }

    // Signup Form Submit
    const formSignup = document.getElementById("form-signup");
    if (formSignup) {
      formSignup.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("signup-name").value;
        const email = document.getElementById("signup-email").value;
        const password = document.getElementById("signup-password").value;
        const confirmPass = document.getElementById("signup-confirm-password").value;
        const alertEl = document.getElementById("signup-error-alert");
        const submitBtn = document.getElementById("btn-submit-signup");

        if (submitBtn) submitBtn.disabled = true;
        if (alertEl) alertEl.style.display = "none";

        const result = await window.AppAuth.register(name, email, password, confirmPass);

        if (submitBtn) submitBtn.disabled = false;

        if (!result.success) {
          if (alertEl) {
            alertEl.textContent = result.error || "Failed to create account.";
            alertEl.style.display = "block";
          }
          return;
        }

        // Success: Close modal, sync state, and navigate
        if (modalSignup) modalSignup.classList.remove("open");
        formSignup.reset();
        await window.AppState.loadUserData();
        this.updateUserProfileDisplays();
        this.showLandingPage(false);
        this.switchScreen("screen-dashboard");
        this.showToast(`Account created! Welcome to Where Did My Money Go, ${result.user.name}!`, "success");
      });
    }

    // Profile Dropdown Actions
    const chipBtn = document.getElementById("profile-chip-btn");
    const dropdownMenu = document.getElementById("profile-dropdown-menu");
    const btnProfile = document.getElementById("dropdown-btn-profile");
    const btnSettings = document.getElementById("dropdown-btn-settings");
    const btnLogout = document.getElementById("dropdown-btn-logout");
    const btnMobileLogout = document.getElementById("mobile-logout-btn");
    const btnSettingsLogout = document.getElementById("settings-btn-logout");

    if (chipBtn && dropdownMenu) {
      chipBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle("open");
      });

      document.addEventListener("click", (e) => {
        if (!chipBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
          dropdownMenu.classList.remove("open");
        }
      });
    }

    if (btnProfile) btnProfile.addEventListener("click", () => this.switchScreen("screen-settings"));
    if (btnSettings) btnSettings.addEventListener("click", () => this.switchScreen("screen-settings"));

    const handleLogout = async () => {
      if (dropdownMenu) dropdownMenu.classList.remove("open");
      await window.AppAuth.logout();
      this.showLandingPage(true);
      this.showToast("Signed out successfully.", "info");
    };

    if (btnLogout) btnLogout.addEventListener("click", handleLogout);
    if (btnMobileLogout) btnMobileLogout.addEventListener("click", handleLogout);
    if (btnSettingsLogout) btnSettingsLogout.addEventListener("click", handleLogout);

    // Account Deletion
    const btnDeleteAccount = document.getElementById("settings-btn-delete-account");
    const btnConfirmDeleteAccount = document.getElementById("btn-confirm-delete-account");

    if (btnDeleteAccount && modalDeleteAccount) {
      btnDeleteAccount.addEventListener("click", () => {
        modalDeleteAccount.classList.add("open");
      });
    }

    if (btnConfirmDeleteAccount) {
      btnConfirmDeleteAccount.addEventListener("click", async () => {
        btnConfirmDeleteAccount.disabled = true;
        btnConfirmDeleteAccount.textContent = "Deleting...";
        const result = await window.AppAuth.deleteAccount();
        btnConfirmDeleteAccount.disabled = false;
        btnConfirmDeleteAccount.textContent = "Yes, Delete Everything";

        if (result.success) {
          if (modalDeleteAccount) modalDeleteAccount.classList.remove("open");
          this.showLandingPage(true);
          this.showToast("Your account and all financial data have been permanently deleted.", "danger");
        } else {
          this.showToast(result.error || "Failed to delete account.", "danger");
        }
      });
    }

    // Demo Data Actions
    const handleDemoLoad = async () => {
      if (window.AppAuth && window.AppAuth.isAuthenticated) {
        window.DemoData.loadDemoData();
        this.updateUserProfileDisplays();
        this.showLandingPage(false);
        this.switchScreen("screen-dashboard");
        this.showToast("Demo transaction history loaded into your account!", "success");
      } else {
        openSignup();
        this.showToast("Create a quick account to test demo data in your private workspace!", "info");
      }
    };

    if (btnLandingDemo) btnLandingDemo.addEventListener("click", handleDemoLoad);
    if (btnDashDemo) btnDashDemo.addEventListener("click", handleDemoLoad);
    if (btnSettingsDemo) btnSettingsDemo.addEventListener("click", handleDemoLoad);
  },

  // Setup CSV Drag & Drop UI Listeners
  setupCSVListeners() {
    const dropZone = document.getElementById("csv-drop-zone");
    const fileInput = document.getElementById("csv-file-input");
    const importConfirmBtn = document.getElementById("btn-execute-import");

    if (!dropZone) return;

    // Trigger file chooser
    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      
      if (e.dataTransfer.files.length > 0) {
        this.handleCSVFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        this.handleCSVFile(e.target.files[0]);
      }
    });

    if (importConfirmBtn) {
      importConfirmBtn.addEventListener("click", () => {
        const report = window.AppCSVImporter.validateRows();
        if (report.validCount > 0) {
          const count = window.AppCSVImporter.importValidRows(report.valid);
          this.showToast(`Imported ${count} transactions successfully!`);
          
          // Clear file state and switch
          document.getElementById("csv-mapping-wrapper").style.display = "none";
          document.getElementById("csv-drop-zone").style.display = "block";
          fileInput.value = "";
          
          this.switchScreen("screen-transactions");
        } else {
          this.showToast("No valid transactions found to import.", "danger");
        }
      });
    }
  },

  handleCSVFile(file) {
    if (!file.name.endsWith(".csv")) {
      this.showToast("Please upload a valid CSV file.", "danger");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = window.AppCSVImporter.parseCSV(e.target.result);
      if (parsed) {
        this.showToast("CSV file parsed successfully! Map your headers below.", "info");
        this.renderCSVMappingUI();
      } else {
        this.showToast("Failed to parse CSV. Make sure headers are on the first row.", "danger");
      }
    };
    reader.readAsText(file);
  },

  renderCSVMappingUI() {
    const dropZone = document.getElementById("csv-drop-zone");
    const wrapper = document.getElementById("csv-mapping-wrapper");
    const container = document.getElementById("csv-mapping-selectors");
    
    dropZone.style.display = "none";
    wrapper.style.display = "block";
    container.innerHTML = "";

    const headers = window.AppCSVImporter.headers;
    const mapping = window.AppCSVImporter.mapping;

    // Render mapping dropdown selects
    window.AppCSVImporter.standardFields.forEach(field => {
      const card = document.createElement("div");
      card.className = "csv-mapping-card";
      
      const label = document.createElement("div");
      label.className = "csv-mapping-label";
      label.textContent = field.label;
      
      const select = document.createElement("select");
      select.className = "csv-mapping-select";
      select.setAttribute("data-field", field.key);
      
      // Default placeholder
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = `-- Select CSV Column --`;
      select.appendChild(emptyOption);

      headers.forEach(h => {
        const option = document.createElement("option");
        option.value = h;
        option.textContent = h;
        if (mapping[field.key] === h) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      select.addEventListener("change", (e) => {
        window.AppCSVImporter.mapping[field.key] = e.target.value;
        this.updateCSVValidationReport();
      });

      card.appendChild(label);
      card.appendChild(select);
      container.appendChild(card);
    });

    this.updateCSVValidationReport();
  },

  updateCSVValidationReport() {
    const report = window.AppCSVImporter.validateRows();
    
    document.getElementById("csv-val-valid").textContent = report.validCount;
    document.getElementById("csv-val-invalid").textContent = report.invalidCount;
    document.getElementById("csv-val-duplicates").textContent = report.duplicateCount;

    // Enable/disable execution button based on mapping completeness
    const importBtn = document.getElementById("btn-execute-import");
    const isMapped = window.AppCSVImporter.mapping.date && 
                     window.AppCSVImporter.mapping.merchant && 
                     window.AppCSVImporter.mapping.amount;
    
    importBtn.disabled = !isMapped || report.validCount === 0;
  },

  // Setup dynamic sliders for Simulator
  setupSimulatorListeners() {
    const sliders = ["sim-slider-food", "sim-slider-shop", "sim-slider-sub"];
    sliders.forEach(id => {
      const slider = document.getElementById(id);
      if (slider) {
        slider.addEventListener("input", () => {
          this.calculateSimulationSavings();
        });
      }
    });
  },

  calculateSimulationSavings() {
    const currentTxs = window.AppAnalytics.getTransactionsForMonth(window.AppState.transactions, 0);
    
    // Sliders
    const foodTarget = parseInt(document.getElementById("sim-slider-food").value);
    const shopTarget = parseFloat(document.getElementById("sim-slider-shop").value);
    const subTarget = parseInt(document.getElementById("sim-slider-sub").value);

    // Initial parameters from current stats
    const lateNight = window.AppAnalytics.getLateNightDiscretionary(currentTxs);
    const foodLNCount = lateNight.count;
    const foodLNTotal = lateNight.total;
    const foodLNAvg = foodLNCount > 0 ? (foodLNTotal / foodLNCount) : 200;

    // 1. Food Deliveries saving
    // Calculate weekly deliveries
    const currentWeekly = Math.round((foodLNCount / 4) * 10) / 10;
    const targetWeekly = foodTarget;
    const foodSavings = Math.max(0, (currentWeekly - targetWeekly) * 4 * foodLNAvg);

    // 2. Shopping target saving
    const currentShopTotal = window.AppAnalytics.calculateTotal(currentTxs, "expense", "Shopping");
    const shopSavings = Math.max(0, currentShopTotal - shopTarget);

    // 3. Subscriptions saving
    const subSummary = window.AppAnalytics.getSubscriptionsSummary(currentTxs);
    const currentSubCount = subSummary.count;
    const subAvg = currentSubCount > 0 ? (subSummary.total / currentSubCount) : 300;
    const subSavings = Math.max(0, (currentSubCount - subTarget) * subAvg);

    const totalSavings = Math.round(foodSavings + shopSavings + subSavings);

    document.getElementById("sim-val-food").textContent = foodTarget + " / week";
    document.getElementById("sim-val-shop").textContent = "₹" + Math.round(shopTarget).toLocaleString('en-IN');
    document.getElementById("sim-val-sub").textContent = subTarget + " active";
    
    document.getElementById("sim-total-saving").textContent = "₹" + totalSavings.toLocaleString('en-IN') + "/month";
    
    // Suggest action button handler
    const addToPlanBtn = document.getElementById("sim-btn-add-plan");
    if (addToPlanBtn) {
      addToPlanBtn.onclick = () => {
        if (totalSavings > 0) {
          window.AppState.addHabitGoal({
            patternId: "simulated_habit",
            category: "General",
            title: "Simulated Custom Target Savings",
            recommendation: `Follow target caps: ${foodTarget}/week late-night deliveries, ₹${shopTarget}/month shopping limit, and ${subTarget} subscriptions.`,
            estimatedSaving: totalSavings,
            status: "in-progress"
          });
          this.showToast("Savings target habits successfully merged into Action Plan!");
          this.switchScreen("screen-action-plan");
        } else {
          this.showToast("Configure sliders to show savings before adding to action plan.", "warning");
        }
      };
    }
  },

  // Central Router Dispatch
  renderActiveScreen(state) {
    // Sync current theme class
    const isDark = state.settings.theme === "dark";
    document.body.classList.toggle("dark-mode", isDark);

    // Renders matching screens
    switch (this.activeScreen) {
      case "screen-dashboard":
        this.renderDashboard(state);
        break;
      case "screen-transactions":
        this.renderTransactions(state);
        break;
      case "screen-where-did-it-go":
        this.renderCashFlow(state);
        break;
      case "screen-insights":
        this.renderAIInsights(state);
        break;
      case "screen-action-plan":
        this.renderActionPlan(state);
        break;
      case "screen-simulator":
        this.renderSimulator(state);
        break;
      case "screen-chat":
        this.renderAIChat(state);
        break;
      case "screen-settings":
        this.renderSettings(state);
        break;
    }
  },

  /* ==========================================
     DASHBOARD SCREEN RENDERING
     ========================================== */
  renderDashboard(state) {
    const currentTxs = window.AppAnalytics.getTransactionsForMonth(state.transactions, 0);

    // Check empty state
    const emptyState = document.getElementById("dashboard-empty-state");
    const contentArea = document.getElementById("dashboard-content-area");

    if (state.transactions.length === 0) {
      emptyState.style.display = "flex";
      contentArea.style.display = "none";
      return;
    } else {
      emptyState.style.display = "none";
      contentArea.style.display = "block";
    }

    // Total Spent Current vs MoM
    const mom = window.AppAnalytics.getMoMChange(state.transactions);
    document.getElementById("dash-total-spent").textContent = "₹" + Math.round(mom.currentTotal).toLocaleString('en-IN');
    
    const spentChangeEl = document.getElementById("dash-spent-change");
    if (mom.lastTotal === 0) {
      spentChangeEl.className = "metric-change change-neutral";
      spentChangeEl.textContent = "no history";
    } else {
      const isUp = mom.diff > 0;
      spentChangeEl.className = `metric-change ${isUp ? 'change-up' : 'change-down'}`;
      spentChangeEl.innerHTML = isUp 
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg> +${Math.round(mom.percentage)}%` 
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg> ${Math.round(mom.percentage)}%`;
    }

    // Average daily spending
    const dailyAvg = window.AppAnalytics.getAverageDailySpending(state.transactions, 0);
    document.getElementById("dash-daily-avg").textContent = "₹" + Math.round(dailyAvg).toLocaleString('en-IN');

    // Largest spending category
    const catBreakdown = window.AppAnalytics.getCategoryBreakdown(currentTxs);
    document.getElementById("dash-largest-cat").textContent = catBreakdown.length > 0 ? catBreakdown[0].category : "None";

    // Potential savings
    const activeHabits = state.savingGoals.habits;
    const potentialSavingVal = activeHabits.reduce((sum, h) => sum + h.estimatedSaving, 0);
    document.getElementById("dash-potential-saving").textContent = "₹" + potentialSavingVal.toLocaleString('en-IN');

    // Score widget
    const score = window.AppAnalytics.calculateSpendingScore(state.transactions, state.savingGoals.habits);
    document.getElementById("dash-score-num").textContent = score;
    
    // Spend Score text summary description
    let scoreMsg = "Becoming aware of spending patterns.";
    if (score >= 90) scoreMsg = "Excellent! Extremely high spending awareness.";
    else if (score >= 75) scoreMsg = "Good habits forming. Watch minor leaks.";
    else if (score < 50) scoreMsg = "Urgent: Multiple leak patterns flagged.";
    document.getElementById("dash-score-msg").textContent = scoreMsg;

    // Circle circumference dasharray
    const circle = document.querySelector(".spend-score-circle");
    if (circle) {
      // Rotate effect corresponding to score percentage
      const angle = (score / 100) * 360;
      circle.style.borderTopColor = score >= 80 ? "var(--success)" : (score >= 60 ? "var(--warning)" : "var(--danger)");
    }

    // Natural Language Story
    const storyContainer = document.getElementById("dash-ai-story");
    storyContainer.innerHTML = window.AppAIEngine.generateMonthStory(state.transactions);

    // Top 3 money leaks
    const leaksContainer = document.getElementById("dash-leaks-container");
    leaksContainer.innerHTML = "";
    
    const insights = window.AppAIEngine.generateInsights(state.transactions);
    const moneyLeaks = insights.filter(i => i.estimatedSaving > 0).slice(0, 3);

    if (moneyLeaks.length > 0) {
      moneyLeaks.forEach(l => {
        const item = document.createElement("div");
        item.className = "ai-leak-item";
        item.innerHTML = `
          <div class="ai-leak-info">
            <div class="ai-leak-icon">${l.emoji}</div>
            <div>
              <div class="ai-leak-title">${l.title}</div>
              <div class="ai-leak-meta">${l.evidence}</div>
            </div>
          </div>
          <div class="ai-leak-amount">
            <div class="ai-leak-val">₹${l.estimatedSaving}</div>
            <div class="ai-leak-potential">potential save</div>
          </div>
        `;
        leaksContainer.appendChild(item);
      });
    } else {
      leaksContainer.innerHTML = `<div class="empty-state-text">No significant leaks found. You're doing great!</div>`;
    }

    // Chart.js updates
    this.renderDashboardCharts(currentTxs);
  },

  renderDashboardCharts(currentTxs) {
    const isDark = window.AppState.settings.theme === "dark";
    const gridColor = isDark ? "#1f2937" : "#e2e8f0";
    const textThemeColor = isDark ? "#9ca3af" : "#475569";

    // 1. Donut Category Chart
    const catBreakdown = window.AppAnalytics.getCategoryBreakdown(currentTxs);
    const catLabels = catBreakdown.map(c => c.category);
    const catData = catBreakdown.map(c => c.amount);

    if (this.charts.category) this.charts.category.destroy();
    
    const catCtx = document.getElementById("chart-category-donut");
    if (catCtx) {
      this.charts.category = new Chart(catCtx, {
        type: "doughnut",
        data: {
          labels: catLabels,
          datasets: [{
            data: catData,
            backgroundColor: [
              "#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#06b6d4",
              "#ec4899", "#8b5cf6", "#14b8a6", "#f43f5e", "#64748b"
            ],
            borderWidth: isDark ? 2 : 1,
            borderColor: isDark ? "#111827" : "#ffffff"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "right",
              labels: { color: textThemeColor, font: { family: "Plus Jakarta Sans", size: 11 } }
            }
          }
        }
      });
    }

    // 2. Daily spending bar chart
    // Get list of daily totals for current month
    const dailyMap = {};
    currentTxs.forEach(tx => {
      if (tx.type === "expense") {
        const day = new Date(tx.date).getDate();
        dailyMap[day] = (dailyMap[day] || 0) + tx.amount;
      }
    });

    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const barLabels = [];
    const barData = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (d <= new Date().getDate() || d <= Object.keys(dailyMap).length) {
        barLabels.push(String(d));
        barData.push(dailyMap[d] || 0);
      }
    }

    if (this.charts.daily) this.charts.daily.destroy();

    const dailyCtx = document.getElementById("chart-daily-bars");
    if (dailyCtx) {
      this.charts.daily = new Chart(dailyCtx, {
        type: "bar",
        data: {
          labels: barLabels,
          datasets: [{
            label: "Daily Spend (₹)",
            data: barData,
            backgroundColor: "rgba(79, 70, 229, 0.75)",
            hoverBackgroundColor: "#4f46e5",
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false }, ticks: { color: textThemeColor, font: { family: "Plus Jakarta Sans" } } },
            y: { grid: { color: gridColor }, ticks: { color: textThemeColor, font: { family: "Plus Jakarta Sans" } } }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }

    // 3. Time of Day Spending
    const segments = window.AppAnalytics.getTimeOfDaySegments(currentTxs);
    if (this.charts.timeOfDay) this.charts.timeOfDay.destroy();

    const todCtx = document.getElementById("chart-time-day");
    if (todCtx) {
      this.charts.timeOfDay = new Chart(todCtx, {
        type: "bar",
        data: {
          labels: ["Morning", "Afternoon", "Evening", "Late-Night"],
          datasets: [{
            data: [segments.morning, segments.afternoon, segments.evening, segments.lateNight],
            backgroundColor: ["#34d399", "#fbbf24", "#f472b6", "#818cf8"],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false }, ticks: { color: textThemeColor } },
            y: { grid: { color: gridColor }, ticks: { color: textThemeColor } }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  },

  /* ==========================================
     TRANSACTIONS SCREEN RENDERING
     ========================================== */
  renderTransactions(state) {
    const tableBody = document.getElementById("tx-table-body");
    if (!tableBody) return;

    // Filters inputs
    const query = document.getElementById("tx-search-input").value.toLowerCase().trim();
    const category = document.getElementById("tx-filter-category").value;
    const type = document.getElementById("tx-filter-type").value;
    const sort = document.getElementById("tx-filter-sort").value;

    let filtered = [...state.transactions];

    // Search query match
    if (query) {
      filtered = filtered.filter(tx => 
        tx.merchant.toLowerCase().includes(query) || 
        (tx.notes || "").toLowerCase().includes(query)
      );
    }

    // Category filter
    if (category) {
      filtered = filtered.filter(tx => tx.category === category);
    }

    // Type filter
    if (type) {
      filtered = filtered.filter(tx => tx.type === type);
    }

    // Sorting
    if (sort === "date-desc") {
      // Sorted default descending
    } else if (sort === "date-asc") {
      filtered.reverse();
    } else if (sort === "amount-desc") {
      filtered.sort((a, b) => b.amount - a.amount);
    } else if (sort === "amount-asc") {
      filtered.sort((a, b) => a.amount - b.amount);
    }

    // Pagination bounds
    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / this.pageSize));
    this.currentPage = Math.min(this.currentPage, totalPages);

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const endIdx = startIdx + this.pageSize;
    const paginated = filtered.slice(startIdx, endIdx);

    tableBody.innerHTML = "";

    if (paginated.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">No transactions found matching the filter criteria.</td></tr>`;
    } else {
      paginated.forEach(tx => {
        const row = document.createElement("tr");
        const badgeClass = tx.type === "expense" ? "badge-expense" : "badge-income";
        const amtClass = tx.type === "expense" ? "tx-expense" : "tx-income";
        const amtSign = tx.type === "expense" ? "-" : "+";

        row.innerHTML = `
          <td>${tx.date} <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 4px;">${tx.time}</span></td>
          <td style="font-weight: 600;">${tx.merchant}</td>
          <td><span class="badge ${badgeClass}">${tx.category}</span></td>
          <td class="tx-amount ${amtClass}">${amtSign}₹${tx.amount.toLocaleString('en-IN')}</td>
          <td><span style="font-size: 0.85rem;">${tx.payment_method}</span></td>
          <td><span style="font-size: 0.8rem; color: var(--text-secondary); max-width: 140px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${tx.notes || '-'}</span></td>
          <td>
            <div class="action-btn-group">
              <button class="icon-btn edit-tx-btn" data-tx-id="${tx.id}" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
              <button class="icon-btn delete delete-tx-btn" data-tx-id="${tx.id}" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              </button>
            </div>
          </td>
        `;
        tableBody.appendChild(row);
      });
    }

    // Pagination metrics rendering
    document.getElementById("tx-pagination-info").textContent = `Showing ${totalCount > 0 ? startIdx + 1 : 0} to ${Math.min(endIdx, totalCount)} of ${totalCount} transactions`;
    
    const prevBtn = document.getElementById("tx-pagination-prev");
    const nextBtn = document.getElementById("tx-pagination-next");

    prevBtn.disabled = this.currentPage === 1;
    nextBtn.disabled = this.currentPage === totalPages;

    // Attach listeners on dynamic buttons
    // Prev / Next Page
    prevBtn.onclick = () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderTransactions(window.AppState);
      }
    };
    nextBtn.onclick = () => {
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.renderTransactions(window.AppState);
      }
    };

    // Table Search and Select changes (real-time filtering)
    // Avoid double binds by overwriting handlers
    const filters = ["tx-search-input", "tx-filter-category", "tx-filter-type", "tx-filter-sort"];
    filters.forEach(id => {
      const el = document.getElementById(id);
      el.oninput = el.onchange = () => {
        this.currentPage = 1;
        this.renderTransactions(window.AppState);
      };
    });

    // CRUD: Bind edit/delete clicks
    document.querySelectorAll(".delete-tx-btn").forEach(btn => {
      btn.onclick = (e) => {
        const txId = e.currentTarget.getAttribute("data-tx-id");
        const confirmDeleteBtn = document.getElementById("btn-confirm-delete");
        confirmDeleteBtn.setAttribute("data-tx-id", txId);
        document.getElementById("modal-confirm-delete").classList.add("open");
      };
    });

    document.querySelectorAll(".edit-tx-btn").forEach(btn => {
      btn.onclick = (e) => {
        const txId = e.currentTarget.getAttribute("data-tx-id");
        const tx = state.transactions.find(t => t.id === txId);
        if (tx) {
          // Prepopulate edit modal
          document.getElementById("form-tx-id").value = tx.id;
          document.getElementById("form-tx-merchant").value = tx.merchant;
          document.getElementById("form-tx-amount").value = tx.amount;
          document.getElementById("form-tx-category").value = tx.category;
          document.getElementById("form-tx-type").value = tx.type;
          document.getElementById("form-tx-date").value = tx.date;
          document.getElementById("form-tx-time").value = tx.time;
          document.getElementById("form-tx-payment").value = tx.payment_method;
          document.getElementById("form-tx-notes").value = tx.notes || "";

          document.getElementById("modal-tx-title").textContent = "Edit Transaction";
          document.getElementById("modal-add-transaction").classList.add("open");
        }
      };
    });
  },

  /* ==========================================
     WHERE DID MY MONEY GO (FLOW) RENDERING
     ========================================== */
  renderCashFlow(state) {
    const currentTxs = window.AppAnalytics.getTransactionsForMonth(state.transactions, 0);

    const totalIncome = window.AppAnalytics.calculateTotal(currentTxs, "income");
    const totalExpense = window.AppAnalytics.calculateTotal(currentTxs, "expense");

    const split = window.AppAnalytics.getEssentialDiscretionarySplit(currentTxs);
    const lateNight = window.AppAnalytics.getLateNightDiscretionary(currentTxs);
    const micro = window.AppAnalytics.getMicroSpending(currentTxs);

    // Potentially Avoidable = late night food + 30% of micro spending + subscriptions cancellations potential
    const subs = window.AppAnalytics.getSubscriptionsSummary(currentTxs);
    const avoidableVal = Math.round((lateNight.total * 0.7) + (micro.total * 0.3) + (subs.total * 0.3));
    
    // Savings = income - expenses
    const savingsVal = Math.max(0, totalIncome - totalExpense);

    // Apply values to Flow nodes
    document.getElementById("flow-val-income").textContent = "₹" + Math.round(totalIncome).toLocaleString('en-IN');
    
    document.getElementById("flow-val-essentials").textContent = "₹" + Math.round(split.essential).toLocaleString('en-IN');
    const essentialPct = totalIncome > 0 ? Math.round((split.essential / totalIncome) * 100) : 0;
    document.getElementById("flow-pct-essentials").textContent = essentialPct + "% of Income";

    document.getElementById("flow-val-discretionary").textContent = "₹" + Math.round(split.discretionary).toLocaleString('en-IN');
    const discPct = totalIncome > 0 ? Math.round((split.discretionary / totalIncome) * 100) : 0;
    document.getElementById("flow-pct-discretionary").textContent = discPct + "% of Income";

    document.getElementById("flow-val-avoidable").textContent = "₹" + Math.round(avoidableVal).toLocaleString('en-IN');
    const avoidablePct = split.discretionary > 0 ? Math.round((avoidableVal / split.discretionary) * 100) : 0;
    document.getElementById("flow-pct-avoidable").textContent = avoidablePct + "% of Discretionary";

    document.getElementById("flow-val-savings").textContent = "₹" + Math.round(savingsVal).toLocaleString('en-IN');
    const savingsPct = totalIncome > 0 ? Math.round((savingsVal / totalIncome) * 100) : 0;
    document.getElementById("flow-pct-savings").textContent = savingsPct + "% Savings rate";
  },

  /* ==========================================
     AI INSIGHTS & BEHAVIORS RENDERING
     ========================================== */
  renderAIInsights(state) {
    const grid = document.getElementById("insights-grid-container");
    if (!grid) return;

    grid.innerHTML = "";

    const insights = window.AppAIEngine.generateInsights(state.transactions);
    if (insights.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-state-text">No behavioral insights detected yet. Ensure you have transactions loaded.</div></div>`;
      return;
    }

    insights.forEach(i => {
      const card = document.createElement("div");
      card.className = "insight-card";
      
      const badgeClass = i.confidence === "High" ? "confidence-high" : (i.confidence === "Medium" ? "confidence-medium" : "confidence-low");
      
      // Determine if habit is already in Action Plan
      const isAdded = state.savingGoals.habits.some(h => h.patternId === i.patternId);
      const actionBtnText = isAdded ? "Added to Plan" : "Add to Action Plan";
      const actionBtnDisabled = isAdded ? "disabled" : "";

      card.innerHTML = `
        <div class="insight-header">
          <div class="insight-title">${i.emoji} ${i.title}</div>
          <span class="confidence-badge ${badgeClass}">${i.confidence} Confidence</span>
        </div>
        <div class="insight-evidence">
          ${i.evidence}
          <span class="insight-evidence-sub">${i.comparison}</span>
        </div>
        <div class="insight-reasoning">
          ${i.reasoning}
        </div>
        <div class="insight-recommendation">
          <strong>Coach Recommendation:</strong> ${i.recommendation}
        </div>
        <div class="insight-footer">
          <div class="insight-saving">
            <div>Potential Saving</div>
            <div class="insight-saving-val">₹${i.estimatedSaving}/month</div>
          </div>
          ${i.actionable 
            ? `<button class="btn btn-primary add-insight-goal-btn" data-pattern-id="${i.patternId}" ${actionBtnDisabled}>${actionBtnText}</button>` 
            : `<span style="font-size:0.75rem; color:var(--text-muted);">Informative insight</span>`
          }
        </div>
      `;
      grid.appendChild(card);
    });

    // Add listeners on habit add buttons
    document.querySelectorAll(".add-insight-goal-btn").forEach(btn => {
      btn.onclick = (e) => {
        const patternId = e.currentTarget.getAttribute("data-pattern-id");
        const insight = insights.find(i => i.patternId === patternId);
        if (insight) {
          const added = window.AppState.addHabitGoal({
            patternId: insight.patternId,
            category: insight.category,
            title: insight.title,
            recommendation: insight.recommendation,
            currentText: insight.evidence,
            targetText: `Follow guideline`,
            estimatedSaving: insight.estimatedSaving
          });

          if (added) {
            this.showToast("Savings habit added to your Action Plan!");
            e.currentTarget.textContent = "Added to Plan";
            e.currentTarget.disabled = true;
          } else {
            this.showToast("This habit is already in your Action Plan.", "warning");
          }
        }
      };
    });
  },

  /* ==========================================
     ACTION PLAN SCREEN RENDERING
     ========================================== */
  renderActionPlan(state) {
    const targetInput = document.getElementById("action-savings-target");
    if (targetInput) {
      targetInput.value = state.savingGoals.target;
      
      // Target input change event
      targetInput.onchange = () => {
        window.AppState.updateSavingsTarget(parseFloat(targetInput.value));
        this.showToast("Savings target updated successfully!");
      };
    }

    const habitsList = document.getElementById("action-habits-list");
    if (!habitsList) return;

    habitsList.innerHTML = "";

    const habits = state.savingGoals.habits;
    if (habits.length === 0) {
      habitsList.innerHTML = `
        <div class="empty-state" style="padding: 24px 0;">
          <div class="empty-state-text">No active habits added yet. Go to **AI Insights** or **Savings Simulator** to add habits!</div>
          <button class="btn btn-secondary" onclick="window.AppUIRender.switchScreen('screen-insights')">Browse AI Insights</button>
        </div>
      `;
      document.getElementById("action-achieved-savings").textContent = "₹0 / month";
      return;
    }

    let achievedSavings = 0;
    habits.forEach(h => {
      if (h.status === "completed") achievedSavings += h.estimatedSaving;

      const card = document.createElement("div");
      card.className = "card";
      card.style.marginBottom = "16px";
      card.style.padding = "20px";

      // Status active selection classes
      const sNotStarted = h.status === "not-started" ? "btn-primary" : "btn-secondary";
      const sInProgress = h.status === "in-progress" ? "btn-primary" : "btn-secondary";
      const sCompleted = h.status === "completed" ? "btn-primary" : "btn-secondary";

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="badge badge-expense">${h.category}</span>
              <h3 style="font-size:1rem; font-weight:700;">${h.title}</h3>
            </div>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:8px;">${h.recommendation}</p>
          </div>
          <button class="icon-btn delete-habit-btn" data-habit-id="${h.id}" title="Remove habit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div style="display:flex; gap:16px; font-size:0.8rem; background-color:var(--bg-tertiary); padding:10px; border-radius:8px; margin-bottom:16px;">
          <div style="flex:1;"><strong>Current Behavior:</strong> ${h.currentText}</div>
          <div style="flex:1;"><strong>Target behavior:</strong> ${h.targetText}</div>
          <div style="flex:1; color:var(--success); font-weight:600;"><strong>Est. Save:</strong> ₹${h.estimatedSaving}/mo</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <span style="font-size:0.8rem; color:var(--text-secondary);">Goal habit status:</span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary habit-status-btn ${sNotStarted}" data-habit-id="${h.id}" data-status="not-started" style="padding:6px 12px; font-size:0.75rem;">Not Started</button>
            <button class="btn btn-secondary habit-status-btn ${sInProgress}" data-habit-id="${h.id}" data-status="in-progress" style="padding:6px 12px; font-size:0.75rem;">In Progress</button>
            <button class="btn btn-secondary habit-status-btn ${sCompleted}" data-habit-id="${h.id}" data-status="completed" style="padding:6px 12px; font-size:0.75rem;">Completed</button>
          </div>
        </div>
      `;
      habitsList.appendChild(card);
    });

    document.getElementById("action-achieved-savings").textContent = `₹${achievedSavings.toLocaleString('en-IN')} / month`;

    // Status clicks
    document.querySelectorAll(".habit-status-btn").forEach(btn => {
      btn.onclick = (e) => {
        const id = e.currentTarget.getAttribute("data-habit-id");
        const status = e.currentTarget.getAttribute("data-status");
        window.AppState.updateHabitStatus(id, status);
        this.showToast(`Habit status marked as: ${status}`);
      };
    });

    // Remove habit
    document.querySelectorAll(".delete-habit-btn").forEach(btn => {
      btn.onclick = (e) => {
        const id = e.currentTarget.getAttribute("data-habit-id");
        window.AppState.removeHabitGoal(id);
        this.showToast("Habit goal removed from plan.", "info");
      };
    });
  },

  /* ==========================================
     SAVINGS SIMULATOR RENDERING
     ========================================== */
  renderSimulator(state) {
    const currentTxs = window.AppAnalytics.getTransactionsForMonth(state.transactions, 0);

    // Obtain current bounds to setup sliders range
    // 1. Food orders
    const lateNight = window.AppAnalytics.getLateNightDiscretionary(currentTxs);
    const foodLNCount = lateNight.count;
    const weeklyAvg = Math.round((foodLNCount / 4) * 10) / 10;

    const foodSlider = document.getElementById("sim-slider-food");
    if (foodSlider) {
      foodSlider.max = Math.max(8, Math.ceil(weeklyAvg * 1.5));
      foodSlider.value = Math.round(weeklyAvg);
    }

    // 2. Shopping total
    const currentShopTotal = window.AppAnalytics.calculateTotal(currentTxs, "expense", "Shopping");
    const shopSlider = document.getElementById("sim-slider-shop");
    if (shopSlider) {
      shopSlider.max = Math.max(10000, Math.ceil(currentShopTotal * 1.2));
      shopSlider.value = Math.round(currentShopTotal);
    }

    // 3. Subscription counts
    const subSummary = window.AppAnalytics.getSubscriptionsSummary(currentTxs);
    const subSlider = document.getElementById("sim-slider-sub");
    if (subSlider) {
      subSlider.max = Math.max(6, subSummary.count);
      subSlider.value = subSummary.count;
    }

    // Compute initial output
    this.calculateSimulationSavings();
  },

  /* ==========================================
     AI CHAT ASSISTANT RENDERING
     ========================================== */
  renderAIChat(state) {
    const historyContainer = document.getElementById("chat-msg-history");
    if (!historyContainer) return;

    historyContainer.innerHTML = "";

    // Load messages
    state.chatHistory.forEach(msg => {
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${msg.sender}`;
      
      // Formatting markdown lines (list items and bolding)
      let text = msg.text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');

      bubble.innerHTML = text;
      historyContainer.appendChild(bubble);
    });

    historyContainer.scrollTop = historyContainer.scrollHeight;

    // Handle suggestion pills click
    const pills = document.querySelectorAll(".chat-suggestion-pill");
    pills.forEach(pill => {
      pill.onclick = (e) => {
        const text = e.currentTarget.textContent;
        document.getElementById("chat-box-input").value = text;
        document.getElementById("chat-send-btn").click();
      };
    });
  },

  /* ==========================================
     SETTINGS SCREEN RENDERING
     ========================================== */
  renderSettings(state) {
    const txCountText = document.getElementById("settings-tx-count");
    if (txCountText) txCountText.textContent = `${state.transactions.length} transactions stored`;

    this.updateUserProfileDisplays();
  }
};
