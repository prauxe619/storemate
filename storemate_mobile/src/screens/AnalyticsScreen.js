import React, {
  useState,
  useEffect,
  useCallback,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';

import {
  database,
} from '../core/database';

import {
  Q,
} from '@nozbe/watermelondb';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  requireCurrentUserId,
} from '../core/auth/localUser';


/* ============================================================
 * COUNTR COLORS
 * ============================================================ */

const COLORS = {

  background:
    '#F5F7F5',

  surface:
    '#FFFFFF',

  surfaceSoft:
    '#F1F5EF',

  ink:
    '#172019',

  text:
    '#2D3830',

  muted:
    '#7C867F',

  mutedLight:
    '#A2AAA5',

  border:
    '#DDE4DE',

  borderSoft:
    '#E7ECE7',

  green:
    '#6C9637',

  greenDark:
    '#527A28',

  greenSoft:
    '#EAF4E3',

  red:
    '#D95C52',

  redSoft:
    '#FFF0EE',

  blue:
    '#477DA8',

  blueSoft:
    '#EEF5FA',

  orange:
    '#C98732',

  orangeSoft:
    '#FFF5E8',

  white:
    '#FFFFFF',
};


/* ============================================================
 * HELPERS
 * ============================================================ */

const formatMoney =
  value => {

    const number =
      Number(value) || 0;

    return `₹${number.toLocaleString(
      'en-IN',
      {
        maximumFractionDigits: 0,
      }
    )}`;
  };


const formatCompactMoney =
  value => {

    const number =
      Number(value) || 0;


    if (
      Math.abs(number) >=
      10000000
    ) {

      return `₹${(
        number / 10000000
      ).toFixed(1)}Cr`;

    }


    if (
      Math.abs(number) >=
      100000
    ) {

      return `₹${(
        number / 100000
      ).toFixed(1)}L`;

    }


    if (
      Math.abs(number) >=
      1000
    ) {

      return `₹${(
        number / 1000
      ).toFixed(1)}K`;

    }


    return formatMoney(
      number
    );
  };


const getMonthName =
  () => {

    return new Date().toLocaleDateString(
      'en-IN',
      {
        month:
          'long',
      }
    );

  };


/* ============================================================
 * ANALYTICS SCREEN
 * ============================================================ */

