import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../../config/api';
import { processLocalVoiceCommand, canExecuteLocalCommand } from './LocalCommandPipeline';
import { bridgeGeminiCommand } from './GeminiCommandBridge';

const SERVER_TIMEOUT_MS = 5000;
const LOCAL_TRANSACTION_CONFIDENCE = 0.90;
const LOCAL_SAFETY_CONFIDENCE = 0.85;

const LOCAL_PRIORITY_INTENTS = new Set([
  'customer.create', 'customer.update', 'customer.delete',
  'khata.credit', 'khata.debit', 'khata.payment', 'khata.settle', 'khata.update', 'khata.delete',
  'inventory.create', 'inventory.add', 'inventory.remove', 'inventory.update', 'inventory.update_price', 'inventory.delete',
  'sale.create', 'sale.update', 'sale.delete', 'pos.add_item', 'pos.apply_discount', 'pos.checkout',
  'purchase.create', 'purchase.update', 'expense.create',
]);

const safeString = value => typeof value !== 'string' ? '' : value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 500);
const safeArray = value => !Array.isArray(value) ? [] : value.filter(Boolean).slice(0, 2000);
const normalizeInventory = inventory => !Array.isArray(inventory) ? [] : inventory.filter(Boolean).slice(0, 2000);

const getInventoryNames = (inventory, inventoryNames) => {
  if (Array.isArray(inventory) && inventory.length > 0) return inventory.map(item => { if (!item) return null; return String(item.productName ?? item.product_name ?? item.name ?? '').trim().slice(0, 150); }).filter(Boolean).slice(0, 1000);
  return safeArray(inventoryNames).map(value => String(value).trim().slice(0, 150)).filter(Boolean).slice(0, 1000);
};

const isUsableNetwork = state => (state?.isConnected === true && state?.isInternetReachable !== false);
const getConfidence = result => { const value = Number(result?.command?.confidence ?? result?.confidence); return !Number.isFinite(value) ? 0 : Math.max(0, Math.min(1, value)); };
const isLocalPriorityIntent = result => Boolean(result?.command && typeof result.command === 'object' && typeof result.command.intent === 'string' && LOCAL_PRIORITY_INTENTS.has(result.command.intent));

const normalizeRemoteResult = remote => {
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return null;
  const command = remote.command && typeof remote.command === 'object' && !Array.isArray(remote.command) ? remote.command : remote;
  if (typeof command.intent !== 'string' || !command.intent.trim().toLowerCase()) return null;
  return { ...command, intent: command.intent.trim().toLowerCase(), source: remote.source || command.source || 'remote', remote_status: remote.status || null };
};

