/*
 * ============================================================
 * StoreMate Local Voice Parser
 * ============================================================
 *
 * OFFLINE-FIRST KIRANA / LOCAL STORE VOICE ENGINE
 *
 * IMPORTANT:
 * This file NEVER writes to WatermelonDB.
 * IntentHandler.js performs all database operations.
 *
 * ============================================================
 */

const MAX_TEXT_LENGTH = 500;
const MAX_QUANTITY = 100000;
const MAX_AMOUNT = 100000000;

const SYNONYMS = {
  sell: 'sell', sale: 'sell', sales: 'sell', cell: 'sell', sel: 'sell', sal: 'sell', sall: 'sell',
  becho: 'sell', bech: 'sell', bechi: 'sell', bechna: 'sell', bechdo: 'sell',
  bikri: 'sell', bik: 'sell', bill: 'sell', billing: 'sell',
  add: 'add', added: 'add', adding: 'add', ad: 'add', plus: 'add',
  jodo: 'add', jod: 'add', jorna: 'add', jor: 'add',
  daalo: 'add', dalo: 'add', daal: 'add', dal: 'add',
  chadha: 'add', chadhao: 'add', chadao: 'add', chadhana: 'add',
  bharo: 'add', bhar: 'add', stock: 'stock', maal: 'stock',
  increase: 'increase', badhao: 'increase', badha: 'increase', badao: 'increase', bada: 'increase', jyada: 'increase', zyaada: 'increase', more: 'increase',
  decrease: 'decrease', ghatao: 'decrease', ghata: 'decrease', kam: 'decrease', less: 'decrease', reduce: 'decrease',
  price: 'price', rate: 'price', daam: 'price', keemat: 'price', kimat: 'price',
  nikalo: 'remove', nikaalo: 'remove', nikal: 'remove', hatao: 'remove', htao: 'remove',
  udhaar: 'khata', udhar: 'khata', udhhar: 'khata',
  baki: 'khata', baaki: 'khata', khaata: 'khata', khata: 'khata', khate: 'khata', khato: 'khata',
  balance: 'khata', bakaya: 'khata', dues: 'khata', hisab: 'khata', hisaab: 'khata',
  account: 'account', accounts: 'account', credit: 'credit',
  jama: 'received', jamaa: 'received', diye: 'received', diya: 'received', diyaa: 'received',
  receive: 'received', received: 'received', receiving: 'received', pay: 'received', paid: 'received', payment: 'received',
  mil: 'received', mile: 'received', mila: 'received', vasool: 'received', vasooli: 'received', liya: 'received', liye: 'received',
  aaye: 'received', aae: 'received', aaya: 'received', aayi: 'received',
  cash: 'cash', nagad: 'cash', nagdi: 'cash', rokad: 'cash', rokar: 'cash',
  discount: 'discount', chhoot: 'discount', chut: 'discount', chhut: 'discount',
  grahak: 'customer', graahak: 'customer', customer: 'customer', customers: 'customer',
  naya: 'new', naye: 'new', new: 'new',
  create: 'create', make: 'create', open: 'create',
  banao: 'create', bnao: 'create', bana: 'create', banado: 'create', banaao: 'create', banaye: 'create',
  khol: 'create', kholo: 'create', kholna: 'create',
  karo: 'do', kar: 'do', kardo: 'do', kardena: 'do', please: 'please', pls: 'please',
};

const DEVANAGARI_NUMBERS = {
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
  ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, पन्द्रह: 15, सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20,
  इक्कीस: 21, बाईस: 22, तेईस: 23, तेइस: 23, चौबीस: 24, पच्चीस: 25, छब्बीस: 26, सत्ताईस: 27, अट्ठाईस: 28, उनतीस: 29, तीस: 30,
  चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90, सौ: 100, हज़ार: 1000, हजार: 1000, लाख: 100000,
};

const SMALL_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  ek: 1, aik: 1, eka: 1, do: 2, dono: 2, teen: 3, tin: 3, char: 4, chaar: 4, panch: 5, paanch: 5,
  chhe: 6, che: 6, chhah: 6, saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, naoo: 9, das: 10,
  gyarah: 11, gyaarah: 11, barah: 12, baarah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16,
  satrah: 17, atharah: 18, unnis: 19, bees: 20, ikkis: 21, bais: 22, baais: 22, teis: 23, teiis: 23,
  chaubis: 24, pachis: 25, chhabis: 26, satais: 27, athais: 28, untees: 29, tees: 30,
  chaalis: 40, chalis: 40, pachaas: 50, pachas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
};

const MULTIPLIERS = {
  hundred: 100, sau: 100, so: 100, thousand: 1000, hazaar: 1000, hazar: 1000, lakh: 100000, lac: 100000,
};

const FRACTION_WORDS = {
  aadha: 0.5, aadhi: 0.5, aadhe: 0.5, half: 0.5, paav: 0.25, pav: 0.25, paawa: 0.25, quarter: 0.25,
  pauna: 0.75, paune: 0.75, pona: 0.75, sava: 1.25, sawa: 1.25, dedh: 1.5, dedha: 1.5, dedhi: 1.5,
  dhai: 2.5, dhaai: 2.5, आधा: 0.5, आधे: 0.5, आधी: 0.5, पाव: 0.25, पौना: 0.75, पौने: 0.75,
  सवा: 1.25, डेढ़: 1.5, ढाई: 2.5,
};

