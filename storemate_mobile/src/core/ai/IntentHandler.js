import { database } from '../database';
import { Q } from '@nozbe/watermelondb';
import { requireCurrentUserId } from '../auth/localUser';
import TelemetryService from '../../services/TelemetryService';


/*
 * ============================================================
 * Countr IntentHandler
 * ============================================================
 *
 * Responsibilities:
 *
 * - Execute local/remote voice intents
 * - Keep every database operation owner-scoped
 * - Handle inventory
 * - Handle sales
 * - Handle Khata
 * - Handle customer creation
 * - Handle inventory queries
 * - Handle daily Khata summaries
 * - Understand quantity units coming from LocalVoiceParser
 *
 * ============================================================
 */


/*
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const MAX_QTY =
  100000;

const MAX_MONEY =
  100000000;


/*
 * ============================================================
 * TELEMETRY HELPERS
 * ============================================================
 */

const trackIntentSuccess = (
  intent,
  payload = {}
) => {

  TelemetryService.trackEvent(
    'voice_action_success',
    'voice',
    {
      intent,
      ...payload,
    }
  );
};


const trackIntentFailure = (
  intent,
  reason,
  payload = {}
) => {

  TelemetryService.trackEvent(
    'voice_action_failed',
    'voice',
    {
      intent,
      reason:
        String(
          reason ||
          'Unknown error'
        ).slice(
          0,
          300
        ),

      ...payload,
    }
  );
};


/*
 * ============================================================
 * SUPPORTED UNITS
 * ============================================================
 */

const SUPPORTED_UNITS =
  new Set([

    'KG',
    'GRAM',

    'LITRE',
    'ML',

    'PIECE',
    'PACK',

    'BOTTLE',
    'BOX',

    'DOZEN',

    'STRIP',

    'CARTON',
    'BUNDLE',

  ]);


/*
 * ============================================================
 * UNIT DISPLAY
 * ============================================================
 */

const unitLabel = unit => {

  if (
    !unit
  ) {

    return 'units';
  }


  switch (
    String(
      unit
    )
      .trim()
      .toUpperCase()
  ) {

    case 'KG':
      return 'kg';

    case 'GRAM':
      return 'grams';

    case 'LITRE':
      return 'litres';

    case 'ML':
      return 'ml';

    case 'PIECE':
      return 'pieces';

    case 'PACK':
      return 'packets';

    case 'BOTTLE':
      return 'bottles';

    case 'BOX':
      return 'boxes';

    case 'DOZEN':
      return 'dozen';

    case 'STRIP':
      return 'strips';

    case 'CARTON':
      return 'cartons';

    case 'BUNDLE':
      return 'bundles';

    default:
      return 'units';
  }
};


/*
 * ============================================================
 * NORMALIZE UNIT
 * ============================================================
 */

const normalizeUnit = value => {

  if (
    typeof value !==
    'string'
  ) {

    return null;
  }


  const normalized =
    value
      .trim()
      .toUpperCase();


  if (
    !SUPPORTED_UNITS.has(
      normalized
    )
  ) {

    return null;
  }


  return normalized;
};


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

const cleanText = (
  value,
  maxLength = 150
) => {

  if (
    typeof value !==
    'string'
  ) {

    return '';
  }


  return value
    .replace(
      /[\u0000-\u001F\u007F]/g,
      ''
    )
    .trim()
    .replace(
      /\s+/g,
      ' '
    )
    .slice(
      0,
      maxLength
    );
};


const parsePositiveNumber =
  value => {

    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {

      return null;
    }


    const number =
      Number(
        value
      );


    if (
      !Number.isFinite(
        number
      ) ||
      number <= 0
    ) {

      return null;
    }


    return number;
  };


/*
 * ============================================================
 * DATE HELPERS
 * ============================================================
 */

const getStartOfToday =
  () => {

    const date =
      new Date();


    date.setHours(
      0,
      0,
      0,
      0
    );


    return date.getTime();
  };


const getStartOfTomorrow =
  () => {

    const date =
      new Date();


    date.setHours(
      0,
      0,
      0,
      0
    );


    date.setDate(
      date.getDate() + 1
    );


    return date.getTime();
  };


const isTodayTimestamp =
  timestamp => {

    const value =
      Number(
        timestamp
      );


    if (
      !Number.isFinite(
        value
      )
    ) {

      return false;
    }


    const start =
      getStartOfToday();


    const end =
      getStartOfTomorrow();


    return (
      value >= start &&
      value < end
    );
  };


/*
 * ============================================================
 * OWNER-SAFE INVENTORY LOOKUP
 * ============================================================
 */

