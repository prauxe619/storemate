// voiceParser.js
// Parses Hinglish/Hindi/English speech transcripts into structured ledger entries.
// Replaces the single-regex processVoiceCommand with something that survives
// real shop-floor speech: word order varies, numbers are sometimes spoken as
// words, and names get mis-transcribed.
//
// Usage:
//   import { parseVoiceCommand } from './voiceParser';
//   const result = parseVoiceCommand(transcript, existingCustomers);
//   // result = { amount, type, customerName, matchedCustomer, confidence, needsClarification, reason }

// ---------------------------------------------------------------------------
// 1. Number words -> digits (covers what shop owners actually say out loud)
// ---------------------------------------------------------------------------
const UNITS = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5,
  che: 6, chhe: 6, saat: 7, aath: 8, aat: 8, nau: 9, das: 10, dus: 10,
};

const MULTIPLIERS = {
  sau: 100, saw: 100,
  hazar: 1000, hazaar: 1000,
  lakh: 100000, lac: 100000,
};

// Turns a run of words like ["paanch", "sau"] or ["do", "hazar"] into a number.
// Handles combinations like "paanch sau" (500) and stacked terms like
// "ek hazar paanch sau" (1500). Returns null if no number words are found.
function wordsToNumber(tokens) {
  let total = 0;
  let current = 0;
  let found = false;

  for (const word of tokens) {
    if (UNITS[word] != null) {
      current = UNITS[word];
      found = true;
    } else if (MULTIPLIERS[word] != null) {
      current = (current || 1) * MULTIPLIERS[word];
      total += current;
      current = 0;
      found = true;
    }
  }
  total += current;
  return found ? total : null;
}

// Extracts an amount from the transcript. Tries digits first (fast, reliable),
// then falls back to spoken number words.
function extractAmount(lowerText) {
  // Digits, optionally with decimal: "500", "500.50"
  const digitMatch = lowerText.match(/\d+(?:\.\d+)?/);
  if (digitMatch) {
    return { amount: parseFloat(digitMatch[0]), source: 'digits' };
  }

  // Spoken number words: scan for a contiguous run of number-ish tokens
  const words = lowerText.split(/\s+/);
  const numberWordSet = new Set([...Object.keys(UNITS), ...Object.keys(MULTIPLIERS)]);
  let run = [];
  let bestRun = [];

  for (const w of words) {
    if (numberWordSet.has(w)) {
      run.push(w);
      if (run.length > bestRun.length) bestRun = run;
    } else {
      run = [];
    }
  }

  if (bestRun.length > 0) {
    const value = wordsToNumber(bestRun);
    if (value) return { amount: value, source: 'words', matchedWords: bestRun };
  }

  return { amount: null, source: null };
}

// ---------------------------------------------------------------------------
// 2. Transaction type detection (credit given vs payment received)
// ---------------------------------------------------------------------------
const CREDIT_SIGNALS = [
  'udhaar', 'udhar', 'credit', 'diya', 'de diya', 'khata', 'baki',
];
const PAYMENT_SIGNALS = [
  'mila', 'mil gaya', 'paid', 'pay', 'received', 'wapas', 'jama', 'chukta',
];

function detectType(lowerText) {
  const hasCredit = CREDIT_SIGNALS.some(w => lowerText.includes(w));
  const hasPayment = PAYMENT_SIGNALS.some(w => lowerText.includes(w));

  if (hasCredit && !hasPayment) return 'CREDIT';
  if (hasPayment && !hasCredit) return 'PAYMENT';
  return null; // ambiguous or not found - don't guess with money
}

// ---------------------------------------------------------------------------
// 3. Name extraction
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'ko', 'ke', 'ka', 'ki', 'se', 'ne', 'naam', 'rupaye', 'rupees', 'rs',
  ...CREDIT_SIGNALS, ...PAYMENT_SIGNALS,
  ...Object.keys(UNITS), ...Object.keys(MULTIPLIERS),
]);

function extractName(lowerText, matchedNumberWords = []) {
  const numberWordSet = new Set(matchedNumberWords);
  const words = lowerText.replace(/\d+(?:\.\d+)?/g, '').split(/\s+/).filter(Boolean);

  const nameWords = words.filter(w => !STOP_WORDS.has(w) && !numberWordSet.has(w));

  if (nameWords.length === 0) return null;

  // Take the first 1-2 remaining words as the name (most shop owners say
  // single first names; occasionally a surname or "bhai/ji" follows).
  const nameSlice = nameWords.slice(0, 2).join(' ');
  return nameSlice.replace(/\b\w/g, c => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// 4. Fuzzy match against existing customers (catches "Ramesh" vs "Rammesh")
// ---------------------------------------------------------------------------
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array(b.length + 1).fill(0).map((_, j) => (i === 0 ? j : 0))
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

// Returns the closest existing customer name if it's a plausible match,
// otherwise null (meaning: treat as a new customer).
function fuzzyMatchCustomer(spokenName, existingCustomers) {
  if (!spokenName || !existingCustomers || existingCustomers.length === 0) return null;

  const spokenLower = spokenName.toLowerCase();
  let best = null;
  let bestDistance = Infinity;

  for (const customer of existingCustomers) {
    const existingLower = (customer.name || customer.customerId || '').toLowerCase();
    const distance = levenshtein(spokenLower, existingLower);
    // Allow more edit distance for longer names, proportionally
    const threshold = Math.max(1, Math.floor(existingLower.length * 0.3));

    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance;
      best = customer;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// 5. Main entry point
// ---------------------------------------------------------------------------
export function parseVoiceCommand(rawText, existingCustomers = []) {
  const lowerText = rawText.toLowerCase().trim();

  const { amount, source, matchedWords } = extractAmount(lowerText);
  const type = detectType(lowerText);
  const customerName = extractName(lowerText, matchedWords);
  const matchedCustomer = fuzzyMatchCustomer(customerName, existingCustomers);

  // Decide whether we're confident enough to show a pre-filled confirm card,
  // or whether we need to ask the user something specific.
  if (amount == null) {
    return {
      amount: null, type: null, customerName, matchedCustomer,
      confidence: 'low', needsClarification: true,
      reason: "Couldn't catch an amount. Try saying the number clearly, like '500'.",
    };
  }

  if (type == null) {
    return {
      amount, type: null, customerName, matchedCustomer,
      confidence: 'medium', needsClarification: true,
      reason: "Got the amount, but not sure if this is udhaar or a payment. Tap to choose.",
    };
  }

  if (!customerName) {
    return {
      amount, type, customerName: null, matchedCustomer: null,
      confidence: 'medium', needsClarification: true,
      reason: "Got the amount and type, but not sure whose account this is.",
    };
  }

  return {
    amount,
    type,
    customerName: matchedCustomer ? matchedCustomer.name : customerName,
    matchedCustomer, // null means this looks like a new customer
    confidence: 'high',
    needsClarification: false,
    reason: null,
    amountSource: source, // 'digits' or 'words' - useful for debugging misheard numbers
  };
}