const UNIT_ALIASES = {
  mg: 'MG', mgs: 'MG', milligram: 'MG', milligrams: 'MG', milligramme: 'MG', milligrammes: 'MG', मिलीग्राम: 'MG', मिलीग्राम्: 'MG',
  gram: 'GRAM', grams: 'GRAM', gm: 'GRAM', gms: 'GRAM', g: 'GRAM', gramme: 'GRAM', grammes: 'GRAM', ग्राम: 'GRAM', ग्राम्: 'GRAM',
  kg: 'KG', kgs: 'KG', kilo: 'KG', kilos: 'KG', kilogram: 'KG', kilograms: 'KG', kilogramme: 'KG', kilogrammes: 'KG', किलो: 'KG', किलोग्राम: 'KG',
  quintal: 'QUINTAL', quintals: 'QUINTAL', qtl: 'QUINTAL', क्विंटल: 'QUINTAL', क्विन्टल: 'QUINTAL',
  ton: 'TON', tons: 'TON', tonne: 'TON', tonnes: 'TON', mt: 'TON', metricton: 'TON', टन: 'TON',
  tola: 'TOLA', tolas: 'TOLA', तोला: 'TOLA',
  chhatak: 'CHHATAK', chatak: 'CHHATAK', chhatacks: 'CHHATAK', छटांक: 'CHHATAK',
  seer: 'SEER', ser: 'SEER', सेर: 'SEER',
  maund: 'MAUND', man: 'MAUND', मन: 'MAUND', मण: 'MAUND',
  ml: 'ML', mls: 'ML', millilitre: 'ML', millilitres: 'ML', milliliter: 'ML', milliliters: 'ML', milliliteres: 'ML', मिली: 'ML', एमएल: 'ML', मिलीलीटर: 'ML',
  litre: 'LITRE', liter: 'LITRE', litres: 'LITRE', liters: 'LITRE', l: 'LITRE', लीटर: 'LITRE', ली: 'LITRE',
  piece: 'PIECE', pieces: 'PIECE', pc: 'PIECE', pcs: 'PIECE', piecee: 'PIECE', piecees: 'PIECE', item: 'PIECE', items: 'PIECE', nag: 'PIECE', नग: 'PIECE', पीस: 'PIECE', नग्ग: 'PIECE',
  dozen: 'DOZEN', dozens: 'DOZEN', dz: 'DOZEN', दर्जन: 'DOZEN',
  gross: 'GROSS', ग्रॉस: 'GROSS', ग्रोस: 'GROSS',
  pair: 'PAIR', pairs: 'PAIR', jodi: 'PAIR', jodiyaan: 'PAIR', jodiya: 'PAIR', जोड़ी: 'PAIR', जोड़ी: 'PAIR',
  set: 'SET', sets: 'SET', सेट: 'SET',
  pack: 'PACK', packs: 'PACK', packet: 'PACK', packets: 'PACK', pkt: 'PACK', pkts: 'PACK', पैक: 'PACK', पैकेट: 'PACK', पैकेट्स: 'PACK',
  pouch: 'POUCH', pouches: 'POUCH', पाउच: 'POUCH',
  sachet: 'SACHET', sachets: 'SACHET', सैशे: 'SACHET', सैशेट: 'SACHET',
  bag: 'BAG', bags: 'BAG', बैग: 'BAG',
  bottle: 'BOTTLE', bottles: 'BOTTLE', btl: 'BOTTLE', बोतल: 'BOTTLE', बॉटल: 'BOTTLE',
  jar: 'JAR', jars: 'JAR', जार: 'JAR',
  box: 'BOX', boxes: 'BOX', dabba: 'BOX', dabbe: 'BOX', dibba: 'BOX', dibbe: 'BOX', डिब्बा: 'BOX', डिब्बे: 'BOX', डब्बा: 'BOX', डब्बे: 'BOX',
  tin: 'TIN', tins: 'TIN', टिन: 'TIN',
  can: 'CAN', cans: 'CAN', कैन: 'CAN', कनस्तर: 'CAN',
  carton: 'CARTON', cartons: 'CARTON', कार्टन: 'CARTON',
  tray: 'TRAY', trays: 'TRAY', ट्रे: 'TRAY',
  strip: 'STRIP', strips: 'STRIP', स्ट्रिप: 'STRIP',
  blister: 'BLISTER', blisters: 'BLISTER', ब्लिस्टर: 'BLISTER',
  tube: 'TUBE', tubes: 'TUBE', ट्यूब: 'TUBE',
  cup: 'CUP', cups: 'CUP', कप: 'CUP',
  bundle: 'BUNDLE', bundles: 'BUNDLE', gaddi: 'BUNDLE', gaddis: 'BUNDLE', बंडल: 'BUNDLE', गड्डी: 'BUNDLE', गद्दी: 'BUNDLE',
  bunch: 'BUNCH', bunches: 'BUNCH', गुच्छा: 'BUNCH', गुच्छे: 'BUNCH', बंच: 'BUNCH',
  roll: 'ROLL', rolls: 'ROLL', रोल: 'ROLL',
  sack: 'SACK', sacks: 'SACK', bora: 'BORI', bori: 'BORI', boras: 'BORI', बोरी: 'BORI',
  crate: 'CRATE', crates: 'CRATE', क्रेट: 'CRATE',
  bucket: 'BUCKET', buckets: 'BUCKET', बाल्टी: 'BUCKET',
  drum: 'DRUM', drums: 'DRUM', ड्रम: 'DRUM',
  basket: 'BASKET', baskets: 'BASKET', टोकरी: 'BASKET',
};

const ALL_UNITS = new Set(Object.values(UNIT_ALIASES));

