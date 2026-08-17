/*
 * ============================================================
 * StoreMate Offline-First Voice Command Router
 * ============================================================
 *
 * RESPONSIBILITIES
 * ------------------------------------------------------------
 *
 * 1. ALWAYS parse locally first.
 * 2. Work without internet.
 * 3. Use backend AI only when local interpretation is not
 *    sufficiently confident.
 * 4. NEVER allow backend AI to override a high-confidence
 *    local transactional command.
 * 5. Pass quantity + unit information through unchanged.
 * 6. Unit conversion is handled downstream by IntentHandler /
 *    UnitConversion.js.
 *
 * ARCHITECTURE
 * ------------------------------------------------------------
 *
 * Voice
 *   ↓
 * LocalVoiceParser
 *   ↓
 * High-confidence transaction?
 *   ├── YES → local result
 *   │
 *   └── NO
 *        ↓
 *      Internet?
 *        ├── NO → local result
 *        │
 *        └── YES → Backend AI
 *                       ↓
 *                    Remote result
 *
 * IMPORTANT
 * ------------------------------------------------------------
 *
 * This router does NOT perform inventory quantity conversion.
 *
 * Example:
 *
 * "add 200 gram sugar"
 *
 * LocalVoiceParser:
 *
 * {
 *   intent: "inventory.add",
 *   product: "sugar",
 *   quantity: 200,
 *   unit: "GRAM"
 * }
 *
 * Then:
 *
 * IntentHandler
 *      ↓
 * UnitConversion
 *      ↓
 * 200 GRAM → 0.2 KG
 *
 * ============================================================
 */

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BASE_URL } from '../../config/api';

import {
  parseVoiceCommandLocally,
} from './LocalVoiceParser';


/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const SERVER_TIMEOUT_MS = 5000;


/*
 * High-confidence local transaction threshold.
 *
 * If the local parser reaches this confidence level,
 * backend AI is completely bypassed.
 */

const LOCAL_TRANSACTION_CONFIDENCE = 0.90;


/*
 * Safety threshold.
 *
 * Even if local confidence is slightly below the primary
 * threshold, a sufficiently strong transactional result
 * should still prevent the backend from changing its meaning.
 */

const LOCAL_SAFETY_CONFIDENCE = 0.85;


/*
 * ============================================================
 * LOCAL TRANSACTIONAL INTENTS
 * ============================================================
 *
 * These intents can modify important shop data.
 *
 * A high-confidence local interpretation of these commands
 * should NEVER be replaced by backend AI.
 *
 * IMPORTANT:
 *
 * Only intents actually produced by LocalVoiceParser should
 * be added here.
 *
 * ============================================================
 */

const LOCAL_PRIORITY_INTENTS = new Set([

  /*
   * ----------------------------------------------------------
   * CUSTOMER
   * ----------------------------------------------------------
   */

  'customer.create',

  'customer.update',

  'customer.delete',


  /*
   * ----------------------------------------------------------
   * KHATA
   * ----------------------------------------------------------
   */

  'khata.credit',

  'khata.debit',

  'khata.payment',

  'khata.settle',

  'khata.update',

  'khata.delete',

  'query.khata',


  /*
   * ----------------------------------------------------------
   * INVENTORY
   * ----------------------------------------------------------
   */

  'inventory.create',

  'inventory.add',

  'inventory.remove',

  'inventory.update',

  'inventory.update_price',

  'inventory.delete',


  /*
   * ----------------------------------------------------------
   * SALES
   * ----------------------------------------------------------
   */

  'sale.create',

  'sale.update',

  'sale.delete',


  /*
   * ----------------------------------------------------------
   * PURCHASES
   * ----------------------------------------------------------
   */

  'purchase.create',

  'purchase.update',


  /*
   * ----------------------------------------------------------
   * EXPENSES
   * ----------------------------------------------------------
   */

  'expense.create',

]);


/*
 * ============================================================
 * SAFE STRING
 * ============================================================
 */

const safeString = value => {

  if (
    typeof value !== 'string'
  ) {
    return '';
  }


  return value
    .replace(
      /[\u0000-\u001F\u007F]/g,
      ''
    )
    .trim()
    .slice(0, 500);
};


/*
 * ============================================================
 * SAFE ARRAY
 * ============================================================
 */

const safeArray = value => {

  if (
    !Array.isArray(value)
  ) {
    return [];
  }


  return value
    .filter(
      item =>
        typeof item === 'string'
    )
    .map(
      item =>
        safeString(item)
    )
    .filter(
      Boolean
    )
    .slice(0, 1000);
};


/*
 * ============================================================
 * NETWORK CHECK
 * ============================================================
 *
 * Network is considered usable when:
 *
 * isConnected === true
 *
 * AND
 *
 * isInternetReachable !== false
 *
 * If isInternetReachable is null/unknown,
 * we still allow the request.
 *
 * ============================================================
 */

