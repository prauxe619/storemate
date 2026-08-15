import { database } from '../database';
import { Q } from '@nozbe/watermelondb';
import { requireCurrentUserId } from '../auth/localUser';


/*
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const MAX_QTY = 100000;
const MAX_MONEY = 100000000;


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

const cleanText = (value, maxLength = 150) => {
  if (typeof value !== 'string') return '';

  return value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
};


const parsePositiveNumber = value => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
};


/*
 * ============================================================
 * OWNER-SAFE INVENTORY LOOKUP
 * ============================================================
 */

const findInventoryItem = async (product, ownerId) => {
  if (!product || !ownerId) return null;

  const allItems = await database
    .get('inventory_items')
    .query(Q.where('owner_id', ownerId))
    .fetch();

  const normalized = String(product)
    .trim()
    .toLowerCase();

  if (!normalized) return null;


  /*
   * Exact match first.
   */

  const exact = allItems.find(item =>
    String(item.productName || '')
      .trim()
      .toLowerCase() === normalized
  );

  if (exact) return exact;


  /*
   * Partial match second.
   */

  return (
    allItems.find(item =>
      String(item.productName || '')
        .trim()
        .toLowerCase()
        .includes(normalized)
    ) || null
  );
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
  ownerId
) {
  if (!soldItem) {
    return 'Product could not be found.';
  }

  if (!ownerId) {
    return 'No active account found.';
  }


  /*
   * CRITICAL USER ISOLATION CHECK.
   *
   * Never allow a product belonging to another user
   * to be modified or sold.
   */

  if (soldItem.ownerId !== ownerId) {
    return 'Product does not belong to the active account.';
  }


  if (
    !Number.isFinite(Number(qty)) ||
    Number(qty) <= 0
  ) {
    return 'Invalid quantity.';
  }


  if (
    Number(qty) > MAX_QTY
  ) {
    return 'The requested quantity is too large.';
  }


  if (
    Number(soldItem.quantity) < Number(qty)
  ) {
    return (
      `Not enough stock. You only have ` +
      `${soldItem.quantity} ${soldItem.productName} left.`
    );
  }


  if (
    !Number.isFinite(Number(totalSaleValue)) ||
    Number(totalSaleValue) < 0 ||
    Number(totalSaleValue) > MAX_MONEY
  ) {
    return 'Invalid sale amount.';
  }


  if (
    paymentType !== 'CASH' &&
    paymentType !== 'KHATA'
  ) {
    return 'Invalid payment method.';
  }


  if (
    paymentType === 'KHATA' &&
    !customer_name
  ) {
    return "Please also say the customer's name for Khata sales.";
  }


  const cleanCustomerName = customer_name
    ? cleanText(customer_name, 100)
    : '';


  if (
    paymentType === 'KHATA' &&
    !cleanCustomerName
  ) {
    return "Please also say the customer's name for Khata sales.";
  }


  await database.write(async () => {

    /*
     * ========================================================
     * CREATE SALE TRANSACTION
     * ========================================================
     */

    await database
      .get('sales_transactions')
      .create(transaction => {
        transaction.ownerId = ownerId;

        transaction.totalAmount =
          totalSaleValue;

        transaction.paymentType =
          paymentType;

        transaction.isSynced =
          false;

        transaction.createdAt =
          now;
      });


    /*
     * ========================================================
     * REDUCE INVENTORY
     * ========================================================
     */

    await soldItem.update(item => {

      /*
       * Re-check ownership inside the write operation.
       */

      if (item.ownerId !== ownerId) {
        throw new Error(
          'Product does not belong to the active account.'
        );
      }


      const currentQuantity =
        Number(item.quantity) || 0;


      if (
        currentQuantity < qty
      ) {
        throw new Error(
          `Not enough stock. Only ${currentQuantity} ${item.productName} available.`
        );
      }


      item.quantity =
        currentQuantity - qty;

      item.isSynced =
        false;

      item.updatedAt =
        now;
    });


    /*
     * ========================================================
     * KHATA ENTRY
     * ========================================================
     */

    if (
      paymentType === 'KHATA'
    ) {

      await database
        .get('ledger_entries')
        .create(entry => {
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
        });
    }
  });


  if (
    paymentType === 'KHATA'
  ) {
    return (
      `Billed ₹${totalSaleValue} to ` +
      `${cleanCustomerName}'s Khata for ` +
      `${qty} ${soldItem.productName}.`
    );
  }


  return (
    `Cash sale recorded: ₹${totalSaleValue} ` +
    `for ${qty} ${soldItem.productName}.`
  );
}


