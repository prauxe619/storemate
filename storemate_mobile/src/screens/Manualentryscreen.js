import React, {
  useState,
  useEffect,
  useMemo,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
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

import TelemetryService from '../services/TelemetryService';

import {
  requireCurrentUserId,
} from '../core/auth/localUser';


/* ============================================================
 * COUNTR COLORS
 * ============================================================ */

const COLORS = {
  background: '#F5F7F5',
  surface: '#FFFFFF',
  surfaceSoft: '#F1F5EF',

  ink: '#172019',
  text: '#2D3830',
  muted: '#7C867F',
  mutedLight: '#A2AAA5',

  border: '#DDE4DE',
  borderSoft: '#E7ECE7',

  green: '#6C9637',
  greenDark: '#527A28',
  greenSoft: '#EAF4E3',

  red: '#D95C52',
  redSoft: '#FFF0EE',

  blue: '#477DA8',
  blueSoft: '#EEF5FA',

  white: '#FFFFFF',
};


/* ============================================================
 * PRESET AMOUNTS
 * ============================================================ */

const PRESET_AMOUNTS = [
  50,
  100,
  200,
  500,
  1000,
];


/* ============================================================
 * LOAD CUSTOMERS
 * ============================================================ */

async function loadCustomers() {

  const ownerId =
    await requireCurrentUserId();


  const entries =
    await database
      .get('ledger_entries')
      .query(
        Q.where(
          'owner_id',
          ownerId
        )
      )
      .fetch();


  const byName = {};


  entries.forEach(
    entry => {

      const rawName =
        entry.customerId ||
        '';


      const key =
        rawName
          .trim()
          .toLowerCase();


      if (!key) {
        return;
      }


      if (!byName[key]) {

        byName[key] = {

          name:
            rawName,

          phone:
            entry.customerPhone ||
            '',

          balance:
            0,

        };
      }


      if (
        entry.entryType ===
        'CREDIT'
      ) {

        byName[key].balance +=
          Number(entry.amount) ||
          0;
      }


      if (
        entry.entryType ===
        'PAYMENT'
      ) {

        byName[key].balance -=
          Number(entry.amount) ||
          0;
      }


      if (
        entry.customerPhone
      ) {

        byName[key].phone =
          entry.customerPhone;
      }
    }
  );


  return Object
    .values(byName)
    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );
}


/* ============================================================
 * BUILD ENTRY
 * ============================================================ */

function buildEntry({
  customer,
  isNewCustomer,
  amount,
  type,
  phone,
}) {

  return {

    customerName:
      customer,

    matchedCustomer:
      isNewCustomer
        ? null
        : {
            name:
              customer,
          },

    amount,

    type,

    customerPhone:
      phone || '',

  };
}


/* ============================================================
 * MANUAL ENTRY SCREEN
 * ============================================================ */