const isUsableNetwork = state => {

  return (
    state?.isConnected === true &&
    state?.isInternetReachable !== false
  );
};


/*
 * ============================================================
 * CONFIDENCE
 * ============================================================
 */

const getConfidence = result => {

  const confidence =
    Number(
      result?.confidence
    );


  if (
    !Number.isFinite(
      confidence
    )
  ) {
    return 0;
  }


  return Math.max(
    0,
    Math.min(
      1,
      confidence
    )
  );
};


/*
 * ============================================================
 * IS LOCAL PRIORITY INTENT
 * ============================================================
 */

const isLocalPriorityIntent = result => {

  return (
    !!result &&
    LOCAL_PRIORITY_INTENTS.has(
      result.intent
    )
  );
};


/*
 * ============================================================
 * NORMALIZE REMOTE RESULT
 * ============================================================
 *
 * Backend must return an object containing at least:
 *
 * {
 *   intent: "inventory.add"
 * }
 *
 * Invalid responses are rejected and local interpretation
 * is used instead.
 *
 * ============================================================
 */

const normalizeRemoteResult = remote => {

  if (
    !remote ||
    typeof remote !== 'object' ||
    Array.isArray(remote)
  ) {
    return null;
  }


  if (
    typeof remote.intent !== 'string'
  ) {
    return null;
  }


  const intent =
    remote.intent
      .trim()
      .toLowerCase();


  if (!intent) {
    return null;
  }


  return {

    ...remote,

    intent,

    source:
      remote.source ||
      'remote',

  };
};


/*
 * ============================================================
 * LOCAL RESULT NORMALIZER
 * ============================================================
 *
 * We don't modify the parser's actual data.
 *
 * We only ensure the result is an object.
 *
 * ============================================================
 */

const normalizeLocalResult = local => {

  if (
    !local ||
    typeof local !== 'object' ||
    Array.isArray(local)
  ) {
    return {

      intent:
        'unknown',

      confidence:
        0,

      source:
        'local',

    };
  }


  return {

    ...local,

    source:
      local.source ||
      'local',

  };
};


/*
 * ============================================================
 * MAIN ROUTER
 * ============================================================
 *
 * parseVoiceCommand({
 *
 *   text,
 *
 *   inventoryNames,
 *
 *   customerNames
 *
 * })
 *
 * ============================================================
 */