const findInventoryItem =
  async (
    product,
    ownerId
  ) => {

    if (
      !product ||
      !ownerId
    ) {

      return null;
    }


    const allItems =
      await database
        .get(
          'inventory_items'
        )
        .query(
          Q.where(
            'owner_id',
            ownerId
          )
        )
        .fetch();


    const normalized =
      String(
        product
      )
        .trim()
        .toLowerCase();


    if (
      !normalized
    ) {

      return null;
    }


    /*
     * Exact match first.
     */

    const exact =
      allItems.find(
        item =>
          String(
            item.productName ||
            ''
          )
            .trim()
            .toLowerCase() ===
          normalized
      );


    if (
      exact
    ) {

      return exact;
    }


    /*
     * Partial match second.
     */

    return (
      allItems.find(
        item =>
          String(
            item.productName ||
            ''
          )
            .trim()
            .toLowerCase()
            .includes(
              normalized
            )
      ) ||
      null
    );
  };


/*
 * ============================================================
 * INVENTORY UNIT SAFETY
 * ============================================================
 */

const getStoredUnit =
  item => {

    if (
      !item
    ) {

      return null;
    }


    const possibleUnits = [

      item.unit,

      item.unitType,

      item.stockUnit,

    ];


    for (
      const value of
      possibleUnits
    ) {

      const normalized =
        normalizeUnit(
          value
        );


      if (
        normalized
      ) {

        return normalized;
      }
    }


    return null;
  };


const validateUnitCompatibility =
  (
    item,
    requestedUnit
  ) => {

    const unit =
      normalizeUnit(
        requestedUnit
      );


    /*
     * No explicit unit from voice.
     */

    if (
      !unit
    ) {

      return {
        ok: true,
        unit: null,
      };
    }


    const storedUnit =
      getStoredUnit(
        item
      );


    /*
     * No persisted unit.
     */

    if (
      !storedUnit
    ) {

      return {
        ok: true,
        unit,
      };
    }


    /*
     * Same unit.
     */

    if (
      storedUnit ===
      unit
    ) {

      return {
        ok: true,
        unit,
      };
    }


    /*
     * Do NOT mix units.
     */

    return {

      ok: false,

      unit,

      storedUnit,
    };
  };


/*
 * ============================================================
 * SALE COMMIT
 * ============================================================
 */

async function commitSale(
  soldItem,
  qty,
  totalSaleValue,
  paymentType,
  customer_name,
  now,
  ownerId,
  requestedUnit = null
) {

  if (
    !soldItem
  ) {

    return 'Product could not be found.';
  }


  if (
    !ownerId
  ) {

    return 'No active account found.';
  }


  /*
   * CRITICAL USER ISOLATION CHECK.
   */

  if (
    soldItem.ownerId !==
    ownerId
  ) {

    return (
      'Product does not belong to the active account.'
    );
  }


  if (
    !Number.isFinite(
      Number(qty)
    ) ||
    Number(qty) <= 0
  ) {

    return 'Invalid quantity.';
  }


  if (
    Number(qty) >
    MAX_QTY
  ) {

    return (
      'The requested quantity is too large.'
    );
  }


  /*
   * UNIT SAFETY.
   */

  const unitCheck =
    validateUnitCompatibility(
      soldItem,
      requestedUnit
    );


  if (
    !unitCheck.ok
  ) {

    return (
      `This product is stored in ${unitLabel(unitCheck.storedUnit)}, ` +
      `but you asked for ${unitLabel(unitCheck.unit)}. ` +
      `Please use the same stock unit.`
    );
  }


  if (
    Number(
      soldItem.quantity
    ) <
    Number(qty)
  ) {

    return (
      `Not enough stock. You only have ` +
      `${soldItem.quantity} ` +
      `${unitLabel(
        unitCheck.unit ||
        getStoredUnit(
          soldItem
        )
      )} ` +
      `${soldItem.productName} left.`
    );
  }


  if (
    !Number.isFinite(
      Number(totalSaleValue)
    ) ||
    Number(totalSaleValue) < 0 ||
    Number(totalSaleValue) >
      MAX_MONEY
  ) {

    return 'Invalid sale amount.';
  }


  if (
    paymentType !==
      'CASH' &&
    paymentType !==
      'KHATA'
  ) {

    return 'Invalid payment method.';
  }


  if (
    paymentType ===
      'KHATA' &&
    !customer_name
  ) {

    return (
      "Please also say the customer's name for Khata sales."
    );
  }


  const cleanCustomerName =
    customer_name
      ? cleanText(
          customer_name,
          100
        )
      : '';


  if (
    paymentType ===
      'KHATA' &&
    !cleanCustomerName
  ) {

    return (
      "Please also say the customer's name for Khata sales."
    );
  }


  await database.write(
    async () => {

      /*
       * CREATE SALE TRANSACTION
       */

      await database
        .get(
          'sales_transactions'
        )
        .create(
          transaction => {

            transaction.ownerId =
              ownerId;

            transaction.totalAmount =
              totalSaleValue;

            transaction.paymentType =
              paymentType;

            transaction.isSynced =
              false;

            transaction.createdAt =
              now;
          }
        );


      /*
       * REDUCE INVENTORY
       */

      await soldItem.update(
        item => {

          if (
            item.ownerId !==
            ownerId
          ) {

            throw new Error(
              'Product does not belong to the active account.'
            );
          }


          const currentQuantity =
            Number(
              item.quantity
            ) || 0;


          if (
            currentQuantity <
            qty
          ) {

            throw new Error(
              `Not enough stock. Only ${currentQuantity} ${unitLabel(
                requestedUnit ||
                getStoredUnit(
                  item
                )
              )} ${item.productName} available.`
            );
          }


          item.quantity =
            currentQuantity -
            qty;

          item.isSynced =
            false;

          item.updatedAt =
            now;
        }
      );


      /*
       * KHATA ENTRY
       */

      if (
        paymentType ===
        'KHATA'
      ) {

        await database
          .get(
            'ledger_entries'
          )
          .create(
            entry => {

              entry.ownerId =
                ownerId;

              entry.customerId =
                cleanCustomerName;

              entry.amount =
                totalSaleValue;

              entry.entryType =
                'CREDIT';

              entry.isSynced =
                false;

              entry.createdAt =
                now;
            }
          );
      }
    }
  );


  const displayUnit =
    unitLabel(
      requestedUnit ||
      getStoredUnit(
        soldItem
      )
    );


  if (
    paymentType ===
    'KHATA'
  ) {

    return (
      `Billed ₹${totalSaleValue} to ` +
      `${cleanCustomerName}'s Khata for ` +
      `${qty} ${displayUnit} ` +
      `${soldItem.productName}.`
    );
  }


  return (
    `Cash sale recorded: ₹${totalSaleValue} ` +
    `for ${qty} ${displayUnit} ` +
    `${soldItem.productName}.`
  );
}