const ManualEntryScreen = ({
  onClose,
  onSaved,
  initialQuery = '',
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


  /* ==========================================================
   * STATE
   * ========================================================== */

  const [
    allCustomers,
    setAllCustomers,
  ] = useState([]);


  const [
    searchQuery,
    setSearchQuery,
  ] = useState(
    initialQuery
  );


  const [
    selectedCustomer,
    setSelectedCustomer,
  ] = useState(null);


  const [
    newPhone,
    setNewPhone,
  ] = useState('');


  const [
    amount,
    setAmount,
  ] = useState(null);


  const [
    customAmount,
    setCustomAmount,
  ] = useState('');


  const [
    showCustomInput,
    setShowCustomInput,
  ] = useState(false);


  const [
    entryType,
    setEntryType,
  ] = useState(null);


  const [
    isSaving,
    setIsSaving,
  ] = useState(false);


  /* ==========================================================
   * LOAD CUSTOMERS
   * ========================================================== */

  useEffect(() => {

    let mounted = true;


    loadCustomers()
      .then(customers => {

        if (mounted) {

          setAllCustomers(
            customers
          );
        }

      })
      .catch(error => {

        console.log(
          'Customer loading failed:',
          error?.message
        );

      });


    return () => {
      mounted = false;
    };

  }, []);


  /* ==========================================================
   * FILTER CUSTOMERS
   * ========================================================== */

  const filteredCustomers =
    useMemo(() => {

      if (
        !searchQuery.trim()
      ) {

        return allCustomers
          .slice(0, 20);
      }


      const query =
        searchQuery
          .trim()
          .toLowerCase();


      return allCustomers
        .filter(customer =>
          customer.name
            .toLowerCase()
            .includes(query)
        )
        .slice(0, 30);

    }, [
      searchQuery,
      allCustomers,
    ]);


  /* ==========================================================
   * EXACT MATCH
   * ========================================================== */

  const exactMatchExists =
    allCustomers.some(
      customer =>
        customer.name
          .toLowerCase() ===
        searchQuery
          .trim()
          .toLowerCase()
    );


  /* ==========================================================
   * CUSTOMER SELECT
   * ========================================================== */

  const handleSelectCustomer =
    customer => {

      setSelectedCustomer(
        customer
      );


      setSearchQuery(
        customer.name
      );


      setNewPhone(
        customer.phone || ''
      );

    };


  /* ==========================================================
   * NEW CUSTOMER
   * ========================================================== */

  const handleUseNewName =
    () => {

      const name =
        searchQuery.trim();


      if (!name) {

        return;
      }


      setSelectedCustomer({

        name,

        phone: '',

        balance: 0,

        isNew: true,

      });


      setNewPhone('');

    };


  /* ==========================================================
   * AMOUNT
   * ========================================================== */

  const handlePresetTap =
    value => {

      setAmount(
        value
      );


      setShowCustomInput(
        false
      );


      setCustomAmount(
        ''
      );

    };


  const handleCustomConfirm =
    () => {

      const value =
        parseFloat(
          customAmount
        );


      if (
        !value ||
        value <= 0
      ) {

        Alert.alert(
          'Invalid amount',
          'Please enter an amount greater than ₹0.'
        );

        return;
      }


      setAmount(
        value
      );


      setShowCustomInput(
        false
      );

    };


  /* ==========================================================
   * SAVE VALIDATION
   * ========================================================== */

  const canSave =
    !!selectedCustomer &&
    !!amount &&
    !!entryType &&
    !isSaving;


  /* ==========================================================
   * SAVE
   * ========================================================== */

  const handleSave =
    async () => {

      if (!canSave) {

        return;
      }


      setIsSaving(
        true
      );


      const phone =
        selectedCustomer.isNew
          ? newPhone
          : selectedCustomer.phone;


      const entry =
        buildEntry({

          customer:
            selectedCustomer.name,

          isNewCustomer:
            !!selectedCustomer.isNew,

          amount,

          type:
            entryType,

          phone,

        });


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
                record => {

                  record.ownerId =
                    ownerId;


                  record.customerId =
                    entry.customerName;


                  record.amount =
                    entry.amount;


                  record.entryType =
                    entry.type;


                  record.customerPhone =
                    entry.customerPhone;


                  record.isSynced =
                    false;


                  record.createdAt =
                    Date.now();

                }
              );

          }
        );


        onSaved &&
          onSaved(entry);


        TelemetryService.trackEvent(
          'manual_entry_created',
          'khata',
          {

            type:
              entryType,

            amount:
              amount,

          }
        );


        onClose &&
          onClose();


      } catch (
        error
      ) {

        Alert.alert(
          'Could not save',
          error?.message ||
            'Something went wrong while saving the entry.'
        );

      } finally {

        setIsSaving(
          false
        );
      }
    };


  /* ==========================================================
   * BALANCE LABEL
   * ========================================================== */

  const getBalanceLabel =
    customer => {

      const balance =
        Number(
          customer.balance
        ) || 0;


      if (
        balance > 0
      ) {

        return {
          text:
            `Owes ₹${balance.toFixed(0)}`,
          style:
            styles.balanceOwes,
        };

      }


      if (
        balance < 0
      ) {

        return {
          text:
            `Advance ₹${Math.abs(
              balance
            ).toFixed(0)}`,
          style:
            styles.balanceAdvance,
        };

      }


      return {
        text:
          'Settled',
        style:
          styles.balanceSettled,
      };

    };


  /* ==========================================================
   * RENDER
   * ========================================================== */

  return (

    <KeyboardAvoidingView

      style={
        styles.keyboardContainer
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
          styles.container,

          {
            paddingTop:
              Math.max(
                insets.top,
                12
              ),

            paddingBottom:
              Math.max(
                insets.bottom,
                10
              ),

            paddingHorizontal:
              horizontalPadding,
          },
        ]}
      >

        <ScrollView

          style={
            styles.scroll
          }

          contentContainerStyle={
            styles.scrollContent
          }

          keyboardShouldPersistTaps="handled"

          showsVerticalScrollIndicator={
            false
          }

          keyboardDismissMode={
            Platform.OS ===
            'ios'
              ? 'interactive'
              : 'on-drag'
          }
        >

          {/* ==================================================
              HEADER
              ================================================== */}

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


              <View>

                <Text
                  style={
                    styles.eyebrow
                  }
                >
                  COUNTR · KHATA
                </Text>


                <Text
                  style={
                    styles.header
                  }
                >
                  Add entry
                </Text>

              </View>

            </View>


            <TouchableOpacity
              onPress={
                onClose
              }
              style={
                styles.closeBtn
              }
              activeOpacity={
                0.75
              }
            >

              <Text
                style={
                  styles.closeBtnText
                }
              >
                Cancel
              </Text>

            </TouchableOpacity>

          </View>


          {/* ==================================================
              QUICK EXPLANATION
              ================================================== */}

          <View
            style={
              styles.infoCard
            }
          >

            <View
              style={
                styles.infoIcon
              }
            >

              <Text
                style={
                  styles.infoIconText
                }
              >
                ₹
              </Text>

            </View>


            <View
              style={
                styles.infoTextWrap
              }
            >

              <Text
                style={
                  styles.infoTitle
                }
              >
                Record a shop transaction
              </Text>


              <Text
                style={
                  styles.infoSubtitle
                }
              >
                Choose the customer, amount and whether it is Udhaar or a payment.
              </Text>

            </View>

          </View>


          {/* ==================================================
              STEP 1
              ================================================== */}

          <View
            style={
              styles.stepHeader
            }
          >

            <View
              style={
                styles.stepNumber
              }
            >

              <Text
                style={
                  styles.stepNumberText
                }
              >
                1
              </Text>

            </View>


            <View>

              <Text
                style={
                  styles.stepTitle
                }
              >
                Customer
              </Text>


              <Text
                style={
                  styles.stepSubtitle
                }
              >
                Search existing or add new
              </Text>

            </View>

          </View>


          {/* SEARCH */}

          <View
            style={
              styles.searchShell
            }
          >

            <Text
              style={
                styles.searchIcon
              }
            >
              ⌕
            </Text>


            <TextInput

              style={
                styles.searchInput
              }

              placeholder="Search customer name..."

              placeholderTextColor={
                COLORS.mutedLight
              }

              value={
                searchQuery
              }

              onChangeText={text => {

                setSearchQuery(
                  text
                );

                setSelectedCustomer(
                  null
                );

              }}

              returnKeyType="done"

            />

          </View>


          {/* CUSTOMER LIST */}

          {!selectedCustomer && (

            <View
              style={
                styles.customerListCard
              }
            >

              {filteredCustomers.length >
                0 ? (

                <FlatList

                  data={
                    filteredCustomers
                  }

                  keyExtractor={
                    item =>
                      item.name
                  }

                  keyboardShouldPersistTaps="handled"

                  scrollEnabled={
                    filteredCustomers.length >
                    5
                  }

                  nestedScrollEnabled={
                    true
                  }

                  renderItem={({
                    item,
                  }) => {

                    const balance =
                      getBalanceLabel(
                        item
                      );


                    return (

                      <TouchableOpacity

                        style={
                          styles.customerRow
                        }

                        onPress={() =>
                          handleSelectCustomer(
                            item
                          )
                        }

                        activeOpacity={
                          0.75
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
                            {item.name
                              .charAt(
                                0
                              )
                              .toUpperCase()}
                          </Text>

                        </View>


                        <View
                          style={
                            styles.customerInfo
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


                          <View
                            style={
                              styles.customerMeta
                            }
                          >

                            <Text
                              style={
                                styles.customerPhone
                              }
                            >
                              {item.phone
                                ? item.phone
                                : 'No WhatsApp number'}
                            </Text>


                            <View
                              style={
                                styles.metaDot
                              }
                            />


                            <Text
                              style={
                                balance.style
                              }
                            >
                              {
                                balance.text
                              }
                            </Text>

                          </View>

                        </View>


                        <Text
                          style={
                            styles.customerArrow
                          }
                        >
                          ›
                        </Text>

                      </TouchableOpacity>

                    );

                  }}

                />

              ) : (

                <View
                  style={
                    styles.emptyCustomers
                  }
                >

                  <Text
                    style={
                      styles.emptyIcon
                    }
                  >
                    👤
                  </Text>


                  <Text
                    style={
                      styles.emptyTitle
                    }
                  >
                    No customer found
                  </Text>


                  <Text
                    style={
                      styles.emptySubtitle
                    }
                  >
                    Type the name below to add a new customer.
                  </Text>

                </View>

              )}


              {/* ADD NEW */}

              {searchQuery.trim() &&
                !exactMatchExists && (

                <TouchableOpacity

                  style={
                    styles.newCustomerButton
                  }

                  onPress={
                    handleUseNewName
                  }

                  activeOpacity={
                    0.8
                  }
                >

                  <View
                    style={
                      styles.newCustomerIcon
                    }
                  >

                    <Text
                      style={
                        styles.newCustomerIconText
                      }
                    >
                      +
                    </Text>

                  </View>


                  <View
                    style={
                      styles.newCustomerInfo
                    }
                  >

                    <Text
                      style={
                        styles.newCustomerTitle
                      }
                    >
                      Add new customer
                    </Text>


                    <Text
                      style={
                        styles.newCustomerName
                      }
                      numberOfLines={
                        1
                      }
                    >
                      “{searchQuery.trim()}”
                    </Text>

                  </View>


                  <Text
                    style={
                      styles.newCustomerArrow
                    }
                  >
                    →
                  </Text>

                </TouchableOpacity>

              )}

            </View>

          )}


          {/* ==================================================
              SELECTED CUSTOMER
              ================================================== */}

          {selectedCustomer && (

            <View
              style={
                styles.selectedCard
              }
            >

              <View
                style={
                  styles.selectedLeft
                }
              >

                <View
                  style={
                    styles.selectedAvatar
                  }
                >

                  <Text
                    style={
                      styles.selectedAvatarText
                    }
                  >
                    {selectedCustomer.name
                      .charAt(
                        0
                      )
                      .toUpperCase()}
                  </Text>

                </View>


                <View
                  style={
                    styles.selectedInfo
                  }
                >

                  <View
                    style={
                      styles.selectedNameRow
                    }
                  >

                    <Text
                      style={
                        styles.selectedName
                      }
                      numberOfLines={
                        1
                      }
                    >
                      {
                        selectedCustomer.name
                      }
                    </Text>


                    {selectedCustomer.isNew && (

                      <View
                        style={
                          styles.newBadge
                        }
                      >

                        <Text
                          style={
                            styles.newBadgeText
                          }
                        >
                          NEW
                        </Text>

                      </View>

                    )}

                  </View>


                  {!selectedCustomer.isNew && (

                    <Text
                      style={
                        styles.selectedBalance
                      }
                    >
                      {getBalanceLabel(
                        selectedCustomer
                      ).text}
                    </Text>

                  )}

                </View>

              </View>


              <TouchableOpacity

                onPress={() => {

                  setSelectedCustomer(
                    null
                  );

                  setNewPhone(
                    ''
                  );

                }}

                style={
                  styles.changeButton
                }

                activeOpacity={
                  0.7
                }
              >

                <Text
                  style={
                    styles.changeButtonText
                  }
                >
                  Change
                </Text>

              </TouchableOpacity>

            </View>

          )}


          {/* ==================================================
              NEW CUSTOMER WHATSAPP
              ================================================== */}

          {selectedCustomer?.isNew && (

            <View
              style={
                styles.phoneCard
              }
            >

              <View
                style={
                  styles.phoneIcon
                }
              >

                <Text
                  style={
                    styles.phoneIconText
                  }
                >
                  ◉
                </Text>

              </View>


              <View
                style={
                  styles.phoneInfo
                }
              >

                <Text
                  style={
                    styles.phoneTitle
                  }
                >
                  WhatsApp number
                </Text>


                <Text
                  style={
                    styles.phoneSubtitle
                  }
                >
                  Optional — useful for sending receipts.
                </Text>


                <TextInput

                  style={
                    styles.phoneInput
                  }

                  placeholder="10-digit mobile number"

                  placeholderTextColor={
                    COLORS.mutedLight
                  }

                  keyboardType="phone-pad"

                  maxLength={
                    10
                  }

                  value={
                    newPhone
                  }

                  onChangeText={
                    setNewPhone
                  }

                />

              </View>

            </View>

          )}


          {/* ==================================================
              STEP 2
              ================================================== */}

          {selectedCustomer && (

            <>

              <View
                style={
                  styles.stepHeader
                }
              >

                <View
                  style={
                    styles.stepNumber
                  }
                >

                  <Text
                    style={
                      styles.stepNumberText
                    }
                  >
                    2
                  </Text>

                </View>


                <View>

                  <Text
                    style={
                      styles.stepTitle
                    }
                  >
                    Amount
                  </Text>


                  <Text
                    style={
                      styles.stepSubtitle
                    }
                  >
                    How much?
                  </Text>

                </View>

              </View>


              {/* PRESET AMOUNTS */}

              <View
                style={
                  styles.amountGrid
                }
              >

                {PRESET_AMOUNTS.map(
                  value => (

                    <TouchableOpacity

                      key={
                        value
                      }

                      style={[
                        styles.amountButton,

                        amount ===
                          value &&
                          styles.amountButtonActive,
                      ]}

                      onPress={() =>
                        handlePresetTap(
                          value
                        )
                      }

                      activeOpacity={
                        0.8
                      }
                    >

                      <Text
                        style={[
                          styles.amountButtonText,

                          amount ===
                            value &&
                            styles.amountButtonTextActive,
                        ]}
                      >
                        ₹{value}
                      </Text>

                    </TouchableOpacity>

                  )
                )}


                <TouchableOpacity

                  style={[
                    styles.amountButton,

                    showCustomInput &&
                      styles.amountButtonActive,
                  ]}

                  onPress={() =>
                    setShowCustomInput(
                      true
                    )
                  }

                  activeOpacity={
                    0.8
                  }
                >

                  <Text
                    style={[
                      styles.amountButtonText,

                      showCustomInput &&
                        styles.amountButtonTextActive,
                    ]}
                  >
                    Custom
                  </Text>

                </TouchableOpacity>

              </View>


              {/* CUSTOM AMOUNT */}

              {showCustomInput && (

                <View
                  style={
                    styles.customAmountCard
                  }
                >

                  <View
                    style={
                      styles.customAmountInputWrap
                    }
                  >

                    <Text
                      style={
                        styles.rupeeSymbol
                      }
                    >
                      ₹
                    </Text>


                    <TextInput

                      style={
                        styles.customAmountInput
                      }

                      placeholder="Enter amount"

                      placeholderTextColor={
                        COLORS.mutedLight
                      }

                      keyboardType="decimal-pad"

                      value={
                        customAmount
                      }

                      onChangeText={
                        setCustomAmount
                      }

                      autoFocus

                    />

                  </View>


                  <TouchableOpacity

                    style={
                      styles.setAmountButton
                    }

                    onPress={
                      handleCustomConfirm
                    }

                    activeOpacity={
                      0.8
                    }
                  >

                    <Text
                      style={
                        styles.setAmountText
                      }
                    >
                      Set
                    </Text>

                  </TouchableOpacity>

                </View>

              )}


              {/* SELECTED AMOUNT */}

              {amount && (

                <View
                  style={
                    styles.amountPreview
                  }
                >

                  <Text
                    style={
                      styles.amountPreviewLabel
                    }
                  >
                    ENTRY AMOUNT
                  </Text>


                  <Text
                    style={
                      styles.amountPreviewValue
                    }
                  >
                    ₹{Number(amount).toLocaleString('en-IN')}
                  </Text>

                </View>

              )}


              {/* ==================================================
                  STEP 3
                  ================================================== */}

              <View
                style={
                  styles.stepHeader
                }
              >

                <View
                  style={
                    styles.stepNumber
                  }
                >

                  <Text
                    style={
                      styles.stepNumberText
                    }
                  >
                    3
                  </Text>

                </View>


                <View>

                  <Text
                    style={
                      styles.stepTitle
                    }
                  >
                    Transaction type
                  </Text>


                  <Text
                    style={
                      styles.stepSubtitle
                    }
                  >
                    What happened?
                  </Text>

                </View>

              </View>


              <View
                style={
                  styles.typeContainer
                }
              >

                {/* UDHAR */}

                <TouchableOpacity

                  style={[
                    styles.typeCard,

                    entryType ===
                      'CREDIT' &&
                      styles.typeCardCreditActive,
                  ]}

                  onPress={() =>
                    setEntryType(
                      'CREDIT'
                    )
                  }

                  activeOpacity={
                    0.82
                  }
                >

                  <View
                    style={[
                      styles.typeIcon,

                      entryType ===
                        'CREDIT' &&
                        styles.typeIconCreditActive,
                    ]}
                  >

                    <Text
                      style={
                        styles.typeIconText
                      }
                    >
                      ↑
                    </Text>

                  </View>


                  <View
                    style={
                      styles.typeInfo
                    }
                  >

                    <Text
                      style={[
                        styles.typeTitle,

                        entryType ===
                          'CREDIT' &&
                          styles.typeTitleActive,
                      ]}
                    >
                      Udhaar
                    </Text>


                    <Text
                      style={
                        styles.typeDescription
                      }
                    >
                      Customer will pay later
                    </Text>

                  </View>


                  {entryType ===
                    'CREDIT' && (

                    <View
                      style={
                        styles.checkCircle
                      }
                    >

                      <Text
                        style={
                          styles.checkText
                        }
                      >
                        ✓
                      </Text>

                    </View>

                  )}

                </TouchableOpacity>


                {/* PAYMENT */}

                <TouchableOpacity

                  style={[
                    styles.typeCard,

                    entryType ===
                      'PAYMENT' &&
                      styles.typeCardPaymentActive,
                  ]}

                  onPress={() =>
                    setEntryType(
                      'PAYMENT'
                    )
                  }

                  activeOpacity={
                    0.82
                  }
                >

                  <View
                    style={[
                      styles.typeIcon,

                      entryType ===
                        'PAYMENT' &&
                        styles.typeIconPaymentActive,
                    ]}
                  >

                    <Text
                      style={
                        styles.typeIconText
                      }
                    >
                      ↓
                    </Text>

                  </View>


                  <View
                    style={
                      styles.typeInfo
                    }
                  >

                    <Text
                      style={[
                        styles.typeTitle,

                        entryType ===
                          'PAYMENT' &&
                          styles.typeTitleActive,
                      ]}
                    >
                      Payment received
                    </Text>


                    <Text
                      style={
                        styles.typeDescription
                      }
                    >
                      Customer paid money
                    </Text>

                  </View>


                  {entryType ===
                    'PAYMENT' && (

                    <View
                      style={[
                        styles.checkCircle,

                        styles.checkCirclePayment,
                      ]}
                    >

                      <Text
                        style={
                          styles.checkText
                        }
                      >
                        ✓
                      </Text>

                    </View>

                  )}

                </TouchableOpacity>

              </View>


              {/* ==================================================
                  FINAL PREVIEW
                  ================================================== */}

              {canSave && (

                <View
                  style={
                    styles.finalPreview
                  }
                >

                  <View
                    style={
                      styles.finalPreviewTop
                    }
                  >

                    <Text
                      style={
                        styles.finalPreviewLabel
                      }
                    >
                      READY TO SAVE
                    </Text>


                    <Text
                      style={
                        styles.finalPreviewAmount
                      }
                    >
                      ₹{Number(amount).toLocaleString('en-IN')}
                    </Text>

                  </View>


                  <Text
                    style={
                      styles.finalPreviewText
                    }
                  >
                    {entryType ===
                    'CREDIT'
                      ? 'Udhaar added for'
                      : 'Payment received from'}{' '}
                    <Text
                      style={
                        styles.finalPreviewName
                      }
                    >
                      {
                        selectedCustomer.name
                      }
                    </Text>
                  </Text>

                </View>

              )}

            </>

          )}

          <View
            style={
              styles.bottomSpace
            }
          />

        </ScrollView>


        {/* ======================================================
            SAVE FOOTER
            ====================================================== */}

        <View
          style={
            styles.footer
          }
        >

          <TouchableOpacity

            style={[
              styles.saveButton,

              !canSave &&
                styles.saveButtonDisabled,
            ]}

            onPress={
              handleSave
            }

            disabled={
              !canSave
            }

            activeOpacity={
              0.86
            }
          >

            {isSaving ? (

              <ActivityIndicator
                color={
                  COLORS.white
                }
              />

            ) : (

              <>

                <View
                  style={
                    styles.saveButtonIcon
                  }
                >

                  <Text
                    style={
                      styles.saveButtonIconText
                    }
                  >
                    ✓
                  </Text>

                </View>


                <Text
                  style={
                    styles.saveButtonText
                  }
                >
                  Save entry
                </Text>


                <Text
                  style={
                    styles.saveButtonArrow
                  }
                >
                  →
                </Text>

              </>

            )}

          </TouchableOpacity>

        </View>

      </View>

    </KeyboardAvoidingView>
  );
};