const AnalyticsScreen = ({
  onClose,
}) => {

  const insets =
    useSafeAreaInsets();


  const {
    width: windowWidth,
  } = useWindowDimensions();


  const horizontalPadding =
    windowWidth < 360
      ? 14
      : windowWidth < 600
      ? 18
      : 28;


  const isSmallPhone =
    windowWidth < 360;


  /* ==========================================================
   * STATE
   * ========================================================== */

  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    refreshing,
    setRefreshing,
  ] = useState(false);


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


  const [
    totalStockItems,
    setTotalStockItems,
  ] = useState(0);


  /* ==========================================================
   * FETCH ANALYTICS
   * ========================================================== */

  const fetchAnalytics =
    useCallback(
      async (
        showRefresh = false
      ) => {

        if (
          showRefresh
        ) {

          setRefreshing(
            true
          );

        } else {

          setLoading(
            true
          );

        }


        try {

          /*
           * ==================================================
           * CURRENT USER
           * ==================================================
           */

          const ownerId =
            await requireCurrentUserId();


          /*
           * ==================================================
           * MONTH START
           * ==================================================
           */

          const now =
            new Date();


          const startOfMonth =
            new Date(
              now.getFullYear(),
              now.getMonth(),
              1
            ).getTime();


          /*
           * ==================================================
           * SALES
           *
           * IMPORTANT:
           * Filter by current owner.
           * ==================================================
           */

          const sales =
            await database
              .get(
                'sales_transactions'
              )
              .query(
                Q.where(
                  'owner_id',
                  ownerId
                )
              )
              .fetch();


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


              const createdAt =
                Number(
                  sale.createdAt
                ) || 0;


              if (
                createdAt >=
                startOfMonth
              ) {

                monthSales +=
                  amount;
              }

            }
          );


          /*
           * ==================================================
           * KHATA
           *
           * Current-user only.
           * ==================================================
           */

          const ledger =
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
           * ==================================================
           * INVENTORY
           *
           * Current-user only.
           * ==================================================
           */

          const inventory =
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


          let invested =
            0;


          let expected =
            0;


          let stockCount =
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


              stockCount +=
                quantity;

            }
          );


          /*
           * ==================================================
           * UPDATE STATE
           * ==================================================
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


          setTotalStockItems(
            stockCount
          );


        } catch (
          error
        ) {

          console.error(
            'Analytics Error:',
            error
          );


        } finally {

          setLoading(
            false
          );


          setRefreshing(
            false
          );
        }

      },
      []
    );


  /* ==========================================================
   * INITIAL LOAD
   * ========================================================== */

  useEffect(() => {

    fetchAnalytics();

  }, [
    fetchAnalytics,
  ]);


  /* ==========================================================
   * REFRESH
   * ========================================================== */

  const handleRefresh =
    () => {

      fetchAnalytics(
        true
      );

    };


  /* ==========================================================
   * DERIVED VALUES
   * ========================================================== */

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


  const profitMargin =
    expectedStockRevenue >
    0

      ? (
          estimatedProfit /
          expectedStockRevenue
        ) *
        100

      : 0;


  const monthVsAllTime =
    allTimeSales >
    0

      ? (
          thisMonthSales /
          allTimeSales
        ) *
        100

      : 0;


  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (
    loading
  ) {

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

        <View
          style={
            styles.loadingLogo
          }
        >

          <Text
            style={
              styles.loadingLogoText
            }
          >
            C
          </Text>

        </View>


        <ActivityIndicator
          size="small"
          color={
            COLORS.green
          }
        />


        <Text
          style={
            styles.loadingText
          }
        >
          Preparing your shop summary...
        </Text>

      </View>

    );
  }


  /* ==========================================================
   * MAIN SCREEN
   * ========================================================== */

  return (

    <View
      style={[
        styles.container,

        {
          paddingTop:
            Math.max(
              insets.top,
              10
            ),

          paddingBottom:
            Math.max(
              insets.bottom,
              8
            ),

          paddingHorizontal:
            horizontalPadding,
        },
      ]}
    >

      {/* =====================================================
          HEADER
          ===================================================== */}

      <View
        style={
          styles.headerRow
        }
      >

        <View
          style={
            styles.headerLeft
          }
        >

          <View
            style={
              styles.headerMark
            }
          >

            <Text
              style={
                styles.headerMarkText
              }
            >
              C
            </Text>

          </View>


          <View
            style={
              styles.headerTextWrap
            }
          >

            <Text
              style={
                styles.eyebrow
              }
            >
              COUNTR · BUSINESS
            </Text>


            <Text
              style={
                styles.header
              }
              numberOfLines={
                1
              }
            >
              Analytics
            </Text>

          </View>

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


      {/* =====================================================
          SCROLL CONTENT
          ===================================================== */}

      <ScrollView

        showsVerticalScrollIndicator={
          false
        }

        keyboardShouldPersistTaps="handled"

        refreshControl={

          <RefreshControl

            refreshing={
              refreshing
            }

            onRefresh={
              handleRefresh
            }

            tintColor={
              COLORS.green
            }

            colors={[
              COLORS.green,
            ]}

          />

        }

        contentContainerStyle={
          styles.scrollContent
        }
      >


        {/* ==================================================
            BUSINESS SNAPSHOT
            ================================================== */}

        <View
          style={
            styles.snapshotCard
          }
        >

          <View
            style={
              styles.snapshotTop
            }
          >

            <View
              style={
                styles.snapshotText
              }
            >

              <Text
                style={
                  styles.snapshotEyebrow
                }
              >
                BUSINESS SNAPSHOT
              </Text>


              <Text
                style={
                  styles.snapshotTitle
                }
              >
                Mera Vyapar
              </Text>


              <Text
                style={
                  styles.snapshotSubtitle
                }
              >
                Your numbers at a glance
              </Text>

            </View>


            <View
              style={
                styles.snapshotIcon
              }
            >

              <Text
                style={
                  styles.snapshotIconText
                }
              >
                ₹
              </Text>

            </View>

          </View>


          <View
            style={
              styles.snapshotDivider
            }
          />


          <View
            style={
              styles.snapshotBottom
            }
          >

            <View>

              <Text
                style={
                  styles.snapshotSmallLabel
                }
              >
                THIS MONTH
              </Text>


              <Text
                style={
                  styles.snapshotValue
                }
              >
                {formatCompactMoney(
                  thisMonthSales
                )}
              </Text>

            </View>


            <View
              style={
                styles.snapshotRight
              }
            >

              <Text
                style={
                  styles.snapshotSmallLabel
                }
              >
                PENDING BAKI
              </Text>


              <Text
                style={
                  styles.snapshotPending
                }
              >
                {formatCompactMoney(
                  netPending
                )}
              </Text>

            </View>

          </View>

        </View>


        {/* ==================================================
            SALES
            ================================================== */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Sales & Revenue
        </Text>


        <View
          style={
            styles.twoColumn
          }
        >

          {/* THIS MONTH */}

          <View
            style={[
              styles.metricCard,
              styles.metricCardGreen,
            ]}
          >

            <View
              style={
                styles.cardIcon
              }
            >

              <Text
                style={
                  styles.cardIconText
                }
              >
                ↑
              </Text>

            </View>


            <Text
              style={
                styles.metricLabel
              }
            >
              {getMonthName()} sales
            </Text>


            <Text
              style={
                styles.metricValue
              }
              numberOfLines={
                1
              }
              adjustsFontSizeToFit
              minimumFontScale={
                0.65
              }
            >
              {formatCompactMoney(
                thisMonthSales
              )}
            </Text>


            <Text
              style={
                styles.metricHint
              }
            >
              {monthVsAllTime > 0
                ? `${monthVsAllTime.toFixed(
                    0
                  )}% of all-time sales`
                : 'No sales recorded yet'}
            </Text>

          </View>


          {/* ALL TIME */}

          <View
            style={
              styles.metricCard
            }
          >

            <View
              style={
                styles.cardIcon
              }
            >

              <Text
                style={
                  styles.cardIconTextDark
                }
              >
                ₹
              </Text>

            </View>


            <Text
              style={
                styles.metricLabel
              }
            >
              All-time sales
            </Text>


            <Text
              style={
                styles.metricValueDark
              }
              numberOfLines={
                1
              }
              adjustsFontSizeToFit
              minimumFontScale={
                0.65
              }
            >
              {formatCompactMoney(
                allTimeSales
              )}
            </Text>


            <Text
              style={
                styles.metricHint
              }
            >
              Total recorded sales
            </Text>

          </View>

        </View>


        {/* ==================================================
            KHATA
            ================================================== */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Khata
        </Text>


        <View
          style={
            styles.khataCard
          }
        >

          <View
            style={
              styles.khataHeader
            }
          >

            <View>

              <Text
                style={
                  styles.khataTitle
                }
              >
                Customer money
              </Text>


              <Text
                style={
                  styles.khataSubtitle
                }
              >
                Udhaar and payments recorded
              </Text>

            </View>


            <View
              style={
                styles.khataBook
              }
            >

              <Text
                style={
                  styles.khataBookText
                }
              >
                K
              </Text>

            </View>

          </View>


          <View
            style={
              styles.khataMetrics
            }
          >

            {/* UDHAR */}

            <View
              style={
                styles.khataMetric
              }
            >

              <Text
                style={
                  styles.khataMetricLabel
                }
              >
                UDHAR GIVEN
              </Text>


              <Text
                style={
                  styles.khataCredit
                }
              >
                {formatCompactMoney(
                  totalUdhaar
                )}
              </Text>

            </View>


            <View
              style={
                styles.verticalDivider
              }
            />


            {/* PAYMENT */}

            <View
              style={
                styles.khataMetric
              }
            >

              <Text
                style={
                  styles.khataMetricLabel
                }
              >
                PAYMENT RECEIVED
              </Text>


              <Text
                style={
                  styles.khataPayment
                }
              >
                {formatCompactMoney(
                  totalPayments
                )}
              </Text>

            </View>

          </View>


          <View
            style={
              styles.bakiBox
            }
          >

            <View
              style={
                styles.bakiIcon
              }
            >

              <Text
                style={
                  styles.bakiIconText
                }
              >
                !
              </Text>

            </View>


            <View
              style={
                styles.bakiInfo
              }
            >

              <Text
                style={
                  styles.bakiLabel
                }
              >
                NET BAKI TO COLLECT
              </Text>


              <Text
                style={
                  styles.bakiDescription
                }
              >
                Money currently pending from customers
              </Text>

            </View>


            <Text
              style={
                styles.bakiValue
              }
            >
              {formatCompactMoney(
                netPending
              )}
            </Text>

          </View>

        </View>


        {/* ==================================================
            INVENTORY
            ================================================== */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Stock & Profit
        </Text>


        <View
          style={
            styles.stockCard
          }
        >

          <View
            style={
              styles.stockHeader
            }
          >

            <View>

              <Text
                style={
                  styles.stockTitle
                }
              >
                Your current stock
              </Text>


              <Text
                style={
                  styles.stockSubtitle
                }
              >
                If everything sells at your current selling price
              </Text>

            </View>


            <View
              style={
                styles.stockIcon
              }
            >

              <Text
                style={
                  styles.stockIconText
                }
              >
                📦
              </Text>

            </View>

          </View>


          {/* COST / REVENUE */}

          <View
            style={
              styles.stockMetrics
            }
          >

            <View
              style={
                styles.stockMetric
              }
            >

              <Text
                style={
                  styles.stockMetricLabel
                }
              >
                STOCK COST
              </Text>


              <Text
                style={
                  styles.stockCost
                }
              >
                {formatCompactMoney(
                  stockInvestment
                )}
              </Text>


              <Text
                style={
                  styles.stockMetricHint
                }
              >
                Money invested
              </Text>

            </View>


            <View
              style={
                styles.verticalDivider
              }
            />


            <View
              style={
                styles.stockMetric
              }
            >

              <Text
                style={
                  styles.stockMetricLabel
                }
              >
                EXPECTED SALES
              </Text>


              <Text
                style={
                  styles.stockRevenue
                }
              >
                {formatCompactMoney(
                  expectedStockRevenue
                )}
              </Text>


              <Text
                style={
                  styles.stockMetricHint
                }
              >
                If all stock sells
              </Text>

            </View>

          </View>


          {/* PROFIT */}

          <View
            style={
              styles.profitBox
            }
          >

            <View
              style={
                styles.profitLeft
              }
            >

              <View
                style={
                  styles.profitIcon
                }
              >

                <Text
                  style={
                    styles.profitIconText
                  }
                >
                  ↗
                </Text>

              </View>


              <View
                style={
                  styles.profitInfo
                }
              >

                <Text
                  style={
                    styles.profitLabel
                  }
                >
                  ESTIMATED STOCK PROFIT
                </Text>


                <Text
                  style={
                    styles.profitHint
                  }
                >
                  Current inventory only
                </Text>

              </View>

            </View>


            <View
              style={
                styles.profitRight
              }
            >

              <Text
                style={
                  styles.profitValue
                }
              >
                {formatCompactMoney(
                  estimatedProfit
                )}
              </Text>


              <Text
                style={
                  styles.profitMargin
                }
              >
                {profitMargin.toFixed(
                  1
                )}% margin
              </Text>

            </View>

          </View>


          {/* STOCK COUNT */}

          <View
            style={
              styles.stockCountRow
            }
          >

            <Text
              style={
                styles.stockCountLabel
              }
            >
              Units currently in stock
            </Text>


            <Text
              style={
                styles.stockCountValue
              }
            >
              {totalStockItems.toLocaleString(
                'en-IN'
              )}
            </Text>

          </View>

        </View>


        {/* ==================================================
            SIMPLE BUSINESS HEALTH
            ================================================== */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Quick view
        </Text>


        <View
          style={
            styles.quickCard
          }
        >

          <View
            style={
              styles.quickRow
            }
          >

            <View
              style={
                styles.quickIconGreen
              }
            >

              <Text
                style={
                  styles.quickIconText
                }
              >
                ₹
              </Text>

            </View>


            <View
              style={
                styles.quickInfo
              }
            >

              <Text
                style={
                  styles.quickTitle
                }
              >
                Sales recorded
              </Text>


              <Text
                style={
                  styles.quickDescription
                }
              >
                {allTimeSales > 0
                  ? 'Your shop has recorded sales.'
                  : 'Start recording sales to see your business grow.'}
              </Text>

            </View>


            <Text
              style={
                styles.quickValue
              }
            >
              {formatCompactMoney(
                allTimeSales
              )}
            </Text>

          </View>


          <View
            style={
              styles.quickDivider
            }
          />


          <View
            style={
              styles.quickRow
            }
          >

            <View
              style={
                styles.quickIconOrange
              }
            >

              <Text
                style={
                  styles.quickIconTextOrange
                }
              >
                !
              </Text>

            </View>


            <View
              style={
                styles.quickInfo
              }
            >

              <Text
                style={
                  styles.quickTitle
                }
              >
                Customer baki
              </Text>


              <Text
                style={
                  styles.quickDescription
                }
              >
                {netPending > 0
                  ? 'Money is waiting to be collected.'
                  : 'No pending customer balance.'}
              </Text>

            </View>


            <Text
              style={
                styles.quickValueOrange
              }
            >
              {formatCompactMoney(
                netPending
              )}
            </Text>

          </View>


          <View
            style={
              styles.quickDivider
            }
          />


          <View
            style={
              styles.quickRow
            }
          >

            <View
              style={
                styles.quickIconBlue
              }
            >

              <Text
                style={
                  styles.quickIconTextBlue
                }
              >
                %
              </Text>

            </View>


            <View
              style={
                styles.quickInfo
              }
            >

              <Text
                style={
                  styles.quickTitle
                }
              >
                Stock margin
              </Text>


              <Text
                style={
                  styles.quickDescription
                }
              >
                Estimated margin on current stock.
              </Text>

            </View>


            <Text
              style={
                styles.quickValueBlue
              }
            >
              {profitMargin.toFixed(
                1
              )}%
            </Text>

          </View>

        </View>


        {/* ==================================================
            FOOTER NOTE
            ================================================== */}

        <View
          style={
            styles.footerNote
          }
        >

          <View
            style={
              styles.footerDot
            }
          />


          <Text
            style={
              styles.footerText
            }
          >
            Countr calculates these numbers from your recorded sales, Khata and inventory.
          </Text>

        </View>


      </ScrollView>

    </View>
  );
};


/* ============================================================
 * STYLES
 * ============================================================ */

const styles =
  StyleSheet.create({

    /* ========================================================
       ROOT
       ======================================================== */

    container: {
      flex: 1,

      backgroundColor:
        COLORS.background,
    },


    /* ========================================================
       LOADING
       ======================================================== */

    loadingContainer: {
      flex: 1,

      alignItems:
        'center',

      justifyContent:
        'center',

      backgroundColor:
        COLORS.background,
    },


    loadingLogo: {
      width: 52,

      height: 52,

      borderRadius: 17,

      backgroundColor:
        COLORS.ink,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 14,
    },


    loadingLogoText: {
      color:
        '#DFFFAD',

      fontSize: 23,

      fontWeight:
        '900',
    },


    loadingText: {
      color:
        COLORS.muted,

      fontSize: 8,

      fontWeight:
        '600',

      marginTop: 10,
    },


    /* ========================================================
       HEADER
       ======================================================== */

    headerRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      marginTop: 5,

      marginBottom: 17,
    },


    headerLeft: {
      flexDirection:
        'row',

      alignItems:
        'center',

      flex: 1,

      minWidth: 0,
    },


    headerMark: {
      width: 40,

      height: 40,

      borderRadius: 13,

      backgroundColor:
        COLORS.ink,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 10,
    },


    headerMarkText: {
      color:
        '#DFFFAD',

      fontSize: 17,

      fontWeight:
        '900',
    },


    headerTextWrap: {
      flex: 1,

      minWidth: 0,
    },


    eyebrow: {
      color:
        COLORS.green,

      fontSize: 6.5,

      fontWeight:
        '900',

      letterSpacing:
        1.2,

      marginBottom: 2,
    },


    header: {
      color:
        COLORS.ink,

      fontSize: 22,

      fontWeight:
        '900',

      letterSpacing:
        -0.6,
    },


    closeBtn: {
      paddingVertical: 9,

      paddingHorizontal: 13,

      backgroundColor:
        COLORS.surface,

      borderRadius: 10,

      borderWidth: 1,

      borderColor:
        COLORS.border,
    },


    closeBtnText: {
      color:
        COLORS.muted,

      fontSize: 8,

      fontWeight:
        '800',
    },


    /* ========================================================
       SCROLL
       ======================================================== */

    scrollContent: {
      paddingBottom: 45,
    },


    /* ========================================================
       SNAPSHOT
       ======================================================== */

    snapshotCard: {
      backgroundColor:
        COLORS.ink,

      borderRadius: 20,

      padding: 16,

      marginBottom: 20,
    },


    snapshotTop: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',
    },


    snapshotText: {
      flex: 1,
    },


    snapshotEyebrow: {
      color:
        '#8F9B90',

      fontSize: 6.5,

      fontWeight:
        '900',

      letterSpacing:
        1.1,

      marginBottom: 3,
    },


    snapshotTitle: {
      color:
        COLORS.white,

      fontSize: 19,

      fontWeight:
        '900',

      letterSpacing:
        -0.5,
    },


    snapshotSubtitle: {
      color:
        '#9BA69C',

      fontSize: 8,

      fontWeight:
        '600',

      marginTop: 2,
    },


    snapshotIcon: {
      width: 44,

      height: 44,

      borderRadius: 14,

      backgroundColor:
        '#29352B',

      alignItems:
        'center',

      justifyContent:
        'center',
    },


    snapshotIconText: {
      color:
        '#DFFFAD',

      fontSize: 18,

      fontWeight:
        '900',
    },


    snapshotDivider: {
      height: 1,

      backgroundColor:
        '#303B32',

      marginVertical: 14,
    },


    snapshotBottom: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'flex-end',
    },


    snapshotSmallLabel: {
      color:
        '#7F8C81',

      fontSize: 6,

      fontWeight:
        '900',

      letterSpacing:
        0.9,

      marginBottom: 3,
    },


    snapshotValue: {
      color:
        '#DFFFAD',

      fontSize: 19,

      fontWeight:
        '900',
    },


    snapshotRight: {
      alignItems:
        'flex-end',
    },


    snapshotPending: {
      color:
        '#FFB0A9',

      fontSize: 19,

      fontWeight:
        '900',
    },


    /* ========================================================
       SECTION
       ======================================================== */

    sectionTitle: {
      color:
        COLORS.ink,

      fontSize: 12,

      fontWeight:
        '900',

      marginBottom: 9,

      marginTop: 1,

      letterSpacing:
        -0.2,
    },


    /* ========================================================
       TWO COLUMN METRICS
       ======================================================== */

    twoColumn: {
      flexDirection:
        'row',

      gap: 9,

      marginBottom: 18,
    },


    metricCard: {
      flex: 1,

      minWidth: 0,

      backgroundColor:
        COLORS.surface,

      borderRadius: 16,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      padding: 13,

      minHeight: 142,
    },


    metricCardGreen: {
      backgroundColor:
        COLORS.greenSoft,

      borderColor:
        '#D4E5C8',
    },


    cardIcon: {
      width: 30,

      height: 30,

      borderRadius: 10,

      backgroundColor:
        COLORS.white,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 10,
    },


    cardIconText: {
      color:
        COLORS.green,

      fontSize: 14,

      fontWeight:
        '900',
    },


    cardIconTextDark: {
      color:
        COLORS.ink,

      fontSize: 12,

      fontWeight:
        '900',
    },


    metricLabel: {
      color:
        COLORS.muted,

      fontSize: 7.5,

      fontWeight:
        '700',

      marginBottom: 4,
    },


    metricValue: {
      color:
        COLORS.greenDark,

      fontSize: 20,

      fontWeight:
        '900',

      letterSpacing:
        -0.5,
    },


    metricValueDark: {
      color:
        COLORS.ink,

      fontSize: 20,

      fontWeight:
        '900',

      letterSpacing:
        -0.5,
    },


    metricHint: {
      color:
        COLORS.mutedLight,

      fontSize: 6.5,

      fontWeight:
        '600',

      marginTop: 5,
    },


    /* ========================================================
       KHATA
       ======================================================== */

    khataCard: {
      backgroundColor:
        COLORS.surface,

      borderRadius: 18,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      padding: 14,

      marginBottom: 19,
    },


    khataHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      marginBottom: 15,
    },


    khataTitle: {
      color:
        COLORS.ink,

      fontSize: 11,

      fontWeight:
        '900',
    },


    khataSubtitle: {
      color:
        COLORS.muted,

      fontSize: 7,

      fontWeight:
        '600',

      marginTop: 2,
    },


    khataBook: {
      width: 34,

      height: 34,

      borderRadius: 11,

      backgroundColor:
        COLORS.greenSoft,

      alignItems:
        'center',

      justifyContent:
        'center',
    },


    khataBookText: {
      color:
        COLORS.green,

      fontSize: 14,

      fontWeight:
        '900',
    },


    khataMetrics: {
      flexDirection:
        'row',

      alignItems:
        'stretch',

      marginBottom: 14,
    },


    khataMetric: {
      flex: 1,

      minWidth: 0,
    },


    khataMetricLabel: {
      color:
        COLORS.muted,

      fontSize: 6.5,

      fontWeight:
        '900',

      letterSpacing:
        0.6,

      marginBottom: 4,
    },


    khataCredit: {
      color:
        COLORS.red,

      fontSize: 17,

      fontWeight:
        '900',
    },


    khataPayment: {
      color:
        COLORS.green,

      fontSize: 17,

      fontWeight:
        '900',
    },


    verticalDivider: {
      width: 1,

      backgroundColor:
        COLORS.borderSoft,

      marginHorizontal: 10,
    },


    bakiBox: {
      flexDirection:
        'row',

      alignItems:
        'center',

      backgroundColor:
        COLORS.redSoft,

      borderRadius: 13,

      padding: 10,
    },


    bakiIcon: {
      width: 30,

      height: 30,

      borderRadius: 10,

      backgroundColor:
        '#F9DAD6',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 8,
    },


    bakiIconText: {
      color:
        COLORS.red,

      fontSize: 12,

      fontWeight:
        '900',
    },


    bakiInfo: {
      flex: 1,

      minWidth: 0,
    },


    bakiLabel: {
      color:
        '#9A514B',

      fontSize: 6.5,

      fontWeight:
        '900',

      letterSpacing:
        0.7,
    },


    bakiDescription: {
      color:
        '#AF7772',

      fontSize: 6.5,

      fontWeight:
        '600',

      marginTop: 2,
    },


    bakiValue: {
      color:
        COLORS.red,

      fontSize: 15,

      fontWeight:
        '900',

      marginLeft: 7,
    },


    /* ========================================================
       STOCK
       ======================================================== */

    stockCard: {
      backgroundColor:
        COLORS.surface,

      borderRadius: 18,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      padding: 14,

      marginBottom: 19,
    },


    stockHeader: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',

      marginBottom: 15,
    },


    stockTitle: {
      color:
        COLORS.ink,

      fontSize: 11,

      fontWeight:
        '900',
    },


    stockSubtitle: {
      color:
        COLORS.muted,

      fontSize: 7,

      lineHeight: 10,

      maxWidth: 240,

      marginTop: 2,
    },


    stockIcon: {
      width: 36,

      height: 36,

      borderRadius: 11,

      backgroundColor:
        COLORS.orangeSoft,

      alignItems:
        'center',

      justifyContent:
        'center',
    },


    stockIconText: {
      fontSize: 15,
    },


    stockMetrics: {
      flexDirection:
        'row',

      marginBottom: 14,
    },


    stockMetric: {
      flex: 1,

      minWidth: 0,
    },


    stockMetricLabel: {
      color:
        COLORS.muted,

      fontSize: 6.5,

      fontWeight:
        '900',

      letterSpacing:
        0.7,

      marginBottom: 4,
    },


    stockCost: {
      color:
        COLORS.ink,

      fontSize: 17,

      fontWeight:
        '900',
    },


    stockRevenue: {
      color:
        COLORS.green,

      fontSize: 17,

      fontWeight:
        '900',
    },


    stockMetricHint: {
      color:
        COLORS.mutedLight,

      fontSize: 6.5,

      fontWeight:
        '600',

      marginTop: 2,
    },


    profitBox: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      backgroundColor:
        COLORS.greenSoft,

      borderRadius: 14,

      padding: 11,

      marginBottom: 10,
    },


    profitLeft: {
      flexDirection:
        'row',

      alignItems:
        'center',

      flex: 1,

      minWidth: 0,
    },


    profitIcon: {
      width: 34,

      height: 34,

      borderRadius: 11,

      backgroundColor:
        COLORS.white,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 8,
    },


    profitIconText: {
      color:
        COLORS.green,

      fontSize: 16,

      fontWeight:
        '900',
    },


    profitInfo: {
      flex: 1,

      minWidth: 0,
    },


    profitLabel: {
      color:
        COLORS.greenDark,

      fontSize: 6.5,

      fontWeight:
        '900',

      letterSpacing:
        0.6,
    },


    profitHint: {
      color:
        '#7A936A',

      fontSize: 6.5,

      marginTop: 2,
    },


    profitRight: {
      alignItems:
        'flex-end',

      marginLeft: 8,
    },


    profitValue: {
      color:
        COLORS.greenDark,

      fontSize: 16,

      fontWeight:
        '900',
    },


    profitMargin: {
      color:
        COLORS.green,

      fontSize: 6.5,

      fontWeight:
        '800',

      marginTop: 2,
    },


    stockCountRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      paddingTop: 3,
    },


    stockCountLabel: {
      color:
        COLORS.muted,

      fontSize: 7.5,

      fontWeight:
        '600',
    },


    stockCountValue: {
      color:
        COLORS.ink,

      fontSize: 10,

      fontWeight:
        '900',
    },


    /* ========================================================
       QUICK VIEW
       ======================================================== */

    quickCard: {
      backgroundColor:
        COLORS.surface,

      borderRadius: 18,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      paddingHorizontal: 13,

      paddingVertical: 4,

      marginBottom: 18,
    },


    quickRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      paddingVertical: 12,
    },


    quickIconGreen: {
      width: 34,

      height: 34,

      borderRadius: 11,

      backgroundColor:
        COLORS.greenSoft,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 9,
    },


    quickIconOrange: {
      width: 34,

      height: 34,

      borderRadius: 11,

      backgroundColor:
        COLORS.orangeSoft,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 9,
    },


    quickIconBlue: {
      width: 34,

      height: 34,

      borderRadius: 11,

      backgroundColor:
        COLORS.blueSoft,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 9,
    },


    quickIconText: {
      color:
        COLORS.green,

      fontSize: 13,

      fontWeight:
        '900',
    },


    quickIconTextOrange: {
      color:
        COLORS.orange,

      fontSize: 13,

      fontWeight:
        '900',
    },


    quickIconTextBlue: {
      color:
        COLORS.blue,

      fontSize: 13,

      fontWeight:
        '900',
    },


    quickInfo: {
      flex: 1,

      minWidth: 0,
    },


    quickTitle: {
      color:
        COLORS.ink,

      fontSize: 9,

      fontWeight:
        '900',
    },


    quickDescription: {
      color:
        COLORS.muted,

      fontSize: 6.5,

      lineHeight: 10,

      marginTop: 2,
    },


    quickValue: {
      color:
        COLORS.greenDark,

      fontSize: 11,

      fontWeight:
        '900',

      marginLeft: 8,
    },


    quickValueOrange: {
      color:
        COLORS.orange,

      fontSize: 11,

      fontWeight:
        '900',

      marginLeft: 8,
    },


    quickValueBlue: {
      color:
        COLORS.blue,

      fontSize: 11,

      fontWeight:
        '900',

      marginLeft: 8,
    },


    quickDivider: {
      height: 1,

      backgroundColor:
        COLORS.borderSoft,
    },


    /* ========================================================
       FOOTER NOTE
       ======================================================== */

    footerNote: {
      flexDirection:
        'row',

      alignItems:
        'flex-start',

      paddingHorizontal: 3,

      marginTop: 1,
    },


    footerDot: {
      width: 5,

      height: 5,

      borderRadius: 5,

      backgroundColor:
        COLORS.green,

      marginTop: 3,

      marginRight: 6,
    },


    footerText: {
      flex: 1,

      color:
        COLORS.mutedLight,

      fontSize: 6.5,

      lineHeight: 10,

      fontWeight:
        '600',
    },

  });


export default AnalyticsScreen;