/*
 * ============================================================
 * CONFIRM PENDING SALE
 * ============================================================
 */

export const confirmPendingSale =
  async (
    pendingSale,
    chosenPaymentType
  ) => {

    if (
      !pendingSale ||
      (
        chosenPaymentType !==
          'CASH' &&
        chosenPaymentType !==
          'KHATA'
      )
    ) {

      return (
        'Something went wrong confirming that sale.'
      );
    }


    try {

      const ownerId =
        await requireCurrentUserId();


      if (
        !ownerId
      ) {

        return (
          'No active account found.'
        );
      }


      if (
        !pendingSale.itemId
      ) {

        return (
          'Product information is missing.'
        );
      }


      const soldItem =
        await database
          .get(
            'inventory_items'
          )
          .find(
            pendingSale.itemId
          );


      if (
        soldItem.ownerId !==
        ownerId
      ) {

        return (
          'Product does not belong to the active account.'
        );
      }


      const pendingQty =
        Number(
          pendingSale.qty
        );


      if (
        !Number.isFinite(
          pendingQty
        ) ||
        pendingQty <= 0
      ) {

        return (
          'Invalid quantity.'
        );
      }


      if (
        pendingQty >
        MAX_QTY
      ) {

        return (
          'The requested quantity is too large.'
        );
      }


      const requestedUnit =
        normalizeUnit(
          pendingSale.unit
        );


      const unitCheck =
        validateUnitCompatibility(
          soldItem,
          requestedUnit
        );


      if (
        !unitCheck.ok
      ) {

        return (
          `This product is stored in ${unitLabel(unitCheck.storedUnit)}, ` +
          `but you asked for ${unitLabel(unitCheck.unit)}.`
        );
      }


      if (
        Number(
          soldItem.quantity
        ) <
        pendingQty
      ) {

        return (
          `Not enough stock. You only have ` +
          `${soldItem.quantity} ` +
          `${unitLabel(
            requestedUnit ||
            getStoredUnit(
              soldItem
            )
          )} ` +
          `${soldItem.productName} left.`
        );
      }


      const totalSaleValue =
        Number(
          pendingSale.totalSaleValue
        );


      if (
        !Number.isFinite(
          totalSaleValue
        ) ||
        totalSaleValue < 0 ||
        totalSaleValue >
          MAX_MONEY
      ) {

        return (
          'Invalid sale amount.'
        );
      }


      const result =
        await commitSale(
          soldItem,
          pendingQty,
          totalSaleValue,
          chosenPaymentType,
          pendingSale.customer_name,
          Date.now(),
          ownerId,
          requestedUnit
        );


      trackIntentSuccess(
        'sale.confirm',
        {
          product:
            soldItem.productName,

          qty:
            pendingQty,

          unit:
            requestedUnit ||
            getStoredUnit(
              soldItem
            ) ||
            null,

          amount:
            totalSaleValue,

          payment_type:
            chosenPaymentType,

          customer_name:
            pendingSale.customer_name ||
            null,
        }
      );


      return result;

    } catch (
      error
    ) {

      console.error(
        'Confirm Sale Error:',
        error
      );


      trackIntentFailure(
        'sale.confirm',
        error?.message ||
          'Database error while trying to save.'
      );


      TelemetryService.logError(
        'voice_sale_confirm',
        error?.message ||
          'Database error while trying to save.',
        error?.stack
      );


      return (
        error?.message ||
        'Database error while trying to save.'
      );
    }
  };