/* ============================================================
 * STYLES
 * ============================================================ */

const styles =
  StyleSheet.create({

    /* ========================================================
       BASE
       ======================================================== */

    keyboardContainer: {
      flex: 1,

      backgroundColor:
        COLORS.background,
    },


    container: {
      flex: 1,

      backgroundColor:
        COLORS.background,
    },


    scroll: {
      flex: 1,
    },


    scrollContent: {
      paddingTop: 6,

      paddingBottom: 20,
    },


    bottomSpace: {
      height: 16,
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

      marginBottom: 18,
    },


    headerLeft: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },


    headerMark: {
      width: 38,

      height: 38,

      borderRadius: 12,

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


    eyebrow: {
      color:
        COLORS.green,

      fontSize: 7,

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

      borderRadius: 10,

      backgroundColor:
        COLORS.surface,

      borderWidth: 1,

      borderColor:
        COLORS.border,
    },


    closeBtnText: {
      color:
        COLORS.muted,

      fontSize: 9,

      fontWeight:
        '800',
    },


    /* ========================================================
       INFO
       ======================================================== */

    infoCard: {
      flexDirection:
        'row',

      alignItems:
        'center',

      backgroundColor:
        COLORS.greenSoft,

      borderRadius: 16,

      padding: 13,

      marginBottom: 21,
    },


    infoIcon: {
      width: 38,

      height: 38,

      borderRadius: 12,

      backgroundColor:
        COLORS.white,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 10,
    },


    infoIconText: {
      color:
        COLORS.green,

      fontSize: 16,

      fontWeight:
        '900',
    },


    infoTextWrap: {
      flex: 1,
    },


    infoTitle: {
      color:
        '#385126',

      fontSize: 10,

      fontWeight:
        '900',

      marginBottom: 2,
    },


    infoSubtitle: {
      color:
        '#718360',

      fontSize: 8,

      lineHeight: 12,

      fontWeight:
        '600',
    },


    /* ========================================================
       STEPS
       ======================================================== */

    stepHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      marginBottom: 10,

      marginTop: 2,
    },


    stepNumber: {
      width: 28,

      height: 28,

      borderRadius: 9,

      backgroundColor:
        COLORS.ink,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 9,
    },


    stepNumberText: {
      color:
        '#DFFFAD',

      fontSize: 10,

      fontWeight:
        '900',
    },


    stepTitle: {
      color:
        COLORS.ink,

      fontSize: 12,

      fontWeight:
        '900',
    },


    stepSubtitle: {
      color:
        COLORS.muted,

      fontSize: 7.5,

      fontWeight:
        '600',

      marginTop: 1,
    },


    /* ========================================================
       SEARCH
       ======================================================== */

    searchShell: {
      minHeight: 52,

      backgroundColor:
        COLORS.surface,

      borderRadius: 14,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      flexDirection:
        'row',

      alignItems:
        'center',

      paddingHorizontal: 10,

      marginBottom: 9,
    },


    searchIcon: {
      width: 28,

      height: 28,

      borderRadius: 9,

      backgroundColor:
        COLORS.surfaceSoft,

      color:
        COLORS.green,

      fontSize: 18,

      fontWeight:
        '700',

      textAlign:
        'center',

      textAlignVertical:
        'center',

      marginRight: 8,
    },


    searchInput: {
      flex: 1,

      color:
        COLORS.ink,

      fontSize: 11,

      fontWeight:
        '600',

      minHeight: 50,

      paddingVertical: 8,

      paddingHorizontal: 0,
    },


    /* ========================================================
       CUSTOMER LIST
       ======================================================== */

    customerListCard: {
      backgroundColor:
        COLORS.surface,

      borderRadius: 15,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      overflow:
        'hidden',

      marginBottom: 14,
    },


    customerRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      paddingHorizontal: 11,

      paddingVertical: 11,

      borderBottomWidth: 1,

      borderBottomColor:
        COLORS.borderSoft,
    },


    customerAvatar: {
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


    customerAvatarText: {
      color:
        COLORS.greenDark,

      fontSize: 11,

      fontWeight:
        '900',
    },


    customerInfo: {
      flex: 1,

      minWidth: 0,
    },


    customerName: {
      color:
        COLORS.ink,

      fontSize: 10,

      fontWeight:
        '800',

      marginBottom: 3,
    },


    customerMeta: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },


    customerPhone: {
      color:
        COLORS.muted,

      fontSize: 7,

      fontWeight:
        '600',

      maxWidth: 110,
    },


    metaDot: {
      width: 3,

      height: 3,

      borderRadius: 3,

      backgroundColor:
        COLORS.border,

      marginHorizontal: 5,
    },


    balanceOwes: {
      color:
        COLORS.red,

      fontSize: 7,

      fontWeight:
        '800',
    },


    balanceAdvance: {
      color:
        COLORS.blue,

      fontSize: 7,

      fontWeight:
        '800',
    },


    balanceSettled: {
      color:
        COLORS.green,

      fontSize: 7,

      fontWeight:
        '800',
    },


    customerArrow: {
      color:
        COLORS.mutedLight,

      fontSize: 22,

      fontWeight:
        '300',

      marginLeft: 5,
    },


    emptyCustomers: {
      alignItems:
        'center',

      paddingVertical: 20,

      paddingHorizontal: 15,
    },


    emptyIcon: {
      fontSize: 21,

      marginBottom: 5,
    },


    emptyTitle: {
      color:
        COLORS.ink,

      fontSize: 10,

      fontWeight:
        '800',
    },


    emptySubtitle: {
      color:
        COLORS.muted,

      fontSize: 7.5,

      textAlign:
        'center',

      marginTop: 3,
    },


    /* ========================================================
       NEW CUSTOMER
       ======================================================== */

    newCustomerButton: {
      flexDirection:
        'row',

      alignItems:
        'center',

      padding: 11,

      backgroundColor:
        '#F8FBF6',

      borderTopWidth: 1,

      borderTopColor:
        COLORS.borderSoft,
    },


    newCustomerIcon: {
      width: 32,

      height: 32,

      borderRadius: 10,

      backgroundColor:
        COLORS.greenSoft,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 9,
    },


    newCustomerIconText: {
      color:
        COLORS.green,

      fontSize: 17,

      fontWeight:
        '500',
    },


    newCustomerInfo: {
      flex: 1,
    },


    newCustomerTitle: {
      color:
        COLORS.greenDark,

      fontSize: 9,

      fontWeight:
        '900',
    },


    newCustomerName: {
      color:
        COLORS.muted,

      fontSize: 8,

      fontWeight:
        '600',

      marginTop: 2,
    },


    newCustomerArrow: {
      color:
        COLORS.green,

      fontSize: 18,

      fontWeight:
        '400',
    },


    /* ========================================================
       SELECTED CUSTOMER
       ======================================================== */

    selectedCard: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      backgroundColor:
        COLORS.ink,

      borderRadius: 16,

      padding: 12,

      marginBottom: 14,
    },


    selectedLeft: {
      flexDirection:
        'row',

      alignItems:
        'center',

      flex: 1,

      minWidth: 0,
    },


    selectedAvatar: {
      width: 39,

      height: 39,

      borderRadius: 13,

      backgroundColor:
        '#DFFFAD',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 9,
    },


    selectedAvatarText: {
      color:
        COLORS.ink,

      fontSize: 13,

      fontWeight:
        '900',
    },


    selectedInfo: {
      flex: 1,

      minWidth: 0,
    },


    selectedNameRow: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },


    selectedName: {
      color:
        COLORS.white,

      fontSize: 11,

      fontWeight:
        '900',

      maxWidth: 150,
    },


    newBadge: {
      backgroundColor:
        '#DFFFAD',

      borderRadius: 5,

      paddingHorizontal: 5,

      paddingVertical: 2,

      marginLeft: 5,
    },


    newBadgeText: {
      color:
        COLORS.ink,

      fontSize: 5.5,

      fontWeight:
        '900',

      letterSpacing:
        0.7,
    },


    selectedBalance: {
      color:
        '#B9C5B9',

      fontSize: 7.5,

      fontWeight:
        '600',

      marginTop: 3,
    },


    changeButton: {
      borderWidth: 1,

      borderColor:
        '#4A554B',

      borderRadius: 8,

      paddingVertical: 7,

      paddingHorizontal: 9,

      marginLeft: 8,
    },


    changeButtonText: {
      color:
        '#DFFFAD',

      fontSize: 7,

      fontWeight:
        '800',
    },


    /* ========================================================
       PHONE
       ======================================================== */

    phoneCard: {
      flexDirection:
        'row',

      backgroundColor:
        COLORS.surface,

      borderRadius: 15,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      padding: 11,

      marginBottom: 16,
    },


    phoneIcon: {
      width: 33,

      height: 33,

      borderRadius: 10,

      backgroundColor:
        COLORS.greenSoft,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 9,
    },


    phoneIconText: {
      color:
        COLORS.green,

      fontSize: 12,

      fontWeight:
        '900',
    },


    phoneInfo: {
      flex: 1,
    },


    phoneTitle: {
      color:
        COLORS.ink,

      fontSize: 9,

      fontWeight:
        '900',
    },


    phoneSubtitle: {
      color:
        COLORS.muted,

      fontSize: 7,

      marginTop: 2,

      marginBottom: 7,
    },


    phoneInput: {
      minHeight: 42,

      backgroundColor:
        COLORS.surfaceSoft,

      borderRadius: 10,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      color:
        COLORS.ink,

      fontSize: 10,

      fontWeight:
        '700',

      paddingHorizontal: 10,

      paddingVertical: 7,
    },


    /* ========================================================
       AMOUNT
       ======================================================== */

    amountGrid: {
      flexDirection:
        'row',

      flexWrap:
        'wrap',

      gap: 8,

      marginBottom: 9,
    },


    amountButton: {
      minWidth: 68,

      minHeight: 43,

      paddingHorizontal: 13,

      borderRadius: 11,

      backgroundColor:
        COLORS.surface,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      alignItems:
        'center',

      justifyContent:
        'center',
    },


    amountButtonActive: {
      backgroundColor:
        COLORS.green,

      borderColor:
        COLORS.green,
    },


    amountButtonText: {
      color:
        COLORS.text,

      fontSize: 9.5,

      fontWeight:
        '900',
    },


    amountButtonTextActive: {
      color:
        COLORS.white,
    },


    customAmountCard: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 8,

      marginBottom: 9,
    },


    customAmountInputWrap: {
      flex: 1,

      minHeight: 49,

      backgroundColor:
        COLORS.surface,

      borderRadius: 12,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      flexDirection:
        'row',

      alignItems:
        'center',

      paddingHorizontal: 10,
    },


    rupeeSymbol: {
      color:
        COLORS.green,

      fontSize: 16,

      fontWeight:
        '900',

      marginRight: 6,
    },


    customAmountInput: {
      flex: 1,

      color:
        COLORS.ink,

      fontSize: 12,

      fontWeight:
        '800',

      minHeight: 47,

      paddingVertical: 5,
    },


    setAmountButton: {
      minHeight: 49,

      paddingHorizontal: 17,

      borderRadius: 12,

      backgroundColor:
        COLORS.green,

      alignItems:
        'center',

      justifyContent:
        'center',
    },


    setAmountText: {
      color:
        COLORS.white,

      fontSize: 9,

      fontWeight:
        '900',
    },


    amountPreview: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      backgroundColor:
        COLORS.greenSoft,

      borderRadius: 12,

      paddingHorizontal: 12,

      paddingVertical: 9,

      marginBottom: 4,
    },


    amountPreviewLabel: {
      color:
        '#718360',

      fontSize: 6.5,

      fontWeight:
        '900',

      letterSpacing:
        1,
    },


    amountPreviewValue: {
      color:
        COLORS.greenDark,

      fontSize: 14,

      fontWeight:
        '900',
    },


    /* ========================================================
       TRANSACTION TYPE
       ======================================================== */

    typeContainer: {
      gap: 9,
    },


    typeCard: {
      flexDirection:
        'row',

      alignItems:
        'center',

      backgroundColor:
        COLORS.surface,

      borderRadius: 15,

      borderWidth: 1,

      borderColor:
        COLORS.border,

      padding: 11,

      minHeight: 67,
    },


    typeCardCreditActive: {
      backgroundColor:
        COLORS.redSoft,

      borderColor:
        '#E7A8A2',
    },


    typeCardPaymentActive: {
      backgroundColor:
        COLORS.greenSoft,

      borderColor:
        '#B7D59C',
    },


    typeIcon: {
      width: 39,

      height: 39,

      borderRadius: 12,

      backgroundColor:
        COLORS.surfaceSoft,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 10,
    },


    typeIconCreditActive: {
      backgroundColor:
        '#FADCD8',
    },


    typeIconPaymentActive: {
      backgroundColor:
        '#D9EBCB',
    },


    typeIconText: {
      color:
        COLORS.muted,

      fontSize: 18,

      fontWeight:
        '800',
    },


    typeInfo: {
      flex: 1,
    },


    typeTitle: {
      color:
        COLORS.ink,

      fontSize: 10,

      fontWeight:
        '900',
    },


    typeTitleActive: {
      color:
        COLORS.ink,
    },


    typeDescription: {
      color:
        COLORS.muted,

      fontSize: 7.5,

      fontWeight:
        '600',

      marginTop: 3,
    },


    checkCircle: {
      width: 24,

      height: 24,

      borderRadius: 12,

      backgroundColor:
        COLORS.red,

      alignItems:
        'center',

      justifyContent:
        'center',
    },


    checkCirclePayment: {
      backgroundColor:
        COLORS.green,
    },


    checkText: {
      color:
        COLORS.white,

      fontSize: 11,

      fontWeight:
        '900',
    },


    /* ========================================================
       FINAL PREVIEW
       ======================================================== */

    finalPreview: {
      backgroundColor:
        COLORS.ink,

      borderRadius: 15,

      padding: 13,

      marginTop: 14,
    },


    finalPreviewTop: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      marginBottom: 4,
    },


    finalPreviewLabel: {
      color:
        '#9CA99D',

      fontSize: 6.5,

      fontWeight:
        '900',

      letterSpacing:
        1,
    },


    finalPreviewAmount: {
      color:
        '#DFFFAD',

      fontSize: 17,

      fontWeight:
        '900',
    },


    finalPreviewText: {
      color:
        '#C2CCC3',

      fontSize: 8,

      fontWeight:
        '600',
    },


    finalPreviewName: {
      color:
        COLORS.white,

      fontWeight:
        '900',
    },


    /* ========================================================
       FOOTER
       ======================================================== */

    footer: {
      paddingTop: 9,

      backgroundColor:
        COLORS.background,
    },


    saveButton: {
      minHeight: 57,

      borderRadius: 16,

      backgroundColor:
        COLORS.green,

      flexDirection:
        'row',

      alignItems:
        'center',

      paddingHorizontal: 15,

      shadowColor:
        COLORS.greenDark,

      shadowOffset: {
        width: 0,

        height: 5,
      },

      shadowOpacity:
        0.18,

      shadowRadius:
        9,

      elevation: 3,
    },


    saveButtonDisabled: {
      backgroundColor:
        '#CBD2CC',

      shadowOpacity:
        0,

      elevation: 0,
    },


    saveButtonIcon: {
      width: 29,

      height: 29,

      borderRadius: 9,

      backgroundColor:
        'rgba(255,255,255,0.18)',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 9,
    },


    saveButtonIconText: {
      color:
        COLORS.white,

      fontSize: 12,

      fontWeight:
        '900',
    },


    saveButtonText: {
      flex: 1,

      color:
        COLORS.white,

      fontSize: 11,

      fontWeight:
        '900',
    },


    saveButtonArrow: {
      color:
        COLORS.white,

      fontSize: 21,

      fontWeight:
        '300',
    },

  });


export default ManualEntryScreen;