const STOP_WORDS = new Set([
  'create', 'make', 'open', 'add', 'new', 'sell', 'sale', 'sales', 'remove', 'stock', 'please', 'pls', 'an', 'a', 'the',
  'account', 'accounts', 'customer', 'customers', 'khata', 'khate', 'balance', 'bakaya', 'dues', 'due', 'total', 'hisab', 'hisaab',
  'for', 'of', 'to', 'from', 'on', 'ka', 'ke', 'ki', 'k', 'mein', 'me', 'ko', 'se', 'ne', 'naam', 'named', 'called',
  'how', 'much', 'many', 'have', 'has', 'left', 'remaining', 'kitna', 'kitni', 'kitne', 'bacha', 'bache', 'baki', 'baaki',
  'received', 'payment', 'paid', 'jama', 'cash', 'nagad', 'rokar', 'today', 'aaj', 'karo', 'kar', 'kardo',
  'wala', 'wale', 'wali', 'waala', 'waale', 'waali', 'rupee', 'rupees', 'rupaye', 'rupay', 'rs', 'rs.', 'price', 'rate',
  'वाला', 'वाले', 'वाली', 'रुपया', 'रुपये', 'रुपए', 'का', 'की', 'के', 'बकाया', 'बैलेंस', 'हिसाब', 'हिसाव', 'कितना', 'कितने', 'बत्ताओ', 'बताओ', 'दिखाओ',
]);
Object.keys(UNIT_ALIASES).forEach((unit) => STOP_WORDS.add(unit));

const CUSTOMER_COMMAND_WORDS = new Set([
  'create', 'make', 'open', 'add', 'new', 'account', 'accounts', 'customer', 'customers', 'khata', 'khate', 'banao', 'bnao',
  'bana', 'banado', 'banaao', 'karo', 'kar', 'please', 'naam', 'named', 'called', 'grahak', 'balance', 'bakaya', 'dues', 'hisab', 'hisaab',
]);

const cleanText = (value) => typeof value !== 'string' ? '' : value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, MAX_TEXT_LENGTH);
const titleCase = (value) => cleanText(value).split(/\s+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
const convertDevanagariDigits = (text) => { const map = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' }; return text.replace(/[०-९]/g, (digit) => map[digit] || digit); };
const convertDevanagariNumberWords = (text) => text.split(/\s+/).map((word) => DEVANAGARI_NUMBERS[word] !== undefined ? String(DEVANAGARI_NUMBERS[word]) : word).join(' ');

const normalizeSpokenNumbers = (text) => {
  let working = convertDevanagariNumberWords(convertDevanagariDigits(text));
  const words = working.split(/\s+/).filter(Boolean);
  const output = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i], next = words[i + 1];
    // Only treat 'do' as a verb/stop word if it's strictly at the end of the sentence or followed by action verbs
    if (word === 'do' && i === words.length - 1) continue;
    if (FRACTION_WORDS[word] !== undefined) { output.push(word); continue; }
    const currentNumber = SMALL_NUMBERS[word], nextMultiplier = MULTIPLIERS[next];
    if (currentNumber !== undefined && nextMultiplier !== undefined) { output.push(String(currentNumber * nextMultiplier)); i++; continue; }
    if (/^\d+(?:\.\d+)?$/.test(word) && nextMultiplier !== undefined) { output.push(String(Number(word) * nextMultiplier)); i++; continue; }
    if (currentNumber !== undefined) { output.push(String(currentNumber)); continue; }
    if (MULTIPLIERS[word] !== undefined) { output.push(String(MULTIPLIERS[word])); continue; }
    output.push(word);
  }
  return output.join(' ');
};

const normalizeText = text => {
  const rawBase = cleanText(text).toLowerCase().replace(/['’]/g, '').replace(/,/g, '').replace(/\s+/g, ' ');
  const numberNormalized = normalizeSpokenNumbers(rawBase);
  const clean = numberNormalized.split(/\s+/).map(word => SYNONYMS[word] || word).join(' ');
  return { raw: rawBase, clean, normalized: numberNormalized };
};

const makeResult = ({ intent, product = null, qty = 1, unit = null, amount = null, discount_percent = null, new_price = null, customer_name = null, time_period = null, payment_type = null, price_hint = null, confidence = 0.95, resolved_inventory_id = null, inventory_item_id = null }) => ({ intent, product, qty, unit, discount_percent, new_price, customer_name, time_period, amount, payment_type, price_hint, confidence, resolved_inventory_id, inventory_item_id, source: 'local_rules' });
const normalizeUnit = (value) => { if (value === null || value === undefined) return null; return UNIT_ALIASES[String(value).trim().toLowerCase()] || null; };

const parseNumberUnitTokens = (raw) => {
  const matches = []; const regex = /(\d+(?:\.\d+)?)\s*([a-zA-Z\u0900-\u097F]+)/gi; let match;
  while ((match = regex.exec(raw)) !== null) { const value = Number(match[1]), unit = normalizeUnit(match[2]); if (Number.isFinite(value) && value > 0 && unit) matches.push({ qty: value, unit, index: match.index, length: match[0].length }); }
  return matches;
};

const parseFractionUnit = (raw) => {
  const words = raw.toLowerCase().split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) { const fraction = FRACTION_WORDS[words[i]]; if (fraction !== undefined) { const unit = normalizeUnit(words[i + 1]); if (unit) return { qty: fraction, unit, index: i }; } }
  for (let i = 0; i < words.length - 2; i++) { const fraction = FRACTION_WORDS[words[i]]; if (fraction !== undefined) { const possibleArticle = words[i + 1], unit = normalizeUnit(words[i + 2]); if ((possibleArticle === 'a' || possibleArticle === 'an' || possibleArticle === 'ek') && unit) return { qty: fraction, unit, index: i }; } }
  return null;
};

const MIXED_UNIT_FACTORS = { MG: { base: 'KG', factor: 0.000001 }, GRAM: { base: 'KG', factor: 0.001 }, KG: { base: 'KG', factor: 1 }, QUINTAL: { base: 'KG', factor: 100 }, TON: { base: 'KG', factor: 1000 }, ML: { base: 'LITRE', factor: 0.001 }, LITRE: { base: 'LITRE', factor: 1 }, PIECE: { base: 'PIECE', factor: 1 }, DOZEN: { base: 'PIECE', factor: 12 }, GROSS: { base: 'PIECE', factor: 144 }, PAIR: { base: 'PIECE', factor: 2 } };

const combineQuantityTokens = (tokens) => {
  if (!tokens || tokens.length === 0) return null;
  if (tokens.length === 1) return { qty: Math.min(tokens[0].qty, MAX_QUANTITY), unit: tokens[0].unit };
  const firstFactor = MIXED_UNIT_FACTORS[tokens[0].unit];
  if (!firstFactor) return { qty: tokens[0].qty, unit: tokens[0].unit };
  let baseQuantity = 0; tokens.forEach((token) => { baseQuantity += token.qty * MIXED_UNIT_FACTORS[token.unit].factor; });
  return { qty: Math.min(baseQuantity, MAX_QUANTITY), unit: firstFactor.base };
};

const extractQuantityAndUnit = (raw) => {
  if (!raw) return { qty: 1, unit: null };
  const fraction = parseFractionUnit(raw); if (fraction) return { qty: Math.min(fraction.qty, MAX_QUANTITY), unit: fraction.unit };
  const tokens = parseNumberUnitTokens(raw);
  if (tokens.length) { if (tokens.length > 1) { const combined = combineQuantityTokens(tokens); if (combined) return combined; } return { qty: Math.min(tokens[0].qty, MAX_QUANTITY), unit: tokens[0].unit }; }
  for (const word of raw.toLowerCase().split(/\s+/)) { if (FRACTION_WORDS[word] !== undefined) return { qty: FRACTION_WORDS[word], unit: null }; }
  const quantityMatch = raw.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/); if (quantityMatch) { const value = Number(quantityMatch[1]); if (Number.isFinite(value) && value > 0) return { qty: Math.min(value, MAX_QUANTITY), unit: null }; }
  return { qty: 1, unit: null };
};