export async function parseVoiceCommand({ text, inventory = [], inventoryNames = [], customerNames = [] } = {}) {
  const safeText = safeString(text), safeInventory = normalizeInventory(inventory), safeCustomerNames = safeArray(customerNames);
  if (!safeText) return { status: 'INVALID_COMMAND', command: null, source: 'local', confidence: 0 };

  console.log('COUNTR VOICE ROUTER INPUT:', { text: safeText, inventoryCount: safeInventory.length, inventoryNamesCount: Array.isArray(inventoryNames) ? inventoryNames.length : 0, customerNamesCount: safeCustomerNames.length });

  let localResult;
  try { localResult = processLocalVoiceCommand({ text: safeText, inventory: safeInventory, customerNames: safeCustomerNames }); } 
  catch (error) { console.error('VoiceCommandRouter: LocalCommandPipeline failed', error?.message || error); localResult = { status: 'PARSER_ERROR', reason: error?.message || 'Local command pipeline failed.', command: null, source: 'local_error', confidence: 0 }; }

  const localCanExecute = canExecuteLocalCommand(localResult), localConfidence = getConfidence(localResult), localPriority = isLocalPriorityIntent(localResult), localReady = localResult?.status === 'READY' && Boolean(localResult?.command && typeof localResult.command === 'object');
  if (localReady && localCanExecute && localPriority && localConfidence >= LOCAL_TRANSACTION_CONFIDENCE) { console.log('COUNTR VOICE ROUTER:', 'LOCAL_TRANSACTION'); return { ...localResult, source: 'local_pipeline', execution: 'local', cloud_called: false }; }
  if (localReady && !localPriority) return { ...localResult, source: 'local_pipeline', execution: 'local', cloud_called: false };

  let networkAvailable = false;
  try { 
    const netInfoPromise = NetInfo.fetch();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('NetInfo timeout')), 1000));
    const networkState = await Promise.race([netInfoPromise, timeoutPromise]);
    networkAvailable = isUsableNetwork(networkState); 
  } 
  catch (error) { 
    console.log('VoiceCommandRouter: NetInfo failed or timed out', error?.message || error); 
    networkAvailable = false; 
  }

  if (!networkAvailable) return { ...localResult, source: 'local_offline', execution: 'local', cloud_called: false };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);

  try {
    let token = null;
    try { token = await AsyncStorage.getItem('userToken'); } catch (error) {}

    const resolvedInventoryNames = getInventoryNames(safeInventory, inventoryNames), localCommand = localResult?.command || null;
    const requestBody = { text: safeText, inventory_names: resolvedInventoryNames, customer_names: safeCustomerNames, voice_language: 'hi-en-hinglish', mode: 'command_parser', response_mode: 'strict_command_json', local_hint: { status: localResult?.status || null, intent: localCommand?.intent || null, product: localCommand?.product || null, quantity: localCommand?.quantity ?? localCommand?.qty ?? null, qty: localCommand?.qty ?? localCommand?.quantity ?? null, unit: localCommand?.unit || null, price_hint: localCommand?.price_hint ?? null, amount: localCommand?.amount ?? null, customer_name: localCommand?.customer_name || null, payment_type: localCommand?.payment_type || null, confidence: localConfidence } };

    const response = await fetch(`${BASE_URL}/api/v1/ai/parse-intent`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(requestBody), signal: controller.signal });

    if (!response.ok) return { ...localResult, source: 'local_backend_error', execution: 'local', cloud_called: true, cloud_status: response.status };

    let remoteRaw;
    try { remoteRaw = await response.json(); } catch (error) { return { ...localResult, source: 'local_invalid_remote', execution: 'local', cloud_called: true }; }

    const remote = normalizeRemoteResult(remoteRaw);
    if (!remote) return { ...localResult, source: 'local_invalid_remote', execution: 'local', cloud_called: true };

    if (localPriority && localCanExecute && localConfidence >= LOCAL_SAFETY_CONFIDENCE) return { ...localResult, source: 'local_priority', execution: 'local', cloud_called: true, remote_intent: remote.intent, remote_result: remote };

    const bridged = bridgeGeminiCommand({ geminiResult: remote, inventory: safeInventory, customerNames: safeCustomerNames });
    if (!bridged || bridged.status !== 'READY') return { ...localResult, source: 'local_remote_rejected', execution: 'local', cloud_called: true, cloud_status: response.status, remote_intent: remote.intent };

    const remoteCommand = bridged?.command && typeof bridged.command === 'object' && !Array.isArray(bridged.command) ? bridged.command : null;
    if (!remoteCommand) return { ...localResult, source: 'local_invalid_bridge', execution: 'local', cloud_called: true };

    return { ...bridged, ...remoteCommand, command: remoteCommand, source: 'remote_ai', execution: 'remote', cloud_called: true, local_result: localResult, remote_result: remote };

  } catch (error) {
    const errorMessage = error?.name === 'AbortError' ? 'Backend voice request timed out' : (error?.message || 'Unknown network error');
    return { ...localResult, source: 'local_network_fallback', execution: 'local', cloud_called: true, cloud_error: errorMessage };
  } finally { clearTimeout(timeoutId); }
}

export default parseVoiceCommand;