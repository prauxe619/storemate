import React from 'react';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';

import {
  withObservables,
} from '@nozbe/watermelondb/react';

import {
  database,
} from '../core/database';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';


const DashboardScreen = ({
  ledgerEntries,
  sales,
}) => {

  /*
   * =========================================================
   * SAFE AREA
   * =========================================================
   *
   * Handles:
   *
   * - Android status bar
   * - Notches
   * - Punch-hole displays
   * - 3-button navigation
   * - Gesture navigation
   * - Persistent navigation bars
   * - Hidden navigation bars
   * - Large Android screens
   */
  const insets =
    useSafeAreaInsets();


  /*
   * =========================================================
   * RESPONSIVE SCREEN SIZE
   * =========================================================
   */

  const {
    width: windowWidth,
  } = useWindowDimensions();


  /*
   * Small phones:
   *   14px
   *
   * Normal phones:
   *   20px
   *
   * Large phones/tablets:
   *   28px
   */
  const horizontalPadding =
    windowWidth < 360
      ? 14
      : windowWidth < 600
      ? 20
      : 28;


  /*
   * =========================================================
   * OUTSTANDING KHATA
   * =========================================================
   */

  let totalOutstanding =
    0;


  ledgerEntries.forEach(
    entry => {

      totalOutstanding +=
        entry.entryType ===
        'CREDIT'
          ? entry.amount
          : -entry.amount;

    }
  );


  totalOutstanding =
    Math.max(
      totalOutstanding,
      0
    );


  /*
   * =========================================================
   * TOTAL REVENUE
   * =========================================================
   */

  const totalRevenue =
    sales.reduce(
      (
        sum,
        sale
      ) =>
        sum +
        sale.totalAmount,
      0
    );


  /*
   * =========================================================
   * TODAY'S REVENUE
   * =========================================================
   *
   * Same calculation used by
   * HomeScreen so the dashboard
   * and home screen remain
   * consistent.
   */

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );


  const todaysSales =
    sales.filter(
      sale =>
        (
          sale.createdAt ||
          0
        ) >=
        today.getTime()
    );


  const todaysRevenue =
    todaysSales.reduce(
      (
        sum,
        sale
      ) =>
        sum +
        sale.totalAmount,
      0
    );


  /*
   * =========================================================
   * CASH VS KHATA
   * =========================================================
   */

  const cashSales =
    sales.filter(
      sale =>
        sale.paymentType ===
        'CASH'
    );


  const khataSales =
    sales.filter(
      sale =>
        sale.paymentType ===
        'KHATA'
    );


  const cashRevenue =
    cashSales.reduce(
      (
        sum,
        sale
      ) =>
        sum +
        sale.totalAmount,
      0
    );


  const khataRevenue =
    khataSales.reduce(
      (
        sum,
        sale
      ) =>
        sum +
        sale.totalAmount,
      0
    );


  const cashPct =
    totalRevenue > 0
      ? Math.round(
          (
            cashRevenue /
            totalRevenue
          ) * 100
        )
      : 0;


  const khataPct =
    totalRevenue > 0
      ? 100 -
        cashPct
      : 0;


  /*
   * =========================================================
   * AVERAGE SALE
   * =========================================================
   */

  const avgSale =
    sales.length > 0
      ? totalRevenue /
        sales.length
      : 0;


  /*
   * =========================================================
   * DISTINCT DEBTORS
   * =========================================================
   */

  const balanceByCustomer =
    {};


  ledgerEntries.forEach(
    entry => {

      /*
       * Defensive handling in case
       * customerId is missing.
       */
      const key =
        String(
          entry.customerId ||
            ''
        )
          .trim()
          .toLowerCase();


      if (!key) {
        return;
      }


      balanceByCustomer[key] =
        (
          balanceByCustomer[key] ||
          0
        ) +
        (
          entry.entryType ===
          'CREDIT'
            ? entry.amount
            : -entry.amount
        );

    }
  );


  const debtorCount =
    Object.values(
      balanceByCustomer
    ).filter(
      balance =>
        balance > 0
    ).length;


  /*
   * =========================================================
   * RESPONSIVE CARD WIDTH
   * =========================================================
   *
   * On small phones the two-column
   * layout remains compact.
   *
   * On larger screens it gets more
   * breathing room.
   */

  const cardGap =
    windowWidth < 360
      ? 8
      : 12;


  return (

    <View
      style={[
        styles.container,

        {
          /*
           * Dynamic status-bar /
           * notch handling.
           */
          paddingTop:
            Math.max(
              insets.top,
              16
            ),

          /*
           * Dynamic Android navigation
           * / gesture handling.
           */
          paddingBottom:
            Math.max(
              insets.bottom,
              16
            ),

          paddingHorizontal:
            horizontalPadding,
        },
      ]}
    >

      <ScrollView

        showsVerticalScrollIndicator={
          false
        }

        contentContainerStyle={[
          styles.scrollContent,

          {
            /*
             * Always leave enough room
             * below the final card.
             */
            paddingBottom:
              Math.max(
                insets.bottom +
                  30,
                46
              ),
          },
        ]}

        keyboardShouldPersistTaps="handled"

      >

        {/* ===============================================
            HEADER
            =============================================== */}

        <Text
          style={
            styles.header
          }
        >
          Business Overview
        </Text>


        <Text
          style={
            styles.headerHinglish
          }
        >
          Karobar ka Hisaab
        </Text>


        {/* ===============================================
            TOTAL REVENUE + OUTSTANDING
            =============================================== */}

        <View
          style={[
            styles.cardRow,

            {
              gap:
                cardGap,
            },
          ]}
        >

          <View
            style={
              styles.card
            }
          >

            <Text
              style={
                styles.cardTitle
              }
            >
              TOTAL REVENUE
            </Text>


            <Text
              style={[
                styles.cardValue,

                {
                  color:
                    '#0C9C4C',
                },
              ]}
              numberOfLines={
                1
              }
              adjustsFontSizeToFit
              minimumFontScale={
                0.75
              }
            >
              ₹
              {totalRevenue.toLocaleString(
                'en-IN'
              )}
            </Text>


            <Text
              style={
                styles.cardSubtext
              }
            >
              {sales.length}{' '}
              completed sale
              {sales.length !==
              1
                ? 's'
                : ''}
            </Text>

          </View>


          <View
            style={
              styles.card
            }
          >

            <Text
              style={
                styles.cardTitle
              }
            >
              OUTSTANDING KHATA
            </Text>


            <Text
              style={[
                styles.cardValue,

                {
                  color:
                    '#E0433B',
                },
              ]}
              numberOfLines={
                1
              }
              adjustsFontSizeToFit
              minimumFontScale={
                0.75
              }
            >
              ₹
              {totalOutstanding.toLocaleString(
                'en-IN'
              )}
            </Text>


            <Text
              style={
                styles.cardSubtext
              }
              numberOfLines={
                2
              }
            >
              {debtorCount >
              0
                ? `Owed by ${debtorCount} customer${
                    debtorCount !==
                    1
                      ? 's'
                      : ''
                  }`
                : 'Nobody owes you right now'}
            </Text>

          </View>

        </View>


        {/* ===============================================
            TODAY + AVG SALE
            =============================================== */}

        <View
          style={[
            styles.cardRow,

            {
              gap:
                cardGap,
            },
          ]}
        >

          <View
            style={
              styles.card
            }
          >

            <Text
              style={
                styles.cardTitle
              }
            >
              TODAY'S REVENUE
            </Text>


            <Text
              style={
                styles.cardValueSmall
              }
              numberOfLines={
                1
              }
              adjustsFontSizeToFit
              minimumFontScale={
                0.75
              }
            >
              ₹
              {todaysRevenue.toLocaleString(
                'en-IN'
              )}
            </Text>


            <Text
              style={
                styles.cardSubtext
              }
            >
              {todaysSales.length}{' '}
              sale
              {todaysSales.length !==
              1
                ? 's'
                : ''}{' '}
              today
            </Text>

          </View>


          <View
            style={
              styles.card
            }
          >

            <Text
              style={
                styles.cardTitle
              }
            >
              AVG SALE VALUE
            </Text>


            <Text
              style={
                styles.cardValueSmall
              }
              numberOfLines={
                1
              }
              adjustsFontSizeToFit
              minimumFontScale={
                0.75
              }
            >
              ₹
              {avgSale.toLocaleString(
                'en-IN',
                {
                  maximumFractionDigits:
                    0,
                }
              )}
            </Text>


            <Text
              style={
                styles.cardSubtext
              }
            >
              Across all sales
            </Text>

          </View>

        </View>


        {/* ===============================================
            CASH VS KHATA
            =============================================== */}

        {sales.length >
          0 && (

          <View
            style={
              styles.splitCard
            }
          >

            <Text
              style={
                styles.cardTitle
              }
            >
              CASH VS KHATA
            </Text>


            <View
              style={
                styles.splitBarTrack
              }
            >

              <View
                style={[
                  styles.splitBarFill,

                  {
                    width:
                      `${cashPct}%`,

                    backgroundColor:
                      '#0C9C4C',
                  },
                ]}
              />

            </View>


            <View
              style={
                styles.splitLegendRow
              }
            >

              {/* Cash */}

              <View
                style={
                  styles.splitLegendItem
                }
              >

                <View
                  style={[
                    styles.splitDot,

                    {
                      backgroundColor:
                        '#0C9C4C',
                    },
                  ]}
                />

                <Text
                  style={
                    styles.splitLegendText
                  }
                  numberOfLines={
                    2
                  }
                >
                  Cash · {cashPct}% · ₹
                  {cashRevenue.toLocaleString(
                    'en-IN'
                  )}
                </Text>

              </View>


              {/* Khata */}

              <View
                style={
                  styles.splitLegendItem
                }
              >

                <View
                  style={[
                    styles.splitDot,

                    {
                      backgroundColor:
                        '#E0433B',
                    },
                  ]}
                />

                <Text
                  style={
                    styles.splitLegendText
                  }
                  numberOfLines={
                    2
                  }
                >
                  Khata · {khataPct}% · ₹
                  {khataRevenue.toLocaleString(
                    'en-IN'
                  )}
                </Text>

              </View>

            </View>

          </View>

        )}

      </ScrollView>

    </View>
  );
};


