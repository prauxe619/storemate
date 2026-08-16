import { Q } from '@nozbe/watermelondb';

import { database } from '../database';

import { BASE_URL } from '../../config/api';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  requireCurrentUserId,
} from '../auth/localUser';

import {
  SecureStorage,
} from '../../utils/secureStorage';


const SYNC_TIMEOUT_MS = 15000;


/*
 * ============================================================
 * AUTH TOKEN
 * ============================================================
 */

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


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

const isValidOwnerId = ownerId => {

  return (
    typeof ownerId === 'string' &&
    ownerId.trim().length > 0
  );

};


const safeNumber = value => {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;

};


const safeString = value => {

  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();

};


const parseServerResponse =
  async response => {

    const text =
      await response.text();

    if (!text) {
      return {};
    }

    try {

      return JSON.parse(
        text
      );

    } catch {

      return {
        raw: text,
      };

    }

  };


/*
 * ============================================================
 * NORMALIZE INVENTORY UNIT
 * ============================================================
 */

const normalizeUnit = value => {

  const unit =
    String(
      value || ''
    )
      .trim()
      .toUpperCase();


  const aliases = {

    KG:
      'KG',

    KGS:
      'KG',

    KILO:
      'KG',

    KILOGRAM:
      'KG',

    KILOGRAMS:
      'KG',


    G:
      'GRAM',

    GM:
      'GRAM',

    GMS:
      'GRAM',

    GRAM:
      'GRAM',

    GRAMS:
      'GRAM',


    L:
      'LITRE',

    LT:
      'LITRE',

    LTR:
      'LITRE',

    LITER:
      'LITRE',

    LITRE:
      'LITRE',

    LITRES:
      'LITRE',


    ML:
      'ML',

    MILLILITER:
      'ML',

    MILLILITRE:
      'ML',

    MILLILITERS:
      'ML',

    MILLILITRES:
      'ML',


    PC:
      'PCS',

    PCS:
      'PCS',

    PIECE:
      'PCS',

    PIECES:
      'PCS',


    PACK:
      'PACK',

    PACKET:
      'PACK',

    PACKETS:
      'PACK',


    BOX:
      'BOX',

    BOXES:
      'BOX',


    BOTTLE:
      'BOTTLE',

    BOTTLES:
      'BOTTLE',


    DOZEN:
      'DOZEN',

    DOZ:
      'DOZEN',


    STRIP:
      'STRIP',

    STRIPS:
      'STRIP',


    CARTON:
      'CARTON',

    CARTONS:
      'CARTON',


    BUNDLE:
      'BUNDLE',

    BUNDLES:
      'BUNDLE',

  };


  return (
    aliases[unit] ||
    unit ||
    'PCS'
  );

};


/*
 * ============================================================
 * SYNC WITH CLOUD
 * ============================================================
 */

