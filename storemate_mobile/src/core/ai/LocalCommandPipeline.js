import { parseVoiceCommandLocally } from './LocalVoiceParser';
import { resolveInventoryVariant } from './InventoryVariantResolver';

const numberOrNull = value => { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
const cleanName = value => { if (value === null || value === undefined) return null; const text = String(value).trim(); return text || null; };
const normalizeText = value => String(value ?? '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();

const normalizeCustomerName = (text, customerNames = []) => {
  const normalized = normalizeText(text); if (!normalized) return null;
  const match = customerNames.find(name => normalizeText(name) === normalized); return match || text.trim();
};

const HINDI_NUMBER_WORDS = { zero: 0, shunya: 0, ek: 1, eka: 1, one: 1, do: 2, dono: 2, two: 2, teen: 3, tin: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, five: 5, chhe: 6, che: 6, chhah: 6, six: 6, saat: 7, sat: 7, seven: 7, aath: 8, ath: 8, eight: 8, nau: 9, no: 9, nine: 9, das: 10, ten: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19, bees: 20, ikkis: 21, baais: 22, teis: 23, chaubis: 24, pachis: 25, chhabis: 26, satais: 27, athais: 28, untees: 29, tees: 30, chaalis: 40, pachaas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90, sau: 100, ek_sau: 100, dedh: 1.5, aadha: 0.5, aadhi: 0.5, dhai: 2.5 };

const parseHindiNumber = value => {
  const text = normalizeText(value); if (!text) return null;
  const numeric = Number(text); if (Number.isFinite(numeric)) return numeric;
  if (HINDI_NUMBER_WORDS[text] !== undefined) return HINDI_NUMBER_WORDS[text];
  const tokens = text.split(/\s+/);
  if (tokens.length === 2) { const first = HINDI_NUMBER_WORDS[tokens[0]]; const second = HINDI_NUMBER_WORDS[tokens[1]]; if (first !== undefined && second !== undefined) { if (second === 100) return first * 100; return first + second; } }
  if (tokens.length === 3 && HINDI_NUMBER_WORDS[tokens[0]] === 1.5 && HINDI_NUMBER_WORDS[tokens[1]] === 100) return 150;
  return null;
};

const extractCustomerName = (text, customerNames = []) => {
  const normalized = normalizeText(text);
  for (const customer of customerNames) { const customerNormalized = normalizeText(customer); if (customerNormalized && normalized.includes(customerNormalized)) return customer; }
  const match = normalized.match(/^(.*?)\s+(?:ke|ki|ka)\s+(?:khate|khata|bahi|account)\b/i); if (match?.[1]) { const candidate = match[1].trim(); if (candidate) return normalizeCustomerName(candidate, customerNames); }
  const koMatch = normalized.match(/^(.*?)\s+ko\b/i); if (koMatch?.[1]) { const candidate = koMatch[1].trim(); if (candidate) return normalizeCustomerName(candidate, customerNames); }
  return null;
};

const extractMoneyAmount = text => {
  const normalized = normalizeText(text); if (!normalized) return null;
  const currencyNumericMatch = normalized.match(/(?:₹|rs\.?|rupees?|rupaye?|rupay|rupee|रुपये|रुपए|रुपया)\s*(\d+(?:\.\d+)?)/i); if (currencyNumericMatch) { const amount = Number(currencyNumericMatch[1]); if (Number.isFinite(amount) && amount > 0) return amount; }
  const reverseCurrencyNumericMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|rupaye?|rupay|rupee|रुपये|रुपए|रुपया)\b/i); if (reverseCurrencyNumericMatch) { const amount = Number(reverseCurrencyNumericMatch[1]); if (Number.isFinite(amount) && amount > 0) return amount; }
  const plainNumericMatch = normalized.match(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/i); if (plainNumericMatch) { const amount = Number(plainNumericMatch[1]); if (Number.isFinite(amount) && amount > 0) return amount; }
  if (normalized.match(/\bdedh\s+sau\b/i)) return 150;
  const numberWordMatch = normalized.match(/\b(ek|dono|do|teen|char|chaar|paanch|panch|chhe|che|chhah|saat|sat|aath|ath|nau|no|das|gyarah|barah|terah|chaudah|pandrah|solah|satrah|satra|atharah|unnis|bees|ikkis|baais|teis|chaubis|pachis|chhabis|satais|athais|untees|un-tees|tees|chaalis|pachaas|saath|sattar|assi|nabbe|sau|dedh|dhai)\b(?:\s+sau)?/i); if (numberWordMatch) return parseHindiNumber(numberWordMatch[0]);
  return null;
};

