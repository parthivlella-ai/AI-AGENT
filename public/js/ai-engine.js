/**
 * ai-engine.js - AI Reasoning Layer
 * Explains deterministic facts, generates savings advice, and answers chat prompts.
 */

window.AppAIEngine = {
  // Generate Month in One Story (concise natural-language summary)
  generateMonthStory(transactions) {
    const currentTxs = window.AppAnalytics.getTransactionsForMonth(transactions, 0);
    if (currentTxs.length === 0) {
      return "Your financial story is waiting for transactions! Add some transactions manually or upload a CSV, and I'll analyze your spending behavior.";
    }

    const mom = window.AppAnalytics.getMoMChange(transactions);
    const catBreakdown = window.AppAnalytics.getCategoryBreakdown(currentTxs);
    const timeOfDay = window.AppAnalytics.getTimeOfDaySegments(currentTxs);
    const weekdayWeekend = window.AppAnalytics.getWeekdayWeekendSplit(currentTxs);
    const micro = window.AppAnalytics.getMicroSpending(currentTxs);
    const lateNight = window.AppAnalytics.getLateNightDiscretionary(currentTxs);

    let story = "";

    // MoM Trend
    if (mom.lastTotal === 0) {
      story += `You spent a total of ₹${Math.round(mom.currentTotal)} this month. Since there is no historical baseline, I will start tracking your behaviors from now. `;
    } else {
      const direction = mom.diff > 0 ? "more" : "less";
      story += `You spent ₹${Math.round(mom.currentTotal)} this month, which is ${Math.round(Math.abs(mom.percentage))}% (${direction} by ₹${Math.round(Math.abs(mom.diff))}) compared to last month. `;
    }

    // Top Category
    if (catBreakdown.length > 0) {
      const topCat = catBreakdown[0];
      story += `Your largest spending category was **${topCat.category}**, representing ₹${Math.round(topCat.amount)} (${Math.round((topCat.amount / mom.currentTotal) * 100)}% of your expenses). `;
    }

    // Temporal Peak
    const peakSegments = Object.keys(timeOfDay).sort((a, b) => timeOfDay[b] - timeOfDay[a]);
    const peakTextMap = {
      morning: "morning (5 AM - 12 PM)",
      afternoon: "afternoon (12 PM - 5 PM)",
      evening: "evening (5 PM - 8 PM)",
      lateNight: "late-night (9 PM - 5 AM)"
    };
    story += `Your highest spending period of the day was during the **${peakTextMap[peakSegments[0]]}**. `;

    // Weekend Skew
    if (weekdayWeekend.weekendTotal > 0) {
      const weekendPercent = Math.round((weekdayWeekend.weekendTotal / mom.currentTotal) * 100);
      story += `Weekend expenditures accounted for **${weekendPercent}%** of your total budget. `;
      if (weekdayWeekend.weekendAverage > weekdayWeekend.weekdayAverage * 1.3) {
        story += `Your average weekend spending is notably higher (₹${Math.round(weekdayWeekend.weekendAverage)} vs ₹${Math.round(weekdayWeekend.weekdayAverage)} during weekdays), indicating a shopping or dining out pattern. `;
      }
    }

    // Specific Money Leaks
    const avoidable = (lateNight.total * 0.5) + (micro.count > 15 ? micro.total * 0.3 : 0);
    if (avoidable > 500) {
      story += `I detected approximately **₹${Math.round(avoidable)}** in potentially avoidable spending, mostly from late-night deliveries (₹${Math.round(lateNight.total)}) and micro-purchases under ₹200. `;
    }

    story += `If this trajectory continues, your discretionary overhead is expected to remain elevated next month. I suggest starting a saving habit in the Action Plan.`;

    return story;
  },

  // Compile prioritized list of AI behavior insights
  generateInsights(transactions) {
    const currentTxs = window.AppAnalytics.getTransactionsForMonth(transactions, 0);
    const lastTxs = window.AppAnalytics.getTransactionsForMonth(transactions, -1);
    const insights = [];

    if (currentTxs.length === 0) return insights;

    const currentTotal = window.AppAnalytics.calculateTotal(currentTxs, "expense");

    // 1. Late Night Food Delivery Insight
    const lateNight = window.AppAnalytics.getLateNightDiscretionary(currentTxs);
    const foodLateNightTxs = lateNight.transactions.filter(t => t.category === "Food");
    const foodLateNightTotal = foodLateNightTxs.reduce((sum, t) => sum + t.amount, 0);
    
    if (foodLateNightTxs.length >= 4) {
      // Historical comparison
      const lastLN = window.AppAnalytics.getLateNightDiscretionary(lastTxs);
      const lastFoodLN = lastLN.transactions.filter(t => t.category === "Food");
      const lastFoodLNTotal = lastFoodLN.reduce((sum, t) => sum + t.amount, 0);
      const diffPercent = lastFoodLNTotal > 0 ? Math.round(((foodLateNightTotal - lastFoodLNTotal) / lastFoodLNTotal) * 100) : 0;
      
      const averageOrder = Math.round(foodLateNightTotal / foodLateNightTxs.length);
      const weeklyAvg = Math.round((foodLateNightTxs.length / 4) * 10) / 10;
      const targetWeekly = 2;
      const estimatedSaving = Math.max(0, (weeklyAvg - targetWeekly) * 4 * averageOrder);

      insights.push({
        patternId: "late_night_food",
        category: "Food",
        emoji: "🍔",
        title: "Late-night food orders",
        evidence: `₹${foodLateNightTotal.toLocaleString('en-IN')} across ${foodLateNightTxs.length} transactions`,
        comparison: diffPercent > 0 ? `+${diffPercent}% compared to last month` : `Active spending pattern`,
        reasoning: `Your late-night discretionary purchases after 8 PM average ₹${averageOrder} per order, occurring ${weeklyAvg} times per week. Most orders are placed at Swiggy/Zomato.`,
        recommendation: `Try limiting food deliveries after 8 PM to 2 times per week. Cook simple dinners or prep snacks beforehand.`,
        estimatedSaving: Math.round(estimatedSaving || 1100),
        confidence: foodLateNightTxs.length > 8 ? "High" : "Medium",
        actionable: true
      });
    }

    // 2. Weekend Spending Spike
    const weekendStats = window.AppAnalytics.getWeekdayWeekendSplit(currentTxs);
    if (weekendStats.weekendTotal > 1500 && weekendStats.weekendAverage > weekendStats.weekdayAverage * 1.35) {
      const multiplier = Math.round((weekendStats.weekendAverage / weekendStats.weekdayAverage) * 10) / 10;
      const weekendsCount = 4; // average weekends in month
      const targetWeekendLimit = Math.round(weekendStats.weekdayAverage * 1.5);
      const estimatedSaving = Math.max(0, weekendStats.weekendTotal - (targetWeekendLimit * weekendsCount));

      insights.push({
        patternId: "weekend_shopping",
        category: "Shopping",
        emoji: "🛍️",
        title: "Weekend spending spike",
        evidence: `Weekend average is ${multiplier}x higher than weekdays`,
        comparison: `₹${Math.round(weekendStats.weekendAverage)}/weekend vs. ₹${Math.round(weekendStats.weekdayAverage)}/weekday`,
        reasoning: `Discretionary shopping and entertainment expenses peak dramatically on Saturdays and Sundays (totaling ₹${Math.round(weekendStats.weekendTotal)}).`,
        recommendation: `Establish a weekend spending limit of ₹${targetWeekendLimit} per Saturday/Sunday. Use apps to track weekend limits separately.`,
        estimatedSaving: Math.round(estimatedSaving || 900),
        confidence: "High",
        actionable: true
      });
    }

    // 3. Subscription Creep
    const subs = window.AppAnalytics.getSubscriptionsSummary(currentTxs);
    if (subs.count >= 3) {
      insights.push({
        patternId: "subscriptions_leak",
        category: "Subscriptions",
        emoji: "⚠️",
        title: "Subscription leak",
        evidence: `₹${subs.total.toLocaleString('en-IN')} on ${subs.count} recurring services`,
        comparison: `Fixed monthly overhead`,
        reasoning: `You spent a total of ₹${subs.total} on subscriptions this month (including ${subs.list.map(s => s.merchant).join(', ')}).`,
        recommendation: `Review your subscriptions. Temporarily cancel services you haven't watched or listened to in the last 14 days.`,
        estimatedSaving: Math.round(subs.total * 0.3), // assume 30% saving on cancel
        confidence: "High",
        actionable: true
      });
    }

    // 4. Micro-spending accumulation
    const micro = window.AppAnalytics.getMicroSpending(currentTxs);
    if (micro.count > 15) {
      const estimatedSaving = Math.round(micro.total * 0.25); // Target 25% reduction
      insights.push({
        patternId: "micro_spending",
        category: "Other",
        emoji: "☕",
        title: "Frequent micro-spending",
        evidence: `₹${micro.total.toLocaleString('en-IN')} across ${micro.count} small transactions`,
        comparison: `Purchases under ₹200 each`,
        reasoning: `Small cash transfers via UPI (averaging ₹${Math.round(micro.average)} for chai, snacks, etc.) add up to ₹${micro.total} this month.`,
        recommendation: `Consolidate purchases or keep a dedicated daily UPI budget of ₹100 for pocket cash.`,
        estimatedSaving: estimatedSaving,
        confidence: "High",
        actionable: true
      });
    }

    // 5. Merchant dependency (e.g. Swiggy accounts for high discretionary %)
    const merchants = window.AppAnalytics.getMerchantBreakdown(currentTxs, 3);
    if (merchants.length > 0 && currentTotal > 0) {
      const topMerchant = merchants[0];
      const percent = Math.round((topMerchant.amount / currentTotal) * 100);
      if (percent > 20 && topMerchant.merchant !== "Rent" && !topMerchant.merchant.includes("Salary")) {
        insights.push({
          patternId: `merchant_${topMerchant.merchant.replace(/\s+/g, '_')}`,
          category: "Other",
          emoji: "🏢",
          title: `Merchant dependency: ${topMerchant.merchant}`,
          evidence: `₹${topMerchant.amount.toLocaleString('en-IN')} spent with this merchant`,
          comparison: `${percent}% of total monthly spending`,
          reasoning: `Your transactions are heavily centered around ${topMerchant.merchant}, indicating high dependency on a single provider for discretionary services.`,
          recommendation: `Evaluate alternatives or check if subscribing to their VIP/membership plan offers discounts to lower transactional costs.`,
          estimatedSaving: Math.round(topMerchant.amount * 0.1), // 10% potential savings
          confidence: "Medium",
          actionable: false
        });
      }
    }

    // Fallback if data is too small
    if (insights.length === 0) {
      insights.push({
        patternId: "insufficient_data",
        category: "General",
        emoji: "📊",
        title: "Not enough behavior patterns detected",
        evidence: "Fewer than 10 transactions recorded this month",
        comparison: "Build history",
        reasoning: "I need to observe more transactions over at least a couple of weeks to confidently detect spending behaviors and leaks.",
        recommendation: "Please add a few more transactions manually, import a CSV, or load the demo data to see the behavioral analyst in action.",
        estimatedSaving: 0,
        confidence: "Low",
        actionable: false
      });
    }

    // Prioritize by potential savings (descending)
    return insights.sort((a, b) => b.estimatedSaving - a.estimatedSaving);
  },

  // Parse questions and return data-backed responses
  chatRespond(query, transactions) {
    const q = query.toLowerCase().trim();
    const currentTxs = window.AppAnalytics.getTransactionsForMonth(transactions, 0);

    if (currentTxs.length === 0) {
      return "I don't have enough transaction data to answer your question yet. Please add some transactions or click **Load Demo Data** under settings to start exploring!";
    }

    // 1. Swiggy / Zomato / Uber / Amazon specific query check
    const merchantMatch = q.match(/spend on (swiggy|zomato|uber|amazon|ola|flipkart|netflix|spotify)/i);
    if (merchantMatch) {
      const merchantName = merchantMatch[1];
      const matchTxs = currentTxs.filter(t => t.merchant.toLowerCase().includes(merchantName));
      const total = matchTxs.reduce((sum, t) => sum + t.amount, 0);
      
      if (matchTxs.length > 0) {
        return `You spent a total of **₹${total.toLocaleString('en-IN')}** at **${merchantName.toUpperCase()}** this month across **${matchTxs.length}** transactions.
        
This represents about **${Math.round((total / window.AppAnalytics.calculateTotal(currentTxs, "expense")) * 100)}%** of your monthly spending. ${total > 1500 ? "Limiting orders or consolidation here could save you significant money!" : ""}`;
      } else {
        return `You have not spent anything at **${merchantName.toUpperCase()}** this month, according to your transactions.`;
      }
    }

    // 2. Spending increase check
    if (q.includes("why did i spend more") || q.includes("spending increase") || q.includes("why did my spending increase")) {
      const mom = window.AppAnalytics.getMoMChange(transactions);
      if (mom.lastTotal === 0) {
        return "I can't calculate a spending increase because I don't see any transactions from last month to compare against.";
      }
      if (mom.diff <= 0) {
        return `Good news! You actually spent **₹${Math.round(Math.abs(mom.diff))} less** this month compared to last month (₹${Math.round(mom.currentTotal)} vs. ₹${Math.round(mom.lastTotal)}). Great job controlling your budget!`;
      }

      const diffTree = window.AppAnalytics.getSpendingIncreaseTree(transactions);
      let response = `Your spending increased by **₹${Math.round(mom.diff)}** (+${Math.round(mom.percentage)}%) this month. 
      
Here are the primary categories that drove this increase:
`;
      diffTree.slice(0, 3).forEach((item, index) => {
        response += `\n${index + 1}. **${item.category}**: +₹${Math.round(item.difference)} (Current: ₹${Math.round(item.currentVal)} vs Last: ₹${Math.round(item.lastVal)})
   *Reasoning*: ${item.reason}
`;
      });

      return response;
    }

    // 3. Where can I save X rupee check
    const savingMatch = q.match(/save (?:rs\.?|₹)?\s?(\d+)/i);
    if (savingMatch || q.includes("where can i save") || q.includes("how to save")) {
      const targetAmount = savingMatch ? parseInt(savingMatch[1]) : 2000;
      const insights = this.generateInsights(transactions).filter(i => i.actionable);
      
      let totalPotential = insights.reduce((sum, i) => sum + i.estimatedSaving, 0);
      let response = `To save **₹${targetAmount.toLocaleString('en-IN')}** this month, here are the highest-impact behavioral adjustments you can make based on your transactions:
      
`;
      let runningSum = 0;
      insights.forEach((i, idx) => {
        if (runningSum < targetAmount * 1.5) {
          response += `* **${i.title}**: ${i.recommendation}
  *Impact*: Save approximately **₹${i.estimatedSaving}/month** (Confidence: ${i.confidence})
  
`;
          runningSum += i.estimatedSaving;
        }
      });

      if (runningSum < targetAmount) {
        response += `*Note: Combining these habits gives a potential saving of ₹${runningSum}/month, which is slightly short of your ₹${targetAmount} target. I suggest looking at fixed subscriptions or capping weekend shopping further.*`;
      } else {
        response += `Applying these rules could save you up to **₹${runningSum}/month** in total! You can add these habits to your **Action Plan** to track progress.`;
      }

      return response;
    }

    // 4. Worst spending habit
    if (q.includes("worst habit") || q.includes("worst spending") || q.includes("bad habit")) {
      const insights = this.generateInsights(transactions).filter(i => i.actionable);
      if (insights.length > 0) {
        const worst = insights[0];
        return `Your highest-impact spending leak is **${worst.title}**.
        
You spent **${worst.evidence}** this month.
*Reason*: ${worst.reasoning}
*Coach Advice*: ${worst.recommendation}
*Potential Saving*: **₹${worst.estimatedSaving}/month** (Confidence: ${worst.confidence})

Would you like me to add this habit to your **Action Plan**?`;
      }
      return "You don't have any major leaking habits! Your spending is well-balanced across categories.";
    }

    // 5. Subscription check
    if (q.includes("subscription") || q.includes("recurring")) {
      const subs = window.AppAnalytics.getSubscriptionsSummary(currentTxs);
      if (subs.count > 0) {
        let response = `You spent **₹${subs.total.toLocaleString('en-IN')}** on **${subs.count} recurring subscriptions** this month:
        
`;
        subs.list.forEach(s => {
          response += `* **${s.merchant}**: ₹${s.amount}\n`;
        });
        response += `\n*Recommendation*: Review these subscriptions. If you haven't used Spotify, Netflix, or Google One actively in 2 weeks, pausing or downgrading could save you money.`;
        return response;
      }
      return "I didn't detect any active recurring subscriptions in your transaction list this month.";
    }

    // 6. Weekend spending check
    if (q.includes("weekend") || q.includes("saturday") || q.includes("sunday")) {
      const weekendStats = window.AppAnalytics.getWeekdayWeekendSplit(currentTxs);
      if (weekendStats.weekendTotal > 0) {
        return `Here is your weekend spending analysis:
* **Weekend Total**: ₹${Math.round(weekendStats.weekendTotal)}
* **Average Saturday/Sunday**: ₹${Math.round(weekendStats.weekendAverage)}
* **Average Weekday (Mon-Fri)**: ₹${Math.round(weekendStats.weekdayAverage)}

Your weekend daily spending is **${Math.round((weekendStats.weekendAverage / weekdayWeekend.weekdayAverage - 1) * 100)}% higher** than weekdays. This is primarily driven by shopping and eating out. Capping weekend outlays at ₹1,000 would save you about ₹${Math.round(Math.max(0, weekendStats.weekendTotal - 4000))} per month.`;
      }
      return "I don't have enough weekend data to analyze your weekend spending trend.";
    }

    // 7. General category/totals check
    if (q.includes("most money") || q.includes("top category") || q.includes("categories")) {
      const catBreakdown = window.AppAnalytics.getCategoryBreakdown(currentTxs);
      if (catBreakdown.length > 0) {
        let response = `Here are your top spending categories this month:
        
`;
        catBreakdown.slice(0, 5).forEach((c, idx) => {
          const totalExpense = window.AppAnalytics.calculateTotal(currentTxs, "expense");
          const pct = Math.round((c.amount / totalExpense) * 100);
          response += `${idx + 1}. **${c.category}**: ₹${Math.round(c.amount)} (${pct}%)\n`;
        });
        return response;
      }
    }

    // Fallback general guidance
    return `I can analyze your transactions to help you find savings! You can try asking:
* *"Why did my spending increase?"*
* *"How much did I spend on Swiggy?"*
* *"Where can I save ₹2,000?"*
* *"What is my worst spending habit?"*
* *"Show my weekend spending pattern."*
* *"Which subscriptions should I review?"*`;
  }
};