export const syncWithCloud =
  async () => {

    let ownerId = null;


    try {

      /*
       * ======================================================
       * CURRENT USER
       * ======================================================
       */

      ownerId =
        await requireCurrentUserId();


      if (
        !isValidOwnerId(
          ownerId
        )
      ) {

        throw new Error(
          'No active StoreMate user.'
        );

      }


      /*
       * ======================================================
       * AUTHENTICATION
       * ======================================================
       */

      const token =
        await getAuthToken();


      if (!token) {

        throw new Error(
          'Authentication required to sync data.'
        );

      }


      /*
       * ======================================================
       * LOCAL UNSYNCED INVENTORY
       * ======================================================
       *
       * IMPORTANT:
       *
       * Only current user's records.
       */

      const unsyncedInventory =
        await database
          .collections
          .get(
            'inventory_items'
          )
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
       * ======================================================
       * LOCAL UNSYNCED LEDGER
       * ======================================================
       */

      const unsyncedLedger =
        await database
          .collections
          .get(
            'ledger_entries'
          )
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
       * ======================================================
       * LOCAL UNSYNCED SALES
       * ======================================================
       */

      const unsyncedSales =
        await database
          .collections
          .get(
            'sales_transactions'
          )
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
       * ======================================================
       * NOTHING TO SYNC
       * ======================================================
       */

      if (

        unsyncedInventory.length ===
          0 &&

        unsyncedLedger.length ===
          0 &&

        unsyncedSales.length ===
          0

      ) {

        console.log(
          '✅ StoreMate: nothing to sync',
          ownerId
        );


        return {

          success:
            true,

          message:
            'Up to date',

          ownerId,

          counts: {

            inventory:
              0,

            ledger:
              0,

            sales:
              0,

          },

        };

      }


      /*
       * ======================================================
       * BUILD PAYLOAD
       * ======================================================
       */

      const payload = {

        owner_id:
          ownerId,


        /*
         * INVENTORY
         */

        inventory:
          unsyncedInventory.map(
            item => ({

              id:
                item.id,

              /*
               * Server does NOT trust this
               * for ownership.
               */

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

              unit:
                normalizeUnit(
                  item.unit
                ),

              purchase_price:
                safeNumber(
                  item.purchasePrice
                ),

              selling_price:
                safeNumber(
                  item.sellingPrice
                ),

              category:
                safeString(
                  item.category
                ) ||
                null,

              image_url:
                safeString(
                  item.imageUrl
                ) ||
                null,

              created_at:
                safeNumber(
                  item.createdAt
                ),

              updated_at:
                safeNumber(
                  item.updatedAt
                ),

              is_synced:
                false,

            })
          ),


        /*
         * LEDGER / KHATA
         */

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
                ).toUpperCase(),

              customer_phone:
                safeString(
                  entry.customerPhone
                ) ||
                null,

              note:
                safeString(
                  entry.note
                ) ||
                null,

              created_at:
                safeNumber(
                  entry.createdAt
                ),

              is_synced:
                false,

            })
          ),


        /*
         * SALES
         */

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
                ).toUpperCase(),

              created_at:
                safeNumber(
                  sale.createdAt
                ),

              is_synced:
                false,

            })
          ),

      };


      console.log(
        '📤 StoreMate sync starting:',
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
       * ======================================================
       * REQUEST TIMEOUT
       * ======================================================
       */

      const controller =
        new AbortController();


      const timeoutId =
        setTimeout(
          () => {
            controller.abort();
          },
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
       * ======================================================
       * SERVER RESPONSE
       * ======================================================
       */

      const serverResult =
        await parseServerResponse(
          response
        );


      if (
        !response.ok
      ) {

        const serverMessage =
          serverResult?.message ||
          serverResult?.error ||
          serverResult?.detail ||
          serverResult?.raw ||
          `Server rejected sync (${response.status}).`;


        throw new Error(
          `Server rejected the sync: ${serverMessage}`
        );

      }


      /*
       * ======================================================
       * APPLICATION-LEVEL ERROR
       * ======================================================
       */

      if (
        serverResult &&
        serverResult.status ===
          'error'
      ) {

        throw new Error(
          serverResult.message ||
          serverResult.error ||
          'Server rejected the sync.'
        );

      }


      /*
       * ======================================================
       * SERVER COUNTS
       * ======================================================
       */

      const responseCounts =
        serverResult?.counts ||
        serverResult?.synced ||
        null;


      /*
       * ======================================================
       * MARK LOCAL RECORDS SYNCED
       * ======================================================
       *
       * ONLY AFTER SERVER ACCEPTED THEM.
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
             * SECURITY CHECK
             */

            if (
              record.ownerId !==
              ownerId
            ) {

              console.warn(
                '⚠️ Skipping wrong-owner record:',
                record.id
              );

              continue;

            }


            preparedUpdates.push(

              record.prepareUpdate(
                current => {

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
       * ======================================================
       * SUCCESS
       * ======================================================
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


    } catch (
      error
    ) {

      const errorMessage =

        error?.name ===
          'AbortError'

          ? 'Sync timed out. Your local data is safe and will be retried.'

          : (
              error?.message ||
              'Unknown sync error occurred.'
            );


      console.error(
        '❌ StoreMate sync failed:',
        errorMessage
      );


      /*
       * IMPORTANT:
       *
       * We DO NOT set is_synced here.
       *
       * Failed records remain unsynced
       * and will retry later.
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


/*
 * ============================================================
 * RESTORE FROM CLOUD
 * ============================================================
 *
 * Server → WatermelonDB
 *
 * This uses:
 *
 * GET /api/sync/restore
 *
 * ============================================================
 */

export const restoreFromCloud =
  async () => {

    let ownerId = null;


    try {

      /*
       * ======================================================
       * CURRENT USER
       * ======================================================
       */

      ownerId =
        await requireCurrentUserId();


      if (
        !isValidOwnerId(
          ownerId
        )
      ) {

        throw new Error(
          'No active StoreMate user.'
        );

      }


      /*
       * ======================================================
       * AUTH
       * ======================================================
       */

      const token =
        await getAuthToken();


      if (!token) {

        throw new Error(
          'Authentication required to restore data.'
        );

      }


      console.log(
        '📥 StoreMate restore starting:',
        ownerId
      );


      /*
       * ======================================================
       * REQUEST
       * ======================================================
       */

      const controller =
        new AbortController();


      const timeoutId =
        setTimeout(
          () => {
            controller.abort();
          },
          SYNC_TIMEOUT_MS
        );


      let response;


      try {

        response =
          await fetch(
            `${BASE_URL}/api/sync/restore`,
            {

              method:
                'GET',

              headers: {

                Accept:
                  'application/json',

                Authorization:
                  `Bearer ${token}`,

              },

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
       * ======================================================
       * RESPONSE
       * ======================================================
       */

      const serverResult =
        await parseServerResponse(
          response
        );


      if (
        !response.ok
      ) {

        throw new Error(
          serverResult?.message ||
          serverResult?.error ||
          `Restore failed (${response.status}).`
        );

      }


      if (
        serverResult?.status ===
          'error'
      ) {

        throw new Error(
          serverResult.message ||
          serverResult.error ||
          'Restore failed.'
        );

      }


      /*
       * ======================================================
       * VERIFY OWNER
       * ======================================================
       */

      if (
        serverResult.owner_id &&
        String(
          serverResult.owner_id
        ) !==
        String(ownerId)
      ) {

        throw new Error(
          'Restore account mismatch. Data was not restored.'
        );

      }


      /*
       * ======================================================
       * DATA
       * ======================================================
       */

      const inventory =
        Array.isArray(
          serverResult.inventory
        )
          ? serverResult.inventory
          : [];


      const ledger =
        Array.isArray(
          serverResult.ledger
        )
          ? serverResult.ledger
          : [];


      const sales =
        Array.isArray(
          serverResult.sales
        )
          ? serverResult.sales
          : [];


      /*
       * ======================================================
       * RESTORE COUNTERS
       * ======================================================
       */

      const restoredCounts = {

        inventory:
          0,

        ledger:
          0,

        sales:
          0,

      };


      /*
       * ======================================================
       * WATERMELONDB WRITE
       * ======================================================
       */

      await database.write(
        async () => {

          /*
           * ================================================
           * INVENTORY
           * ================================================
           */

          for (
            const row of
              inventory
          ) {

            if (
              !row ||
              !row.id
            ) {

              continue;

            }


            const collection =
              database.get(
                'inventory_items'
              );


            try {

              const existing =
                await collection.find(
                  row.id
                );


              /*
               * Do not overwrite existing
               * local data.
               */

              if (
                existing.ownerId ===
                ownerId
              ) {

                continue;

              }


              /*
               * Never touch another owner's
               * local record.
               */

              continue;


            } catch {

              /*
               * Record does not exist.
               */

            }


            await collection.create(
              record => {

                record._setRaw(
                  'owner_id',
                  ownerId
                );

                record._setRaw(
                  'barcode',
                  safeString(
                    row.barcode
                  )
                );

                record._setRaw(
                  'product_name',
                  safeString(
                    row.product_name
                  )
                );

                record._setRaw(
                  'quantity',
                  safeNumber(
                    row.quantity
                  )
                );

                record._setRaw(
                  'unit',
                  normalizeUnit(
                    row.unit
                  )
                );

                record._setRaw(
                  'purchase_price',
                  safeNumber(
                    row.purchase_price
                  )
                );

                record._setRaw(
                  'selling_price',
                  safeNumber(
                    row.selling_price
                  )
                );

                record._setRaw(
                  'category',
                  row.category ||
                  null
                );

                record._setRaw(
                  'image_url',
                  row.image_url ||
                  null
                );

                record._setRaw(
                  'is_synced',
                  true
                );

                if (
                  row.created_at !==
                  undefined
                ) {

                  record._setRaw(
                    'created_at',
                    safeNumber(
                      row.created_at
                    )
                  );

                }

                record._setRaw(
                  'updated_at',
                  safeNumber(
                    row.updated_at
                  )
                );

              }
            );


            restoredCounts.inventory +=
              1;

          }


          /*
           * ================================================
           * LEDGER
           * ================================================
           */

          for (
            const row of
              ledger
          ) {

            if (
              !row ||
              !row.id
            ) {

              continue;

            }


            const collection =
              database.get(
                'ledger_entries'
              );


            try {

              await collection.find(
                row.id
              );

              continue;

            } catch {

              /*
               * Record doesn't exist.
               */

            }


            await collection.create(
              record => {

                record._setRaw(
                  'owner_id',
                  ownerId
                );

                record._setRaw(
                  'customer_id',
                  safeString(
                    row.customer_id
                  )
                );

                record._setRaw(
                  'amount',
                  safeNumber(
                    row.amount
                  )
                );

                record._setRaw(
                  'entry_type',
                  safeString(
                    row.entry_type
                  ).toUpperCase()
                );

                record._setRaw(
                  'customer_phone',
                  row.customer_phone ||
                  null
                );

                record._setRaw(
                  'note',
                  row.note ||
                  null
                );

                record._setRaw(
                  'is_synced',
                  true
                );

                record._setRaw(
                  'created_at',
                  safeNumber(
                    row.created_at
                  )
                );

              }
            );


            restoredCounts.ledger +=
              1;

          }


          /*
           * ================================================
           * SALES
           * ================================================
           */

          for (
            const row of
              sales
          ) {

            if (
              !row ||
              !row.id
            ) {

              continue;

            }


            const collection =
              database.get(
                'sales_transactions'
              );


            try {

              await collection.find(
                row.id
              );

              continue;

            } catch {

              /*
               * Record doesn't exist.
               */

            }


            await collection.create(
              record => {

                record._setRaw(
                  'owner_id',
                  ownerId
                );

                record._setRaw(
                  'total_amount',
                  safeNumber(
                    row.total_amount
                  )
                );

                record._setRaw(
                  'payment_type',
                  safeString(
                    row.payment_type
                  ).toUpperCase()
                );

                record._setRaw(
                  'is_synced',
                  true
                );

                record._setRaw(
                  'created_at',
                  safeNumber(
                    row.created_at
                  )
                );

              }
            );


            restoredCounts.sales +=
              1;

          }

        }
      );


      /*
       * ======================================================
       * SUCCESS
       * ======================================================
       */

      console.log(
        '✅ StoreMate restore complete:',
        {
          ownerId,
          ...restoredCounts,
        }
      );


      return {

        success:
          true,

        message:
          'Restore complete',

        ownerId,

        counts:
          restoredCounts,

        profile:
          serverResult.profile ||
          null,

      };


    } catch (
      error
    ) {

      const errorMessage =

        error?.name ===
          'AbortError'

          ? 'Restore timed out. Your existing local data is safe.'

          : (
              error?.message ||
              'Restore failed.'
            );


      console.error(
        '❌ StoreMate restore failed:',
        errorMessage
      );


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