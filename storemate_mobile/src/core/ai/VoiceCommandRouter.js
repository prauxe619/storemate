/*
 * ============================================================
 * COUNTR - OFFLINE FIRST VOICE COMMAND ROUTER
 * ============================================================
 *
 * PHASE 3F
 *
 * Architecture:
 *
 * Voice text
 *     ↓
 * LocalCommandPipeline
 *     ↓
 * LocalVoiceParser
 *     ↓
 * InventoryVariantResolver
 *     ↓
 * Can execute locally?
 *     ├── YES → return LOCAL
 *     │
 *     └── NO
 *          ↓
 *       Internet?
 *          ├── NO → return local result
 *          │
 *          └── YES → Backend AI / Gemini
 *
 * IMPORTANT:
 *
 * Local commands always get first priority.
 *
 * We NEVER send a high-confidence executable local
 * transaction to Gemini.
 *
 * ============================================================
 */

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BASE_URL } from '../../config/api';

import {
  processLocalVoiceCommand,
  canExecuteLocalCommand,
} from './LocalCommandPipeline';

import {
  bridgeGeminiCommand,
} from './GeminiCommandBridge';


/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const SERVER_TIMEOUT_MS = 5000;


/*
 * ============================================================
 * LOCAL CONFIDENCE THRESHOLDS
 * ============================================================
 */

const LOCAL_TRANSACTION_CONFIDENCE = 0.90;

const LOCAL_SAFETY_CONFIDENCE = 0.85;


/*
 * ============================================================
 * LOCAL PRIORITY INTENTS
 * ============================================================
 *
 * These are important transactional operations.
 *
 * If LocalCommandPipeline produces one of these with enough
 * confidence and it is executable, Gemini must NOT override it.
 * ============================================================
 */

