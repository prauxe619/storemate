import React, {
  useState,
  useEffect,
  useMemo,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Linking,
  Alert,
  useWindowDimensions,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  BASE_URL,
} from '../config/api';


const AdminDashboard = ({
  onClose,
}) => {

  /*
   * =========================================================
   * SAFE AREA
   * =========================================================
   *
   * Dynamically handles:
   *
   * - Status bar
   * - Notches
   * - Punch-hole displays
   * - Android 3-button navigation
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
   * Small phones:
   *   <360 = 14
   *
   * Normal phones:
   *   360-599 = 20
   *
   * Large phones/tablets:
   *   600+ = 28
   */

  const horizontalPadding =
    windowWidth < 360
      ? 14
      : windowWidth < 600
      ? 20
      : 28;


  /*
   * Smaller gap on very narrow
   * phones.
   */

  const metricsGap =
    windowWidth < 360
      ? 8
      : 10;


  /*
   * =========================================================
   * STATE
   * =========================================================
   */

  const [
    users,
    setUsers,
  ] = useState([]);

  const [
    totalShops,
    setTotalShops,
  ] = useState(0);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState(null);

  const [
    searchQuery,
    setSearchQuery,
  ] = useState('');

  const [
    sortMode,
    setSortMode,
  ] = useState('newest');


  /*
   * =========================================================
   * INITIAL LOAD
   * =========================================================
   */

  useEffect(() => {

    fetchAdminData();

  }, []);


  /*
   * =========================================================
   * FETCH ADMIN DATA
   * =========================================================
   */

  const fetchAdminData =
    async () => {

      try {

        setError(null);


        const token =
          await AsyncStorage.getItem(
            'userToken'
          );


        /*
         * No token:
         * fail clearly instead of
         * sending "Bearer null".
         */

        if (!token) {

          setError(
            'Admin session expired. Please log in again.'
          );

          return;
        }


        const response =
          await fetch(
            `${BASE_URL}/api/v1/admin/users`,
            {
              method:
                'GET',

              headers: {
                'Content-Type':
                  'application/json',

                'Authorization':
                  `Bearer ${token}`,
              },
            }
          );


        /*
         * The server may return a
         * non-JSON response on certain
         * failures, so parse defensively.
         */

        let data = {};

        try {

          data =
            await response.json();

        } catch (
          parseError
        ) {

          data = {};
        }


        if (
          response.ok
        ) {

          setUsers(
            Array.isArray(
              data.users
            )
              ? data.users
              : []
          );


          setTotalShops(
            Number(
              data.total_shops
            ) || 0
          );

        } else {

          setError(
            data.error ||
              'Failed to load admin data'
          );
        }

      } catch (
        err
      ) {

        console.error(
          'Admin dashboard error:',
          err
        );


        setError(
          'Network error. Is the server running?'
        );

      } finally {

        setIsLoading(
          false
        );

        setIsRefreshing(
          false
        );
      }
    };


  /*
   * =========================================================
   * PULL TO REFRESH
   * =========================================================
   */

  const onRefresh =
    () => {

      setIsRefreshing(
        true
      );

      fetchAdminData();
    };


  /*
   * =========================================================
   * PHONE COMPLETION
   * =========================================================
   */

  const usersWithPhone =
    users.filter(
      user =>
        Boolean(
          String(
            user.phone ||
              ''
          ).trim()
        )
    ).length;


  const phoneCompletionPct =
    users.length > 0
      ? Math.round(
          (
            usersWithPhone /
            users.length
          ) * 100
        )
      : 0;


  /*
   * =========================================================
   * SEARCH + SORT
   * =========================================================
   */

  const visibleUsers =
    useMemo(() => {

      let list =
        [...users];


      /*
       * SEARCH
       */

      if (
        searchQuery.trim()
      ) {

        const q =
          searchQuery
            .trim()
            .toLowerCase();


        list =
          list.filter(
            user => {

              const shopName =
                String(
                  user.shop_name ||
                    ''
                ).toLowerCase();


              const email =
                String(
                  user.email ||
                    ''
                ).toLowerCase();


              const phone =
                String(
                  user.phone ||
                    ''
                );


              return (
                shopName.includes(q) ||
                email.includes(q) ||
                phone.includes(q)
              );
            }
          );
      }


      /*
       * SORT
       */

      if (
        sortMode ===
        'name'
      ) {

        list.sort(
          (
            a,
            b
          ) =>
            String(
              a.shop_name ||
                ''
            ).localeCompare(
              String(
                b.shop_name ||
                  ''
              )
            )
        );

      } else if (
        sortMode ===
        'oldest'
      ) {

        list.sort(
          (
            a,
            b
          ) =>
            Number(
              a.id
            ) -
            Number(
              b.id
            )
        );

      } else {

        /*
         * Newest first.
         */

        list.sort(
          (
            a,
            b
          ) =>
            Number(
              b.id
            ) -
            Number(
              a.id
            )
        );
      }


      return list;

    }, [
      users,
      searchQuery,
      sortMode,
    ]);


  /*
   * =========================================================
   * EMAIL
   * =========================================================
   */

  const handleEmailPress =
    email => {

      if (!email) {
        return;
      }


      Linking
        .openURL(
          `mailto:${email}`
        )
        .catch(
          () =>
            Alert.alert(
              'Error',
              'Could not open mail app.'
            )
        );
    };


  /*
   * =========================================================
   * PHONE
   * =========================================================
   */

  const handlePhonePress =
    phone => {

      if (!phone) {
        return;
      }


      Linking
        .openURL(
          `tel:${phone}`
        )
        .catch(
          () =>
            Alert.alert(
              'Error',
              'Could not open dialer.'
            )
        );
    };


  /*
   * =========================================================
   * USER CARD
   * =========================================================
   */

  const renderUserCard =
    ({
      item,
    }) => {

      const shopName =
        String(
          item.shop_name ||
            'Unnamed Shop'
        ).trim();


      const avatarLetter =
        shopName
          .charAt(0)
          .toUpperCase() ||
        '?';


      return (

        <View
          style={
            styles.userCard
          }
        >

          {/* =============================================
              USER HEADER
              ============================================= */}

          <View
            style={
              styles.userCardHeader
            }
          >

            <View
              style={
                styles.shopAvatar
              }
            >

              <Text
                style={
                  styles.shopAvatarText
                }
              >
                {avatarLetter}
              </Text>

            </View>


            <View
              style={
                styles.shopHeaderText
              }
            >

              <Text
                style={
                  styles.shopName
                }

                numberOfLines={
                  2
                }
              >
                {shopName}
              </Text>


              <Text
                style={
                  styles.userId
                }
              >
                #
                {item.id}
              </Text>

            </View>

          </View>


          {/* =============================================
              EMAIL
              ============================================= */}

          {item.email ? (

            <TouchableOpacity
              onPress={() =>
                handleEmailPress(
                  item.email
                )
              }

              activeOpacity={
                0.6
              }

              style={
                styles.detailButton
              }
            >

              <Text
                style={
                  styles.userDetail
                }

                numberOfLines={
                  2
                }
              >
                ✉️ {item.email}
              </Text>

            </TouchableOpacity>

          ) : (

            <Text
              style={
                styles.userDetailMissing
              }
            >
              ✉️ No email on file
            </Text>

          )}


          {/* =============================================
              PHONE
              ============================================= */}

          {item.phone ? (

            <TouchableOpacity
              onPress={() =>
                handlePhonePress(
                  item.phone
                )
              }

              activeOpacity={
                0.6
              }

              style={
                styles.detailButton
              }
            >

              <Text
                style={
                  styles.userDetail
                }

                numberOfLines={
                  1
                }
              >
                📞 {item.phone}
              </Text>

            </TouchableOpacity>

          ) : (

            <Text
              style={
                styles.userDetailMissing
              }
            >
              📞 No phone on file
            </Text>

          )}

        </View>
      );
    };


  /*
   * =========================================================
   * LOADING SCREEN
   * =========================================================
   */

  if (
    isLoading
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

            paddingHorizontal:
              horizontalPadding,
          },
        ]}
      >

        <ActivityIndicator
          size="large"
          color="#B7791F"
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
           * Status bar / notch.
           */
          paddingTop:
            Math.max(
              insets.top,
              16
            ),

          /*
           * Android navigation /
           * gesture area.
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

        <Text
          style={
            styles.header
          }

          numberOfLines={
            1
          }

          adjustsFontSizeToFit

          minimumFontScale={
            0.75
          }
        >
          👑 Super Admin
        </Text>


        {onClose && (

          <TouchableOpacity
            style={
              styles.closeBtn
            }

            onPress={
              onClose
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
              Close
            </Text>

          </TouchableOpacity>

        )}

      </View>


      {/* ===================================================
          ERROR
          =================================================== */}

      {error ? (

        <View
          style={
            styles.errorBox
          }
        >

          <Text
            style={
              styles.errorText
            }
          >
            {error}
          </Text>


          <TouchableOpacity
            style={
              styles.retryBtn
            }

            onPress={
              fetchAdminData
            }

            activeOpacity={
              0.85
            }
          >

            <Text
              style={
                styles.retryBtnText
              }
            >
              Try Again
            </Text>

          </TouchableOpacity>

        </View>

      ) : (

        <>
          {/* ===============================================
              METRICS
              =============================================== */}

          <View
            style={[
              styles.metricsRow,

              {
                gap:
                  metricsGap,
              },
            ]}
          >

            {/* TOTAL SHOPS */}

            <View
              style={
                styles.metricsCard
              }
            >

              <Text
                style={
                  styles.metricsTitle
                }
              >
                TOTAL SHOPS
              </Text>


              <Text
                style={
                  styles.metricsValue
                }

                numberOfLines={
                  1
                }

                adjustsFontSizeToFit

                minimumFontScale={
                  0.7
                }
              >
                {totalShops}
              </Text>

            </View>


            {/* PHONE COMPLETION */}

            <View
              style={
                styles.metricsCard
              }
            >

              <Text
                style={
                  styles.metricsTitle
                }
              >
                HAVE A PHONE
              </Text>


              <Text
                style={[
                  styles.metricsValue,

                  {
                    color:
                      phoneCompletionPct <
                      50
                        ? '#E0433B'
                        : '#0C9C4C',
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
                {phoneCompletionPct}%
              </Text>

            </View>

          </View>


          {/* ===============================================
              SEARCH
              =============================================== */}

          <TextInput

            style={
              styles.searchInput
            }

            placeholder="Search by shop, email or phone"

            placeholderTextColor="#9CA3AF"

            value={
              searchQuery
            }

            onChangeText={
              setSearchQuery
            }

            autoCapitalize="none"

            autoCorrect={
              false
            }

            returnKeyType="search"

            clearButtonMode="while-editing"

          />


          {/* ===============================================
              SORT
              =============================================== */}

          <View
            style={
              styles.sortRow
            }
          >

            {[
              {
                key:
                  'newest',

                label:
                  'Newest',
              },

              {
                key:
                  'oldest',

                label:
                  'Oldest',
              },

              {
                key:
                  'name',

                label:
                  'A–Z',
              },

            ].map(
              option => (

                <TouchableOpacity

                  key={
                    option.key
                  }

                  style={[
                    styles.sortChip,

                    sortMode ===
                      option.key &&
                      styles.sortChipActive,
                  ]}

                  onPress={() =>
                    setSortMode(
                      option.key
                    )
                  }

                  activeOpacity={
                    0.8
                  }
                >

                  <Text
                    style={[
                      styles.sortChipText,

                      sortMode ===
                        option.key &&
                        styles.sortChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>

                </TouchableOpacity>

              )
            )}

          </View>


          {/* ===============================================
              DIRECTORY TITLE
              =============================================== */}

          <Text
            style={
              styles.listTitle
            }

            numberOfLines={
              1
            }
          >
            User Directory

            {searchQuery
              ? ` · ${visibleUsers.length} match${
                  visibleUsers.length ===
                  1
                    ? ''
                    : 'es'
                }`
              : ''}
          </Text>


          {/* ===============================================
              USER LIST
              =============================================== */}

          <FlatList

            data={
              visibleUsers
            }

            keyExtractor={
              item =>
                String(
                  item.id
                )
            }

            renderItem={
              renderUserCard
            }

            showsVerticalScrollIndicator={
              false
            }

            keyboardShouldPersistTaps="handled"

            keyboardDismissMode="on-drag"

            removeClippedSubviews={
              true
            }

            initialNumToRender={
              15
            }

            maxToRenderPerBatch={
              10
            }

            windowSize={
              5
            }

            contentContainerStyle={[
              styles.listContent,

              {
                /*
                 * Dynamic bottom safe
                 * area.
                 */
                paddingBottom:
                  Math.max(
                    insets.bottom +
                      30,
                    46
                  ),
              },
            ]}

            refreshControl={

              <RefreshControl

                refreshing={
                  isRefreshing
                }

                onRefresh={
                  onRefresh
                }

                tintColor="#0C9C4C"

                colors={[
                  '#0C9C4C',
                ]}
              />

            }

            ListEmptyComponent={

              <View
                style={
                  styles.emptyState
                }
              >

                <Text
                  style={
                    styles.emptyEmoji
                  }
                >
                  🔍
                </Text>


                <Text
                  style={
                    styles.emptyText
                  }
                >
                  {searchQuery
                    ? `No shops match "${searchQuery}"`
                    : 'No shops found'}
                </Text>

              </View>

            }

          />

        </>

      )}

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

      width:
        '100%',
    },

    header: {
      flex: 1,

      minWidth:
        0,

      marginRight:
        12,

      fontSize: 22,

      color:
        '#B7791F',

      fontWeight:
        '800',
    },

    closeBtn: {
      backgroundColor:
        '#FFFFFF',

      paddingVertical:
        8,

      paddingHorizontal:
        16,

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
     * ERROR
     * =======================================================
     */

    errorBox: {
      backgroundColor:
        '#FDECEA',

      padding: 20,

      borderRadius:
        12,

      borderWidth:
        1,

      borderColor:
        '#F7C9C4',

      alignItems:
        'center',
    },

    errorText: {
      color:
        '#E0433B',

      fontSize: 15,

      textAlign:
        'center',

      fontWeight:
        '600',

      marginBottom:
        14,

      lineHeight:
        21,
    },

    retryBtn: {
      backgroundColor:
        '#E0433B',

      paddingVertical:
        10,

      paddingHorizontal:
        24,

      borderRadius:
        8,
    },

    retryBtnText: {
      color:
        '#FFFFFF',

      fontWeight:
        '700',
    },


    /*
     * =======================================================
     * METRICS
     * =======================================================
     */

    metricsRow: {
      flexDirection:
        'row',

      marginBottom:
        14,

      width:
        '100%',
    },

    metricsCard: {
      flex: 1,

      minWidth:
        0,

      backgroundColor:
        '#FFFFFF',

      padding: 18,

      borderRadius:
        14,

      borderWidth:
        1,

      borderColor:
        '#EAECEC',

      alignItems:
        'center',
    },

    metricsTitle: {
      color:
        '#6B7280',

      fontSize: 11,

      fontWeight:
        '700',

      letterSpacing:
        0.5,

      marginBottom:
        6,

      textAlign:
        'center',
    },

    metricsValue: {
      color:
        '#1B1F23',

      fontSize: 30,

      fontWeight:
        '800',
    },


    /*
     * =======================================================
     * SEARCH
     * =======================================================
     */

    searchInput: {
      backgroundColor:
        '#FFFFFF',

      color:
        '#1B1F23',

      paddingHorizontal:
        13,

      paddingVertical:
        12,

      minHeight:
        48,

      borderRadius:
        10,

      borderWidth:
        1,

      borderColor:
        '#EAECEC',

      marginBottom:
        12,

      fontSize: 14,
    },


    /*
     * =======================================================
     * SORT
     * =======================================================
     */

    sortRow: {
      flexDirection:
        'row',

      marginBottom:
        16,

      gap:
        8,

      flexWrap:
        'wrap',
    },

    sortChip: {
      paddingVertical:
        7,

      paddingHorizontal:
        14,

      borderRadius:
        20,

      backgroundColor:
        '#FFFFFF',

      borderWidth:
        1,

      borderColor:
        '#EAECEC',
    },

    sortChipActive: {
      backgroundColor:
        '#1B1F23',

      borderColor:
        '#1B1F23',
    },

    sortChipText: {
      color:
        '#6B7280',

      fontSize: 12.5,

      fontWeight:
        '600',
    },

    sortChipTextActive: {
      color:
        '#FFFFFF',
    },


    /*
     * =======================================================
     * LIST
     * =======================================================
     */

    listTitle: {
      color:
        '#6B7280',

      fontSize: 13,

      fontWeight:
        '700',

      marginBottom:
        12,
    },

    listContent: {
      flexGrow:
        1,
    },


    /*
     * =======================================================
     * USER CARD
     * =======================================================
     */

    userCard: {
      backgroundColor:
        '#FFFFFF',

      padding: 16,

      borderRadius:
        14,

      borderWidth:
        1,

      borderColor:
        '#EAECEC',

      marginBottom:
        12,

      width:
        '100%',
    },

    userCardHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      marginBottom:
        10,
    },

    shopAvatar: {
      width: 40,

      height: 40,

      borderRadius: 20,

      backgroundColor:
        '#FFF6E5',

      alignItems:
        'center',

      justifyContent:
        'center',

      flexShrink:
        0,
    },

    shopAvatarText: {
      color:
        '#B7791F',

      fontWeight:
        '800',

      fontSize: 16,
    },

    shopHeaderText: {
      flex: 1,

      minWidth:
        0,

      marginLeft:
        12,
    },

    shopName: {
      color:
        '#1B1F23',

      fontSize: 16,

      fontWeight:
        '700',

      flexShrink:
        1,
    },

    userId: {
      color:
        '#9CA3AF',

      fontSize: 11,

      marginTop:
        1,

      fontWeight:
        '600',
    },


    /*
     * =======================================================
     * CONTACT DETAILS
     * =======================================================
     */

    detailButton: {
      alignSelf:
        'stretch',

      paddingVertical:
        2,
    },

    userDetail: {
      color:
        '#374151',

      fontSize: 13.5,

      marginBottom:
        4,

      flexShrink:
        1,

      lineHeight:
        19,
    },

    userDetailMissing: {
      color:
        '#9CA3AF',

      fontSize: 13.5,

      marginBottom:
        4,

      fontStyle:
        'italic',

      lineHeight:
        19,
    },


    /*
     * =======================================================
     * EMPTY STATE
     * =======================================================
     */

    emptyState: {
      alignItems:
        'center',

      paddingTop:
        60,

      paddingHorizontal:
        20,
    },

    emptyEmoji: {
      fontSize: 34,

      marginBottom:
        10,
    },

    emptyText: {
      color:
        '#6B7280',

      fontSize: 14,

      textAlign:
        'center',
    },

  });


export default AdminDashboard;