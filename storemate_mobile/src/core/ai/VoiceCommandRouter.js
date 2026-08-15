/*
 * ============================================================
 * StoreMate Offline-First Voice Router
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Always create a local interpretation first.
 * 2. Offline -> use local immediately.
 * 3. Online -> try backend AI.
 * 4. NEVER allow backend AI to override high-confidence
 *    local safety classifications for financial/customer
 *    commands.
 *
 * This is intentionally conservative because voice commands
 * can modify inventory and money records.
 * ============================================================
 */

import NetInfo from '@react-native-community/netinfo';

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
 * SENSITIVE INTENTS
 * ============================================================
 *
 * These commands can change:
 *
 * - money
 * - Khata
 * - customer records
 * - inventory
 *
 * For these, a strong local interpretation gets priority.
 * ============================================================
 */

const LOCAL_PRIORITY_INTENTS = new Set([
  'customer.create',
  'khata.credit',
  'query.khata',
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
   * Empty command.
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
   * This is always available.
   */

  const localResult =
    parseVoiceCommandLocally(
      safeText,
      inventoryNames,
      customerNames
    );


  /*
   * ==========================================================
   * SENSITIVE LOCAL COMMANDS
   * ==========================================================
   *
   * Do NOT allow an online AI response to reinterpret:
   *
   * "Create Suresh account"
   *
   * as:
   *
   * sale.create / inventory.add
   *
   * Same for payment commands.
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
     * If NetInfo itself fails, remain offline-first.
     */

    return localResult;
  }


  /*
   * ==========================================================
   * BACKEND REQUEST
   * ==========================================================
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

    const response =
      await fetch(
        `${BASE_URL}/api/v1/ai/parse-intent`,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',
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
     * Backend failure -> local.
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


    if (!remote) {

      return localResult;
    }


    /*
     * ==========================================================
     * SECOND SAFETY CHECK
     * ==========================================================
     *
     * If local parser confidently identified a command as a
     * customer/payment command, NEVER replace it with a
     * conflicting remote interpretation.
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
     * ==========================================================
     * REMOTE RESULT
     * ==========================================================
     */

    return remote;

  } catch {

    /*
     * Timeout / DNS / server down / no internet.
     *
     * Local parser remains the fallback.
     */

    return localResult;

  } finally {

    clearTimeout(
      timeoutId
    );
  }
}


export default parseVoiceCommand;