/*
 * ============================================================
 * CONFIRM PENDING SALE
 * ============================================================
 */

export const confirmPendingSale = async (
  pendingSale,
  chosenPaymentType
) => {

  if (
    !pendingSale ||
    (
      chosenPaymentType !== 'CASH' &&
      chosenPaymentType !== 'KHATA'
    )
  ) {
    return 'Something went wrong confirming that sale.';
  }


  try {

    const ownerId =
      await requireCurrentUserId();


    if (!ownerId) {
      return 'No active account found.';
    }


    if (!pendingSale.itemId) {
      return 'Product information is missing.';
    }


    const soldItem =
      await database
        .get('inventory_items')
        .find(
          pendingSale.itemId
        );


    /*
     * ========================================================
     * STRICT OWNERSHIP CHECK
     * ========================================================
     *
     * IMPORTANT:
     *
     * We intentionally do NOT use:
     *
     * if (soldItem.ownerId && ...)
     *
     * because an old record without ownerId must NOT
     * automatically pass the security check.
     */

    if (
      soldItem.ownerId !== ownerId
    ) {
      return 'Product does not belong to the active account.';
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
      return 'Invalid quantity.';
    }


    if (
      pendingQty > MAX_QTY
    ) {
      return 'The requested quantity is too large.';
    }


    if (
      Number(soldItem.quantity) <
      pendingQty
    ) {
      return (
        `Not enough stock. You only have ` +
        `${soldItem.quantity} ` +
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
      totalSaleValue > MAX_MONEY
    ) {
      return 'Invalid sale amount.';
    }


    return await commitSale(
      soldItem,
      pendingQty,
      totalSaleValue,
      chosenPaymentType,
      pendingSale.customer_name,
      Date.now(),
      ownerId
    );

  } catch (error) {

    console.error(
      'Confirm Sale Error:',
      error
    );


    return (
      error?.message ||
      'Database error while trying to save.'
    );
  }
};


/*
 * ============================================================
 * MAIN AI ACTION EXECUTOR
 * ============================================================
 */

export const executeAIAction = async (
  aiResponse
) => {

  const now =
    Date.now();


  /*
   * ==========================================================
   * BASIC VALIDATION
   * ==========================================================
   */

  if (
    !aiResponse ||
    typeof aiResponse !== 'object' ||
    Array.isArray(aiResponse)
  ) {
    return 'Invalid voice command.';
  }


  /*
   * ==========================================================
   * ALLOWED INTENTS
   * ==========================================================
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


    return (
      "I couldn't understand that command."
    );
  }


  /*
   * ==========================================================
   * SANITIZE TEXT
   * ==========================================================
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
    );


  const unit =
    cleanText(
      aiResponse.unit,
      20
    );


  /*
   * ==========================================================
   * PAYMENT TYPE
   * ==========================================================
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
   * ==========================================================
   * NUMBERS
   * ==========================================================
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


  let discount_percent =
    parsePositiveNumber(
      aiResponse.discount_percent
    );


  if (
    discount_percent !== null &&
    discount_percent > 100
  ) {
    return 'Discount cannot be more than 100%.';
  }


  /*
   * ==========================================================
   * HARD LIMITS
   * ==========================================================
   */

  if (
    qty !== null &&
    qty > MAX_QTY
  ) {
    return 'The requested quantity is too large.';
  }


  if (
    amount !== null &&
    amount > MAX_MONEY
  ) {
    return 'The requested amount is too large.';
  }


  if (
    new_price !== null &&
    new_price > MAX_MONEY
  ) {
    return 'The requested price is too large.';
  }


  /*
   * ==========================================================
   * CURRENT USER
   * ==========================================================
   *
   * Everything below runs for this user only.
   */

  try {

    const ownerId =
      await requireCurrentUserId();


    if (!ownerId) {
      return 'No active account found.';
    }


    /*
     * ========================================================
     * EXECUTE INTENT
     * ========================================================
     */

    switch (
      intent
    ) {


      /*
       * ======================================================
       * CREATE NEW INVENTORY PRODUCT
       * ======================================================
       */

      case 'inventory.create': {

        if (!product) {
          return 'Please specify the product name.';
        }


        const existing =
          await findInventoryItem(
            product,
            ownerId
          );


        if (existing) {
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
              .get('inventory_items')
              .create(item => {

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
              });
          }
        );


        if (
          startingPrice > 0 &&
          startingQuantity > 0
        ) {

          return (
            `New product ${product} created with ` +
            `${startingQuantity} ${unit || 'units'} ` +
            `at ₹${startingPrice}.`
          );
        }


        if (
          startingQuantity > 0
        ) {

          return (
            `New product ${product} created with ` +
            `${startingQuantity} ${unit || 'units'} stock.`
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
       * ======================================================
       * ADD INVENTORY
       * ======================================================
       */

      case 'inventory.add': {

        if (!product) {
          return 'Which product are you adding?';
        }


        if (!qty) {
          return (
            `How many ${product} do you want to add?`
          );
        }


        const item =
          await findInventoryItem(
            product,
            ownerId
          );


        if (!item) {

          return (
            `I couldn't find ${product} in your inventory. ` +
            `If this is a new product, say "create product ${product}".`
          );
        }


        /*
         * Extra ownership validation.
         */

        if (
          item.ownerId !== ownerId
        ) {
          return (
            'Product does not belong to the active account.'
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

                current.isSynced =
                  false;

                current.updatedAt =
                  now;
              }
            );
          }
        );


        return (
          `Stock updated. You now have ` +
          `${item.quantity} ${item.productName}.`
        );
      }


      /*
       * ======================================================
       * SALE
       * ======================================================
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
            amount ||
            qty
          )
        ) {

          const flatAmount =
            Number(
              new_price ||
              amount ||
              qty
            );


          if (
            !Number.isFinite(
              flatAmount
            ) ||
            flatAmount <= 0 ||
            flatAmount > MAX_MONEY
          ) {
            return (
              'Please provide a valid amount.'
            );
          }


          await database.write(
            async () => {

              await database
                .get('sales_transactions')
                .create(transaction => {

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
                });


              await database
                .get('ledger_entries')
                .create(entry => {

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
                });
            }
          );


          return (
            `Added flat Udhaar of ₹${flatAmount} ` +
            `to ${customer_name}'s Khata.`
          );
        }


        if (!product) {
          return (
            'Which product are you trying to sell?'
          );
        }


        if (!qty) {
          return (
            `How many ${product} are you selling?`
          );
        }


        const soldItem =
          await findInventoryItem(
            product,
            ownerId
          );


        if (!soldItem) {
          return (
            `Product "${product}" not found in your inventory.`
          );
        }


        /*
         * Strict ownership validation.
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
          Number(soldItem.quantity) <
          qty
        ) {

          return (
            `Not enough stock. You only have ` +
            `${soldItem.quantity} ` +
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


        /*
         * ====================================================
         * PAYMENT METHOD
         * ====================================================
         */

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


        /*
         * If no payment method was specified,
         * ask instead of assuming cash.
         */

        if (
          !resolvedPaymentType
        ) {

          return {

            needsConfirmation:
              true,

            message:
              `Cash or Khata for ${qty} ` +
              `${soldItem.productName} ` +
              `(₹${totalSaleValue})?`,

            pendingSale: {

              itemId:
                soldItem.id,

              qty:
                qty,

              totalSaleValue:
                totalSaleValue,

              customer_name:
                customer_name ||
                null,
            },
          };
        }


        return await commitSale(
          soldItem,
          qty,
          totalSaleValue,
          resolvedPaymentType,
          customer_name,
          now,
          ownerId
        );
      }


      /*
       * ======================================================
       * PAYMENT RECEIVED
       * ======================================================
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
          paymentAmount > MAX_MONEY
        ) {

          return (
            'Please provide a valid payment amount.'
          );
        }


        await database.write(
          async () => {

            await database
              .get('ledger_entries')
              .create(entry => {

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
              });
          }
        );


        return (
          `Logged ₹${paymentAmount} payment received ` +
          `from ${customer_name}.`
        );
      }


      /*
       * ======================================================
       * UPDATE PRICE
       * ======================================================
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


        if (!priceItem) {
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


        return (
          `Price of ${priceItem.productName} ` +
          `is now ₹${new_price}.`
        );
      }


      /*
       * ======================================================
       * CREATE CUSTOMER / KHATA
       * ======================================================
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


        /*
         * ====================================================
         * ONLY SEARCH CURRENT USER'S LEDGER
         * ====================================================
         */

        const existingEntries =
          await database
            .get('ledger_entries')
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


        /*
         * ====================================================
         * CREATE ZERO-BALANCE KHATA RECORD
         * ====================================================
         */

        await database.write(
          async () => {

            await database
              .get('ledger_entries')
              .create(entry => {

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
              });
          }
        );


        return (
          `New Khata account created for ` +
          `${cleanCustomerName}.`
        );
      }


      /*
       * ======================================================
       * SALES QUERY
       * ======================================================
       */

      case 'query.sales': {

        const today =
          new Date();


        today.setHours(
          0,
          0,
          0,
          0
        );


        const sales =
          await database
            .get('sales_transactions')
            .query(
              Q.where(
                'owner_id',
                ownerId
              ),
              Q.where(
                'created_at',
                Q.gte(
                  today.getTime()
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
       * ======================================================
       * KHATA QUERY
       * ======================================================
       */

      case 'query.khata': {

        if (
          !customer_name
        ) {

          return (
            "Which customer's balance do you want to check?"
          );
        }


        const allEntries =
          await database
            .get('ledger_entries')
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
            `₹${Math.abs(balance).toLocaleString('en-IN')} ` +
            `for ${customer_name}.`
          );
        }


        return (
          `${customer_name}'s account is completely settled (₹0 balance).`
        );
      }


      /*
       * ======================================================
       * INVENTORY QUERY
       * ======================================================
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


        if (
          stockItem.quantity <=
          0
        ) {

          return (
            `${stockItem.productName} is currently out of stock!`
          );
        }


        return (
          `You have ${stockItem.quantity} ` +
          `${stockItem.productName} ready to sell.`
        );
      }


      /*
       * ======================================================
       * UI ACTIONS
       * ======================================================
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
       * ======================================================
       * POS ACTIONS
       * ======================================================
       */

      case 'pos.add_item':
      case 'pos.apply_discount':
      case 'pos.checkout':

        return (
          "Please open 'New Sale' first to use cart commands."
        );


      /*
       * ======================================================
       * UNKNOWN
       * ======================================================
       */

      case 'unknown':
      default:

        return (
          reason ||
          'Please specify an action, product, and quantity.'
        );
    }

  } catch (error) {

    console.error(
      'Action Execution Error:',
      error
    );


    return (
      error?.message ||
      'Database error while trying to save.'
    );
  }
};