export async function parseVoiceCommand({

  text,

  inventoryNames = [],

  customerNames = [],

}) {

  /*
   * ==========================================================
   * SANITIZE INPUT
   * ==========================================================
   */

  const safeText =
    safeString(text);


  const safeInventoryNames =
    safeArray(
      inventoryNames
    );


  const safeCustomerNames =
    safeArray(
      customerNames
    );


  /*
   * ==========================================================
   * EMPTY COMMAND
   * ==========================================================
   *
   * Even empty input goes through the local parser so that
   * LocalVoiceParser remains the single source of truth for
   * its fallback/unknown structure.
   * ==========================================================
   */

  if (!safeText) {

    const emptyResult =
      parseVoiceCommandLocally(
        '',
        safeInventoryNames,
        safeCustomerNames
      );


    return normalizeLocalResult(
      emptyResult
    );
  }


  /*
   * ==========================================================
   * LOCAL PARSE FIRST
   * ==========================================================
   *
   * THIS ALWAYS HAPPENS.
   *
   * Therefore:
   *
   * Internet ON  → local first
   * Internet OFF → local first
   *
   * ==========================================================
   */

  let localResult;


  try {

    localResult =
      parseVoiceCommandLocally(
        safeText,
        safeInventoryNames,
        safeCustomerNames
      );

  } catch (error) {

    /*
     * Local parser failure.
     *
     * We don't silently fabricate an intent.
     *
     * If online, backend gets a chance.
     */

    console.error(
      'VoiceCommandRouter: local parser failed',
      error?.message || error
    );


    localResult = {

      intent:
        'unknown',

      confidence:
        0,

      source:
        'local_error',

    };
  }


  localResult =
    normalizeLocalResult(
      localResult
    );


  /*
   * ==========================================================
   * LOCAL TRANSACTIONAL PRIORITY
   * ==========================================================
   *
   * Example:
   *
   * "add 200 gram sugar"
   *
   * Local:
   *
   * inventory.add
   * confidence 0.95
   *
   * → RETURN IMMEDIATELY.
   *
   * Backend AI is NOT contacted.
   *
   * ==========================================================
   */

  if (

    isLocalPriorityIntent(
      localResult
    ) &&

    getConfidence(
      localResult
    ) >=
    LOCAL_TRANSACTION_CONFIDENCE

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
   * return local interpretation.
   *
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

  } catch (error) {

    /*
     * NetInfo itself failed.
     *
     * Stay offline-first.
     */

    console.log(
      'VoiceCommandRouter: NetInfo unavailable, using local parser',
      error?.message || error
    );


    return localResult;
  }


  /*
   * ==========================================================
   * BACKEND REQUEST
   * ==========================================================
   *
   * Internet appears available.
   *
   * Local parser was not sufficiently confident to completely
   * own the command.
   *
   * Give backend AI a chance.
   * ==========================================================
   */

  const controller =
    new AbortController();


  const timeoutId =
    setTimeout(
      () => {

        controller.abort();

      },
      SERVER_TIMEOUT_MS
    );


  try {

    /*
     * ========================================================
     * AUTH TOKEN
     * ========================================================
     *
     * Your backend expects:
     *
     * Authorization:
     * Bearer <JWT>
     *
     * We use getItem because userToken is stored as one key.
     * ========================================================
     */

    let token = null;


    try {

      token =
        await AsyncStorage.getItem(
          'userToken'
        );

    } catch (tokenError) {

      console.log(
        'VoiceCommandRouter: failed to read auth token',
        tokenError?.message ||
          tokenError
      );
    }


    /*
     * ========================================================
     * REQUEST BODY
     * ========================================================
     */

    const requestBody = {

      text:
        safeText,

      inventory_names:
        safeInventoryNames,

      customer_names:
        safeCustomerNames,

      voice_language:
        'hi-en-hinglish',

      voice_features: {

        price_qualified_products:
          true,

        direct_khata_item_sales:
          true,

        product_aliases:
          true,

        mixed_units:
          true,

      },

      local_hint: {

        intent:
          localResult.intent,

        product:
          localResult.product ||
          null,

        qty:
          localResult.qty ??
          null,

        unit:
          localResult.unit ||
          null,

        price_hint:
          localResult.price_hint ??
          null,

        customer_name:
          localResult.customer_name ||
          null,

        payment_type:
          localResult.payment_type ||
          null,

        confidence:
          getConfidence(
            localResult
          ),

      },

    };


    /*
     * ========================================================
     * SEND TO BACKEND
     * ========================================================
     */

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
              ? {
                  Authorization:
                    `Bearer ${token}`,
                }
              : {}),

          },

          body:
            JSON.stringify(
              requestBody
            ),

          signal:
            controller.signal,

        }
      );


    /*
     * ========================================================
     * BACKEND FAILURE
     * ========================================================
     *
     * 401
     * 403
     * 404
     * 429
     * 500
     * 502
     * timeout
     *
     * ALL fall back to local.
     * ========================================================
     */

    if (
      !response.ok
    ) {

      console.log(
        `VoiceCommandRouter: backend returned ${response.status}; using local result`
      );


      return localResult;
    }


    /*
     * ========================================================
     * PARSE REMOTE JSON
     * ========================================================
     */

    let remoteRaw;


    try {

      remoteRaw =
        await response.json();

    } catch (jsonError) {

      console.log(
        'VoiceCommandRouter: invalid backend JSON',
        jsonError?.message ||
          jsonError
      );


      return localResult;
    }


    /*
     * ========================================================
     * NORMALIZE REMOTE
     * ========================================================
     */

    const remote =
      normalizeRemoteResult(
        remoteRaw
      );


    /*
     * Invalid backend response.
     */

    if (!remote) {

      return localResult;
    }


    /*
     * ========================================================
     * SECOND TRANSACTION SAFETY CHECK
     * ========================================================
     *
     * Example:
     *
     * Local:
     *
     * inventory.add
     * confidence 0.87
     *
     * Remote:
     *
     * sale.create
     *
     * We DO NOT allow the remote model to reinterpret it.
     *
     * ========================================================
     */

    if (

      isLocalPriorityIntent(
        localResult
      ) &&

      getConfidence(
        localResult
      ) >=
      LOCAL_SAFETY_CONFIDENCE

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
     * Local parser was not confident enough to claim the
     * command.
     *
     * Backend AI is therefore allowed to interpret it.
     *
     * ========================================================
     */

    return {

      ...remote,

      source:
        remote.source ||
        'remote',

    };

  } catch (error) {

    /*
     * ========================================================
     * NETWORK / TIMEOUT / DNS FAILURE
     * ========================================================
     *
     * NEVER break the voice feature because internet failed.
     *
     * ========================================================
     */

    const errorMessage =
      error?.name === 'AbortError'

        ? 'Backend voice request timed out'

        : (
            error?.message ||
            'Unknown network error'
          );


    console.log(
      `VoiceCommandRouter: ${errorMessage}; using local result`
    );


    return localResult;

  } finally {

    clearTimeout(
      timeoutId
    );
  }
}


/*
 * ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */

export default parseVoiceCommand;