/*
 * ===========================================================
 * STYLES
 * ===========================================================
 */

const styles =
  StyleSheet.create({

    /*
     * =======================================================
     * ROOT
     * =======================================================
     */

    container: {
      flex: 1,

      backgroundColor:
        '#F5F7F6',
    },


    /*
     * =======================================================
     * SCROLL
     * =======================================================
     */

    scrollContent: {
      paddingTop:
        0,
    },


    /*
     * =======================================================
     * HEADER
     * =======================================================
     */

    header: {
      fontSize: 24,

      color:
        '#1B1F23',

      fontWeight:
        '800',

      marginTop:
        10,
    },

    headerHinglish: {
      color:
        '#9CA3AF',

      fontSize: 13,

      fontStyle:
        'italic',

      marginTop:
        2,

      marginBottom:
        20,
    },


    /*
     * =======================================================
     * CARD ROW
     * =======================================================
     */

    cardRow: {
      flexDirection:
        'row',

      marginBottom:
        12,

      width:
        '100%',
    },


    /*
     * =======================================================
     * STAT CARD
     * =======================================================
     */

    card: {
      flex: 1,

      minWidth:
        0,

      backgroundColor:
        '#FFFFFF',

      padding: 18,

      borderRadius:
        16,

      borderWidth:
        1,

      borderColor:
        '#EAECEC',
    },

    cardTitle: {
      color:
        '#6B7280',

      fontSize: 11,

      fontWeight:
        '700',

      letterSpacing:
        0.5,

      marginBottom:
        8,
    },

    cardValue: {
      fontSize: 26,

      fontWeight:
        '800',

      flexShrink:
        1,
    },

    cardValueSmall: {
      fontSize: 20,

      fontWeight:
        '800',

      color:
        '#1B1F23',

      flexShrink:
        1,
    },

    cardSubtext: {
      color:
        '#9CA3AF',

      fontSize: 11.5,

      marginTop:
        8,

      lineHeight:
        16,
    },


    /*
     * =======================================================
     * CASH / KHATA
     * =======================================================
     */

    splitCard: {
      backgroundColor:
        '#FFFFFF',

      padding: 18,

      borderRadius:
        16,

      borderWidth:
        1,

      borderColor:
        '#EAECEC',

      marginTop:
        4,

      marginBottom:
        10,
    },

    splitBarTrack: {
      height: 10,

      borderRadius:
        5,

      backgroundColor:
        '#FDECEA',

      overflow:
        'hidden',

      marginTop:
        4,

      marginBottom:
        12,
    },

    splitBarFill: {
      height:
        '100%',

      borderRadius:
        5,
    },

    splitLegendRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      flexWrap:
        'wrap',

      gap:
        8,
    },

    splitLegendItem: {
      flexDirection:
        'row',

      alignItems:
        'center',

      flexShrink:
        1,

      maxWidth:
        '100%',
    },

    splitDot: {
      width: 8,

      height: 8,

      borderRadius: 4,

      marginRight: 6,

      flexShrink:
        0,
    },

    splitLegendText: {
      color:
        '#374151',

      fontSize: 12.5,

      fontWeight:
        '600',

      flexShrink:
        1,
    },
  });


/*
 * ===========================================================
 * WATERMELONDB OBSERVABLES
 * ===========================================================
 */

const enhance =
  withObservables(
    [],
    () => ({

      ledgerEntries:
        database
          .get(
            'ledger_entries'
          )
          .query()
          .observe(),

      sales:
        database
          .get(
            'sales_transactions'
          )
          .query()
          .observe(),

    })
  );


export default enhance(
  DashboardScreen
);