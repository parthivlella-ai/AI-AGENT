/**
 * demo-data.js - Demo Data Generator
 * Generates 3 months of realistic transaction histories relative to the current date.
 * Features specific behavioral patterns for the AI engine to detect.
 */

window.DemoData = {
  loadDemoData() {
    const today = new Date();
    const transactions = [];

    // Helper to generate IDs
    const makeId = () => "tx_demo_" + Math.random().toString(36).substr(2, 9);

    // Generate for Month 0 (current), Month -1 (previous), Month -2 (two months ago)
    for (let m = -2; m <= 0; m++) {
      const year = today.getFullYear();
      const month = today.getMonth() + m;
      
      // Calculate start and end date for target month
      const targetMonthStart = new Date(year, month, 1);
      const targetMonthEnd = new Date(year, month + 1, 0);
      
      // Determine final date to populate in target month
      // For current month, stop at today; for past months, run to end of month
      const maxDay = (m === 0) ? today.getDate() : targetMonthEnd.getDate();

      // Format date helper
      const getFormattedDate = (day) => {
        const d = new Date(year, month, day);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      // 1. Income (Essential)
      // Credit on 1st of month
      transactions.push({
        id: makeId(),
        amount: 38000.00,
        date: getFormattedDate(1),
        time: "10:30",
        merchant: "ACME Corp Salary",
        category: "Salary",
        type: "income",
        payment_method: "Bank Transfer",
        notes: "Monthly paycheck"
      });

      // 2. Rent (Essential)
      // Debit on 3rd of month
      transactions.push({
        id: makeId(),
        amount: 11500.00,
        date: getFormattedDate(3),
        time: "11:00",
        merchant: "Landlord Sharma",
        category: "Bills",
        type: "expense",
        payment_method: "UPI",
        notes: "Monthly apartment rent"
      });

      // 3. Subscriptions (Discretionary)
      // Recurring on fixed days
      transactions.push({
        id: makeId(),
        amount: 649.00,
        date: getFormattedDate(5),
        time: "08:15",
        merchant: "Netflix India",
        category: "Subscriptions",
        type: "expense",
        payment_method: "Credit Card",
        notes: "Premium Ultra HD Plan"
      });

      transactions.push({
        id: makeId(),
        amount: 119.00,
        date: getFormattedDate(10),
        time: "09:00",
        merchant: "Spotify Premium",
        category: "Subscriptions",
        type: "expense",
        payment_method: "UPI",
        notes: "Individual monthly subscription"
      });

      transactions.push({
        id: makeId(),
        amount: 130.00,
        date: getFormattedDate(15),
        time: "07:30",
        merchant: "Google One",
        category: "Subscriptions",
        type: "expense",
        payment_method: "UPI",
        notes: "100GB Storage plan"
      });

      transactions.push({
        id: makeId(),
        amount: 189.00,
        date: getFormattedDate(20),
        time: "18:00",
        merchant: "YouTube Premium",
        category: "Subscriptions",
        type: "expense",
        payment_method: "Credit Card",
        notes: "Family plan subscription"
      });

      // 4. Groceries (Essential)
      // Regular Blinkit / Local supermarket
      const groceryDays = [6, 13, 21, 27];
      groceryDays.forEach(day => {
        if (day <= maxDay) {
          transactions.push({
            id: makeId(),
            amount: Math.round(400 + Math.random() * 800),
            date: getFormattedDate(day),
            time: "17:45",
            merchant: "Blinkit Grocery",
            category: "Groceries",
            type: "expense",
            payment_method: "UPI",
            notes: "Weekly kitchen supplies"
          });
        }
      });

      // 5. Late-night food delivery pattern (Discretionary, Spikes in current month)
      // We trigger late-night delivery: 8 PM - 11:30 PM.
      // Current Month (0): Spends ₹2,400 across 13 transactions
      // Previous Month (-1): Spends ₹1,450 across 8 transactions
      // Two Months Ago (-2): Spends ₹900 across 5 transactions
      let foodOrdersCount = 5;
      let averageFoodAmount = 180;
      if (m === -1) {
        foodOrdersCount = 8;
        averageFoodAmount = 210;
      } else if (m === 0) {
        foodOrdersCount = 14;
        averageFoodAmount = 245;
      }

      // Distribute late night orders across the month days
      // E.g. every few days, mostly Thursdays/Fridays/Saturdays
      for (let i = 1; i <= foodOrdersCount; i++) {
        const day = Math.min(maxDay, Math.round((i * (maxDay / foodOrdersCount)) - (Math.random() * 2)));
        const finalDay = Math.max(1, day);
        if (finalDay <= maxDay) {
          // Late night hours: 20:00 to 23:45
          const hour = Math.floor(20 + Math.random() * 4);
          const minute = String(Math.floor(Math.random() * 60)).padStart(2, '0');
          const merchant = Math.random() > 0.5 ? "Swiggy Food" : "Zomato";
          const amount = Math.round(averageFoodAmount - 40 + Math.random() * 80);
          
          transactions.push({
            id: makeId(),
            amount: amount,
            date: getFormattedDate(finalDay),
            time: `${hour}:${minute}`,
            merchant: merchant,
            category: "Food",
            type: "expense",
            payment_method: "UPI",
            notes: "Late night dinner delivery"
          });
        }
      }

      // 6. Weekend Shopping Spike (Discretionary, higher averages on Sat/Sun)
      // Iterate through days, check if Sat/Sun
      for (let d = 1; d <= maxDay; d++) {
        const currDate = new Date(year, month, d);
        const dayOfWeek = currDate.getDay(); // 0 = Sun, 6 = Sat
        
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          // Weekend! Let's add Shopping/Entertainment transactions
          const shoppingChance = m === 0 ? 0.45 : 0.3; // Higher shopping in current month
          if (Math.random() < shoppingChance) {
            const amount = Math.round(700 + Math.random() * 1500);
            const merchant = Math.random() > 0.5 ? "Amazon.in" : "Flipkart";
            transactions.push({
              id: makeId(),
              amount: amount,
              date: getFormattedDate(d),
              time: "15:30",
              merchant: merchant,
              category: "Shopping",
              type: "expense",
              payment_method: "Credit Card",
              notes: "Weekend shopping haul"
            });
          }

          if (Math.random() < 0.4) {
            const amount = Math.round(350 + Math.random() * 700);
            transactions.push({
              id: makeId(),
              amount: amount,
              date: getFormattedDate(d),
              time: "20:15",
              merchant: "PVR Cinemas / Local Pub",
              category: "Entertainment",
              type: "expense",
              payment_method: "UPI",
              notes: "Weekend outing"
            });
          }
        }
      }

      // 7. Transportation (Essential / Discretionary mix)
      // Occasional Uber/Ola rides during the week
      for (let d = 4; d <= maxDay; d += 5) {
        if (d <= maxDay) {
          const amount = Math.round(150 + Math.random() * 250);
          const merchant = Math.random() > 0.5 ? "Uber India" : "Ola Rides";
          transactions.push({
            id: makeId(),
            amount: amount,
            date: getFormattedDate(d),
            time: "09:15",
            merchant: merchant,
            category: "Transportation",
            type: "expense",
            payment_method: "UPI",
            notes: "Commute to office"
          });
        }
      }

      // 8. Micro-spending Pattern (UPI transfers < ₹150)
      // Tea, snacks, small local buys
      const microPurchasesCount = m === 0 ? 25 : 18; // More in current month
      for (let i = 1; i <= microPurchasesCount; i++) {
        const day = Math.min(maxDay, Math.max(1, Math.round(Math.random() * maxDay)));
        if (day <= maxDay) {
          const hour = String(Math.floor(8 + Math.random() * 12)).padStart(2, '0');
          const minute = String(Math.floor(Math.random() * 60)).padStart(2, '0');
          const merchants = ["Chai Tapri Corner", "Local Pan Shop", "Auto Rickshaw Fare", "Omelette Stall", "Momo Junction", "Fruit Vendor", "Mother Dairy"];
          const merchant = merchants[Math.floor(Math.random() * merchants.length)];
          const amount = Math.round(20 + Math.random() * 95);

          transactions.push({
            id: makeId(),
            amount: amount,
            date: getFormattedDate(day),
            time: `${hour}:${minute}`,
            merchant: merchant,
            category: "Other",
            type: "expense",
            payment_method: "UPI",
            notes: "Quick micro expense"
          });
        }
      }
    }

    // Set inside AppState
    window.AppState.transactions = transactions;
    window.AppState.sortTransactions();

    // Setup action plan items (defaults matching patterns)
    window.AppState.savingGoals.target = 2500;
    window.AppState.savingGoals.habits = [
      {
        id: "habit_demo_1",
        patternId: "late_night_food",
        category: "Food",
        title: "Reduce late-night food orders",
        recommendation: "Limit late-night delivery orders (8 PM - 4 AM) from 4 times/week to 2.",
        currentText: "4 orders / week average",
        targetText: "2 orders / week",
        estimatedSaving: 1100.00,
        status: "in-progress"
      },
      {
        id: "habit_demo_2",
        patternId: "weekend_shopping",
        category: "Shopping",
        title: "Cap weekend shopping spree",
        recommendation: "Set a weekend discretionary budget of maximum ₹1,000 per Saturday/Sunday.",
        currentText: "₹1,850 / weekend average",
        targetText: "₹1,000 / weekend",
        estimatedSaving: 650.00,
        status: "not-started"
      }
    ];

    window.AppState.chatHistory = [
      {
        sender: "assistant",
        text: "Hi! I'm your AI financial behavior analyst. I've loaded your transaction history for the past 3 months. Let me know if you want to know where your money actually went!",
        timestamp: new Date().toISOString()
      }
    ];

    // If user is authenticated, sync to backend
    if (window.AppAuth && window.AppAuth.isAuthenticated) {
      window.AppState.loadDemoTransactions(transactions).then(() => {
        // Add default demo habits to DB
        window.AppState.addHabitGoal(window.AppState.savingGoals.habits[0]);
        window.AppState.addHabitGoal(window.AppState.savingGoals.habits[1]);
        window.AppState.addChatMessage("assistant", "Hi! I've loaded your demo dataset. Ask me anything about your spending behavior!");
      }).catch(e => console.warn("Demo sync warning", e));
    }

    window.AppState.notify();
    return true;
  }
};

