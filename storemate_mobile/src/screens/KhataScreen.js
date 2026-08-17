import React, {
  useState,
  useEffect,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Linking,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useAppAlert } from '../components/AppAlert';
import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TelemetryService from '../services/TelemetryService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { requireCurrentUserId } from '../core/auth/localUser';


/* ============================================================
   COUNTR KHATA SCREEN
   ============================================================ */

const KhataScreen = ({
  onClose,
}) => {
  const insets =
    useSafeAreaInsets();
  const { showAlert } = useAppAlert();

  const {
    width: windowWidth,
    height: windowHeight,
  } = useWindowDimensions();


  /* ==========================================================
     RESPONSIVE
     ========================================================== */

  const horizontalPadding =
    windowWidth < 360
      ? 14
      : windowWidth < 600
      ? 18
      : 28;

  const modalWidth =
    Math.min(
      windowWidth - 32,
      520
    );

  const historyModalWidth =
    Math.min(
      windowWidth - 24,
      600
    );

  const historyModalMaxHeight =
    Math.min(
      windowHeight * 0.82,
      700
    );


  /* ==========================================================
     STATE
     ========================================================== */

  const [
    customers,
    setCustomers,
  ] = useState([]);

  const [
    selectedCustomer,
    setSelectedCustomer,
  ] = useState(null);

  const [
    paymentAmount,
    setPaymentAmount,
  ] = useState('');

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    phoneModalVisible,
    setPhoneModalVisible,
  ] = useState(false);

  const [
    activeRemindCustomer,
    setActiveRemindCustomer,
  ] = useState(null);

  const [
    newPhoneInput,
    setNewPhoneInput,
  ] = useState('');

  const [
    historyModalVisible,
    setHistoryModalVisible,
  ] = useState(false);

  const [
    activeCustomerHistory,
    setActiveCustomerHistory,
  ] = useState(null);

  const [
    shopConfig,
    setShopConfig,
  ] = useState({
    name: 'Kirana Store',
    upiId: '',
  });


  /* ==========================================================
     LOAD
     ========================================================== */

  useEffect(() => {
    fetchKhata();
    loadShopConfig();
  }, []);


  /* ==========================================================
     FETCH KHATA
     ========================================================== */

  const fetchKhata =
    async () => {
      try {
        const ownerId =
          await requireCurrentUserId();

        const entries =
          await database
            .get('ledger_entries')
            .query(
              Q.where(
                'owner_id',
                ownerId
              ),
              Q.sortBy(
                'created_at',
                Q.desc
              )
            )
            .fetch();

        const HISTORY_DISPLAY_LIMIT =
          100;

        const customerData =
          {};

        entries.forEach(
          entry => {
            const originalName =
              entry.customerId ||
              'Unknown Customer';

            const normalizedKey =
              originalName
                .trim()
                .toLowerCase();

            if (
              !customerData[
                normalizedKey
              ]
            ) {
              customerData[
                normalizedKey
              ] = {
                name:
                  originalName,

                balance:
                  0,

                phone:
                  null,

                entryId:
                  entry.id,

                history:
                  [],
              };
            }


            /* CREDIT */

            if (
              entry.entryType ===
              'CREDIT'
            ) {
              customerData[
                normalizedKey
              ].balance +=
                Number(
                  entry.amount ||
                    0
                );
            }


            /* PAYMENT */

            if (
              entry.entryType ===
              'PAYMENT'
            ) {
              customerData[
                normalizedKey
              ].balance -=
                Number(
                  entry.amount ||
                    0
                );
            }


            /* PHONE */

            if (
              entry.customerPhone
            ) {
              customerData[
                normalizedKey
              ].phone =
                entry.customerPhone;
            }


            /* HISTORY */

            if (
              customerData[
                normalizedKey
              ].history.length <
              HISTORY_DISPLAY_LIMIT
            ) {
              customerData[
                normalizedKey
              ].history.push({
                id:
                  entry.id,

                amount:
                  Number(
                    entry.amount ||
                      0
                  ),

                type:
                  entry.entryType,

                date:
                  entry.createdAt ||
                  Date.now(),
              });
            }
          }
        );


        Object.values(
          customerData
        ).forEach(
          customer => {
            customer.history.sort(
              (a, b) =>
                b.date -
                a.date
            );
          }
        );


        const sortedCustomers =
          Object.values(
            customerData
          ).sort(
            (a, b) => {
              if (
                b.balance !==
                a.balance
              ) {
                return (
                  b.balance -
                  a.balance
                );
              }

              return a.name.localeCompare(
                b.name
              );
            }
          );


        setCustomers(
          sortedCustomers
        );
      } catch (error) {
        console.error(
          'Error fetching Khata:',
          error
        );
      }
    };


  /* ==========================================================
     REFRESH
     ========================================================== */

  const onRefresh =
    async () => {
      setRefreshing(
        true
      );

      try {
        await fetchKhata();
      } finally {
        setRefreshing(
          false
        );
      }
    };


  /* ==========================================================
     SHOP CONFIG
     ========================================================== */

  const loadShopConfig =
    async () => {
      try {
        const name =
          await AsyncStorage.getItem(
            'shopName'
          );

        const upi =
          await AsyncStorage.getItem(
            'shopUpi'
          );

        setShopConfig({
          name:
            name ||
            'Kirana Store',

          upiId:
            upi ||
            '',
        });
      } catch (error) {
        console.error(
          'Could not load shop config:',
          error
        );
      }
    };


  /* ==========================================================
     WHATSAPP REMINDER
     ========================================================== */

  const sendWhatsAppReminder =
    (
      customerName,
      balance,
      phone
    ) => {
      let message =
        `Namaste ${customerName} 🙏\n\n` +
        `This is a gentle reminder that your pending Khata balance at ${shopConfig.name} is *₹${balance}*.\n\n`;


      if (
        shopConfig.upiId
      ) {
        const upiLink =
          `upi://pay?pa=${shopConfig.upiId}` +
          `&pn=${encodeURIComponent(
            shopConfig.name
          )}` +
          `&am=${balance}` +
          `&cu=INR`;

        message +=
          `*Pay instantly via UPI:* 👇\n` +
          `${upiLink}\n\n` +
          `Or manually pay to UPI ID: ${shopConfig.upiId}\n\n`;
      } else {
        message +=
          `Please visit the store to clear your dues.\n\n`;
      }


      message +=
        `Thank you from ${shopConfig.name}!`;


      let formattedPhone =
        String(
          phone || ''
        ).replace(
          /\D/g,
          ''
        );


      if (
        formattedPhone.length ===
        10
      ) {
        formattedPhone =
          `91${formattedPhone}`;
      }


      const url =
        `https://wa.me/${formattedPhone}` +
        `?text=${encodeURIComponent(
          message
        )}`;


      TelemetryService.trackEvent(
        'whatsapp_reminder_sent',
        'khata',
        {
          balance_amount:
            balance,
        }
      );


      Linking.openURL(
        url
      ).catch(() =>
        showAlert(
          'WhatsApp unavailable',
          'Could not open WhatsApp on this device.'
        )
      );
    };


  /* ==========================================================
     REMIND CUSTOMER
     ========================================================== */

  const handleRemindTap =
    customer => {
      if (
        customer.balance <=
        0
      ) {
        return showAlert(
          'No Dues',
          `${customer.name} has no pending dues to remind them about.`
        );
      }


      if (
        customer.phone
      ) {
        sendWhatsAppReminder(
          customer.name,
          customer.balance,
          customer.phone
        );
      } else {
        setActiveRemindCustomer(
          customer
        );

        setNewPhoneInput(
          ''
        );

        setPhoneModalVisible(
          true
        );
      }
    };


  /* ==========================================================
     SAVE PHONE + SEND
     ========================================================== */

  const savePhoneAndSend =
    async () => {
      const cleanPhone =
        newPhoneInput.replace(
          /\D/g,
          ''
        );


      if (
        cleanPhone.length <
        10
      ) {
        return showAlert(
          'Invalid number',
          'Please enter a valid 10-digit mobile number.'
        );
      }


      try {
        const ownerId =
          await requireCurrentUserId();


        const existing =
          await database
            .get('ledger_entries')
            .query(
              Q.where(
                'owner_id',
                ownerId
              ),
              Q.where(
                'customer_phone',
                cleanPhone
              )
            )
            .fetch();


        const otherCustomer =
          existing.find(
            entry =>
              String(
                entry.customerId ||
                  ''
              )
                .trim()
                .toLowerCase() !==
              String(
                activeRemindCustomer?.name ||
                  ''
              )
                .trim()
                .toLowerCase()
          );


        if (
          otherCustomer
        ) {
          return showAlert(
            'Number already used',
            `This number already belongs to ${otherCustomer.customerId}.`
          );
        }


        const entryToUpdate =
          await database
            .get(
              'ledger_entries'
            )
            .find(
              activeRemindCustomer.entryId
            );


        await database.write(
          async () => {
            await entryToUpdate.update(
              entry => {
                entry.customerPhone =
                  cleanPhone;

                entry.isSynced =
                  false;
              }
            );
          }
        );


        setPhoneModalVisible(
          false
        );


        sendWhatsAppReminder(
          activeRemindCustomer.name,
          activeRemindCustomer.balance,
          cleanPhone
        );


        await fetchKhata();
      } catch (error) {
        showAlert(
          'Error saving number',
          error?.message ||
            'Unable to save the number.'
        );
      }
    };


  /* ==========================================================
     PAYMENT
     ========================================================== */

  const handlePayment =
    async () => {
      const amount =
        parseFloat(
          paymentAmount
        );


      if (
        isNaN(amount) ||
        amount <= 0
      ) {
        return showAlert(
          'Invalid amount',
          'Enter a valid payment amount.'
        );
      }


      if (
        !selectedCustomer
      ) {
        return;
      }


      try {
        const ownerId =
          await requireCurrentUserId();


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
                    selectedCustomer.name;

                  entry.amount =
                    amount;

                  entry.entryType =
                    'PAYMENT';

                  entry.isSynced =
                    false;

                  entry.createdAt =
                    Date.now();

                  entry.customerPhone =
                    selectedCustomer.phone ||
                    '';
                }
              );


            TelemetryService.trackEvent(
              'khata_payment_received',
              'khata',
              {
                amount:
                  amount,
              }
            );
          }
        );


        showAlert(
          'Payment Received',
          `₹${amount.toFixed(
            2
          )} received from ${selectedCustomer.name}.`
        );


        setPaymentAmount(
          ''
        );

        setSelectedCustomer(
          null
        );


        await fetchKhata();
      } catch (error) {
        showAlert(
          'Database Error',
          error?.message ||
            'Could not record payment.'
        );
      }
    };


  /* ==========================================================
     HISTORY
     ========================================================== */

  const openHistory =
    customer => {
      setActiveCustomerHistory(
        customer
      );

      setHistoryModalVisible(
        true
      );
    };


  const closeHistory =
    () => {
      setHistoryModalVisible(
        false
      );

      setTimeout(
        () => {
          setActiveCustomerHistory(
            null
          );
        },
        250
      );
    };


  /* ==========================================================
     CUSTOMER CARD
     ========================================================== */

  const renderCustomer =
    ({
      item,
    }) => {
      const isDue =
        item.balance >
        0;

      const isAdvance =
        item.balance <
        0;

      const isSettled =
        item.balance ===
        0;


      return (
        <View
          style={
            styles.customerCard
          }
        >

          {/* CUSTOMER INFO */}

          <TouchableOpacity
            style={
              styles.customerInfo
            }
            onPress={() =>
              openHistory(
                item
              )
            }
            activeOpacity={
              0.75
            }
          >

            <View
              style={
                styles.customerTopRow
              }
            >
              <View
                style={
                  styles.customerAvatar
                }
              >
                <Text
                  style={
                    styles.customerAvatarText
                  }
                >
                  {String(
                    item.name ||
                      'C'
                  )
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>

              <View
                style={
                  styles.customerNameWrap
                }
              >
                <Text
                  style={
                    styles.customerName
                  }
                  numberOfLines={
                    1
                  }
                >
                  {item.name}
                </Text>

                {item.phone ? (
                  <Text
                    style={
                      styles.customerPhone
                    }
                  >
                    {item.phone}
                  </Text>
                ) : (
                  <Text
                    style={
                      styles.noPhone
                    }
                  >
                    No phone added
                  </Text>
                )}
              </View>
            </View>


            <View
              style={
                styles.balanceBlock
              }
            >
              <Text
                style={
                  styles.balanceLabel
                }
              >
                {isDue
                  ? 'PENDING DUE'
                  : isAdvance
                  ? 'ADVANCE'
                  : 'ACCOUNT SETTLED'}
              </Text>

              <Text
                style={[
                  styles.customerBalance,
                  isDue &&
                    styles.balanceDue,

                  isAdvance &&
                    styles.balanceAdvance,

                  isSettled &&
                    styles.balanceSettled,
                ]}
              >
                ₹
                {Math.abs(
                  item.balance
                ).toFixed(
                  2
                )}
              </Text>
            </View>


            <View
                  style={styles.customerInfo}
                >
                <Text
                  style={styles.historyButtonText}
                >
                  View full history
                </Text>

                <Text
                  style={styles.historyButtonArrow}
                >
                  →
                </Text>
              </View>

          </TouchableOpacity>


          {/* ACTIONS */}

          <View
            style={
              styles.actionRow
            }
          >

            <TouchableOpacity
              style={[
                styles.remindButton,

                (!isDue ||
                  !item.phone) &&
                  styles.remindButtonSoft,
              ]}
              onPress={() =>
                handleRemindTap(
                  item
                )
              }
              activeOpacity={
                0.8
              }
            >
              <Text
                style={
                  styles.remindIcon
                }
              >
                🔔
              </Text>

              <Text
                style={
                  styles.remindText
                }
              >
                Remind
              </Text>
            </TouchableOpacity>


            <TouchableOpacity
              style={
                styles.receiveButton
              }
              onPress={() =>
                setSelectedCustomer(
                  item
                )
              }
              activeOpacity={
                0.85
              }
            >
              <Text
                style={
                  styles.receiveText
                }
              >
                Receive ₹
              </Text>

              <Text
                style={
                  styles.receiveArrow
                }
              >
                →
              </Text>
            </TouchableOpacity>

          </View>
        </View>
      );
    };


  /* ==========================================================
     MAIN UI
     ========================================================== */

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop:
            Math.max(
              insets.top,
              14
            ),

          paddingBottom:
            Math.max(
              insets.bottom,
              12
            ),

          paddingHorizontal:
            horizontalPadding,
        },
      ]}
    >

      {/* ======================================================
          HEADER
          ====================================================== */}

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
              styles.headerBrandRow
            }
          >
            <View
              style={
                styles.brandDot
              }
            />

            <Text
              style={
                styles.brandText
              }
            >
              COUNTR
            </Text>
          </View>

          <Text
            style={
              styles.headerTitle
            }
          >
            Khata
          </Text>

          <Text
            style={
              styles.headerSubtitle
            }
          >
            Udhaar • Payments • History
          </Text>

        </View>


        <TouchableOpacity
          onPress={
            onClose
          }
          style={
            styles.closeButton
          }
          activeOpacity={
            0.8
          }
        >
          <Text
            style={
              styles.closeButtonText
            }
          >
            Back
          </Text>
        </TouchableOpacity>

      </View>


      {/* ======================================================
          SUMMARY
          ====================================================== */}

      <View
        style={
          styles.summaryCard
        }
      >

        <View
          style={
            styles.summaryIcon
          }
        >
          <Text
            style={
              styles.summaryIconText
            }
          >
            ₹
          </Text>
        </View>

        <View
          style={
            styles.summaryText
          }
        >
          <Text
            style={
              styles.summaryLabel
            }
          >
            KHATA REGISTER
          </Text>

          <Text
            style={
              styles.summaryTitle
            }
          >
            {customers.length}{' '}
            {customers.length ===
            1
              ? 'customer'
              : 'customers'}
          </Text>
        </View>

        <View
          style={
            styles.summaryLive
          }
        >
          <View
            style={
              styles.summaryLiveDot
            }
          />

          <Text
            style={
              styles.summaryLiveText
            }
          >
            LIVE
          </Text>
        </View>

      </View>


      {/* ======================================================
          CUSTOMER LIST
          ====================================================== */}

      {customers.length ===
      0 ? (

        <View
          style={
            styles.emptyState
          }
        >
          <View
            style={
              styles.emptyIcon
            }
          >
            <Text
              style={
                styles.emptyEmoji
              }
            >
              ✓
            </Text>
          </View>

          <Text
            style={
              styles.emptyTitle
            }
          >
            Khata is clear
          </Text>

          <Text
            style={
              styles.emptyText
            }
          >
            No customers have been
            added to your Khata yet.
          </Text>
        </View>

      ) : (

        <FlatList
          data={
            customers
          }

          keyExtractor={
            item =>
              item.name
          }

          showsVerticalScrollIndicator={
            false
          }

          keyboardShouldPersistTaps="handled"

          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom:
                Math.max(
                  insets.bottom +
                    24,
                  40
                ),
            },
          ]}

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

          refreshControl={
            <RefreshControl
              refreshing={
                refreshing
              }
              onRefresh={
                onRefresh
              }
              tintColor="#5B8D25"
              colors={[
                '#5B8D25',
              ]}
            />
          }

          renderItem={
            renderCustomer
          }
        />

      )}


      {/* ======================================================
          HISTORY MODAL
          ====================================================== */}

      <Modal
        visible={
          historyModalVisible
        }
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={
          closeHistory
        }
      >

        <KeyboardAvoidingView
          style={
            styles.modalKeyboardContainer
          }
          behavior={
            Platform.OS ===
            'ios'
              ? 'padding'
              : 'height'
          }
        >

          <View
            style={[
              styles.modalOverlay,
              {
                paddingTop:
                  insets.top,

                paddingBottom:
                  insets.bottom,

                paddingHorizontal:
                  12,
              },
            ]}
          >

            <View
              style={[
                styles.historyModalContent,
                {
                  width:
                    historyModalWidth,

                  maxHeight:
                    historyModalMaxHeight,
                },
              ]}
            >

              <View
                style={
                  styles.historyHeaderRow
                }
              >

                <View
                  style={
                    styles.historyHeaderText
                  }
                >

                  <Text
                    style={
                      styles.modalTitle
                    }
                    numberOfLines={
                      2
                    }
                  >
                    {activeCustomerHistory?.name ||
                      'Customer'}
                    's Khata
                  </Text>

                  <Text
                    style={
                      styles.customerPhoneText
                    }
                    numberOfLines={
                      1
                    }
                  >
                    📞{' '}
                    {activeCustomerHistory?.phone ||
                      'No phone number added'}
                  </Text>

                  <Text
                    style={[
                      styles.historySubtitle,

                      activeCustomerHistory?.balance <
                        0 &&
                        styles.historyAdvance,
                    ]}
                  >
                    {activeCustomerHistory?.balance <
                    0
                      ? `Advance: ₹${Math.abs(
                          activeCustomerHistory.balance
                        ).toFixed(
                          2
                        )}`
                      : `Total Due: ₹${Number(
                          activeCustomerHistory?.balance ||
                            0
                        ).toFixed(
                          2
                        )}`}
                  </Text>

                </View>


                <TouchableOpacity
                  onPress={
                    closeHistory
                  }
                  style={
                    styles.closeCircleButton
                  }
                  activeOpacity={
                    0.8
                  }
                >
                  <Text
                    style={
                      styles.closeCircleText
                    }
                  >
                    ×
                  </Text>
                </TouchableOpacity>

              </View>


              <FlatList
                data={
                  activeCustomerHistory?.history ||
                  []
                }

                keyExtractor={(
                  item,
                  index
                ) =>
                  `${item.id}-${index}`
                }

                showsVerticalScrollIndicator={
                  false
                }

                keyboardShouldPersistTaps="handled"

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

                contentContainerStyle={{
                  paddingBottom:
                    12,
                }}

                ListEmptyComponent={
                  <View
                    style={
                      styles.historyEmpty
                    }
                  >
                    <Text
                      style={
                        styles.historyEmptyText
                      }
                    >
                      No transactions found.
                    </Text>
                  </View>
                }

                renderItem={({
                  item,
                }) => (

                  <View
                    style={
                      styles.historyRow
                    }
                  >

                    <View
                      style={
                        styles.historyTimeline
                      }
                    >
                      <View
                        style={[
                          styles.historyDot,

                          item.type ===
                            'PAYMENT' &&
                            styles.historyDotPayment,
                        ]}
                      />
                    </View>


                    <View
                      style={
                        styles.historyInfo
                      }
                    >

                      <Text
                        style={
                          item.type ===
                          'CREDIT'
                            ? styles.historyTypeCredit
                            : styles.historyTypePayment
                        }
                      >
                        {item.type ===
                        'CREDIT'
                          ? item.amount ===
                            0
                            ? 'Account Created'
                            : 'Udhar Added'
                          : 'Payment Received'}
                      </Text>

                      <Text
                        style={
                          styles.historyDate
                        }
                      >
                        {new Date(
                          item.date
                        ).toLocaleDateString(
                          'en-IN',
                          {
                            day:
                              'numeric',

                            month:
                              'short',

                            year:
                              'numeric',

                            hour:
                              '2-digit',

                            minute:
                              '2-digit',
                          }
                        )}
                      </Text>

                    </View>


                    <Text
                      style={
                        item.type ===
                        'CREDIT'
                          ? styles.historyAmountCredit
                          : styles.historyAmountPayment
                      }
                    >
                      {item.type ===
                      'CREDIT'
                        ? '+'
                        : '-'}
                      ₹
                      {Number(
                        item.amount
                      ).toFixed(
                        2
                      )}
                    </Text>

                  </View>
                )}
              />

            </View>

          </View>

        </KeyboardAvoidingView>

      </Modal>


      {/* ======================================================
          PHONE MODAL
          ====================================================== */}

      <Modal
        visible={
          phoneModalVisible
        }
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() =>
          setPhoneModalVisible(
            false
          )
        }
      >

        <KeyboardAvoidingView
          style={
            styles.modalKeyboardContainer
          }
          behavior={
            Platform.OS ===
            'ios'
              ? 'padding'
              : 'height'
          }
        >

          <View
            style={[
              styles.modalOverlay,
              {
                paddingTop:
                  insets.top,

                paddingBottom:
                  insets.bottom,

                paddingHorizontal:
                  16,
              },
            ]}
          >

            <View
              style={[
                styles.modalContent,
                {
                  width:
                    modalWidth,
                },
              ]}
            >

              <View
                style={
                  styles.modalIcon
                }
              >
                <Text
                  style={
                    styles.modalIconText
                  }
                >
                  📱
                </Text>
              </View>

              <Text
                style={
                  styles.modalTitle
                }
              >
                Add Phone Number
              </Text>

              <Text
                style={
                  styles.modalSubtitle
                }
              >
                Add a mobile number for{' '}
                <Text
                  style={
                    styles.modalStrong
                  }
                >
                  {
                    activeRemindCustomer?.name
                  }
                </Text>
                . Countr will use it
                to send a WhatsApp
                Khata reminder.
              </Text>

              <TextInput
                style={
                  styles.input
                }
                placeholder="10-digit mobile number"
                placeholderTextColor="#9AA39D"
                keyboardType="phone-pad"
                maxLength={
                  10
                }
                value={
                  newPhoneInput
                }
                onChangeText={
                  text =>
                    setNewPhoneInput(
                      text.replace(
                        /\D/g,
                        ''
                      )
                    )
                }
                returnKeyType="done"
              />

              <View
                style={
                  styles.modalBtnRow
                }
              >

                <TouchableOpacity
                  style={
                    styles.cancelButton
                  }
                  onPress={() =>
                    setPhoneModalVisible(
                      false
                    )
                  }
                  activeOpacity={
                    0.8
                  }
                >
                  <Text
                    style={
                      styles.cancelButtonText
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>


                <TouchableOpacity
                  style={
                    styles.confirmButton
                  }
                  onPress={
                    savePhoneAndSend
                  }
                  activeOpacity={
                    0.85
                  }
                >
                  <Text
                    style={
                      styles.confirmButtonText
                    }
                  >
                    Save & Send
                  </Text>

                  <Text
                    style={
                      styles.confirmButtonArrow
                    }
                  >
                    →
                  </Text>
                </TouchableOpacity>

              </View>

            </View>

          </View>

        </KeyboardAvoidingView>

      </Modal>


      {/* ======================================================
          PAYMENT MODAL
          ====================================================== */}

      <Modal
        visible={
          !!selectedCustomer
        }
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          setSelectedCustomer(
            null
          );

          setPaymentAmount(
            ''
          );
        }}
      >

        <KeyboardAvoidingView
          style={
            styles.modalKeyboardContainer
          }
          behavior={
            Platform.OS ===
            'ios'
              ? 'padding'
              : 'height'
          }
        >

          <View
            style={[
              styles.modalOverlay,
              {
                paddingTop:
                  insets.top,

                paddingBottom:
                  insets.bottom,

                paddingHorizontal:
                  16,
              },
            ]}
          >

            <View
              style={[
                styles.modalContent,
                {
                  width:
                    modalWidth,
                },
              ]}
            >

              <View
                style={
                  styles.modalIconGreen
                }
              >
                <Text
                  style={
                    styles.modalIconGreenText
                  }
                >
                  ₹
                </Text>
              </View>

              <Text
                style={
                  styles.modalTitle
                }
              >
                Receive Payment
              </Text>

              <Text
                style={
                  styles.modalSubtitle
                }
              >
                {selectedCustomer?.balance <
                0
                  ? `${selectedCustomer?.name} has ₹${Math.abs(
                      selectedCustomer.balance
                    ).toFixed(
                      2
                    )} in advance.`
                  : `${selectedCustomer?.name} owes ₹${Number(
                      selectedCustomer?.balance ||
                        0
                    ).toFixed(
                      2
                    )}.`}
              </Text>

              <Text
                style={
                  styles.amountLabel
                }
              >
                AMOUNT RECEIVED
              </Text>

              <TextInput
                style={
                  styles.amountInput
                }
                placeholder="₹ 0.00"
                placeholderTextColor="#A1AAA4"
                keyboardType="decimal-pad"
                value={
                  paymentAmount
                }
                onChangeText={
                  setPaymentAmount
                }
                returnKeyType="done"
              />

              <View
                style={
                  styles.modalBtnRow
                }
              >

                <TouchableOpacity
                  style={
                    styles.cancelButton
                  }
                  onPress={() => {
                    setSelectedCustomer(
                      null
                    );

                    setPaymentAmount(
                      ''
                    );
                  }}
                  activeOpacity={
                    0.8
                  }
                >
                  <Text
                    style={
                      styles.cancelButtonText
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>


                <TouchableOpacity
                  style={
                    styles.confirmButton
                  }
                  onPress={
                    handlePayment
                  }
                  activeOpacity={
                    0.85
                  }
                >
                  <Text
                    style={
                      styles.confirmButtonText
                    }
                  >
                    Confirm Payment
                  </Text>

                  <Text
                    style={
                      styles.confirmButtonArrow
                    }
                  >
                    →
                  </Text>
                </TouchableOpacity>

              </View>

            </View>

          </View>

        </KeyboardAvoidingView>

      </Modal>

    </View>
  );
};