const matchKnownCustomer = (raw, customerNames) => {
  if (!Array.isArray(customerNames)) return null;
  const lower = raw.toLowerCase(), sorted = customerNames.filter(Boolean).map((name) => String(name).trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  const matched = sorted.find((name) => lower.includes(name.toLowerCase()));
  return matched ? titleCase(matched) : null;
};

const isValidCustomerName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const cleaned = name.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2 || cleaned.length > 100 || /^\d+(?:\.\d+)?$/.test(cleaned)) return false;
  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.every((word) => CUSTOMER_COMMAND_WORDS.has(word))) return false;
  if (words.some((word) => new Set(['account', 'accounts', 'customer', 'customers', 'khata', 'khate', 'product', 'products', 'item', 'items', 'new', 'naya', 'create', 'make', 'open', 'add', 'please', 'for', 'of', 'named', 'called', 'balance', 'bakaya', 'dues', 'hisab', 'hisaab', 'total', 'batao', 'dikhayo', 'ka', 'ke', 'ki']).has(word))) return false;
  return true;
};

const cleanCustomerName = (value) => {
  if (!value || typeof value !== 'string') return null;
  let name = value.trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:please|pls)\s+/i, '')
    .replace(/\s+(?:please|pls)$/i, '')
    .replace(/^(?:naya|new)\s+/i, '')
    .replace(/\s+(?:naya|new)$/i, '')
    .replace(/\b(?:ka|ke|ki|ko|se|ne)\b/gi, '')
    .replace(/\s+(?:banao|bnao|bana|banado|banaao|karo|kar|do|khol|kholo|khol\s+do)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return isValidCustomerName(name) ? titleCase(name) : null;
};

