/**
 * analytics.js - Deterministic Analytics Engine
 * Centralizes all statistical calculations to avoid duplication.
 */

window.AppAnalytics = {
  // Get date filters for month offsets: 0 (current), -1 (last month), -2 (two months ago)
  getMonthRange(monthOffset) {
    const today = new Date();
    const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    
    const start = new Date(year, month, 1);
    const end = (monthOffset === 0) ? new Date(today) : new Date(year, month + 1, 0, 23, 59, 59, 999);
    
    return { start, end };
  },

  // Filter transactions by date range
  filterByDateRange(transactions, start, end) {
    return transactions.filter(tx => {
      const txDate = new Date(tx.date + "T" + (tx.time || "00:00"));
      return txDate >= start && txDate <= end;
    });
  },

  // Filter transactions for a given month offset
  getTransactionsForMonth(transactions, monthOffset) {
    const { start, end } = this.getMonthRange(monthOffset);
    return this.filterByDateRange(transactions, start, end);
  },

  // Calculate totals
  calculateTotal(transactions, type = "expense", category = null) {
    return transactions
      .filter(tx => tx.type === type && (!category || tx.category === category))
      .reduce((sum, tx) => sum + tx.amount, 0);
  },

  // Essential vs Discretionary classification
  isEssential(category) {
    const essentials = ["Bills", "Groceries", "Healthcare", "Education", "Salary"];
    return essentials.includes(category);
  },

  getEssentialDiscretionarySplit(transactions) {
    let essential = 0;
    let discretionary = 0;

    transactions.forEach(tx => {
      if (tx.type === "expense") {
        if (this.isEssential(tx.category)) {
          essential += tx.amount;
        } else {
          discretionary += tx.amount;
        }
      }
    });

    return { essential, discretionary };
  },

  // Category summary mapping
  getCategoryBreakdown(transactions, type = "expense") {
    const map = {};
    transactions.forEach(tx => {
      if (tx.type === type) {
        map[tx.category] = (map[tx.category] || 0) + tx.amount;
      }
    });

    return Object.keys(map).map(category => ({
      category,
      amount: map[category],
      percentage: 0 // Will be set relative to total
    })).sort((a, b) => b.amount - a.amount);
  },

  // Merchant summary mapping
  getMerchantBreakdown(transactions, limit = 5) {
    const map = {};
    transactions.forEach(tx => {
      if (tx.type === "expense") {
        map[tx.merchant] = (map[tx.merchant] || 0) + tx.amount;
      }
    });

    return Object.keys(map).map(merchant => ({
      merchant,
      amount: map[merchant]
    })).sort((a, b) => b.amount - a.amount).slice(0, limit);
  },

  // Time-of-day analytics
  // Morning (5:00 - 11:59), Afternoon (12:00 - 16:59), Evening (17:00 - 20:59), Late-Night (21:00 - 4:59)
  getTimeOfDaySegments(transactions) {
    const segments = { morning: 0, afternoon: 0, evening: 0, lateNight: 0 };
    
    transactions.forEach(tx => {
      if (tx.type === "expense") {
        const time = tx.time || "12:00";
        const hour = parseInt(time.split(":")[0]);
        
        if (hour >= 5 && hour < 12) segments.morning += tx.amount;
        else if (hour >= 12 && hour < 17) segments.afternoon += tx.amount;
        else if (hour >= 17 && hour < 21) segments.evening += tx.amount;
        else segments.lateNight += tx.amount;
      }
    });
    
    return segments;
  },

  // Weekday vs Weekend spending
  // Weekend = Sat (6) & Sun (0)
  getWeekdayWeekendSplit(transactions) {
    let weekday = 0;
    let weekend = 0;
    let weekdayDays = 0;
    let weekendDays = 0;

    // Track unique days to calculate daily averages correctly
    const uniqueWeekdayDates = new Set();
    const uniqueWeekendDates = new Set();

    transactions.forEach(tx => {
      if (tx.type === "expense") {
        const d = new Date(tx.date);
        const day = d.getDay();
        if (day === 0 || day === 6) {
          weekend += tx.amount;
          uniqueWeekendDates.add(tx.date);
        } else {
          weekday += tx.amount;
          uniqueWeekdayDates.add(tx.date);
        }
      }
    });

    weekdayDays = uniqueWeekdayDates.size || 1;
    weekendDays = uniqueWeekendDates.size || 1;

    return {
      weekdayTotal: weekday,
      weekendTotal: weekend,
      weekdayAverage: weekday / weekdayDays,
      weekendAverage: weekend / weekendDays
    };
  },

  // Micro-spending totals (< ₹200)
  getMicroSpending(transactions, threshold = 200) {
    const microTxs = transactions.filter(tx => tx.type === "expense" && tx.amount <= threshold);
    const total = microTxs.reduce((sum, tx) => sum + tx.amount, 0);
    return {
      count: microTxs.length,
      total,
      average: microTxs.length ? (total / microTxs.length) : 0
    };
  },

  // Late-night discretionary spending (8 PM to 4 AM)
  getLateNightDiscretionary(transactions) {
    const lateNightTxs = transactions.filter(tx => {
      if (tx.type !== "expense") return false;
      // Exclude essentials like Rent/Bills/Healthcare
      if (tx.category === "Bills" || tx.category === "Healthcare") return false;
      
      const hour = parseInt((tx.time || "12:00").split(":")[0]);
      return (hour >= 20 || hour < 4);
    });

    const total = lateNightTxs.reduce((sum, tx) => sum + tx.amount, 0);
    return {
      count: lateNightTxs.length,
      total,
      transactions: lateNightTxs
    };
  },

  // Get month over month change totals
  getMoMChange(transactions) {
    const currentTxs = this.getTransactionsForMonth(transactions, 0);
    const lastTxs = this.getTransactionsForMonth(transactions, -1);

    const currentTotal = this.calculateTotal(currentTxs, "expense");
    const lastTotal = this.calculateTotal(lastTxs, "expense");

    const diff = currentTotal - lastTotal;
    const percentage = lastTotal > 0 ? (diff / lastTotal) * 100 : 0;

    return {
      currentTotal,
      lastTotal,
      diff,
      percentage
    };
  },

  // Average daily spending (excluding large one-offs like Rent)
  getAverageDailySpending(transactions, monthOffset = 0) {
    const txs = this.getTransactionsForMonth(transactions, monthOffset)
      .filter(tx => tx.type === "expense" && tx.category !== "Bills"); // Exclude rent/utility big hits
    
    const total = txs.reduce((sum, tx) => sum + tx.amount, 0);
    const today = new Date();
    
    let days = today.getDate(); // Default current month days elapsed
    if (monthOffset < 0) {
      const { start, end } = this.getMonthRange(monthOffset);
      days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    }

    return days > 0 ? (total / days) : 0;
  },

  // Recurring subscriptions detection
  // Detects regular monthly spending in the Subscriptions category
  getSubscriptionsSummary(transactions) {
    const subTxs = transactions.filter(tx => tx.category === "Subscriptions" && tx.type === "expense");
    const total = subTxs.reduce((sum, tx) => sum + tx.amount, 0);
    
    // Group by merchant to identify distinct subscriptions
    const merchMap = {};
    subTxs.forEach(tx => {
      merchMap[tx.merchant] = (merchMap[tx.merchant] || 0) + tx.amount;
    });

    const list = Object.keys(merchMap).map(merchant => ({
      merchant,
      amount: merchMap[merchant]
    }));

    return {
      total,
      count: list.length,
      list
    };
  },

  // Dynamic Spending Awareness Score Calculation (0-100)
  calculateSpendingScore(transactions, habits = []) {
    let score = 85; // Starting baseline

    const currentTxs = this.getTransactionsForMonth(transactions, 0);
    if (currentTxs.length === 0) return 100; // Empty state perfect score

    // 1. Penalty for micro-spending excess (under ₹200)
    const micro = this.getMicroSpending(currentTxs);
    if (micro.count > 20) {
      score -= 10;
    } else if (micro.count > 10) {
      score -= 5;
    }

    // 2. Penalty for late-night discretionary purchases
    const lateNight = this.getLateNightDiscretionary(currentTxs);
    if (lateNight.count > 10) {
      score -= 15;
    } else if (lateNight.count > 5) {
      score -= 8;
    }

    // 3. Penalty for high weekend skew
    const weekendStats = this.getWeekdayWeekendSplit(currentTxs);
    if (weekendStats.weekendAverage > weekendStats.weekdayAverage * 1.5) {
      score -= 10;
    }

    // 4. Penalty for high discretionary spending overhead
    const split = this.getEssentialDiscretionarySplit(currentTxs);
    const totalExpense = split.essential + split.discretionary;
    if (totalExpense > 0) {
      const discretionaryRatio = split.discretionary / totalExpense;
      if (discretionaryRatio > 0.6) {
        score -= 15;
      } else if (discretionaryRatio > 0.4) {
        score -= 8;
      }
    }

    // 5. Subscription overload
    const subs = this.getSubscriptionsSummary(currentTxs);
    if (subs.count > 5) {
      score -= 10;
    } else if (subs.count > 3) {
      score -= 5;
    }

    // 6. Bonus for positive Action Plan progress
    const activeHabits = habits;
    const completedCount = activeHabits.filter(h => h.status === "completed").length;
    score += (completedCount * 8); // Max +24 points

    // Constrain score
    return Math.max(10, Math.min(100, Math.round(score)));
  },

  // "Why did my spending increase?" comparison utility
  getSpendingIncreaseTree(transactions) {
    const currentTxs = this.getTransactionsForMonth(transactions, 0);
    const lastTxs = this.getTransactionsForMonth(transactions, -1);

    const currentCatMap = {};
    const lastCatMap = {};

    currentTxs.forEach(tx => {
      if (tx.type === "expense") {
        currentCatMap[tx.category] = (currentCatMap[tx.category] || 0) + tx.amount;
      }
    });

    lastTxs.forEach(tx => {
      if (tx.type === "expense") {
        lastCatMap[tx.category] = (lastCatMap[tx.category] || 0) + tx.amount;
      }
    });

    const allCategories = new Set([...Object.keys(currentCatMap), ...Object.keys(lastCatMap)]);
    const comparisons = [];

    allCategories.forEach(category => {
      const currentVal = currentCatMap[category] || 0;
      const lastVal = lastCatMap[category] || 0;
      const difference = currentVal - lastVal;

      if (difference !== 0) {
        // Find reasons (e.g. food delivery frequency change)
        let reason = "";
        if (category === "Food") {
          const curDeliveries = currentTxs.filter(t => t.category === "Food" && (t.merchant.toLowerCase().includes("swiggy") || t.merchant.toLowerCase().includes("zomato")));
          const lastDeliveries = lastTxs.filter(t => t.category === "Food" && (t.merchant.toLowerCase().includes("swiggy") || t.merchant.toLowerCase().includes("zomato")));
          const countDiff = curDeliveries.length - lastDeliveries.length;
          
          if (countDiff > 0) {
            reason = `Ordered food delivery ${countDiff} more times than last month.`;
          } else {
            const curAvg = curDeliveries.length ? (curDeliveries.reduce((s, t) => s + t.amount, 0) / curDeliveries.length) : 0;
            const lastAvg = lastDeliveries.length ? (lastDeliveries.reduce((s, t) => s + t.amount, 0) / lastDeliveries.length) : 0;
            if (curAvg > lastAvg) {
              reason = `Average food order value increased by ₹${Math.round(curAvg - lastAvg)}.`;
            }
          }
        } else if (category === "Shopping") {
          const curShop = currentTxs.filter(t => t.category === "Shopping");
          const lastShop = lastTxs.filter(t => t.category === "Shopping");
          const diffCount = curShop.length - lastShop.length;
          if (diffCount > 0) {
            reason = `Made ${diffCount} extra shopping purchases.`;
          } else {
            reason = `Made higher-value discretionary purchases this month.`;
          }
        } else if (category === "Other") {
          const curMicro = currentTxs.filter(t => t.category === "Other" && t.amount < 200).length;
          const lastMicro = lastTxs.filter(t => t.category === "Other" && t.amount < 200).length;
          if (curMicro > lastMicro) {
            reason = `Micro UPI purchases (<₹200) increased by ${curMicro - lastMicro} transactions.`;
          }
        }

        comparisons.push({
          category,
          currentVal,
          lastVal,
          difference,
          reason: reason || `Net change in category transaction volumes.`
        });
      }
    });

    // Sort by largest increase
    comparisons.sort((a, b) => b.difference - a.difference);

    return comparisons;
  }
};