/* ============================================================
   STYLES — COUNTR WHITE THEME
   ============================================================ */

const styles =
  StyleSheet.create({

    /* ========================================================
       MAIN
       ======================================================== */

    container: {
      flex: 1,
      backgroundColor:
        '#F5F7F5',
    },


    /* ========================================================
       HEADER
       ======================================================== */

    headerRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',

      marginBottom: 18,
    },

    headerLeft: {
      flex: 1,
      minWidth: 0,
    },

    headerBrandRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      marginBottom: 3,
    },

    brandDot: {
      width: 7,
      height: 7,
      borderRadius: 7,
      backgroundColor:
        '#7CAD32',
      marginRight: 6,
    },

    brandText: {
      color: '#5D8E28',
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 2,
    },

    headerTitle: {
      color: '#142019',
      fontSize: 26,
      lineHeight: 30,
      fontWeight: '900',
      letterSpacing: -0.8,
    },

    headerSubtitle: {
      color: '#7D8780',
      fontSize: 11,
      marginTop: 2,
    },

    closeButton: {
      height: 40,
      minWidth: 62,
      paddingHorizontal: 15,
      borderRadius: 13,

      backgroundColor:
        '#FFFFFF',

      borderWidth: 1,

      borderColor:
        '#E0E5E1',

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    closeButtonText: {
      color: '#27332C',
      fontSize: 12,
      fontWeight: '800',
    },


    /* ========================================================
       SUMMARY
       ======================================================== */

    summaryCard: {
      minHeight: 76,

      paddingHorizontal: 15,
      paddingVertical: 13,

      borderRadius: 20,

      backgroundColor:
        '#FFFFFF',

      borderWidth: 1,

      borderColor:
        '#DFE6DF',

      flexDirection:
        'row',

      alignItems:
        'center',

      marginBottom: 12,

      shadowColor:
        '#102015',

      shadowOffset: {
        width: 0,
        height: 3,
      },

      shadowOpacity:
        0.04,

      shadowRadius:
        10,

      elevation: 1,
    },

    summaryIcon: {
      width: 46,
      height: 46,
      borderRadius: 15,

      backgroundColor:
        '#B8FF3D',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 12,
    },

    summaryIconText: {
      color: '#102015',
      fontSize: 21,
      fontWeight: '900',
    },

    summaryText: {
      flex: 1,
    },

    summaryLabel: {
      color: '#8A938D',
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.5,
      marginBottom: 3,
    },

    summaryTitle: {
      color: '#17231B',
      fontSize: 15,
      fontWeight: '900',
    },

    summaryLive: {
      flexDirection:
        'row',

      alignItems:
        'center',

      paddingHorizontal: 8,
      paddingVertical: 6,

      borderRadius: 9,

      backgroundColor:
        '#EFF8E9',
    },

    summaryLiveDot: {
      width: 5,
      height: 5,
      borderRadius: 5,

      backgroundColor:
        '#64A52B',

      marginRight: 5,
    },

    summaryLiveText: {
      color: '#5C8D28',
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.8,
    },


    /* ========================================================
       LIST
       ======================================================== */

    listContent: {
      paddingTop: 1,
    },

    customerCard: {
      backgroundColor:
        '#FFFFFF',

      borderRadius: 20,

      borderWidth: 1,

      borderColor:
        '#E0E6E0',

      padding: 15,

      marginBottom: 11,

      shadowColor:
        '#102015',

      shadowOffset: {
        width: 0,
        height: 3,
      },

      shadowOpacity:
        0.035,

      shadowRadius:
        9,

      elevation: 1,
    },

    customerInfo: {
      minWidth: 0,
    },

    customerTopRow: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },

    customerAvatar: {
      width: 43,
      height: 43,
      borderRadius: 14,

      backgroundColor:
        '#EEF4EA',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 11,
    },

    customerAvatarText: {
      color: '#5D8E28',
      fontSize: 17,
      fontWeight: '900',
    },

    customerNameWrap: {
      flex: 1,
      minWidth: 0,
    },

    customerName: {
      color: '#17231B',
      fontSize: 15,
      fontWeight: '900',
    },

    customerPhone: {
      color: '#8A938D',
      fontSize: 10,
      marginTop: 3,
    },

    noPhone: {
      color: '#B0B7B2',
      fontSize: 10,
      marginTop: 3,
    },

    balanceBlock: {
      alignItems:
        'flex-end',

      marginTop: 14,
    },

    balanceLabel: {
      color: '#909992',
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.2,
      marginBottom: 2,
    },

    customerBalance: {
      fontSize: 21,
      fontWeight: '900',
      letterSpacing: -0.5,
    },

    balanceDue: {
      color: '#D6534D',
    },

    balanceAdvance: {
      color: '#159457',
    },

    balanceSettled: {
      color: '#68736C',
    },

    historyHint: {
      color: '#719D39',
      fontSize: 10,
      fontWeight: '800',
      marginTop: 8,
    },


    /* ========================================================
       ACTIONS
       ======================================================== */

    actionRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      marginTop: 14,

      paddingTop: 13,

      borderTopWidth: 1,

      borderTopColor:
        '#EEF1EE',
    },

    remindButton: {
      flex: 1,

      minHeight: 45,

      borderRadius: 13,

      backgroundColor:
        '#F0F4EE',

      borderWidth: 1,

      borderColor:
        '#DDE5DA',

      alignItems:
        'center',

      justifyContent:
        'center',

      flexDirection:
        'row',

      marginRight: 8,
    },

    remindButtonSoft: {
      backgroundColor:
        '#F6F7F6',

      borderColor:
        '#E7EAE7',
    },

    remindIcon: {
      fontSize: 13,
      marginRight: 5,
    },

    remindText: {
      color: '#3B473F',
      fontSize: 12,
      fontWeight: '800',
    },

    receiveButton: {
      flex: 1,

      minHeight: 45,

      borderRadius: 13,

      backgroundColor:
        '#B8FF3D',

      alignItems:
        'center',

      justifyContent:
        'center',

      flexDirection:
        'row',
    },

    receiveText: {
      color: '#102015',
      fontSize: 12,
      fontWeight: '900',
    },

    receiveArrow: {
      color: '#102015',
      fontSize: 17,
      fontWeight: '900',
      marginLeft: 6,
    },


    /* ========================================================
       EMPTY STATE
       ======================================================== */

    emptyState: {
      flex: 1,

      alignItems:
        'center',

      justifyContent:
        'center',

      paddingHorizontal: 35,
    },

    emptyIcon: {
      width: 70,
      height: 70,
      borderRadius: 23,

      backgroundColor:
        '#EAF6E2',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 15,
    },

    emptyEmoji: {
      color: '#6C9D35',
      fontSize: 27,
      fontWeight: '900',
    },

    emptyTitle: {
      color: '#17231B',
      fontSize: 19,
      fontWeight: '900',
      marginBottom: 6,
    },

    emptyText: {
      color: '#7B857E',
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },


    /* ========================================================
       MODAL BASE
       ======================================================== */

    modalKeyboardContainer: {
      flex: 1,
    },

    modalOverlay: {
      flex: 1,

      backgroundColor:
        'rgba(20,32,25,0.38)',

      justifyContent:
        'center',

      alignItems:
        'center',
    },

    modalContent: {
      backgroundColor:
        '#FFFFFF',

      padding: 22,

      borderRadius: 24,

      borderWidth: 1,

      borderColor:
        '#DFE6DF',

      shadowColor:
        '#102015',

      shadowOffset: {
        width: 0,
        height: 12,
      },

      shadowOpacity:
        0.15,

      shadowRadius:
        25,

      elevation: 8,
    },

    modalIcon: {
      width: 48,
      height: 48,
      borderRadius: 15,

      backgroundColor:
        '#EEF4EA',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 14,
    },

    modalIconText: {
      fontSize: 20,
    },

    modalIconGreen: {
      width: 48,
      height: 48,
      borderRadius: 15,

      backgroundColor:
        '#B8FF3D',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 14,
    },

    modalIconGreenText: {
      color: '#102015',
      fontSize: 21,
      fontWeight: '900',
    },

    modalTitle: {
      color: '#142019',
      fontSize: 21,
      fontWeight: '900',
      letterSpacing: -0.4,
      marginBottom: 6,
    },

    modalSubtitle: {
      color: '#748078',
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 17,
    },

    modalStrong: {
      color: '#29362E',
      fontWeight: '900',
    },

    input: {
      backgroundColor:
        '#F7F9F6',

      color: '#142019',

      paddingHorizontal: 15,
      paddingVertical: 14,

      borderRadius: 14,

      borderWidth: 1,

      borderColor:
        '#DDE4DD',

      marginBottom: 18,

      fontSize: 16,

      minHeight: 52,

      fontWeight: '700',
    },

    amountLabel: {
      color: '#87918A',
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.5,
      marginBottom: 6,
    },

    amountInput: {
      backgroundColor:
        '#F7F9F6',

      color: '#142019',

      paddingHorizontal: 15,
      paddingVertical: 13,

      borderRadius: 14,

      borderWidth: 1,

      borderColor:
        '#DDE4DD',

      marginBottom: 18,

      fontSize: 25,

      minHeight: 58,

      fontWeight: '900',
    },

    modalBtnRow: {
      flexDirection:
        'row',

      justifyContent:
        'flex-end',

      alignItems:
        'center',
    },

    cancelButton: {
      minHeight: 46,

      paddingHorizontal: 14,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 6,
    },

    cancelButtonText: {
      color: '#7A857E',
      fontSize: 12,
      fontWeight: '800',
    },

    confirmButton: {
      minHeight: 46,

      paddingHorizontal: 17,

      borderRadius: 13,

      backgroundColor:
        '#B8FF3D',

      alignItems:
        'center',

      justifyContent:
        'center',

      flexDirection:
        'row',
    },

    confirmButtonText: {
      color: '#102015',
      fontSize: 12,
      fontWeight: '900',
    },

    confirmButtonArrow: {
      color: '#102015',
      fontSize: 17,
      fontWeight: '900',
      marginLeft: 7,
    },


    /* ========================================================
       HISTORY MODAL
       ======================================================== */

    historyModalContent: {
      backgroundColor:
        '#FFFFFF',

      padding: 20,

      borderRadius: 25,

      borderWidth: 1,

      borderColor:
        '#DFE6DF',

      shadowColor:
        '#102015',

      shadowOffset: {
        width: 0,
        height: 12,
      },

      shadowOpacity:
        0.15,

      shadowRadius:
        25,

      elevation: 8,
    },

    historyHeaderRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'flex-start',

      borderBottomWidth: 1,

      borderBottomColor:
        '#E9EDE9',

      paddingBottom: 15,

      marginBottom: 10,
    },

    historyHeaderText: {
      flex: 1,
      minWidth: 0,
    },

    closeCircleButton: {
      width: 38,
      height: 38,
      borderRadius: 13,

      backgroundColor:
        '#F1F4F1',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginLeft: 10,
    },

    closeCircleText: {
      color: '#39453E',
      fontSize: 24,
      lineHeight: 26,
      fontWeight: '300',
    },

    customerPhoneText: {
      color: '#7B857E',
      fontSize: 11,
      fontWeight: '700',
      marginTop: 4,
    },

    historySubtitle: {
      color: '#D6534D',
      fontSize: 14,
      fontWeight: '900',
      marginTop: 5,
    },

    historyAdvance: {
      color: '#159457',
    },

    historyEmpty: {
      paddingVertical: 35,
      alignItems:
        'center',
    },

    historyEmptyText: {
      color: '#8A938D',
      fontSize: 12,
    },

    historyRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      paddingVertical: 13,

      borderBottomWidth: 1,

      borderBottomColor:
        '#F0F2F0',
    },

    historyTimeline: {
      width: 18,
      alignItems:
        'center',
    },

    historyDot: {
      width: 9,
      height: 9,
      borderRadius: 9,

      backgroundColor:
        '#D6534D',
    },

    historyDotPayment: {
      backgroundColor:
        '#159457',
    },

    historyInfo: {
      flex: 1,
      minWidth: 0,
      marginLeft: 4,
      marginRight: 10,
    },

    historyTypeCredit: {
      color: '#D6534D',
      fontSize: 13,
      fontWeight: '900',
      marginBottom: 4,
    },

    historyTypePayment: {
      color: '#159457',
      fontSize: 13,
      fontWeight: '900',
      marginBottom: 4,
    },

    historyDate: {
      color: '#9AA39D',
      fontSize: 10,
    },

    historyAmountCredit: {
      color: '#D6534D',
      fontSize: 16,
      fontWeight: '900',
    },

    historyAmountPayment: {
      color: '#159457',
      fontSize: 16,
      fontWeight: '900',
    },

  });


export default KhataScreen;