const extractCustomerQueryCustomer = (raw, customerNames) => {
  const known = matchKnownCustomer(raw, customerNames);
  if (known) return known;
  let cleaned = raw.toLowerCase()
    .replace(/\b(ka|ke|ki|ko|se|ne|total|balance|bakaya|dues|due|hisab|hisaab|khata|khate|udhaar|udhar|baki|baaki|account|credit|kitna|batao|check|karo|kaise|bata do|dikhayo|dikhao)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const valid = cleanCustomerName(cleaned);
  if (valid) return valid;
  const firstWord = cleaned.split(' ')[0];
  return firstWord ? titleCase(firstWord) : null;
};

const isKhataQuery = (raw) => /\b(khata|khate|udhaar|udhar|baki|baaki|credit|account|balance|bakaya|dues|due|hisab|hisaab)\b/i.test(raw) || /(?:उधार|उधारी|खाता|खाते|बकाया|क्रेडिट|बैलेंस|हिसाब|हिसाव)/i.test(raw);

const extractCustomerCreation = (raw) => {
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const patterns = [/^(?:please|pls)\s+(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(.+?)\s+(?:account|customer|khata)$/i, /^(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(.+?)\s+(?:account|customer|khata)$/i, /^(?:please\s+)?(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(?:account|customer|khata)\s+(?:for|of)\s+(.+)$/i, /^(?:new|naya)\s+(.+?)\s+(?:account|customer|khata)$/i, /^(.+?)\s+(?:account|customer|khata)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i, /^(.+?)\s+(?:ka|k|ke|ki)\s+(?:account|customer|khata|khate)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i];
  for (const pattern of patterns) { const match = normalized.match(pattern); if (!match || !match[1]) continue; const customerName = cleanCustomerName(match[1]); if (customerName) return customerName; } return null;
};

const looksLikeProductPaymentCommand = (text) => {
  if (!text) return false;
  const normalized = String(text).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (/\b(?:\d+(?:\.\d+)?|ek|do|teen|char|chaar|paanch|che|chhe|saat|aath|nau|das)\s*(?:kilo|kilos|kg|kgs|gram|grams|gm|g|litre|litres|liter|liters|ml|packet|pack|packets|pcs?|piece|pieces|bottle|bottles|box|boxes|dabba|dabbe|pouch|pouches|sachet|sachets|bag|bags|tin|tins|can|cans|carton|cartons|tray|trays|strip|strips|tube|tubes|dozen|gross|pair|pairs|set|sets)\b/i.test(normalized)) return true;
  if (/\b\d+(?:\.\d+)?\s*(?:wala|wale|wali|waala|waale|waali)\b/i.test(normalized)) return true;
  if (/\b(?:sugar|chini|cheeni|rice|chawal|basmati|biscuit|biscuits|kurkure|parle|parle\s*g|parle\s*ji|parle\s*jee|tiger|atta|aata|dal|daal|oil|tel|salt|namak|soap|shampoo|milk|doodh|bread|toothbrush|tooth\s+brush)\b/i.test(normalized)) return true;
  return false;
};

const extractPayment = (clean, raw, customerNames = []) => {
  if (!raw || looksLikeProductPaymentCommand(raw)) return null;
  const original = String(raw).replace(/\s+/g, ' ').trim(); if (!original) return null;
  const normalized = normalizeSpokenNumbers(original).replace(/\s+/g, ' ').trim();
  const candidates = [original, normalized, String(clean || '').replace(/\s+/g, ' ').trim()];
  const knownCustomer = matchKnownCustomer(original, customerNames) || matchKnownCustomer(normalized, customerNames);

  const parseAmount = value => {
    if (!value) return null;
    const text = String(value).replace(/\s+/g, ' ').trim();
    const numeric = text.match(/(?:₹|rs\.?|rupees?|rupee|rupaye|rupay|rupiya|rupiye)?\s*(\d+(?:\.\d+)?)/i);
    if (numeric) { const amount = Number(numeric[1]); if (Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT) return amount; }
    return null;
  };

  for (const candidate of candidates) {
    const match = candidate.match(/^(.+?)\s+(?:se|ne)\s+(?:₹|rs\.?|rupees?|rupee)?\s*(\d+(?:\.\d+)?)\s*(?:aaye|aae|aaya|aayi|diye|diya|mila|miley|jama|received)/i);
    if (match) {
      const customerName = cleanCustomerName(match[1]) || (knownCustomer ? knownCustomer : titleCase(match[1]));
      const amount = parseAmount(match[2]);
      if (customerName && amount) return { customer_name: customerName, amount, isReceived: true };
    }
  }

  // English-phrasing credit-direction equivalents: money coming FROM the
  // customer (they paid down what they owe).
  for (const candidate of candidates) {
    let match = candidate.match(/^(?:payment|cash|amount)\s+received\s+from\s+(.+?)\s+(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?)?$/i);
    if (!match) match = candidate.match(/^received\s+(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?)?\s+from\s+(.+)$/i);
    if (!match) match = candidate.match(/^(.+?)\s+paid\s+(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?)?$/i);
    if (match) {
      // the "received AMOUNT from NAME" pattern has amount in group 1, name in group 2 — swap
      const isAmountFirst = /^received/i.test(candidate);
      const nameGroup = isAmountFirst ? match[2] : match[1];
      const amountGroup = isAmountFirst ? match[1] : match[2];
      const customerName = cleanCustomerName(nameGroup) || (knownCustomer ? knownCustomer : titleCase(nameGroup));
      const amount = parseAmount(amountGroup);
      if (customerName && amount) return { customer_name: customerName, amount, isReceived: true };
    }
  }

  // English-phrasing equivalents. "credit given to X 500[ rupees]" / "gave X
  // 500 on credit" mean the customer's due is INCREASING (debit) — the
  // opposite of the "se/ne ... aaye/jama" pattern above.
  for (const candidate of candidates) {
    let match = candidate.match(/^credit\s+given\s+to\s+(.+?)\s+(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?)?$/i);
    if (!match) match = candidate.match(/^gave\s+(.+?)\s+(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?)?\s*(?:on\s+credit|udhaar|udhar)$/i);
    if (match) {
      const customerName = cleanCustomerName(match[1]) || (knownCustomer ? knownCustomer : titleCase(match[1]));
      const amount = parseAmount(match[2]);
      if (customerName && amount) return { customer_name: customerName, amount, isReceived: false };
    }
  }

  return null;
};

const PRODUCT_ALIASES = [
  { canonical: 'parle g', aliases: ['parle g', 'parle ji', 'parle jee', 'parle gee', 'parle gi', 'parle g biscuit', 'parle ji biscuit', 'parle jee biscuit', 'g biscuit', 'जी बिस्किट', 'पारले जी', 'पार्ले जी', 'पारले जी बिस्किट', 'पार्ले जी बिस्कुट'] },
  { canonical: 'kurkure', aliases: ['kurkure', 'kurkura', 'kurkure namkeen', 'कुरकुरे', 'कुरकुरा'] },
  { canonical: 'tiger biscuit', aliases: ['tiger biscuit', 'tiger biscuits', 'tiger', 'टाइगर बिस्किट', 'टाइगर बिस्कुट'] },
  { canonical: 'rice', aliases: ['rice', 'chawal', 'chaawal', 'चावल'] },
  { canonical: 'basmati rice', aliases: ['basmati rice', 'basmati chawal', 'basmati chaawal', 'बासमती चावल'] },
  { canonical: 'sugar', aliases: ['sugar', 'chini', 'cheeni', 'चीनी', 'शक्कर'] },
  { canonical: 'biscuit', aliases: ['biscuit', 'biscuits', 'biskit', 'biskits', 'बिस्किट', 'बिस्कुट'] },
  { canonical: 'tooth brush', aliases: ['toothbrush', 'tooth brush', 'toothbrushes', 'ब्रश', 'टूथब्रश', 'टूथ ब्रश'] },
  { canonical: 'fortune besan', aliases: ['fortune besan', 'besan', 'बेसन', 'फॉर्च्यून बेसन'] },
  { canonical: 'fortune oil', aliases: ['fortune oil', 'oil', 'तेल', 'फॉर्च्यून ऑयल', 'फॉरच्यून तेल'] },
  { canonical: 'sabudana', aliases: ['sabudana', 'sonal sabudana', 'साबूदाना', 'सोनाल साबूदाना'] },
  { canonical: 'soyabean chunks', aliases: ['soyabean chunks', 'soybean chunks', 'soya bean chunks', 'soy bean chunks', 'soyabean chunk', 'soybean chunk', 'सोयाबीन चंक्स', 'सोयाबीन बड़ी'] },
];

const normalizeAliasText = (value) => cleanText(value).toLowerCase().replace(/[\/,]+/g, ' ').replace(/\s+/g, ' ').trim();
const canonicalProductSpeech = (value) => { const normalized = normalizeAliasText(value); if (!normalized) return ''; for (const group of PRODUCT_ALIASES) { if (normalized === normalizeAliasText(group.canonical) || group.aliases.some((alias) => normalizeAliasText(alias) === normalized)) return normalizeAliasText(group.canonical); } return normalized; };

const parsePriceHint = (raw) => {
  if (!raw) return null; const text = convertDevanagariDigits(cleanText(raw).toLowerCase());
  const patterns = [/(?:^|\s)₹\s*(\d+(?:\.\d+)?)\b/i, /(?:^|\s)(?:rs\.?|rupees?|rupee|rupaye|rupay|rupiya|rupiye)\s*(\d+(?:\.\d+)?)\b/i, /\b(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|rupee|rupaye|rupay|rupiya|rupiye)\b/i, /\b(\d+(?:\.\d+)?)\s*(?:wala|wale|wali|waala|waale|waali)\b/i];
  for (const pattern of patterns) { const match = text.match(pattern); if (!match) continue; const value = Number(match[1]); if (Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT) return value; } return null;
};

const extractProductVariant = (itemText) => {
  const cleaned = cleanText(itemText); if (!cleaned) return null;
  const price = parsePriceHint(cleaned); if (price === null) return null;
  const quantity = extractQuantityAndUnit(cleaned);
  const productText = cleaned.replace(/\b\d+(?:\.\d+)?\s*(?:wala|wale|wali|waala|waale|waali)\b/gi, ' ').replace(/(?:₹|rs\.?|rupees?|rupee|rupaye|rupay|rupiya|rupiye)\s*\d+(?:\.\d+)?/gi, ' ').replace(/\s+/g, ' ').trim();
  return { price_hint: price, product_text: productText, qty: quantity.qty, unit: quantity.unit };
};

// Detects phrases like "500 dalo", "500 jama karo", "rs 500 add karo" — a bare
// rupee amount with a generic deposit verb and NO product words. Without this,
// the leftover text falls through to productFromWords(), whose fuzzy matcher
// can accidentally match the digits against a product name that happens to
// contain the same number (e.g. "FORTUNE BESAN 500 GM"), turning a payment
// into a phantom sale. Explicit debt words (udhaar/udhar/baki/baaki) are
// excluded here since those mean the customer's due is INCREASING, not that
// they paid — that direction is left as sale.create/khata debit as before.
// Same shape as isPureAmountKhataCredit/Debit but doesn't require a specific
// keyword to be present — used when extractKhataItemCommand's pattern already
// told us the direction (e.g. "X ko Y udhaar" already consumed "udhaar" into
// the match, so it won't be in itemText anymore).
const parseBareKhataAmount = (itemText) => {
  if (!itemText) return null;
  const normalized = String(itemText).toLowerCase().replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(?:₹|rs\.?|rupees?|rupee|rupaye|rupay)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?|rupaye|rupay|rs\.?)?\s*(?:dalo|daalo|daal|jama\s*karo|jama|jodo|jod|credit|add\s*karo|add|udhaar|udhar|baki|baaki)?\s*(?:karo|kar\s*do|do|de\s*do)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT ? amount : null;
};

const isPureAmountKhataCredit = (itemText) => {
  if (!itemText) return null;
  const normalized = String(itemText).toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\b(?:udhaar|udhar|baki|baaki)\b/i.test(normalized)) return null;
  const match = normalized.match(/^(?:₹|rs\.?|rupees?|rupee|rupaye|rupay)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?|rupaye|rupay|rs\.?)?\s*(?:dalo|daalo|daal|jama\s*karo|jama|jodo|jod|credit|add\s*karo|add)?\s*(?:karo|kar\s*do|do)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT ? amount : null;
};

// Mirror of isPureAmountKhataCredit for the opposite direction: "500 udhar",
// "500 udhaar do" etc mean the customer's due is INCREASING (they're taking
// goods/cash on credit), not that they paid. Without this, 'udhar'/'baki' were
// never filtered out anywhere and productFromWords() would fabricate a fake
// product literally named "Udhar" from the leftover word.
const isPureAmountKhataDebit = (itemText) => {
  if (!itemText) return null;
  const normalized = String(itemText).toLowerCase().replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(?:₹|rs\.?|rupees?|rupee|rupaye|rupay)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?|rupaye|rupay|rs\.?)?\s*(?:udhaar|udhar|baki|baaki)\s*(?:karo|kar\s*do|do|dalo|daalo)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT ? amount : null;
};

const extractKhataItemCommand = (raw, customerNames) => {
  if (!raw) return null; const normalized = raw.replace(/\s+/g, ' ').trim();
  // direction: 'debit' means the pattern itself already implies "customer owes
  // more" (it consumed the udhaar/credit keyword into the match), so itemText
  // for these no longer contains that keyword and must be treated as a bare
  // amount owed, not re-checked for the keyword. null means direction is
  // ambiguous and must be inferred from whatever's left in itemText.
  const patterns = [
    { re: /^(.+?)\s+(?:ke|ka|ki)\s+(?:khate|khata|account|accounts)\s+(?:mein|me)\s+(.+)$/i, direction: null },
    { re: /^(.+?)\s+(?:ke|ka|ki)\s+(?:udhaar|udhar|baki|baaki|credit)\s+(?:mein|me)\s+(.+)$/i, direction: 'debit' },
    { re: /^(.+?)\s+ko\s+(.+?)\s+(?:udhaar|udhar|credit)(?:\s+(?:do|de\s*do))?$/i, direction: 'debit' },
  ];
  for (const { re, direction } of patterns) {
    const match = normalized.match(re);
    if (!match) continue;
    const rawCustomer = cleanCustomerName(match[1]); const itemText = cleanText(match[2]);
    if (rawCustomer && itemText) return { customer_name: titleCase(rawCustomer), itemText, direction };
  }
  const knownCustomer = matchKnownCustomer(raw, customerNames);
  if (knownCustomer) {
    const escaped = knownCustomer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Strip the customer name wherever it appears, not just at the start —
    // e.g. "credit given to Suresh 500 rupees" has the name mid-sentence, and
    // an anchored ^-only replace left it (and "credit given to") sitting in
    // itemText, which then got misread as a product.
    const remainder = normalized.replace(new RegExp('\\b' + escaped + '\\b', 'i'), '').replace(/^(?:ke\s+)?(?:khate|khata|account|udhaar|udhar)\s+(?:mein|me)\s+/i, '').replace(/\s+/g, ' ').trim();
    if (remainder) return { customer_name: titleCase(knownCustomer), itemText: remainder, direction: null };
  }
  return null;
};

// Small, bounded edit-distance check used only as a fallback when a plain substring
// match fails. Guarded so it only ever helps with STT-style near-misses
// (soybean vs soyabean, chungs vs chunks) and doesn't loosely match short/unrelated words.
const levenshteinDistance = (a, b) => {
  const al = a.length, bl = b.length;
  if (al === 0) return bl; if (bl === 0) return al;
  let prevRow = Array.from({ length: bl + 1 }, (_, j) => j);
  for (let i = 1; i <= al; i++) {
    const currRow = [i];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(prevRow[j] + 1, currRow[j - 1] + 1, prevRow[j - 1] + cost);
    }
    prevRow = currRow;
  }
  return prevRow[bl];
};

