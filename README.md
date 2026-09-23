# Where Did My Money Go? — Smart Expense & Budget Tracker

> **"Don't just track your money. Understand your spending behavior."**

A modern personal finance and expense analysis platform that uncovers hidden spending patterns, detects money leaks (such as late-night deliveries, micro-transactions, and weekend spikes), provides natural language explanations, interactive savings simulations, and tailored action plans in a secure, multi-user environment with 100% data isolation.

---

## 🌟 Key Features

- **Simple & Intuitive Entry**: Instant, clear Sign In and Create Account portal upon opening the link, with a 1-click **Live Demo** option to test immediately without signing up.
- **Modern Emerald Green Fintech Theme**: High-contrast, clean visual design system with dark and light modes, zero cognitive clutter, and glassmorphic card elements.
- **Multi-User Authentication & Isolation**: Secure registration, login, logout, password hashing with bcrypt, session tokens, and strict SQLite user isolation.
- **Behavioral Leak Detection**: Automatically identifies psychological triggers (e.g., late-night food deliveries, recurring subscriptions, weekend discretionary spikes).
- **Cash Flow Allocation Diagram**: Visual breakdown of Essential vs Discretionary expenses and potential monthly savings.
- **Interactive Savings Simulator**: Dynamic sliders to test how behavioral changes impact your monthly wallet.
- **Personal Financial Advisor**: Built-in spending coach answering questions regarding your budget and transaction history.
- **Interactive Action Plan**: Turn insights into actionable habits and track your accumulated savings progress.
- **Smart CSV Import**: Flexible column mapping with auto-categorization and duplicate detection.
- **1-Click Full Data Export**: Download your complete personal data archive as a structured JSON file at any time.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express, `node:sqlite` (SQLite Database with WAL mode)
- **Security**: `bcryptjs` (salt rounds: 10), `jsonwebtoken`, `cookie-parser`, Security Headers, Rate Limiting, IDOR protection
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Vanilla CSS Design System (Emerald Mint & Obsidian Graphite)
- **Visuals & Charts**: Chart.js, Lucide Icons

---

## 🌐 Deploying to Render (Zero Configuration & Zero Errors)

This repository is pre-configured for seamless zero-error deployment on **[Render.com](https://render.com/)**:

1. **Push to your GitHub repository**:
   Ensure all changes are pushed to `main`.
2. **Create a new Web Service on Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com/) -> **New +** -> **Web Service**.
   - Connect your GitHub repository.
3. **Deployment Settings**:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Node Version**: Render will automatically detect `.node-version` (`22.12.0`) or you can set `NODE_VERSION=22.12.0` in Environment Variables.
   - **Health Check Path**: `/health`
4. **Deploy**:
   - Click **Deploy Web Service**. The deployment will build and go live in seconds without any errors!

*(Note: Render Blueprint `render.yaml` is also included in the repository for 1-click Infrastructure-as-Code deployment).*

---

## 🚀 Local Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v22.5.0 or higher)

### Running Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/parthivlella-ai/AI-AGENT.git
   cd AI-AGENT
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser at:
   ```text
   http://localhost:8080
   ```

---

## 🔒 Security & Multi-Tenancy

- **Password Hashing**: Uses strong salt hashing via `bcryptjs`.
- **Database Isolation**: All queries filter strictly by `WHERE user_id = current_user.id`.
- **IDOR Protection**: Modifying or deleting records checks resource ownership on every operation.
- **Safe Account Deletion**: Cascading deletion wipes all user transactions, habits, goals, and chat history.

---

## 📄 License
ISC License