const isKhataPhrase = text => { const normalized = normalizeText(text); return ( /\b(?:ke|ki|ka)\s+(?:khate|khata|bahi)\b/i.test(normalized) || /\bkhate\s+mein\b/i.test(normalized) || /\bkhata\s+mein\b/i.test(normalized) || /\bbahi\s+mein\b/i.test(normalized) || /\baccount\s+mein\b/i.test(normalized) || /\baccount\s+me\b/i.test(normalized) ); };
const isMoneyLanguage = text => { const normalized = normalizeText(text); return ( /(?:₹|rs\.?|rupees?|rupaye?|rupay|rupee|रुपये|रुपए|रुपया)\b/i.test(normalized) || /\b(?:udhaar|udhar|credit|bahi|khata|khate|chadha|chadhaao|chadhao|chadao|chadha\s+do|likho|likh\s+do)\b/i.test(normalized) ); };

const looksLikeProductKhataCommand = text => {
  const normalized = normalizeText(text); if (!normalized) return false;
  return ( /\b\d+(?:\.\d+)?\s*(?:kilo|kilos|kg|gram|grams|gm|g|litre|litres|liter|liters|ml|packet|pack|pcs?|pieces?|piece|bottle|bottles|box|boxes|dabba|dabbe|dozen)\b/i.test(normalized) || /\b(?:sugar|chini|cheeni|rice|chawal|basmati|biscuit|biscuits|kurkure|parle|parle\s*g|parle\s*ji|tiger|atta|aata|dal|daal|oil|tel|salt|namak|soap|shampoo|milk|doodh|bread)\b/i.test(normalized) || /\b\d+(?:\.\d+)?\s*(?:wala|wale|wali|waala|waale|waali)\b/i.test(normalized) || /\b(?:ek|do|teen|char|chaar|paanch|che|chhe|saat|aath|nau|das)\s+(?:packet|pack|kilo|kg|gram|gm|piece|pcs?|bottle|box|dabba)\b/i.test(normalized) );
};

const looksLikeMoneyOnlyKhataCommand = ({ text, parsed, customerNames }) => {
  const normalized = normalizeText(text); const customerName = extractCustomerName(text, customerNames); if (!customerName) return false;
  const hasKhataContext = isKhataPhrase(text) || /\b(?:udhaar|udhar|credit)\b/i.test(normalized) || /\b(?:bahi|bahikhata)\b/i.test(normalized); if (!hasKhataContext) return false;
  if (looksLikeProductKhataCommand(text)) return false;
  const product = parsed?.product || parsed?.product_name || null; const quantity = numberOrNull(parsed?.qty ?? parsed?.quantity); const unit = parsed?.unit || null; const priceHint = numberOrNull(parsed?.price_hint ?? parsed?.variant_price);
  const hasRealProduct = Boolean(product && !/^(udhaar|udhar|bahi|bahikhata|khata|khate|chadha|chadhaao|chadhao|chadao|daal|daalo|dalo|jod|jodo|add|likh|likho|likhdo|kar|karo|kardo|de|dena)$/i.test(String(product).trim()));
  if (hasRealProduct) return false;
  if (quantity !== null && quantity > 0 && unit) return false;
  if (priceHint !== null) return false;
  const amount = extractMoneyAmount(text); if (amount === null || !Number.isFinite(amount) || amount <= 0) return false;
  if (!isMoneyLanguage(text)) return false;
  return true;
};

const buildNormalizedCommand = ({ parsed, resolved }) => {
  const command = { intent: parsed.intent || 'unknown', product: parsed.product || parsed.product_name || null, quantity: numberOrNull(parsed.qty ?? parsed.quantity), unit: parsed.unit || null, price_hint: numberOrNull(parsed.price_hint ?? parsed.variant_price), amount: numberOrNull(parsed.amount), customer_name: cleanName(parsed.customer_name), payment_type: parsed.payment_type || null, confidence: numberOrNull(parsed.confidence), source: 'local' };
  if (resolved && resolved.status === 'FOUND') { command.resolved_inventory_id = resolved.id; command.inventory_item_id = resolved.id; command.resolved_inventory_item = resolved.item || null; command.product = resolved.product_name || command.product; command.selling_price = numberOrNull(resolved.selling_price); command.inventory_unit = resolved.unit || null; command.stock_quantity = numberOrNull(resolved.stock_quantity); command.variant_resolved = true; } 
  else { command.resolved_inventory_id = null; command.inventory_item_id = null; command.resolved_inventory_item = null; command.variant_resolved = false; }
  return command;
};