const fuzzyWordMatch = (nameWord, rawWord) => {
  // Guard first, on BOTH the substring and edit-distance checks: without this,
  // single-letter/short name tokens (e.g. the "G" in "Parle G") trivially
  // substring-match almost anything, and short 5-letter words collide with
  // each other at edit-distance 1 (e.g. "chana" vs "chang").
  if (nameWord.length < 4 || rawWord.length < 4) return false;
  if (nameWord.includes(rawWord) || rawWord.includes(nameWord)) return true;
  if (nameWord.length < 6 || rawWord.length < 6) return false;
  const maxLen = Math.max(nameWord.length, rawWord.length);
  const threshold = maxLen <= 7 ? 1 : 2;
  return levenshteinDistance(nameWord, rawWord) <= threshold;
};

const productFromInventory = (raw, inventoryNames) => {
  if (!Array.isArray(inventoryNames) || inventoryNames.length === 0) return null;
  const rawNormalized = normalizeAliasText(raw); if (!rawNormalized) return null;
  const sorted = [...inventoryNames].filter(Boolean).map((name) => String(name).trim()).filter(Boolean);
  
  // Exact or substring match first
  const exactCandidates = sorted.filter((name) => rawNormalized.includes(normalizeAliasText(name))).sort((a, b) => normalizeAliasText(b).length - normalizeAliasText(a).length);
  if (exactCandidates.length) return exactCandidates[0];

  // Alias check
  for (const group of PRODUCT_ALIASES) {
    for (const alias of group.aliases) {
      if (rawNormalized.includes(normalizeAliasText(alias))) {
        const canonical = normalizeAliasText(group.canonical);
        const match = sorted.find(name => normalizeAliasText(name).includes(canonical) || canonical.includes(normalizeAliasText(name)));
        if (match) return match;
      }
    }
  }

  // Token-based fuzzy match for long names like "sonal sabudana" -> "SONAL SABUDANA KHICHI DI"
  const rawWords = rawNormalized.split(/\s+/).filter(word => word.length >= 2 && !STOP_WORDS.has(word));
  if (!rawWords.length) return null;

  let bestMatch = null, maxMatchedWords = 0;
  for (const name of sorted) {
    const nameLower = normalizeAliasText(name);
    const nameWords = nameLower.split(/\s+/);
    let matchedCount = 0;
    for (const word of rawWords) {
      if (nameLower.includes(word) || nameWords.some((nw) => fuzzyWordMatch(nw, word))) matchedCount++;
    }
    if (matchedCount > maxMatchedWords) {
      maxMatchedWords = matchedCount;
      bestMatch = name;
    }
  }

  return maxMatchedWords > 0 ? bestMatch : null;
};

