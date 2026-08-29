/**
 * csv-importer.js - CSV Parsing, Column Mapping, and Pre-import Validation
 */

window.AppCSVImporter = {
  parsedRows: [], // Array of raw object rows from CSV
  headers: [],    // Array of string headers
  mapping: {},    // Maps standard fields to CSV headers { standardField: csvHeader }

  // Expected standard fields
  standardFields: [
    { key: "date", label: "Date (Required)", required: true },
    { key: "merchant", label: "Merchant (Required)", required: true },
    { key: "amount", label: "Amount (Required)", required: true },
    { key: "category", label: "Category", required: false },
    { key: "time", label: "Time", required: false },
    { key: "type", label: "Type (Expense/Income)", required: false },
    { key: "payment_method", label: "Payment Method", required: false },
    { key: "notes", label: "Notes/Remarks", required: false }
  ],

  // Simple, robust client-side CSV parser
  parseCSV(text) {
    const lines = text.split(/\r\n|\n/);
    if (lines.length < 2) return false;

    // Helper to parse CSV line respecting quotes
    const parseLine = (line) => {
      const result = [];
      let current = "";
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Extract headers
    this.headers = parseLine(lines[0]).map(h => h.replace(/^["']|["']$/g, ''));
    if (this.headers.length === 0 || !this.headers[0]) return false;

    this.parsedRows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseLine(lines[i]);
      const row = {};
      this.headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index].replace(/^["']|["']$/g, '') : "";
      });
      this.parsedRows.push(row);
    }

    this.autoMapHeaders();
    return true;
  },

  // Predict mapping based on header strings
  autoMapHeaders() {
    this.mapping = {};
    const lowerHeaders = this.headers.map(h => h.toLowerCase());

    const dateMatches = ["date", "tx date", "transaction date", "time stamp", "timestamp"];
    const merchantMatches = ["merchant", "description", "payee", "to", "vendor", "details", "narrative"];
    const amountMatches = ["amount", "value", "rupees", "inr", "tx amount", "cost", "price"];
    const categoryMatches = ["category", "tag", "purpose", "group"];
    const timeMatches = ["time", "hour", "clock", "timestamp_time"];
    const typeMatches = ["type", "d/c", "credit/debit", "transaction type", "dr/cr"];
    const methodMatches = ["payment_method", "payment", "mode", "wallet", "method", "via"];
    const notesMatches = ["notes", "memo", "remarks", "comment", "remarks"];

    const findMatch = (matches) => {
      for (let i = 0; i < this.headers.length; i++) {
        if (matches.includes(lowerHeaders[i])) return this.headers[i];
      }
      // Partial matches
      for (let i = 0; i < this.headers.length; i++) {
        if (matches.some(m => lowerHeaders[i].includes(m))) return this.headers[i];
      }
      return "";
    };

    this.mapping.date = findMatch(dateMatches);
    this.mapping.merchant = findMatch(merchantMatches);
    this.mapping.amount = findMatch(amountMatches);
    this.mapping.category = findMatch(categoryMatches);
    this.mapping.time = findMatch(timeMatches);
    this.mapping.type = findMatch(typeMatches);
    this.mapping.payment_method = findMatch(methodMatches);
    this.mapping.notes = findMatch(notesMatches);
  },

  // Perform category auto-detection
  inferCategory(merchant) {
    const m = merchant.toLowerCase();
    if (m.includes("swiggy") || m.includes("zomato") || m.includes("foodpanda") || m.includes("restaurant") || m.includes("eats") || m.includes("cafe")) {
      return "Food";
    }
    if (m.includes("blinkit") || m.includes("zepto") || m.includes("grofers") || m.includes("bigbasket") || m.includes("grocery") || m.includes("supermarket")) {
      return "Groceries";
    }
    if (m.includes("uber") || m.includes("ola") || m.includes("rides") || m.includes("metro") || m.includes("auto") || m.includes("railway") || m.includes("irctc")) {
      return "Transportation";
    }
    if (m.includes("amazon") || m.includes("flipkart") || m.includes("myntra") || m.includes("nykaa") || m.includes("shopping") || m.includes("mall")) {
      return "Shopping";
    }
    if (m.includes("netflix") || m.includes("spotify") || m.includes("youtube") || m.includes("google one") || m.includes("hotstar") || m.includes("prime")) {
      return "Subscriptions";
    }
    if (m.includes("hospital") || m.includes("pharmacy") || m.includes("apollo") || m.includes("medplus") || m.includes("doctor")) {
      return "Healthcare";
    }
    if (m.includes("udemy") || m.includes("coursera") || m.includes("school") || m.includes("college") || m.includes("books")) {
      return "Education";
    }
    if (m.includes("electricity") || m.includes("bescom") || m.includes("water") || m.includes("airtel") || m.includes("jio") || m.includes("recharge")) {
      return "Bills";
    }
    if (m.includes("hotel") || m.includes("flight") || m.includes("trip") || m.includes("makemytrip") || m.includes("travel")) {
      return "Travel";
    }
    if (m.includes("pvr") || m.includes("inox") || m.includes("bookmyshow") || m.includes("pub") || m.includes("club") || m.includes("cinema")) {
      return "Entertainment";
    }
    return "Other";
  },

  // Perform validation on all rows based on current mapping
  validateRows() {
    const report = {
      valid: [],
      invalid: [],
      duplicates: [],
      invalidCount: 0,
      validCount: 0,
      duplicateCount: 0
    };

    if (!this.mapping.date || !this.mapping.merchant || !this.mapping.amount) {
      return report; // Mapping incomplete
    }

    const existingTxs = window.AppState.transactions;

    this.parsedRows.forEach((row, idx) => {
      const dateVal = row[this.mapping.date];
      const merchantVal = row[this.mapping.merchant];
      const amountVal = parseFloat((row[this.mapping.amount] || "").replace(/[^0-9.-]/g, ''));
      
      // Basic validity checks
      const isDateValid = dateVal && !isNaN(Date.parse(dateVal));
      const isMerchantValid = merchantVal && merchantVal.trim().length > 0;
      const isAmountValid = !isNaN(amountVal) && amountVal > 0;

      if (!isDateValid || !isMerchantValid || !isAmountValid) {
        report.invalid.push({ index: idx + 1, row, reason: "Missing or malformed date, merchant or numeric amount" });
        report.invalidCount++;
        return;
      }

      // Check duplicates (same date, merchant, amount)
      const formattedDate = new Date(dateVal).toISOString().split('T')[0];
      const isDuplicate = existingTxs.some(tx => 
        tx.date === formattedDate && 
        tx.merchant.toLowerCase() === merchantVal.trim().toLowerCase() && 
        Math.abs(tx.amount - amountVal) < 0.01
      );

      const categoryVal = this.mapping.category ? row[this.mapping.category] : this.inferCategory(merchantVal);
      const timeVal = this.mapping.time ? row[this.mapping.time] : "12:00";
      
      let typeVal = "expense";
      if (this.mapping.type) {
        const rawType = row[this.mapping.type].toLowerCase();
        if (rawType.includes("inc") || rawType.includes("credit") || rawType.includes("cr") || rawType.includes("salary")) {
          typeVal = "income";
        }
      } else {
        // Auto-infer salary/income from merchant name
        if (merchantVal.toLowerCase().includes("salary") || merchantVal.toLowerCase().includes("paycheck") || merchantVal.toLowerCase().includes("refund")) {
          typeVal = "income";
        }
      }

      const methodVal = this.mapping.payment_method ? row[this.mapping.payment_method] : "UPI";
      const notesVal = this.mapping.notes ? row[this.mapping.notes] : "";

      const cleanRow = {
        amount: amountVal,
        date: formattedDate,
        time: timeVal,
        merchant: merchantVal.trim(),
        category: categoryVal || this.inferCategory(merchantVal),
        type: typeVal,
        payment_method: methodVal,
        notes: notesVal
      };

      if (isDuplicate) {
        report.duplicates.push({ index: idx + 1, row: cleanRow });
        report.duplicateCount++;
      } else {
        report.valid.push(cleanRow);
        report.validCount++;
      }
    });

    return report;
  },

  // Save valid transactions into AppState
  async importValidRows(validRows) {
    if (!validRows || validRows.length === 0) return 0;
    
    if (window.AppState.importTransactions) {
      await window.AppState.importTransactions(validRows);
      return validRows.length;
    }

    validRows.forEach(tx => {
      const newTx = {
        id: "tx_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        amount: tx.amount,
        date: tx.date,
        time: tx.time,
        merchant: tx.merchant,
        category: tx.category,
        type: tx.type,
        payment_method: tx.payment_method,
        notes: tx.notes,
        created_at: new Date().toISOString()
      };
      window.AppState.transactions.push(newTx);
    });

    window.AppState.sortTransactions();
    window.AppState.notify();
    return validRows.length;
  }
};