export const processLocalVoiceCommand = ({ text, inventory = [], customerNames = [] } = {}) => {
  if (!text || typeof text !== 'string' || !text.trim()) return { status: 'INVALID_COMMAND', reason: 'Voice command is empty.', command: null };
  let parsed; try { parsed = parseVoiceCommandLocally(text, inventory.map(item => item?.productName ?? item?.product_name ?? item), customerNames); } catch (error) { return { status: 'PARSER_ERROR', reason: error?.message || 'Local voice parser failed.', command: null }; }
  if (!parsed) return { status: 'UNKNOWN_COMMAND', reason: 'Local parser returned no result.', parsed: null, command: null };

  const productKhata = looksLikeProductKhataCommand(text);
  if (!productKhata && looksLikeMoneyOnlyKhataCommand({ text, parsed, customerNames })) {
    const customerName = extractCustomerName(text, customerNames); const amount = extractMoneyAmount(text) ?? numberOrNull(parsed.amount);
    const moneyParsed = { ...parsed, intent: 'khata.credit', product: null, product_name: null, qty: null, quantity: null, unit: null, price_hint: null, variant_price: null, amount, customer_name: customerName, payment_type: 'KHATA' };
    return { status: 'READY', command: buildNormalizedCommand({ parsed: moneyParsed, resolved: null }), parsed: moneyParsed, inventory: null };
  }

  if (productKhata && (parsed.intent === 'khata.credit' || !parsed.product)) {
    const normalized = normalizeText(text);
    let productText = normalized.replace(/^.+?\s+(?:ke|ki|ka)\s+(?:khate|khata|bahi|account)\s+(?:mein|me)\s+/i, '').replace(/^.+?\s+ko\s+/i, '').replace(/\b(?:udhaar|udhar|credit)\b/gi, ' ').replace(/\b(?:daalo|dalo|daal|chadha\s+do|chadha|chadhao|chadao|jodo|jod|add|likho|likh\s+do|likhdo|karo|kar\s+do)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    const productMatch = productText.match(/(?:\d+(?:\.\d+)?\s*(?:kilo|kg|gram|gm|g|litre|liter|ml|packet|pack|piece|pcs?|bottle|box|dabba)\s+)?(.+?)(?:\s+\d+(?:\.\d+)?\s*(?:kilo|kg|gram|gm|g|litre|liter|ml|packet|pack|piece|pcs?|bottle|box|dabba))?$/i);
    const recoveredProduct = productMatch?.[1]?.trim() || productText;
    const customerName = extractCustomerName(text, customerNames);
    const recoveredQuantity = numberOrNull(parsed.qty ?? parsed.quantity), recoveredUnit = parsed.unit || null;
    parsed = { ...parsed, intent: 'sale.create', product: recoveredProduct || null, product_name: recoveredProduct || null, customer_name: customerName || parsed.customer_name || null, qty: recoveredQuantity || 1, quantity: recoveredQuantity || 1, unit: recoveredUnit, payment_type: 'KHATA' };
  }

  if (parsed.intent === 'unknown') return { status: 'UNKNOWN_COMMAND', reason: 'Local parser could not determine the command.', parsed, command: null };
  const hasProduct = Boolean(parsed.product || parsed.product_name);
  if (!hasProduct) return { status: 'READY', command: buildNormalizedCommand({ parsed, resolved: null }), parsed, inventory: null };

  let resolved; try { resolved = resolveInventoryVariant({ command: parsed, inventory }); } catch (error) { return { status: 'RESOLVER_ERROR', reason: error?.message || 'Inventory variant resolver failed.', parsed, command: null }; }
  if (!resolved || resolved.status !== 'FOUND') return { status: resolved?.status || 'VARIANT_NOT_FOUND', reason: resolved?.reason || 'Inventory variant could not be resolved.', parsed, command: buildNormalizedCommand({ parsed, resolved }), inventory: resolved || null };

  const command = buildNormalizedCommand({ parsed, resolved });
  if (parsed.payment_type === 'KHATA') command.payment_type = 'KHATA';
  return { status: 'READY', command, parsed, inventory: resolved };
};

export const canExecuteLocalCommand = result => {
  if (!result || result.status !== 'READY') return false;
  const command = result.command; if (!command) return false;
  if (command.intent === 'sale.create') return Boolean(command.resolved_inventory_id);
  if (command.intent === 'khata.credit') return Boolean(command.customer_name) && numberOrNull(command.amount) !== null;
  return true;
};

export default { processLocalVoiceCommand, canExecuteLocalCommand };