const productFromWords = (raw, inventoryNames) => {
  const exact = productFromInventory(raw, inventoryNames);
  if (exact) return exact;
  
  const tokens = raw.split(/\s+/).filter((word) => {
    if (!word || /^(?:₹|rs\.?|rupees?)?\d+(?:\.\d+)?$/i.test(word) || normalizeUnit(word) || FRACTION_WORDS[word] !== undefined || STOP_WORDS.has(word)) return false;
    const ignored = ['sell', 'becho', 'bechi', 'bikri', 'sale', 'bill', 'add', 'jodo', 'daalo', 'dalo', 'stock', 'plus', 'remove', 'khata', 'khate', 'udhaar', 'udhar', 'baki', 'baaki', 'cash', 'nagad', 'rokar', 'received', 'from', 'ne', 'se', 'discount', 'percent', 'payment', 'jama', 'create', 'make', 'open', 'new', 'account', 'accounts', 'customer', 'customers', 'banao', 'bnao', 'bana', 'banado', 'banaao', 'named', 'called', 'how', 'much', 'many', 'have', 'has', 'left', 'remaining', 'kitna', 'kitni', 'kitne', 'mere', 'mera', 'meri', 'pass', 'paas', 'bacha', 'bache', 'baki', 'baaki', 'hai', 'hain', 'today', 'aaj', 'ke', 'ka', 'ki', 'ko', 'mein', 'me', 'wala', 'wale', 'wali', 'waala', 'waale', 'waali', 'rupee', 'rupees', 'rupaye', 'rupay', 'rs', 'price', 'rate', 'वाला', 'वाले', 'वाली', 'रुपये', 'रुपए', 'karo', 'kar', 'do', 'increase', 'badhao', 'badao', 'decrease', 'ghatao', 'kam', 'balance', 'bakaya', 'dues', 'due', 'total', 'hisab', 'hisaab'];
    return !ignored.includes(word);
  });
  return tokens.length ? titleCase(tokens.join(' ')) : null;
};

