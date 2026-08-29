# Where Did My Money Go? — AI Spending Behavior Analyst

> **"Don't just track your money. Understand your spending behavior."**

An AI-powered personal finance analysis platform that spots hidden spending patterns, detects money leaks (such as late-night food deliveries, micro-transactions, and weekend spikes), provides natural language explanations, interactive savings simulations, and tailored action plans in a secure, multi-user environment with 100% data isolation.

---

## 🌟 Key Features

- **Multi-User Authentication & Isolation**: Secure registration, login, logout, password hashing with bcrypt, session management, and strict SQLite data isolation.
- **What Your Money Is Telling You**: AI-powered narrative summary explaining why spending changed month-over-month.
- **Behavioral Leak Detection**: Uncovers subtle psychological triggers (e.g. Swiggy/Zomato deliveries after 8 PM, recurring unused subscriptions, weekend spikes).
- **Cash Flow Allocation Diagram**: Visual breakdown of Essential vs Discretionary expenses and potential monthly savings.
- **Interactive Savings Simulator**: Dynamic sliders to test how behavioral changes impact your monthly wallet.
- **AI Financial Coach (Chat)**: User-specific AI assistant answering personalized questions regarding your transaction history.
- **Interactive Action Plan**: Turn insights into actionable habits and track your accumulated savings progress.
- **Smart CSV Import**: Flexible column mapping with auto-categorization and duplicate detection.
- **Fictional Demo Dataset Generator**: Pre-loaded with 3 months of realistic behavioral patterns.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express, `node:sqlite` (SQLite Database with WAL mode)
- **Security**: `bcryptjs` (salt rounds: 10), `jsonwebtoken`, `cookie-parser`, Security Headers, Rate Limiting, IDOR protection
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Vanilla CSS Design System (Glassmorphism, Dark Mode)
- **Visuals & Charts**: Chart.js, Lucide Icons

---

## 🚀 1-Click & Cloud Deployment

### Option 1: Render.com (Recommended — 100% Free with Persistent Storage)
1. Go to [dashboard.render.com](https://dashboard.render.com/) and click **New +** -> **Blueprint** or **Web Service**.
2. Select your repository: `https://github.com/parthivlella-ai/AI-AGENT`.
3. Render will automatically read [`render.yaml`](file:///c:/Users/parth/OneDrive/Desktop/agent%20W/render.yaml), install dependencies, attach persistent SQLite storage, and deploy your live URL in under 2 minutes!

### Option 2: Railway.app
1. Go to [railway.app](https://railway.app/) -> **New Project** -> **Deploy from GitHub Repo**.
2. Select `parthivlella-ai/AI-AGENT`.
3. Click **Deploy Now**.

### Option 3: Docker / Self-Hosted VPS / Cloud Run / Fly.io
```bash
# Build Docker image
docker build -t where-did-my-money-go .

# Run container with mounted storage volume
docker run -d -p 8080:8080 -v $(pwd)/data:/app/data --name wdmmg where-did-my-money-go
```

---

## 💻 Local Development

### Installation

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
