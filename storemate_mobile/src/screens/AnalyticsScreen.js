import React, {
  useState,
  useEffect,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';

import {
  database,
} from '../core/database';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';


const AnalyticsScreen = ({
  onClose,
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
   * - Large Android displays
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
   * Responsive horizontal padding.
   *
   * Small phone:
   *   < 360 = 14
   *
   * Normal phone:
   *   360-599 = 20
   *
   * Large phone/tablet:
   *   600+ = 28
   */
  const horizontalPadding =
    windowWidth < 360
      ? 14
      : windowWidth < 600
      ? 20
      : 28;


  /*
   * Small phones need a slightly
   * smaller card gap.
   */
  const cardGap =
    windowWidth < 360
      ? 8
      : 12;


  /*
   * =========================================================
   * STATE
   * =========================================================
   */

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    thisMonthSales,
    setThisMonthSales,
  ] = useState(0);

  const [
    allTimeSales,
    setAllTimeSales,
  ] = useState(0);

  const [
    totalUdhaar,
    setTotalUdhaar,
  ] = useState(0);

  const [
    totalPayments,
    setTotalPayments,
  ] = useState(0);

  const [
    stockInvestment,
    setStockInvestment,
  ] = useState(0);

  const [
    expectedStockRevenue,
    setExpectedStockRevenue,
  ] = useState(0);


  /*
   * =========================================================
   * LOAD ANALYTICS
   * =========================================================
   */

  useEffect(() => {

    fetchAnalytics();

  }, []);


  const fetchAnalytics =
    async () => {

      try {

        /*
         * ===================================================
         * 1. SALES
         * ===================================================
         */

        const sales =
          await database
            .get(
              'sales_transactions'
            )
            .query()
            .fetch();


        const now =
          new Date();


        const startOfMonth =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            1
          ).getTime();


        let monthSales =
          0;

        let totalSales =
          0;


        sales.forEach(
          sale => {

            const amount =
              Number(
                sale.totalAmount
              ) || 0;


            totalSales +=
              amount;


            if (
              (
                Number(
                  sale.createdAt
                ) || 0
              ) >=
              startOfMonth
            ) {

              monthSales +=
                amount;
            }

          }
        );


        /*
         * ===================================================
         * 2. KHATA
         * ===================================================
         */

        const ledger =
          await database
            .get(
              'ledger_entries'
            )
            .query()
            .fetch();


        let credit =
          0;

        let payment =
          0;


        ledger.forEach(
          entry => {

            const amount =
              Number(
                entry.amount
              ) || 0;


            if (
              entry.entryType ===
              'CREDIT'
            ) {

              credit +=
                amount;
            }


            if (
              entry.entryType ===
              'PAYMENT'
            ) {

              payment +=
                amount;
            }

          }
        );


        /*
         * ===================================================
         * 3. INVENTORY
         * ===================================================
         */

        const inventory =
          await database
            .get(
              'inventory_items'
            )
            .query()
            .fetch();


        let invested =
          0;

        let expected =
          0;


        inventory.forEach(
          item => {

            const purchasePrice =
              Number(
                item.purchasePrice
              ) || 0;


            const sellingPrice =
              Number(
                item.sellingPrice
              ) || 0;


            const quantity =
              Number(
                item.quantity
              ) || 0;


            invested +=
              purchasePrice *
              quantity;


            expected +=
              sellingPrice *
              quantity;

          }
        );


        /*
         * ===================================================
         * UPDATE STATE
         * ===================================================
         */

        setThisMonthSales(
          monthSales
        );

        setAllTimeSales(
          totalSales
        );

        setTotalUdhaar(
          credit
        );

        setTotalPayments(
          payment
        );

        setStockInvestment(
          invested
        );

        setExpectedStockRevenue(
          expected
        );

      } catch (error) {

        console.error(
          'Analytics Error:',
          error
        );

      } finally {

        setLoading(
          false
        );
      }
    };


  /*
   * =========================================================
   * DERIVED VALUES
   * =========================================================
   */

  const netPending =
    Math.max(
      totalUdhaar -
        totalPayments,
      0
    );


  const estimatedProfit =
    Math.max(
      expectedStockRevenue -
        stockInvestment,
      0
    );


  /*
   * =========================================================
   * LOADING SCREEN
   * =========================================================
   */

  if (loading) {

    return (

      <View
        style={[
          styles.loadingContainer,

          {
            paddingTop:
              Math.max(
                insets.top,
                16
              ),

            paddingBottom:
              Math.max(
                insets.bottom,
                16
              ),
          },
        ]}
      >

        <ActivityIndicator
          size="large"
          color="#0C9C4C"
        />

      </View>

    );
  }


  /*
   * =========================================================
   * MAIN SCREEN
   * =========================================================
   */

  return (

    <View
      style={[
        styles.container,

        {
          /*
           * Dynamic top safe area.
           */
          paddingTop:
            Math.max(
              insets.top,
              16
            ),

          /*
           * Dynamic bottom safe area.
           */
          paddingBottom:
            Math.max(
              insets.bottom,
              16
            ),

          /*
           * Responsive horizontal
           * spacing.
           */
          paddingHorizontal:
            horizontalPadding,
        },
      ]}
    >

      {/* ===================================================
          HEADER
          =================================================== */}

      <View
        style={
          styles.headerRow
        }
      >

        <View
          style={
            styles.headerTextWrap
          }
        >

          <Text
            style={
              styles.header
            }

            numberOfLines={
              1
            }

            adjustsFontSizeToFit

            minimumFontScale={
              0.8
            }
          >
            Business Analytics
          </Text>


          <Text
            style={
              styles.headerHinglish
            }
          >
            Mera Vyapar
          </Text>

        </View>


        {onClose && (

          <TouchableOpacity
            onPress={
              onClose
            }

            style={
              styles.closeBtn
            }

            activeOpacity={
              0.8
            }
          >

            <Text
              style={
                styles.closeBtnText
              }
            >
              Done
            </Text>

          </TouchableOpacity>

        )}

      </View>


      {/* ===================================================
          CONTENT
          =================================================== */}

      <ScrollView

        showsVerticalScrollIndicator={
          false
        }

        keyboardShouldPersistTaps="handled"

        contentContainerStyle={[
          styles.scrollContent,

          {
            /*
             * Dynamic bottom space.
             *
             * This prevents the final
             * card from sitting underneath
             * Android's navigation area.
             */
            paddingBottom:
              Math.max(
                insets.bottom +
                  30,
                46
              ),
          },
        ]}
      >


        {/* =================================================
            REVENUE SECTION
            ================================================= */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Sales & Revenue 💰
        </Text>


        <View
          style={[
            styles.rowGrid,

            {
              gap:
                cardGap,
            },
          ]}
        >

          {/* THIS MONTH */}

          <View
            style={[
              styles.card,
              styles.halfCard,
            ]}
          >

            <Text
              style={
                styles.cardLabel
              }
            >
              This Month's Sales
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
                0.7
              }
            >
              ₹
              {thisMonthSales.toLocaleString(
                'en-IN'
              )}
            </Text>

          </View>


          {/* ALL TIME */}

          <View
            style={[
              styles.card,
              styles.halfCard,
            ]}
          >

            <Text
              style={
                styles.cardLabel
              }
            >
              All-Time Sales
            </Text>


            <Text
              style={
                styles.cardValue
              }

              numberOfLines={
                1
              }

              adjustsFontSizeToFit

              minimumFontScale={
                0.7
              }
            >
              ₹
              {allTimeSales.toLocaleString(
                'en-IN'
              )}
            </Text>

          </View>

        </View>


        {/* =================================================
            KHATA SECTION
            ================================================= */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Khata Summary 📒
        </Text>


        <View
          style={
            styles.card
          }
        >

          <View
            style={[
              styles.rowBetween,

              styles.metricRow,
            ]}
          >

            <View
              style={
                styles.metricColumn
              }
            >

              <Text
                style={
                  styles.cardLabel
                }
              >
                Total Udhaar Given
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
                  0.7
                }
              >
                ₹
                {totalUdhaar.toLocaleString(
                  'en-IN'
                )}
              </Text>

            </View>


            <View
              style={[
                styles.metricColumn,

                styles.rightMetric,
              ]}
            >

              <Text
                style={
                  styles.cardLabel
                }
              >
                Total Payments Received
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
                  0.7
                }
              >
                ₹
                {totalPayments.toLocaleString(
                  'en-IN'
                )}
              </Text>

            </View>

          </View>


          <View
            style={
              styles.divider
            }
          />


          <View
            style={
              styles.rowBetween
            }
          >

            <Text
              style={[
                styles.cardLabel,
                styles.flexLabel,
              ]}
            >
              Net Market Pending (Baki)
            </Text>


            <Text
              style={[
                styles.cardValue,

                {
                  fontSize:
                    20,
                },
              ]}

              numberOfLines={
                1
              }

              adjustsFontSizeToFit

              minimumFontScale={
                0.7
              }
            >
              ₹
              {netPending.toLocaleString(
                'en-IN'
              )}
            </Text>

          </View>

        </View>


        {/* =================================================
            INVENTORY / PROFIT SECTION
            ================================================= */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Stock & Estimated Profit 📦
        </Text>


        <View
          style={
            styles.card
          }
        >

          <View
            style={[
              styles.rowBetween,

              styles.metricRow,
            ]}
          >

            {/* COST */}

            <View
              style={
                styles.metricColumn
              }
            >

              <Text
                style={
                  styles.cardLabel
                }
              >
                Vendor Purchases (Cost)
              </Text>


              <Text
                style={
                  styles.cardValue
                }

                numberOfLines={
                  1
                }

                adjustsFontSizeToFit

                minimumFontScale={
                  0.7
                }
              >
                ₹
                {stockInvestment.toLocaleString(
                  'en-IN'
                )}
              </Text>


              <Text
                style={
                  styles.cardSub
                }
              >
                Money tied in stock
              </Text>

            </View>


            {/* EXPECTED */}

            <View
              style={[
                styles.metricColumn,

                styles.rightMetric,
              ]}
            >

              <Text
                style={
                  styles.cardLabel
                }
              >
                Expected Revenue (Sell)
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
                  0.7
                }
              >
                ₹
                {expectedStockRevenue.toLocaleString(
                  'en-IN'
                )}
              </Text>


              <Text
                style={
                  styles.cardSub
                }
              >
                When all stock is sold
              </Text>

            </View>

          </View>


          <View
            style={
              styles.divider
            }
          />


          <View
            style={
              styles.rowBetween
            }
          >

            <Text
              style={[
                styles.cardLabel,
                styles.flexLabel,
              ]}
            >
              Est. Profit in current stock
            </Text>


            <Text
              style={[
                styles.cardValue,

                {
                  fontSize:
                    20,

                  color:
                    '#1D4ED8',
                },
              ]}

              numberOfLines={
                1
              }

              adjustsFontSizeToFit

              minimumFontScale={
                0.7
              }
            >
              ₹
              {estimatedProfit.toLocaleString(
                'en-IN'
              )}
            </Text>

          </View>

        </View>


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
     * LOADING
     * =======================================================
     */

    loadingContainer: {
      flex: 1,

      justifyContent:
        'center',

      alignItems:
        'center',

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

    headerRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',

      marginTop:
        10,

      marginBottom:
        20,
    },

    headerTextWrap: {
      flex: 1,

      minWidth:
        0,

      marginRight:
        12,
    },

    header: {
      fontSize: 24,

      color:
        '#1B1F23',

      fontWeight:
        '800',
    },

    headerHinglish: {
      color:
        '#9CA3AF',

      fontSize: 13,

      fontStyle:
        'italic',

      marginTop:
        1,
    },

    closeBtn: {
      paddingVertical:
        8,

      paddingHorizontal:
        16,

      backgroundColor:
        '#FFFFFF',

      borderRadius:
        8,

      borderWidth:
        1,

      borderColor:
        '#EAECEC',

      flexShrink:
        0,
    },

    closeBtnText: {
      color:
        '#1B1F23',

      fontWeight:
        '600',
    },


    /*
     * =======================================================
     * SECTION TITLES
     * =======================================================
     */

    sectionTitle: {
      color:
        '#6B7280',

      fontSize: 14,

      fontWeight:
        '700',

      marginTop:
        10,

      marginBottom:
        10,

      textTransform:
        'uppercase',
    },


    /*
     * =======================================================
     * TWO-COLUMN GRID
     * =======================================================
     */

    rowGrid: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      marginBottom:
        20,

      width:
        '100%',
    },

    halfCard: {
      flex: 1,

      minWidth:
        0,

      marginBottom:
        0,
    },


    /*
     * =======================================================
     * CARDS
     * =======================================================
     */

    card: {
      backgroundColor:
        '#FFFFFF',

      padding: 18,

      borderRadius:
        16,

      borderWidth:
        1,

      borderColor:
        '#EAECEC',

      marginBottom:
        20,

      minWidth:
        0,
    },


    /*
     * =======================================================
     * TWO-SIDE METRICS
     * =======================================================
     */

    rowBetween: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',

      width:
        '100%',
    },

    metricRow: {
      alignItems:
        'flex-start',
    },

    metricColumn: {
      flex: 1,

      minWidth:
        0,

      paddingRight:
        8,
    },

    rightMetric: {
      alignItems:
        'flex-end',

      paddingRight:
        0,

      paddingLeft:
        8,
    },

    flexLabel: {
      flex: 1,

      marginRight:
        12,
    },


    /*
     * =======================================================
     * TEXT
     * =======================================================
     */

    cardLabel: {
      color:
        '#6B7280',

      fontSize: 13,

      fontWeight:
        '600',

      marginBottom:
        4,

      flexShrink:
        1,
    },

    cardValue: {
      color:
        '#1B1F23',

      fontSize: 22,

      fontWeight:
        '800',

      flexShrink:
        1,
    },

    cardSub: {
      color:
        '#9CA3AF',

      fontSize: 11,

      marginTop:
        4,

      lineHeight:
        15,
    },


    /*
     * =======================================================
     * DIVIDER
     * =======================================================
     */

    divider: {
      height: 1,

      backgroundColor:
        '#EAECEC',

      marginVertical:
        15,
    },

  });


export default AnalyticsScreen;