const LOCAL_PRIORITY_INTENTS = new Set([

  /*
   * CUSTOMER
   */

  'customer.create',
  'customer.update',
  'customer.delete',


  /*
   * KHATA
   */

  'khata.credit',
  'khata.debit',
  'khata.payment',
  'khata.settle',
  'khata.update',
  'khata.delete',


  /*
   * INVENTORY
   */

  'inventory.create',
  'inventory.add',
  'inventory.remove',
  'inventory.update',
  'inventory.update_price',
  'inventory.delete',


  /*
   * SALES
   */

  'sale.create',
  'sale.update',
  'sale.delete',


  /*
   * PURCHASE
   */

  'purchase.create',
  'purchase.update',


  /*
   * EXPENSE
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
    .filter(Boolean)
    .slice(0, 2000);
};


/*
 * ============================================================
 * NETWORK
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

  const value =
    Number(
      result?.command?.confidence ??
      result?.confidence
    );

  if (
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      value
    )
  );
};


/*
 * ============================================================
 * LOCAL PRIORITY
 * ============================================================
 */

const isLocalPriorityIntent = result => {

  return Boolean(
    result?.command &&
    LOCAL_PRIORITY_INTENTS.has(
      result.command.intent
    )
  );
};


/*
 * ============================================================
 * NORMALIZE REMOTE RESULT
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
 * MAIN ROUTER
 * ============================================================
 *
 * Supported input:
 *
 * {
 *   text,
 *   inventory,
 *   inventoryNames,
 *   customerNames
 * }
 *
 * inventory = ACTUAL inventory objects
 *
 * inventoryNames remains supported for backwards compatibility.
 *
 * ============================================================
 */

export async function parseVoiceCommand({

  text,

  inventory = [],

  inventoryNames = [],

  customerNames = [],

} = {}) {


  /*
   * ==========================================================
   * SANITIZE
   * ==========================================================
   */

  const safeText =
    safeString(text);

  const safeInventory =
    safeArray(
      inventory
    );

  const safeCustomerNames =
    safeArray(
      customerNames
    );


  /*
   * ==========================================================
   * EMPTY COMMAND
   * ==========================================================
   */

  if (!safeText) {

    return {
      status:
        'INVALID_COMMAND',

      command:
        null,

      source:
        'local',

      confidence:
        0,
    };
  }


  /*
   * ==========================================================
   * PHASE 3C - LOCAL COMMAND PIPELINE
   * ==========================================================
   *
   * THIS IS NOW THE PRIMARY LOCAL ENGINE.
   *
   * It performs:
   *
   * LocalVoiceParser
   *       ↓
   * Khata detection
   *       ↓
   * Product detection
   *       ↓
   * InventoryVariantResolver
   *       ↓
   * Normalized command
   *
   * ==========================================================
   */

  let localResult;

  try {

    localResult =
      processLocalVoiceCommand({

        text:
          safeText,

        inventory:
          safeInventory,

        customerNames:
          safeCustomerNames,

      });

  } catch (error) {

    console.error(
      'VoiceCommandRouter: LocalCommandPipeline failed',
      error?.message ||
        error
    );

    localResult = {

      status:
        'PARSER_ERROR',

      reason:
        error?.message ||
        'Local command pipeline failed.',

      command:
        null,

      source:
        'local_error',

    };
  }


  /*
   * ==========================================================
   * CHECK WHETHER LOCAL COMMAND CAN EXECUTE
   * ==========================================================
   */

  const localCanExecute =
    canExecuteLocalCommand(
      localResult
    );


  const localConfidence =
    getConfidence(
      localResult
    );


  const localPriority =
    isLocalPriorityIntent(
      localResult
    );

  const localPriorityNeedsCloudValidation =
  Boolean(
    localCanExecute &&
    localPriority &&
    localConfidence >= LOCAL_SAFETY_CONFIDENCE &&
    localConfidence < LOCAL_TRANSACTION_CONFIDENCE
  );

  /*
   * ==========================================================
   * HIGH-CONFIDENCE LOCAL TRANSACTION
   * ==========================================================
   *
   * Example:
   *
   * "10 wala Kurkure"
   *
   * OR:
   *
   * "Rahul ke khate mein 500 rupaye daalo"
   *
   * If local pipeline can safely execute it,
   * STOP HERE.
   *
   * Gemini is NOT contacted.
   * ==========================================================
   */

  if (

    localCanExecute &&

    localPriority &&

    localConfidence >=
      LOCAL_TRANSACTION_CONFIDENCE

  ) {

    return {

      ...localResult,

      source:
        'local_pipeline',

      execution:
        'local',

      cloud_called:
        false,

    };
  }


  /*
   * ==========================================================
   * LOCAL NON-TRANSACTIONAL READY RESULT
   * ==========================================================
   *
   * Queries and other safe commands do not necessarily need
   * the backend.
   *
   * Example:
   *
   * "Parle G kitna stock hai"
   *
   * ==========================================================
   */

  if (

    localResult?.status ===
      'READY' &&

    !localPriority

  ) {

    return {

      ...localResult,

      source:
        'local_pipeline',

      execution:
        'local',

      cloud_called:
        false,

    };
  }


  /*
   * ==========================================================
   * NETWORK CHECK
   * ==========================================================
   */

  let networkAvailable =
    false;

  try {

    const networkState =
      await NetInfo.fetch();

    networkAvailable =
      isUsableNetwork(
        networkState
      );

  } catch (error) {

    console.log(
      'VoiceCommandRouter: NetInfo failed',
      error?.message ||
        error
    );

    networkAvailable =
      false;
  }


  /*
   * ==========================================================
   * OFFLINE FALLBACK
   * ==========================================================
   *
   * If internet is unavailable,
   * NEVER block the app.
   *
   * Return the local interpretation.
   * ==========================================================
   */

  if (!networkAvailable) {

    return {

      ...localResult,

      source:
        'local_offline',

      execution:
        'local',

      cloud_called:
        false,

    };
  }


  /*
   * ==========================================================
   * CLOUD AI
   * ==========================================================
   *
   * At this point:
   *
   * - local pipeline could not safely execute
   * - internet is available
   *
   * Therefore Gemini/backend gets a chance.
   *
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

    /*
     * ========================================================
     * AUTH
     * ========================================================
     */

    let token = null;

    try {

      token =
        await AsyncStorage.getItem(
          'userToken'
        );

    } catch (error) {

      console.log(
        'VoiceCommandRouter: token read failed',
        error?.message ||
          error
      );
    }


    /*
     * ========================================================
     * INVENTORY NAMES
     * ========================================================
     *
     * Backend AI does not need the entire WatermelonDB
     * objects.
     *
     * Send only product names.
     * ========================================================
     */

    const resolvedInventoryNames =
      safeInventory.length

        ? safeInventory
            .map(
              item =>
                item?.productName ??
                item?.product_name ??
                null
            )
            .filter(Boolean)

        : safeArray(
            inventoryNames
          );


    /*
     * ========================================================
     * LOCAL HINT
     * ========================================================
     *
     * This is extremely important.
     *
     * We don't throw away local understanding.
     *
     * Gemini receives what the local engine already understood
     * and can improve/complete it.
     * ========================================================
     */

    const localCommand =
      localResult?.command ||
      null;


    const requestBody = {

      /*
       * Original speech.
       */

      text:
        safeText,


      /*
       * Context.
       */

      inventory_names:
        resolvedInventoryNames,

      customer_names:
        safeCustomerNames,


      /*
       * Language context.
       */

      voice_language:
        'hi-en-hinglish',


      /*
       * Tell backend what this system is.
       */

      mode:
        'command_parser',


      /*
       * We don't want conversational responses.
       */

      response_mode:
        'strict_command_json',


      /*
       * Local understanding.
       */

      local_hint: {

        status:
          localResult?.status ||
          null,

        intent:
          localCommand?.intent ||
          null,

        product:
          localCommand?.product ||
          null,

        quantity:
          localCommand?.quantity ??
          null,

        unit:
          localCommand?.unit ||
          null,

        price_hint:
          localCommand?.price_hint ??
          null,

        amount:
          localCommand?.amount ??
          null,

        customer_name:
          localCommand?.customer_name ||
          null,

        payment_type:
          localCommand?.payment_type ||
          null,

        confidence:
          localConfidence,

      },


      /*
       * Feature flags.
       */

      voice_features: {

        indian_numbers:
          true,

        hindi:
          true,

        hinglish:
          true,

        product_aliases:
          true,

        price_variants:
          true,

        direct_khata_item_sales:
          true,

        mixed_units:
          true,

        inventory_resolution:
          true,

      },

    };


    /*
     * ========================================================
     * REQUEST
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
     * BACKEND ERROR
     * ========================================================
     */

    if (!response.ok) {

      console.log(
        `VoiceCommandRouter: backend returned ${response.status}; using local result`
      );


      return {

        ...localResult,

        source:
          'local_backend_error',

        execution:
          'local',

        cloud_called:
          true,

        cloud_status:
          response.status,

      };
    }


    /*
     * ========================================================
     * JSON
     * ========================================================
     */

    let remoteRaw;

    try {

      remoteRaw =
        await response.json();

    } catch (error) {

      console.log(
        'VoiceCommandRouter: backend returned invalid JSON',
        error?.message ||
          error
      );


      return {

        ...localResult,

        source:
          'local_invalid_remote',

        execution:
          'local',

        cloud_called:
          true,

      };
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


    if (!remote) {

      return {

        ...localResult,

        source:
          'local_invalid_remote',

        execution:
          'local',

        cloud_called:
          true,

      };
    }


    /*
     * ========================================================
     * REMOTE SAFETY CHECK
     * ========================================================
     *
     * VERY IMPORTANT.
     *
     * Suppose local understood:
     *
     * "10 wala Kurkure"
     *
     * but for some reason local wasn't executable because
     * inventory was unavailable.
     *
     * Gemini says:
     *
     * "inventory.add"
     *
     *
     * That's okay.
     *
     * But if local already had a strong transaction,
     * it must not be silently replaced.
     * ========================================================
     */

    if (

      localPriority &&

      localConfidence >=
        LOCAL_SAFETY_CONFIDENCE

    ) {

      return {

        ...localResult,

        source:
          'local_priority',

        execution:
          'local',

        cloud_called:
          true,

        remote_intent:
          remote.intent,

      };
    }


    /*
     * ========================================================
     * PHASE 3E-3 / 3F - GEMINI COMMAND BRIDGE
     * ========================================================
     *
     * Gemini is ONLY the language interpreter.
     *
     * The remote command must pass through the deterministic
     * business validator + inventory resolver before COUNTR
     * accepts it.
     *
     * Flow:
     *
     * Gemini
     *   ↓
     * GeminiCommandBridge
     *   ↓
     * GeminiCommandValidator
     *   ↓
     * Inventory validation
     *   ↓
     * READY
     *
     * Gemini never gets authority to execute a transaction.
     * ========================================================
     */

    const bridged =
      bridgeGeminiCommand({

        geminiResult:
          remote,

        inventory:
          safeInventory,

        customerNames:
          safeCustomerNames,

      });


    /*
     * ========================================================
     * REMOTE COMMAND REJECTED
     * ========================================================
     *
     * If Gemini invents a product, price, unit, customer, etc.,
     * the deterministic bridge rejects it.
     *
     * We NEVER pass an unvalidated Gemini command to execution.
     * ========================================================
     */

    if (
      !bridged ||
      bridged.status !== 'READY'
    ) {

      return {

        ...localResult,

        source:
          'local_remote_rejected',

        execution:
          'local',

        cloud_called:
          true,

        cloud_status:
          response.status,

        remote_intent:
          remote.intent,

        remote_validation_status:
          bridged?.status ||
          'GEMINI_VALIDATION_FAILED',

        remote_validation_reason:
          bridged?.reason ||
          'Gemini command failed deterministic validation.',

        remote_result:
          remote,

      };
    }


    /*
     * ========================================================
     * VALIDATED REMOTE RESULT
     * ========================================================
     *
     * Only this validated command can move toward the normal
     * transaction executor.
     * ========================================================
     */

    const remoteCommand =
      bridged &&
      bridged.command &&
      typeof bridged.command === "object"
        ? bridged.command
        : bridged;

    return {
      ...bridged,

      // ----------------------------------------------------------
      // BACKWARD COMPATIBILITY
      // ----------------------------------------------------------
      //
      // Older COUNTR consumers expect:
      //
      // result.intent
      // result.product
      // result.quantity
      //
      // New Gemini bridge uses:
      //
      // result.command.intent
      // result.command.product
      // result.command.quantity
      //
      // Expose both shapes.
      // ----------------------------------------------------------

      ...(remoteCommand || {}),

      command:
        bridged.command || remoteCommand,

      source:
        "remote_ai",

      execution:
        "remote",

      cloud_called:
        true,

      local_result:
        localResult,

      remote_result:
        remote,
    };

  } catch (error) {

    /*
     * ========================================================
     * TIMEOUT / NETWORK ERROR
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


    return {

      ...localResult,

      source:
        'local_network_fallback',

      execution:
        'local',

      cloud_called:
        true,

      cloud_error:
        errorMessage,

    };

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