/*
 * ============================================================
 * KHATA TODAY SUMMARY
 * ============================================================
 */

const getTodayKhataSummary =
  async ownerId => {

    if (
      !ownerId
    ) {

      return {

        totalCredit:
          0,

        totalPayment:
          0,

        uniqueCustomers:
          0,

        creditEntries:
          0,

        paymentEntries:
          0,
      };
    }


    const allEntries =
      await database
        .get(
          'ledger_entries'
        )
        .query(
          Q.where(
            'owner_id',
            ownerId
          )
        )
        .fetch();


    const todayEntries =
      allEntries.filter(
        entry =>
          isTodayTimestamp(
            entry.createdAt
          )
      );


    let totalCredit =
      0;

    let totalPayment =
      0;

    let creditEntries =
      0;

    let paymentEntries =
      0;


    const customers =
      new Set();


    todayEntries.forEach(
      entry => {

        const value =
          Number(
            entry.amount
          );


        if (
          !Number.isFinite(
            value
          ) ||
          value <= 0
        ) {

          return;
        }


        const entryType =
          String(
            entry.entryType ||
            ''
          )
            .trim()
            .toUpperCase();


        const customer =
          String(
            entry.customerId ||
            ''
          )
            .trim()
            .toLowerCase();


        if (
          entryType ===
          'CREDIT'
        ) {

          totalCredit +=
            value;

          creditEntries +=
            1;


          if (
            customer
          ) {

            customers.add(
              customer
            );
          }
        }


        if (
          entryType ===
          'PAYMENT'
        ) {

          totalPayment +=
            value;

          paymentEntries +=
            1;
        }
      }
    );


    return {

      totalCredit,

      totalPayment,

      uniqueCustomers:
        customers.size,

      creditEntries,

      paymentEntries,
    };
  };


/*
 * ============================================================
 * MAIN AI ACTION EXECUTOR
 * ============================================================
 */