const isInventoryQuery = (raw, clean) => /\b(how\s+much|how\s+many|stock|inventory|have|has|left|remaining)\b/i.test(raw) || /\b(kitna|kitni|kitne|mere\s+pass|mere\s+paas|mera\s+pass|meri\s+pass|bacha|bache|baki|baaki)\b/i.test(raw);
const isTodayKhataSummary = (raw) => /\b(today|aaj|aajki|aaj\s+ki)\b/i.test(raw) && /\b(udhaar|udhar|baki|khata|balance|bakaya)\b/i.test(raw);

export function parseVoiceCommandLocally(text, inventoryNames = [], customerNames = []) {
  const { raw, clean, normalized } = normalizeText(text);
  if (!raw) return makeResult({ intent: 'unknown', confidence: 0 });

  const customer = extractCustomerCreation(raw);
  if (customer) return makeResult({ intent: 'customer.create', customer_name: customer, confidence: 0.99 });

  const payment = extractPayment(clean, raw, customerNames);
  if (payment && payment.customer_name) return makeResult({ intent: payment.isReceived ? 'khata.credit' : 'khata.debit', customer_name: payment.customer_name, amount: payment.amount, payment_type: 'KHATA', resolved_inventory_id: null, inventory_item_id: null, confidence: 0.99 });

  const khataItem = extractKhataItemCommand(normalized, customerNames);
  if (khataItem) {
    if (khataItem.direction === 'debit') {
      const amt = parseBareKhataAmount(khataItem.itemText);
      if (amt !== null) return makeResult({ intent: 'khata.debit', customer_name: khataItem.customer_name, amount: amt, payment_type: 'KHATA', resolved_inventory_id: null, inventory_item_id: null, confidence: 0.97 });
      // else falls through below: rare case like "Suresh ko sugar udhaar do" — an actual product given on credit
    } else {
      const bareCredit = isPureAmountKhataCredit(khataItem.itemText);
      if (bareCredit !== null) return makeResult({ intent: 'khata.credit', customer_name: khataItem.customer_name, amount: bareCredit, payment_type: 'KHATA', resolved_inventory_id: null, inventory_item_id: null, confidence: 0.97 });
      const bareDebit = isPureAmountKhataDebit(khataItem.itemText);
      if (bareDebit !== null) return makeResult({ intent: 'khata.debit', customer_name: khataItem.customer_name, amount: bareDebit, payment_type: 'KHATA', resolved_inventory_id: null, inventory_item_id: null, confidence: 0.97 });
    }
    const variant = extractProductVariant(khataItem.itemText), itemQty = variant ? variant.qty : extractQuantityAndUnit(khataItem.itemText).qty, itemUnit = variant ? variant.unit : extractQuantityAndUnit(khataItem.itemText).unit, itemPriceHint = variant ? variant.price_hint : parsePriceHint(khataItem.itemText), itemProduct = productFromWords(variant ? variant.product_text : khataItem.itemText, inventoryNames);
    if (itemProduct) return makeResult({ intent: 'sale.create', product: itemProduct, qty: itemPriceHint !== null && !itemUnit && itemQty === itemPriceHint ? 1 : itemQty, unit: itemUnit, customer_name: khataItem.customer_name, payment_type: 'KHATA', price_hint: itemPriceHint, confidence: 0.99 });
  }

  const discountMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|discount)/);
  if (discountMatch) { const discount = Number(discountMatch[1]); if (Number.isFinite(discount) && discount >= 0 && discount <= 100) return makeResult({ intent: 'pos.apply_discount', discount_percent: discount, confidence: 0.97 }); }

  if (isTodayKhataSummary(raw)) return makeResult({ intent: 'query.khata.summary', time_period: 'today', confidence: 0.98 });

  if (isKhataQuery(raw)) {
    const matchedCustomer = extractCustomerQueryCustomer(raw, customerNames);
    return makeResult({ intent: 'query.khata', customer_name: matchedCustomer, time_period: /\b(today|aaj)\b/i.test(raw) ? 'today' : null, confidence: matchedCustomer ? 0.95 : 0.9 });
  }

  let { qty, unit } = extractQuantityAndUnit(normalized);
  const price_hint = parsePriceHint(normalized);
  const product = productFromInventory(normalized, inventoryNames) || productFromWords(normalized, inventoryNames);

  if (isInventoryQuery(raw, clean)) return makeResult({ intent: 'query.inventory', product, qty, unit, confidence: product ? 0.97 : 0.78 });

  if (product) {
    const customerName = matchKnownCustomer(raw, customerNames);
    return makeResult({ intent: 'sale.create', product, qty, unit, customer_name: customerName, payment_type: customerName ? 'KHATA' : null, price_hint, confidence: 0.92 });
  }

  return makeResult({ intent: 'unknown', product: null, qty, unit, confidence: 0.4 });
}

export const getSupportedVoiceUnits = () => Array.from(ALL_UNITS);
export { parsePriceHint, canonicalProductSpeech, productFromInventory, extractKhataItemCommand, extractProductVariant };
export default parseVoiceCommandLocally;