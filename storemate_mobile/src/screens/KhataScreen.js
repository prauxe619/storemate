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
  Alert,
  Linking,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';

import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TelemetryService from '../services/TelemetryService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const KhataScreen = ({
  onClose,
}) => {
  const insets =
    useSafeAreaInsets();

  const {
    width: windowWidth,
    height: windowHeight,
  } = useWindowDimensions();

  /*
   * Responsive horizontal spacing.
   *
   * Very small phones need less side padding.
   * Large phones/tablets can use more spacing.
   */
  const horizontalPadding =
    windowWidth < 360
      ? 14
      : windowWidth < 600
      ? 20
      : 28;

  /*
   * Modal width.
   *
   * Prevents huge modal dialogs on tablets
   * and large Android devices.
   */
  const modalWidth = Math.min(
    windowWidth - 32,
    520
  );

  const historyModalWidth =
    Math.min(
      windowWidth - 24,
      600
    );

  /*
   * History modal height adapts to
   * different screen sizes.
   */
  const historyModalMaxHeight =
    Math.min(
      windowHeight * 0.82,
      700
    );

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
    name: 'Our Store',
    upiId: '',
  });

  /*
   * =====================================
   * LOAD KHATA
   * =====================================
   */

  const fetchKhata =
    async () => {
      try {
        /*
         * Balance calculation MUST see every
         * ledger entry.
         *
         * Do not add a global limit here.
         */
        const entries =
          await database
            .get('ledger_entries')
            .query(
              Q.sortBy(
                'created_at',
                Q.desc
              )
            )
            .fetch();

        /*
         * This limit only affects what is
         * displayed in each customer's
         * history modal.
         */
        const HISTORY_DISPLAY_LIMIT =
          100;

        const customerData = {};

        entries.forEach(
          entry => {
            const originalName =
              entry.customerId;

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
                name: originalName,
                balance: 0,
                phone: null,
                entryId:
                  entry.id,
                history: [],
              };
            }

            if (
              entry.entryType ===
              'CREDIT'
            ) {
              customerData[
                normalizedKey
              ].balance +=
                entry.amount;
            }

            if (
              entry.entryType ===
              'PAYMENT'
            ) {
              customerData[
                normalizedKey
              ].balance -=
                entry.amount;
            }

            if (
              entry.customerPhone
            ) {
              customerData[
                normalizedKey
              ].phone =
                entry.customerPhone;
            }

            if (
              customerData[
                normalizedKey
              ].history.length <
              HISTORY_DISPLAY_LIMIT
            ) {
              customerData[
                normalizedKey
              ].history.push({
                id: entry.id,
                amount:
                  entry.amount,
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
        ).forEach(customer => {
          customer.history.sort(
            (a, b) =>
              b.date - a.date
          );
        });

        /*
         * Keep zero-balance customers visible.
         * Highest debt appears first.
         */
        const sortedCustomers =
          Object.values(
            customerData
          ).sort((a, b) => {
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
          });

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

  useEffect(() => {
    fetchKhata();
    loadShopConfig();
  }, []);

  /*
   * =====================================
   * PULL TO REFRESH
   * =====================================
   */

  const onRefresh =
    async () => {
      setRefreshing(true);

      try {
        await fetchKhata();
      } finally {
        setRefreshing(false);
      }
    };

  /*
   * =====================================
   * SHOP CONFIG
   * =====================================
   */

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
            upi || '',
        });
      } catch (error) {
        console.error(
          'Could not load shop config:',
          error
        );
      }
    };

  /*
   * =====================================
   * WHATSAPP REMINDER
   * =====================================
   */

  const sendWhatsAppReminder = (
    customerName,
    balance,
    phone
  ) => {
    let message =
      `Namaste ${customerName} 🙏\n\n` +
      `This is a gentle reminder that your pending Khata (Udhaar) balance at our store is *₹${balance}*.\n\n`;

    if (shopConfig.upiId) {
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
      `Thank you from ${shopConfig.name}!\n\n`;

    message +=
      `---\n` +
      `Sent via StoreMate — The Free AI Operating System for Shops. ` +
      `Click here to digitize your store: https://storemate.in/app`;

    let formattedPhone =
      phone.replace(
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

    Linking.openURL(url).catch(
      () =>
        Alert.alert(
          'Error',
          'Could not open WhatsApp.'
        )
    );
  };

  /*
   * =====================================
   * REMIND CUSTOMER
   * =====================================
   */

  const handleRemindTap =
    customer => {
      if (
        customer.balance <=
        0
      ) {
        return Alert.alert(
          'No Dues',
          `${customer.name} has no pending dues to remind them about!`
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

  /*
   * =====================================
   * SAVE PHONE + SEND
   * =====================================
   */

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
        return Alert.alert(
          'Invalid',
          'Please enter a valid 10-digit number.'
        );
      }

      try {
        const existing =
          await database
            .get('ledger_entries')
            .query(
              Q.where(
                'customer_phone',
                cleanPhone
              )
            )
            .fetch();

        const otherCustomer =
          existing.find(
            entry =>
              entry.customerId
                .trim()
                .toLowerCase() !==
              activeRemindCustomer.name
                .trim()
                .toLowerCase()
          );

        if (
          otherCustomer
        ) {
          return Alert.alert(
            'Number in Use',
            `This number already belongs to ${otherCustomer.customerId}.`
          );
        }

        const entryToUpdate =
          await database
            .get('ledger_entries')
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
        Alert.alert(
          'Error saving number',
          error.message
        );
      }
    };

  /*
   * =====================================
   * PAYMENT
   * =====================================
   */

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
        return Alert.alert(
          'Invalid Amount',
          'Enter a valid number.'
        );
      }

      try {
        await database.write(
          async () => {
            await database
              .get(
                'ledger_entries'
              )
              .create(entry => {
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
              });

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

        Alert.alert(
          '✅ Payment Logged',
          `₹${amount} cleared for ${selectedCustomer.name}.`
        );

        setPaymentAmount(
          ''
        );

        setSelectedCustomer(
          null
        );

        await fetchKhata();
      } catch (error) {
        Alert.alert(
          'Database Error',
          error.message
        );
      }
    };

  /*
   * =====================================
   * HISTORY
   * =====================================
   */

  const openHistory =
    customer => {
      setActiveCustomerHistory(
        customer
      );

      setHistoryModalVisible(
        true
      );
    };

  /*
   * =====================================
   * CLOSE HISTORY
   * =====================================
   */

  const closeHistory =
    () => {
      setHistoryModalVisible(
        false
      );

      /*
       * Clear the object after the
       * modal closes rather than
       * immediately.
       */
      setTimeout(() => {
        setActiveCustomerHistory(
          null
        );
      }, 250);
    };

  /*
   * =====================================
   * SCREEN
   * =====================================
   */

  return (
    <View
      style={[
        styles.container,
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
      {/* ================================
          HEADER
          ================================= */}

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
            numberOfLines={1}
          >
            Khata Register
          </Text>

          <Text
            style={
              styles.headerHinglish
            }
          >
            Udhaar Book
          </Text>
        </View>

        <TouchableOpacity
          onPress={onClose}
          style={
            styles.closeBtn
          }
          activeOpacity={0.8}
        >
          <Text
            style={
              styles.closeBtnText
            }
          >
            Back
          </Text>
        </TouchableOpacity>
      </View>

      {/* ================================
          CUSTOMER LIST
          ================================= */}

      {customers.length ===
      0 ? (
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
            🎉
          </Text>

          <Text
            style={
              styles.emptyText
            }
          >
            No customers in your Khata yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={item =>
            item.name
          }
          showsVerticalScrollIndicator={
            false
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            {
              /*
               * The final customer card
               * must remain above the
               * Android navigation area.
               */
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
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={
                refreshing
              }
              onRefresh={
                onRefresh
              }
              tintColor="#0C9C4C"
            />
          }
          renderItem={({
            item,
          }) => (
            <View
              style={
                styles.card
              }
            >
              <TouchableOpacity
                style={
                  styles.cardInfo
                }
                onPress={() =>
                  openHistory(
                    item
                  )
                }
                activeOpacity={
                  0.7
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

                {item.balance ===
                0 ? (
                  <Text
                    style={[
                      styles.customerBalance,
                      {
                        color:
                          '#6B7280',
                      },
                    ]}
                  >
                    Settled (₹0.00)
                  </Text>
                ) : (
                  <Text
                    style={[
                      styles.customerBalance,
                      item.balance <
                        0 && {
                        color:
                          '#0C9C4C',
                      },
                    ]}
                  >
                    {item.balance <
                    0
                      ? `Advance: ₹${Math.abs(
                          item.balance
                        ).toFixed(
                          2
                        )}`
                      : `Owes: ₹${item.balance.toFixed(
                          2
                        )}`}
                  </Text>
                )}

                <Text
                  style={
                    styles.viewHistoryHint
                  }
                >
                  Tap to view history ›
                </Text>
              </TouchableOpacity>

              <View
                style={
                  styles.actionRow
                }
              >
                <TouchableOpacity
                  style={
                    styles.remindBtn
                  }
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
                      styles.remindBtnText
                    }
                  >
                    🔔 Remind
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={
                    styles.settleBtn
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
                      styles.settleBtnText
                    }
                  >
                    Receive ₹
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* =================================================
          TRANSACTION HISTORY MODAL
          ================================================= */}

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
                    {
                      activeCustomerHistory?.name
                    }
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
                    {activeCustomerHistory?.phone
                      ? activeCustomerHistory.phone
                      : 'No phone number added'}
                  </Text>

                  <Text
                    style={[
                      styles.historySubtitle,
                      activeCustomerHistory?.balance <
                        0 && {
                        color:
                          '#0C9C4C',
                      },
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
                    styles.closeCircleBtn
                  }
                  activeOpacity={
                    0.8
                  }
                >
                  <Text
                    style={
                      styles.closeCircleBtnText
                    }
                  >
                    ✕
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
                windowSize={5}
                contentContainerStyle={{
                  paddingBottom: 12,
                }}
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
                            ? '🟢 Account Created'
                            : '🔴 Udhar (Credit)'
                          : '🟢 Paid (Received)'}
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
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
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

      {/* =================================================
          PHONE POPUP MODAL
          ================================================= */}

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
                We don't have a number for{' '}
                {
                  activeRemindCustomer?.name
                }
                . Add it once to send automatic reminders.
              </Text>

              <TextInput
                style={
                  styles.input
                }
                placeholder="10-digit Mobile Number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                maxLength={10}
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
                    styles.cancelBtn
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
                      styles.cancelBtnText
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={
                    styles.confirmBtn
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
                      styles.confirmBtnText
                    }
                  >
                    Save & Send
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* =================================================
          PAYMENT MODAL
          ================================================= */}

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
              <Text
                style={
                  styles.modalTitle
                }
              >
                Settle Account
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
                    )} in advance`
                  : `${selectedCustomer?.name} owes ₹${Number(
                      selectedCustomer?.balance ||
                        0
                    ).toFixed(
                      2
                    )}`}
              </Text>

              <TextInput
                style={
                  styles.input
                }
                placeholder="Amount Received (₹)"
                placeholderTextColor="#9CA3AF"
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
                    styles.cancelBtn
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
                      styles.cancelBtnText
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={
                    styles.confirmBtn
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
                      styles.confirmBtnText
                    }
                  >
                    Confirm Payment
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

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#F5F7F6',
    },

    headerRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',

      marginBottom: 20,
    },

    headerTextWrap: {
      flex: 1,
      marginRight: 12,
    },

    header: {
      fontSize: 24,
      color: '#1B1F23',
      fontWeight: '800',
    },

    headerHinglish: {
      color: '#9CA3AF',
      fontSize: 13,
      fontStyle: 'italic',
      marginTop: 1,
    },

    closeBtn: {
      paddingVertical: 8,
      paddingHorizontal: 16,

      backgroundColor:
        '#FFFFFF',

      borderRadius: 8,

      borderWidth: 1,

      borderColor:
        '#EAECEC',
    },

    closeBtnText: {
      color: '#1B1F23',
      fontWeight: '600',
    },

    closeCircleBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,

      backgroundColor:
        '#F5F7F6',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginLeft: 12,
    },

    closeCircleBtnText: {
      color: '#1B1F23',
      fontWeight: '700',
      fontSize: 16,
    },

    emptyState: {
      flex: 1,

      justifyContent:
        'center',

      alignItems:
        'center',

      paddingHorizontal: 20,
    },

    emptyEmoji: {
      fontSize: 40,
      marginBottom: 10,
    },

    emptyText: {
      color: '#1B1F23',
      fontSize: 17,
      fontWeight: '600',
      textAlign: 'center',
    },

    listContent: {
      paddingTop: 2,
    },

    card: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',

      backgroundColor:
        '#FFFFFF',

      padding: 18,

      borderRadius: 14,

      marginBottom: 12,

      borderWidth: 1,

      borderColor:
        '#EAECEC',

      /*
       * Prevent action buttons from
       * getting squeezed on narrow
       * devices.
       */
      minHeight: 90,
    },

    cardInfo: {
      flex: 1,
      paddingRight: 10,
      minWidth: 0,
    },

    customerName: {
      color: '#1B1F23',
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 4,
    },

    customerBalance: {
      color: '#E0433B',
      fontSize: 15,
      fontWeight: '700',
    },

    viewHistoryHint: {
      color: '#0C9C4C',
      fontSize: 12,
      marginTop: 6,
      fontWeight: '600',
    },

    actionRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      flexShrink: 0,
    },

    remindBtn: {
      backgroundColor:
        '#F5F7F6',

      paddingHorizontal: 12,
      paddingVertical: 10,

      borderRadius: 8,

      borderWidth: 1,

      borderColor:
        '#EAECEC',

      marginRight: 8,
    },

    remindBtnText: {
      color: '#1B1F23',
      fontWeight: '600',
      fontSize: 13,
    },

    settleBtn: {
      backgroundColor:
        '#0C9C4C',

      paddingHorizontal: 14,
      paddingVertical: 10,

      borderRadius: 8,
    },

    settleBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 13,
    },

    /*
     * ==============================
     * MODAL SYSTEM
     * ==============================
     */

    modalKeyboardContainer: {
      flex: 1,
    },

    modalOverlay: {
      flex: 1,

      backgroundColor:
        'rgba(27,31,35,0.55)',

      justifyContent:
        'center',

      alignItems:
        'center',
    },

    modalContent: {
      backgroundColor:
        '#FFFFFF',

      padding: 25,

      borderRadius: 16,

      borderWidth: 1,

      borderColor:
        '#EAECEC',

      /*
       * Width is supplied dynamically
       * so this works on small phones,
       * large phones and tablets.
       */
    },

    modalTitle: {
      color: '#1B1F23',
      fontSize: 20,
      fontWeight: '800',
      marginBottom: 5,
    },

    modalSubtitle: {
      color: '#6B7280',
      fontSize: 14,
      marginBottom: 20,
      lineHeight: 20,
    },

    input: {
      backgroundColor:
        '#F5F7F6',

      color: '#1B1F23',

      paddingHorizontal: 15,
      paddingVertical: 14,

      borderRadius: 10,

      borderWidth: 1,

      borderColor:
        '#EAECEC',

      marginBottom: 20,

      fontSize: 18,

      minHeight: 52,
    },

    modalBtnRow: {
      flexDirection:
        'row',

      justifyContent:
        'flex-end',

      alignItems:
        'center',

      flexWrap:
        'wrap',
    },

    cancelBtn: {
      paddingVertical: 12,
      paddingHorizontal: 8,

      marginRight: 10,
    },

    cancelBtnText: {
      color: '#6B7280',
      fontSize: 15,
      fontWeight: '700',
    },

    confirmBtn: {
      backgroundColor:
        '#0C9C4C',

      paddingVertical: 14,
      paddingHorizontal: 18,

      borderRadius: 10,

      minHeight: 48,

      justifyContent:
        'center',

      alignItems:
        'center',
    },

    confirmBtnText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },

    /*
     * ==============================
     * HISTORY MODAL
     * ==============================
     */

    historyModalContent: {
      backgroundColor:
        '#FFFFFF',

      padding: 25,

      borderRadius: 16,

      borderWidth: 1,

      borderColor:
        '#EAECEC',
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
        '#EAECEC',

      paddingBottom: 15,

      marginBottom: 15,
    },

    historyHeaderText: {
      flex: 1,
      minWidth: 0,
    },

    historySubtitle: {
      color: '#E0433B',
      fontSize: 15,
      fontWeight: '700',
      marginTop: 4,
    },

    customerPhoneText: {
      color: '#6B7280',
      fontSize: 13,
      fontWeight: '600',
      marginTop: 4,
    },

    historyRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',

      paddingVertical: 12,

      borderBottomWidth: 1,

      borderBottomColor:
        '#F5F7F6',
    },

    historyInfo: {
      flex: 1,
      minWidth: 0,
      marginRight: 12,
    },

    historyTypeCredit: {
      color: '#E0433B',
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 4,
    },

    historyTypePayment: {
      color: '#0C9C4C',
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 4,
    },

    historyDate: {
      color: '#9CA3AF',
      fontSize: 12,
    },

    historyAmountCredit: {
      color: '#E0433B',
      fontSize: 17,
      fontWeight: '800',
    },

    historyAmountPayment: {
      color: '#0C9C4C',
      fontSize: 17,
      fontWeight: '800',
    },
  });

export default KhataScreen;