export const executeAIAction =
  async (
    aiResponse
  ) => {

    const now =
      Date.now();


    /*
     * BASIC VALIDATION
     */

    if (
      !aiResponse ||
      typeof aiResponse !==
        'object' ||
      Array.isArray(
        aiResponse
      )
    ) {

      return (
        'Invalid voice command.'
      );
    }


    /*
     * ALLOWED INTENTS
     */

    const allowedIntents =
      new Set([

        'inventory.create',
        'inventory.add',

        'sale.create',

        'khata.credit',

        'inventory.update_price',

        'customer.create',

        'query.sales',

        'query.khata',

        'query.khata.summary',

        'query.inventory',

        'ui.open_billing',

        'ui.show_low_stock',

        'ui.show_sales',

        'pos.add_item',

        'pos.apply_discount',

        'pos.checkout',

        'unknown',

      ]);


    const intent =
      typeof aiResponse.intent ===
      'string'

        ? aiResponse.intent
            .trim()
            .toLowerCase()

        : 'unknown';


    if (
      !allowedIntents.has(
        intent
      )
    ) {

      console.warn(
        'Blocked unknown AI intent:',
        intent
      );


      trackIntentFailure(
        intent,
        'Unknown or blocked intent'
      );


      return (
        "I couldn't understand that command."
      );
    }


    /*
     * SANITIZE TEXT
     */

    const product =
      cleanText(
        aiResponse.product,
        150
      );


    const customer_name =
      cleanText(
        aiResponse.customer_name,
        100
      );


    const reason =
      cleanText(
        aiResponse.reason,
        250
      );


    const time_period =
      cleanText(
        aiResponse.time_period,
        50
      )
        .toLowerCase();


    /*
     * UNIT
     */

    const unit =
      normalizeUnit(
        aiResponse.unit
      );


    /*
     * PAYMENT TYPE
     */

    const payment_type =
      (
        aiResponse.payment_type ===
          'CASH' ||

        aiResponse.payment_type ===
          'KHATA'
      )

        ? aiResponse.payment_type

        : null;


    /*
     * NUMBERS
     */

    const qty =
      parsePositiveNumber(
        aiResponse.qty
      );


    const amount =
      parsePositiveNumber(
        aiResponse.amount
      );


    const new_price =
      parsePositiveNumber(
        aiResponse.new_price
      );


    const discount_percent =
      parsePositiveNumber(
        aiResponse.discount_percent
      );


    if (
      discount_percent !==
        null &&
      discount_percent >
        100
    ) {

      return (
        'Discount cannot be more than 100%.'
      );
    }


    /*
     * HARD LIMITS
     */

    if (
      qty !== null &&
      qty > MAX_QTY
    ) {

      return (
        'The requested quantity is too large.'
      );
    }


    if (
      amount !== null &&
      amount > MAX_MONEY
    ) {

      return (
        'The requested amount is too large.'
      );
    }


    if (
      new_price !== null &&
      new_price > MAX_MONEY
    ) {

      return (
        'The requested price is too large.'
      );
    }


    /*
     * CURRENT USER
     */

    try {

      const ownerId =
        await requireCurrentUserId();


      if (
        !ownerId
      ) {

        return (
          'No active account found.'
        );
      }


      /*
       * ======================================================
       * EXECUTE INTENT
       * ======================================================
       */

      switch (
        intent
      ) {


        /*
         * ====================================================
         * CREATE NEW INVENTORY PRODUCT
         * ====================================================
         */

        case 'inventory.create': {

          if (
            !product
          ) {

            return (
              'Please specify the product name.'
            );
          }


          const existing =
            await findInventoryItem(
              product,
              ownerId
            );


          if (
            existing
          ) {

            return (
              `${existing.productName} already exists in your inventory.`
            );
          }


          const startingQuantity =
            qty !== null
              ? qty
              : 0;


          const startingPrice =
            new_price !== null
              ? new_price
              : 0;


          await database.write(
            async () => {

              await database
                .get(
                  'inventory_items'
                )
                .create(
                  item => {

                    item.ownerId =
                      ownerId;

                    item.productName =
                      product;

                    item.quantity =
                      startingQuantity;

                    item.sellingPrice =
                      startingPrice;

                    item.isSynced =
                      false;

                    item.createdAt =
                      now;

                    item.updatedAt =
                      now;


                    if (
                      unit &&
                      typeof item.unit !==
                        'undefined'
                    ) {

                      item.unit =
                        unit;
                    }


                    if (
                      aiResponse.barcode &&
                      typeof item.barcode !==
                        'undefined'
                    ) {

                      item.barcode =
                        cleanText(
                          aiResponse.barcode,
                          100
                        );
                    }
                  }
                );
            }
          );


          trackIntentSuccess(
            'inventory.create',
            {
              product,
              qty:
                startingQuantity,
              unit:
                unit ||
                null,
              price:
                startingPrice,
            }
          );


          const displayUnit =
            unitLabel(
              unit
            );


          if (
            startingPrice > 0 &&
            startingQuantity > 0
          ) {

            return (
              `New product ${product} created with ` +
              `${startingQuantity} ${displayUnit} ` +
              `at ₹${startingPrice}.`
            );
          }


          if (
            startingQuantity > 0
          ) {

            return (
              `New product ${product} created with ` +
              `${startingQuantity} ${displayUnit} stock.`
            );
          }


          if (
            startingPrice > 0
          ) {

            return (
              `New product ${product} created at ₹${startingPrice}.`
            );
          }


          return (
            `New product ${product} created.`
          );
        }


        /*
         * ====================================================
         * ADD INVENTORY
         * ====================================================
         */

        case 'inventory.add': {

          if (
            !product
          ) {

            return (
              'Which product are you adding?'
            );
          }


          if (
            !qty
          ) {

            return (
              `How many ${product} do you want to add?`
            );
          }


          const item =
            await findInventoryItem(
              product,
              ownerId
            );


          if (
            !item
          ) {

            return (
              `I couldn't find ${product} in your inventory. ` +
              `If this is a new product, say "create product ${product}".`
            );
          }


          if (
            item.ownerId !==
            ownerId
          ) {

            return (
              'Product does not belong to the active account.'
            );
          }


          const unitCheck =
            validateUnitCompatibility(
              item,
              unit
            );


          if (
            !unitCheck.ok
          ) {

            return (
              `This product is stored in ${unitLabel(unitCheck.storedUnit)}, ` +
              `but you asked to add ${qty} ${unitLabel(unitCheck.unit)}. ` +
              `I won't mix different units.`
            );
          }


          await database.write(
            async () => {

              await item.update(
                current => {

                  if (
                    current.ownerId !==
                    ownerId
                  ) {

                    throw new Error(
                      'Product does not belong to the active account.'
                    );
                  }


                  current.quantity =
                    Number(
                      current.quantity
                    ) +
                    qty;


                  if (
                    unit &&
                    typeof current.unit !==
                      'undefined'
                  ) {

                    current.unit =
                      unit;
                  }


                  current.isSynced =
                    false;

                  current.updatedAt =
                    now;
                }
              );
            }
          );


          trackIntentSuccess(
            'inventory.add',
            {
              product:
                item.productName,

              qty,

              unit:
                unit ||
                getStoredUnit(item) ||
                null,
            }
          );


          const storedOrRequestedUnit =
            unit ||
            getStoredUnit(
              item
            );


          return (
            `Stock updated. You now have ` +
            `${Number(
              item.quantity
            )} ` +
            `${unitLabel(
              storedOrRequestedUnit
            )} ` +
            `${item.productName}.`
          );
        }


        /*
         * ====================================================
         * SALE
         * ====================================================
         */

        case 'sale.create': {

          /*
           * Flat Khata entry.
           */

          if (
            !product &&
            customer_name &&
            (
              new_price ||
              amount
            )
          ) {

            const flatAmount =
              Number(
                new_price ||
                amount
              );


            if (
              !Number.isFinite(
                flatAmount
              ) ||
              flatAmount <= 0 ||
              flatAmount >
                MAX_MONEY
            ) {

              return (
                'Please provide a valid amount.'
              );
            }


            await database.write(
              async () => {

                await database
                  .get(
                    'sales_transactions'
                  )
                  .create(
                    transaction => {

                      transaction.ownerId =
                        ownerId;

                      transaction.totalAmount =
                        flatAmount;

                      transaction.paymentType =
                        'KHATA';

                      transaction.isSynced =
                        false;

                      transaction.createdAt =
                        now;
                    }
                  );


                await database
                  .get(
                    'ledger_entries'
                  )
                  .create(
                    entry => {

                      entry.ownerId =
                        ownerId;

                      entry.customerId =
                        customer_name.trim();

                      entry.amount =
                        flatAmount;

                      entry.entryType =
                        'CREDIT';

                      entry.isSynced =
                        false;

                      entry.createdAt =
                        now;
                    }
                  );
              }
            );


            trackIntentSuccess(
              'khata.credit',
              {
                customer_name,
                amount:
                  flatAmount,
                entry_type:
                  'CREDIT',
              }
            );


            return (
              `Added flat Udhaar of ₹${flatAmount} ` +
              `to ${customer_name}'s Khata.`
            );
          }


          if (
            !product
          ) {

            return (
              'Which product are you trying to sell?'
            );
          }


          if (
            !qty
          ) {

            return (
              `How many ${product} are you selling?`
            );
          }


          const soldItem =
            await findInventoryItem(
              product,
              ownerId
            );


          if (
            !soldItem
          ) {

            return (
              `Product "${product}" not found in your inventory.`
            );
          }


          if (
            soldItem.ownerId !==
            ownerId
          ) {

            return (
              'Product does not belong to the active account.'
            );
          }


          const saleUnitCheck =
            validateUnitCompatibility(
              soldItem,
              unit
            );


          if (
            !saleUnitCheck.ok
          ) {

            return (
              `This product is stored in ${unitLabel(
                saleUnitCheck.storedUnit
              )}, ` +
              `but you asked for ${unitLabel(
                saleUnitCheck.unit
              )}. ` +
              `Please use the correct stock unit.`
            );
          }


          if (
            Number(
              soldItem.quantity
            ) <
            qty
          ) {

            return (
              `Not enough stock. You only have ` +
              `${soldItem.quantity} ` +
              `${unitLabel(
                unit ||
                getStoredUnit(
                  soldItem
                )
              )} ` +
              `${soldItem.productName} left.`
            );
          }


          const sellingPrice =
            Number(
              soldItem.sellingPrice
            );


          if (
            !Number.isFinite(
              sellingPrice
            ) ||
            sellingPrice < 0
          ) {

            return (
              'This product has an invalid selling price.'
            );
          }


          const totalSaleValue =
            sellingPrice *
            qty;


          if (
            !Number.isFinite(
              totalSaleValue
            ) ||
            totalSaleValue >
              MAX_MONEY
          ) {

            return (
              'The sale amount is too large.'
            );
          }


          let resolvedPaymentType =
            null;


          if (
            payment_type ===
              'CASH' ||
            payment_type ===
              'KHATA'
          ) {

            resolvedPaymentType =
              payment_type;

          } else if (
            customer_name
          ) {

            resolvedPaymentType =
              'KHATA';
          }


          if (
            !resolvedPaymentType
          ) {

            return {

              needsConfirmation:
                true,

              message:
                `Cash or Khata for ${qty} ` +
                `${unitLabel(
                  unit ||
                  getStoredUnit(
                    soldItem
                  )
                )} ` +
                `${soldItem.productName} ` +
                `(₹${totalSaleValue})?`,

              pendingSale: {

                itemId:
                  soldItem.id,

                qty:
                  qty,

                unit:
                  unit ||
                  getStoredUnit(
                    soldItem
                  ) ||
                  null,

                totalSaleValue:
                  totalSaleValue,

                customer_name:
                  customer_name ||
                  null,
              },
            };
          }


          const saleResult =
            await commitSale(
              soldItem,
              qty,
              totalSaleValue,
              resolvedPaymentType,
              customer_name,
              now,
              ownerId,
              unit
            );


          trackIntentSuccess(
            'sale.create',
            {
              product:
                soldItem.productName,

              qty,

              unit:
                unit ||
                getStoredUnit(
                  soldItem
                ) ||
                null,

              amount:
                totalSaleValue,

              payment_type:
                resolvedPaymentType,

              customer_name:
                customer_name ||
                null,
            }
          );


          return saleResult;
        }


        /*
         * ====================================================
         * PAYMENT RECEIVED
         * ====================================================
         */

        case 'khata.credit': {

          const paymentAmount =
            amount ??
            new_price ??
            qty;


          if (
            !customer_name ||
            !paymentAmount
          ) {

            return (
              'I need the customer name and amount received.'
            );
          }


          if (
            !Number.isFinite(
              paymentAmount
            ) ||
            paymentAmount <= 0 ||
            paymentAmount >
              MAX_MONEY
          ) {

            return (
              'Please provide a valid payment amount.'
            );
          }


          await database.write(
            async () => {

              await database
                .get(
                  'ledger_entries'
                )
                .create(
                  entry => {

                    entry.ownerId =
                      ownerId;

                    entry.customerId =
                      customer_name.trim();

                    entry.amount =
                      paymentAmount;

                    entry.entryType =
                      'PAYMENT';

                    entry.isSynced =
                      false;

                    entry.createdAt =
                      now;
                  }
                );
            }
          );


          trackIntentSuccess(
            'khata.credit',
            {
              customer_name,

              amount:
                paymentAmount,

              entry_type:
                'PAYMENT',
            }
          );


          return (
            `Logged ₹${paymentAmount} payment received ` +
            `from ${customer_name}.`
          );
        }


        /*
         * ====================================================
         * UPDATE PRICE
         * ====================================================
         */

        case 'inventory.update_price': {

          if (
            !product ||
            !new_price
          ) {

            return (
              'Please specify the product and the new price.'
            );
          }


          const priceItem =
            await findInventoryItem(
              product,
              ownerId
            );


          if (
            !priceItem
          ) {

            return (
              `Product "${product}" not found.`
            );
          }


          if (
            priceItem.ownerId !==
            ownerId
          ) {

            return (
              'Product does not belong to the active account.'
            );
          }


          await database.write(
            async () => {

              await priceItem.update(
                item => {

                  if (
                    item.ownerId !==
                    ownerId
                  ) {

                    throw new Error(
                      'Product does not belong to the active account.'
                    );
                  }


                  item.sellingPrice =
                    new_price;

                  item.isSynced =
                    false;

                  item.updatedAt =
                    now;
                }
              );
            }
          );


          trackIntentSuccess(
            'inventory.update_price',
            {
              product:
                priceItem.productName,

              new_price,
            }
          );


          return (
            `Price of ${priceItem.productName} ` +
            `is now ₹${new_price}.`
          );
        }


        /*
         * ====================================================
         * CREATE CUSTOMER / KHATA
         * ====================================================
         */

        case 'customer.create': {

          if (
            !customer_name
          ) {

            return (
              'Please specify the customer name for the new Khata.'
            );
          }


          const cleanCustomerName =
            String(
              customer_name
            )
              .trim()
              .replace(
                /\s+/g,
                ' '
              );


          if (
            cleanCustomerName.length <
            2
          ) {

            return (
              'Please provide a valid customer name.'
            );
          }


          const existingEntries =
            await database
              .get(
                'ledger_entries'
              )
              .query(
                Q.where(
                  'owner_id',
                  ownerId
                )
              )
              .fetch();


          const normalizedName =
            cleanCustomerName
              .toLowerCase();


          const alreadyExists =
            existingEntries.some(
              entry =>
                String(
                  entry.customerId ||
                  ''
                )
                  .trim()
                  .toLowerCase() ===
                normalizedName
            );


          if (
            alreadyExists
          ) {

            return (
              `${cleanCustomerName}'s Khata already exists.`
            );
          }


          await database.write(
            async () => {

              await database
                .get(
                  'ledger_entries'
                )
                .create(
                  entry => {

                    entry.ownerId =
                      ownerId;

                    entry.customerId =
                      cleanCustomerName;

                    entry.amount =
                      0;

                    entry.entryType =
                      'CREDIT';

                    entry.isSynced =
                      false;

                    entry.createdAt =
                      now;
                  }
                );
            }
          );


          trackIntentSuccess(
            'customer.create',
            {
              customer_name:
                cleanCustomerName,
            }
          );


          return (
            `New Khata account created for ` +
            `${cleanCustomerName}.`
          );
        }


        /*
         * ====================================================
         * SALES QUERY
         * ====================================================
         */

        case 'query.sales': {

          const today =
            getStartOfToday();


          const sales =
            await database
              .get(
                'sales_transactions'
              )
              .query(
                Q.where(
                  'owner_id',
                  ownerId
                ),
                Q.where(
                  'created_at',
                  Q.gte(
                    today
                  )
                )
              )
              .fetch();


          const totalSales =
            sales.reduce(
              (
                sum,
                sale
              ) =>
                sum +
                (
                  Number(
                    sale.totalAmount
                  ) ||
                  0
                ),
              0
            );


          return (
            `You have made ₹${totalSales.toLocaleString('en-IN')} ` +
            `in sales today.`
          );
        }


        /*
         * ====================================================
         * KHATA QUERY
         * ====================================================
 */

        case 'query.khata':
        case 'query.khata.summary': {

          const normalizedPeriod =
            time_period
              .replace(
                /[\s_-]+/g,
                ''
              );


          const summaryRequested =
            intent ===
              'query.khata.summary' ||
            (
              !customer_name &&
              (
                normalizedPeriod ===
                  'today' ||

                normalizedPeriod ===
                  'aaj' ||

                normalizedPeriod ===
                  'day' ||

                normalizedPeriod ===
                  'todays'
              )
            );


          if (
            summaryRequested
          ) {

            const summary =
              await getTodayKhataSummary(
                ownerId
              );


            if (
              summary.totalCredit <=
                0 &&
              summary.totalPayment <=
                0
            ) {

              return (
                'No Khata activity has been recorded today.'
              );
            }


            const summaryText =
              `${summary.uniqueCustomers} ` +
              (
                summary.uniqueCustomers ===
                1
                  ? 'customer'
                  : 'customers'
              ) +
              ` were given credit today ` +
              `totalling ₹${summary.totalCredit.toLocaleString('en-IN')}.`;


            if (
              summary.totalCredit <=
                0 &&
              summary.totalPayment >
                0
            ) {

              return (
                `You received ₹${summary.totalPayment.toLocaleString('en-IN')} ` +
                `in Khata payments today.`
              );
            }


            if (
              summary.totalPayment >
                0
            ) {

              return (
                `${summaryText} ` +
                `You also received ₹${summary.totalPayment.toLocaleString('en-IN')} ` +
                `in Khata payments today.`
              );
            }


            return summaryText;
          }


          /*
           * Customer-specific Khata.
           */

          if (
            !customer_name
          ) {

            return (
              "Which customer's balance do you want to check?"
            );
          }


          const allEntries =
            await database
              .get(
                'ledger_entries'
              )
              .query(
                Q.where(
                  'owner_id',
                  ownerId
                )
              )
              .fetch();


          const normalizedCustomer =
            customer_name
              .trim()
              .toLowerCase();


          const entries =
            allEntries.filter(
              entry =>
                String(
                  entry.customerId ||
                  ''
                )
                  .trim()
                  .toLowerCase()
                  .includes(
                    normalizedCustomer
                  )
            );


          if (
            entries.length ===
            0
          ) {

            return (
              `I couldn't find any Khata records for ${customer_name}.`
            );
          }


          let balance =
            0;


          entries.forEach(
            entry => {

              const entryAmount =
                Number(
                  entry.amount
                );


              if (
                !Number.isFinite(
                  entryAmount
                )
              ) {

                return;
              }


              if (
                entry.entryType ===
                'CREDIT'
              ) {

                balance +=
                  entryAmount;
              }


              if (
                entry.entryType ===
                'PAYMENT'
              ) {

                balance -=
                  entryAmount;
              }
            }
          );


          if (
            balance > 0
          ) {

            return (
              `${customer_name} currently owes you ` +
              `₹${balance.toLocaleString('en-IN')}.`
            );
          }


          if (
            balance < 0
          ) {

            return (
              `You hold an advance of ` +
              `₹${Math.abs(
                balance
              ).toLocaleString('en-IN')} ` +
              `for ${customer_name}.`
            );
          }


          return (
            `${customer_name}'s account is completely settled (₹0 balance).`
          );
        }


        /*
         * ====================================================
         * INVENTORY QUERY
         * ====================================================
 */

        case 'query.inventory': {

          if (
            !product
          ) {

            return (
              'Which product are you looking for?'
            );
          }


          const stockItem =
            await findInventoryItem(
              product,
              ownerId
            );


          if (
            !stockItem
          ) {

            return (
              `You don't have any "${product}" in your inventory.`
            );
          }


          if (
            stockItem.ownerId !==
            ownerId
          ) {

            return (
              'Product does not belong to the active account.'
            );
          }


          const storedUnit =
            getStoredUnit(
              stockItem
            );


          if (
            Number(
              stockItem.quantity
            ) <= 0
          ) {

            return (
              `${stockItem.productName} is currently out of stock!`
            );
          }


          return (
            `You have ${stockItem.quantity} ` +
            `${unitLabel(
              storedUnit
            )} ` +
            `${stockItem.productName} ready to sell.`
          );
        }


        /*
         * ====================================================
         * UI ACTIONS
         * ====================================================
 */

        case 'ui.open_billing':

          return (
            'Opening billing screen...'
          );


        case 'ui.show_low_stock':
        case 'ui.show_sales':

          return (
            'Looking that up for you...'
          );


        /*
         * ====================================================
         * POS ACTIONS
         * ====================================================
 */

        case 'pos.add_item':
        case 'pos.apply_discount':
        case 'pos.checkout':

          return (
            "Please open 'New Sale' first to use cart commands."
          );


        /*
         * ====================================================
         * UNKNOWN
         * ====================================================
 */

        case 'unknown':
        default:

          return (
            reason ||
            'Please specify an action, product, and quantity.'
          );
      }

    } catch (
      error
    ) {

      console.error(
        'Action Execution Error:',
        error
      );


      trackIntentFailure(
        intent,
        error?.message ||
          'Database error while trying to save.'
      );


      TelemetryService.logError(
        'voice_action',
        error?.message ||
          'Database error while trying to save.',
        error?.stack
      );


      return (
        error?.message ||
        'Database error while trying to save.'
      );
    }
  };