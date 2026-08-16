/*
 * ============================================================
 * StoreMate Offline-First Voice Router
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Always create a local interpretation first.
 * 2. Offline -> use local immediately.
 * 3. Online -> try backend AI only when appropriate.
 * 4. NEVER allow backend AI to override a high-confidence
 *    local transactional interpretation.
 *
 * This is intentionally conservative because voice commands
 * can modify inventory, sales, money and customer records.
 * ============================================================
 */

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../../config/api';

import {
  parseVoiceCommandLocally,
} from './LocalVoiceParser';


const SERVER_TIMEOUT_MS = 5000;


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

const safeString = value =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .slice(0, 500)
    : '';


const isUsableNetwork = state =>
  state?.isConnected === true &&
  state?.isInternetReachable !== false;


/*
 * ============================================================
 * LOCAL PRIORITY INTENTS
 * ============================================================
 *
 * These commands can directly change:
 *
 * - customers
 * - Khata
 * - payments
 * - inventory
 * - prices
 * - sales
 *
 * If the local parser confidently understands one of these,
 * the backend AI is NOT allowed to reinterpret it.
 *
 * This is important for offline-first behavior and prevents
 * online AI from changing a correctly detected command.
 * ============================================================
 */

const LOCAL_PRIORITY_INTENTS = new Set([
  'customer.create',
  'khata.credit',
  'query.khata',
  'inventory.create',
  'inventory.add',
  'inventory.update_price',
  'sale.create',
]);


/*
 * ============================================================
 * NORMALIZE REMOTE RESULT
 * ============================================================
 */

const normalizeRemoteResult = remote => {

  if (
    !remote ||
    typeof remote !== 'object' ||
    Array.isArray(remote) ||
    typeof remote.intent !== 'string'
  ) {
    return null;
  }

  return {
    ...remote,

    intent:
      remote.intent
        .trim()
        .toLowerCase(),

    source:
      remote.source || 'remote',
  };
};


/*
 * ============================================================
 * MAIN ROUTER
 * ============================================================
 */

export async function parseVoiceCommand({
  text,
  inventoryNames = [],
  customerNames = [],
}) {

  const safeText =
    safeString(text);


  /*
   * ==========================================================
   * EMPTY COMMAND
   * ==========================================================
   */

  if (!safeText) {

    return parseVoiceCommandLocally(
      '',
      inventoryNames,
      customerNames
    );
  }


  /*
   * ==========================================================
   * LOCAL PARSE FIRST
   * ==========================================================
   *
   * This ALWAYS runs.
   *
   * Therefore voice commands do not depend on internet
   * availability for basic command recognition.
   */

  const localResult =
    parseVoiceCommandLocally(
      safeText,
      inventoryNames,
      customerNames
    );


  /*
   * ==========================================================
   * LOCAL TRANSACTIONAL PRIORITY
   * ==========================================================
   *
   * Example:
   *
   * "create Ravi account"
   *
   * Local parser:
   *
   * customer.create
   * customer_name = Ravi
   *
   * We immediately return it.
   *
   * Backend AI never gets the opportunity to reinterpret
   * it as a product or sale.
   */

  if (
    LOCAL_PRIORITY_INTENTS.has(
      localResult?.intent
    ) &&
    Number(
      localResult?.confidence || 0
    ) >= 0.90
  ) {

    return {
      ...localResult,

      source:
        'local_priority',
    };
  }


  /*
   * ==========================================================
   * CHECK NETWORK
   * ==========================================================
   *
   * If there is no internet:
   *
   * LOCAL RESULT IS RETURNED IMMEDIATELY.
   *
   * No backend call is attempted.
   */

  try {

    const networkState =
      await NetInfo.fetch();


    if (
      !isUsableNetwork(
        networkState
      )
    ) {

      return localResult;
    }

  } catch {

    /*
     * NetInfo failure must NEVER break voice commands.
     *
     * Remain offline-first.
     */

    return localResult;
  }


  /*
   * ==========================================================
   * BACKEND REQUEST
   * ==========================================================
   *
   * Only reached when:
   *
   * 1. Local parser did not produce a high-confidence
   *    transactional intent.
   *
   * 2. Internet appears available.
   */

  const controller =
    new AbortController();


  const timeoutId =
    setTimeout(
      () =>
        controller.abort(),
      SERVER_TIMEOUT_MS
    );


  try {

    /*
     * ========================================================
     * AUTH TOKEN
     * ========================================================
     *
     * /api/v1/ai/parse-intent requires a valid JWT on the
     * backend. Using getItem (single-key) here, NOT multiGet,
     * consistent with the AsyncStorage fix applied elsewhere
     * in this app.
     *
     * The header is attached conditionally: if no token is
     * found (e.g. a rare storage read failure), the request
     * still goes out. The backend will then correctly return
     * 401, which the existing "BACKEND FAILURE -> LOCAL" check
     * below already handles by falling back to the local
     * result. Voice commands degrade gracefully either way.
     */

    let token = null;

    try {
      token = await AsyncStorage.getItem('userToken');
    } catch (tokenError) {
      console.log(
        'VoiceCommandRouter: failed to read auth token',
        tokenError?.message
      );
    }

    const response =
      await fetch(
        `${BASE_URL}/api/v1/ai/parse-intent`,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',
            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {}),
          },

          body:
            JSON.stringify({
              text:
                safeText,

              inventory_names:
                Array.isArray(
                  inventoryNames
                )
                  ? inventoryNames
                  : [],

              customer_names:
                Array.isArray(
                  customerNames
                )
                  ? customerNames
                  : [],
            }),

          signal:
            controller.signal,
        }
      );


    /*
     * ========================================================
     * BACKEND FAILURE -> LOCAL
     * ========================================================
     *
     * Also covers a 401 from a missing/expired token — voice
     * commands never hard-fail, they just fall back to the
     * local parser.
     */

    if (
      !response.ok
    ) {

      return localResult;
    }


    const remoteRaw =
      await response.json();


    const remote =
      normalizeRemoteResult(
        remoteRaw
      );


    /*
     * Invalid backend response -> local.
     */

    if (!remote) {

      return localResult;
    }


    /*
     * ========================================================
     * SECOND SAFETY CHECK
     * ========================================================
     *
     * This protects against a situation where the local
     * confidence was slightly below the first threshold but
     * still strong enough that we don't want the backend
     * changing the meaning of a transactional command.
     */

    if (
      LOCAL_PRIORITY_INTENTS.has(
        localResult?.intent
      ) &&
      Number(
        localResult?.confidence || 0
      ) >= 0.85
    ) {

      return {
        ...localResult,

        source:
          'local_priority',

        remoteIntent:
          remote.intent,
      };
    }


    /*
     * ========================================================
     * REMOTE RESULT
     * ========================================================
     *
     * Only commands that local parsing could not confidently
     * classify reach this point.
     */

    return {
      ...remote,

      source:
        remote.source ||
        'remote',
    };

  } catch {

    /*
     * ========================================================
     * NETWORK / TIMEOUT / DNS FAILURE
     * ========================================================
     *
     * Always fall back to local interpretation.
     *
     * This is the critical offline-first behavior.
     */

    return localResult;

  } finally {

    clearTimeout(
      timeoutId
    );
  }
}


export default parseVoiceCommand;