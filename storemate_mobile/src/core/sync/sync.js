import { Q } from '@nozbe/watermelondb';
import { database } from '../database';
import { BASE_URL } from '../../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireCurrentUserId } from '../auth/localUser';
import { SecureStorage } from '../../utils/secureStorage';

const SYNC_TIMEOUT_MS = 15000;

const getAuthToken = async () => {
  const secureToken =
    await SecureStorage.getToken();

  if (secureToken) {
    return secureToken;
  }

  return await AsyncStorage.getItem(
    'userToken'
  );
};

const isValidOwnerId = ownerId =>
  typeof ownerId === 'string' &&
  ownerId.trim().length > 0;

const safeNumber = value => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
};

const safeString = value =>
  value === null ||
  value === undefined
    ? ''
    : String(value).trim();

const parseServerResponse = async response => {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
};

export const syncWithCloud = async () => {
  let ownerId = null;

  try {
    /*
     * ==========================================================
     * CURRENT USER
     * ==========================================================
     *
     * Sync is ALWAYS performed for the currently logged-in user.
     */

    ownerId =
      await requireCurrentUserId();

    if (!isValidOwnerId(ownerId)) {
      throw new Error(
        'No active StoreMate user.'
      );
    }


    /*
     * ==========================================================
     * AUTHENTICATION
     * ==========================================================
     *
     * Use SecureStorage first.
     *
     * AsyncStorage remains a fallback for older installations.
     */

    const token =
      await getAuthToken();

    if (!token) {
      throw new Error(
        'Authentication required to sync data.'
      );
    }


    /*
     * ==========================================================
     * LOCAL DATA
     * ==========================================================
     *
     * CRITICAL:
     *
     * Every query is restricted to owner_id.
     *
     * Therefore User B can never push User A's records.
     */

    const unsyncedInventory =
      await database.collections
        .get('inventory_items')
        .query(
          Q.where(
            'owner_id',
            ownerId
          ),
          Q.where(
            'is_synced',
            false
          )
        )
        .fetch();


    const unsyncedLedger =
      await database.collections
        .get('ledger_entries')
        .query(
          Q.where(
            'owner_id',
            ownerId
          ),
          Q.where(
            'is_synced',
            false
          )
        )
        .fetch();


    const unsyncedSales =
      await database.collections
        .get('sales_transactions')
        .query(
          Q.where(
            'owner_id',
            ownerId
          ),
          Q.where(
            'is_synced',
            false
          )
        )
        .fetch();


    /*
     * ==========================================================
     * NOTHING TO SYNC
     * ==========================================================
     */

    if (
      unsyncedInventory.length === 0 &&
      unsyncedLedger.length === 0 &&
      unsyncedSales.length === 0
    ) {

      console.log(
        '✅ Everything is already synced for current user:',
        ownerId
      );

      return {
        success: true,
        message: 'Up to date',
        ownerId,
        counts: {
          inventory: 0,
          ledger: 0,
          sales: 0,
        },
      };
    }


    /*
     * ==========================================================
     * BUILD OWNER-SCOPED PAYLOAD
     * ==========================================================
     */

    const payload = {

      /*
       * Server MUST use this owner_id to scope
       * the incoming records.
       */

      owner_id:
        ownerId,

      inventory:
        unsyncedInventory.map(
          item => ({
            id:
              item.id,

            owner_id:
              ownerId,

            barcode:
              safeString(
                item.barcode
              ),

            product_name:
              safeString(
                item.productName
              ),

            quantity:
              safeNumber(
                item.quantity
              ),

            purchase_price:
              safeNumber(
                item.purchasePrice
              ),

            selling_price:
              safeNumber(
                item.sellingPrice
              ),

            updated_at:
              safeNumber(
                item.updatedAt
              ),
          })
        ),

      ledger:
        unsyncedLedger.map(
          entry => ({
            id:
              entry.id,

            owner_id:
              ownerId,

            customer_id:
              safeString(
                entry.customerId
              ),

            amount:
              safeNumber(
                entry.amount
              ),

            entry_type:
              safeString(
                entry.entryType
              ),

            created_at:
              safeNumber(
                entry.createdAt
              ),
          })
        ),

      sales:
        unsyncedSales.map(
          sale => ({
            id:
              sale.id,

            owner_id:
              ownerId,

            total_amount:
              safeNumber(
                sale.totalAmount
              ),

            payment_type:
              safeString(
                sale.paymentType
              ),

            created_at:
              safeNumber(
                sale.createdAt
              ),
          })
        ),
    };


    /*
     * ==========================================================
     * DEBUG INFORMATION
     * ==========================================================
     *
     * Do not print the authentication token.
     */

    console.log(
      '📤 StoreMate sync starting',
      {
        ownerId,

        inventory:
          payload.inventory.length,

        ledger:
          payload.ledger.length,

        sales:
          payload.sales.length,
      }
    );


    /*
     * ==========================================================
     * REQUEST TIMEOUT
     * ==========================================================
     */

    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(
        () =>
          controller.abort(),
        SYNC_TIMEOUT_MS
      );


    let response;

    try {

      response =
        await fetch(
          `${BASE_URL}/api/sync`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',

              Authorization:
                `Bearer ${token}`,
            },

            body:
              JSON.stringify(
                payload
              ),

            signal:
              controller.signal,
          }
        );

    } finally {

      clearTimeout(
        timeoutId
      );
    }


    /*
     * ==========================================================
     * READ SERVER RESPONSE
     * ==========================================================
     */

    const serverResult =
      await parseServerResponse(
        response
      );


    /*
     * ==========================================================
     * SERVER REJECTED REQUEST
     * ==========================================================
     *
     * IMPORTANT:
     *
     * We DO NOT mark local records synced.
     *
     * They remain unsynced and can be retried later.
     */

    if (!response.ok) {

      const serverMessage =
        serverResult?.message ||
        serverResult?.error ||
        serverResult?.detail ||
        serverResult?.raw ||
        `Server rejected sync (${response.status}).`;


      console.error(
        '❌ Server rejected StoreMate sync:',
        {
          status:
            response.status,

          ownerId,

          message:
            serverMessage,
        }
      );


      throw new Error(
        `Server rejected the sync: ${serverMessage}`
      );
    }


    /*
     * ==========================================================
     * SERVER APPLICATION-LEVEL REJECTION
     * ==========================================================
     *
     * Some APIs return HTTP 200 but still report:
     *
     * success: false
     *
     * We must not mark records synced in that situation.
     */

    if (
      serverResult &&
      serverResult.success === false
    ) {

      const message =
        serverResult.message ||
        serverResult.error ||
        'Server rejected the sync.';


      console.error(
        '❌ Sync application-level rejection:',
        {
          ownerId,
          message,
        }
      );


      throw new Error(
        `Server rejected the sync: ${message}`
      );
    }


    /*
     * ==========================================================
     * VERIFY SERVER RESPONSE
     * ==========================================================
     *
     * If the server provides explicit counts, use them to
     * detect partial rejection.
     *
     * We remain compatible with your existing endpoint if it
     * simply returns success/200 without counts.
     */

    const responseCounts =
      serverResult?.counts ||
      serverResult?.synced ||
      null;


    if (
      responseCounts &&
      typeof responseCounts ===
        'object'
    ) {

      const serverInventoryCount =
        Number(
          responseCounts.inventory
        );

      const serverLedgerCount =
        Number(
          responseCounts.ledger
        );

      const serverSalesCount =
        Number(
          responseCounts.sales
        );


      if (
        Number.isFinite(
          serverInventoryCount
        ) &&
        serverInventoryCount <
          unsyncedInventory.length
      ) {

        throw new Error(
          'Server did not accept all inventory records.'
        );
      }


      if (
        Number.isFinite(
          serverLedgerCount
        ) &&
        serverLedgerCount <
          unsyncedLedger.length
      ) {

        throw new Error(
          'Server did not accept all Khata records.'
        );
      }


      if (
        Number.isFinite(
          serverSalesCount
        ) &&
        serverSalesCount <
          unsyncedSales.length
      ) {

        throw new Error(
          'Server did not accept all sales records.'
        );
      }
    }


    /*
     * ==========================================================
     * MARK LOCAL RECORDS AS SYNCED
     * ==========================================================
     *
     * ONLY happens after successful server acceptance.
     *
     * We additionally re-check owner_id before updating each
     * record.
     */

    const recordsToUpdate = [
      ...unsyncedInventory,

      ...unsyncedLedger,

      ...unsyncedSales,
    ];


    await database.write(
      async () => {

        const preparedUpdates =
          [];


        for (
          const record of
            recordsToUpdate
        ) {

          /*
           * Safety check.
           *
           * A record belonging to another user must NEVER
           * be marked synced from this user's session.
           */

          if (
            record.ownerId !==
            ownerId
          ) {

            console.warn(
              '⚠️ Skipping record with wrong owner:',
              record.id
            );

            continue;
          }


          preparedUpdates.push(
            record.prepareUpdate(
              current => {

                /*
                 * Re-check ownership inside
                 * the prepared update.
                 */

                if (
                  current.ownerId !==
                  ownerId
                ) {
                  return;
                }


                current.isSynced =
                  true;
              }
            )
          );
        }


        if (
          preparedUpdates.length
        ) {

          await database.batch(
            ...preparedUpdates
          );
        }
      }
    );


    /*
     * ==========================================================
     * SUCCESS
     * ==========================================================
     */

    console.log(
      '✅ StoreMate sync successful:',
      {
        ownerId,

        inventory:
          unsyncedInventory.length,

        ledger:
          unsyncedLedger.length,

        sales:
          unsyncedSales.length,
      }
    );


    return {
      success:
        true,

      message:
        'Sync complete',

      ownerId,

      counts: {
        inventory:
          unsyncedInventory.length,

        ledger:
          unsyncedLedger.length,

        sales:
          unsyncedSales.length,
      },

      server:
        serverResult,
    };

  } catch (error) {

    const errorMessage =
      error?.name ===
      'AbortError'
        ? 'Sync timed out. Your local data is safe and will be retried.'
        : (
            error?.message ||
            'Unknown sync error occurred.'
          );


    console.error(
      '❌ Sync Failed:',
      errorMessage
    );


    /*
     * IMPORTANT:
     *
     * We intentionally DO NOT change is_synced here.
     *
     * Therefore failed records remain:
     *
     * is_synced = false
     *
     * and can be synced again later.
     */

    return {
      success:
        false,

      message:
        errorMessage,

      ownerId,
    };
  }
};


export default syncWithCloud;