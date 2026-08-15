import React, { useState, useEffect, useMemo } from 'react';
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
  useWindowDimensions,
} from 'react-native';

import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TelemetryService from '../services/TelemetryService';
import { requireCurrentUserId } from '../core/auth/localUser'; // 🚀 Added user ownership isolation[cite: 20]

const PRESET_AMOUNTS = [50, 100, 200, 500, 1000];

// Same shared entry point as the voice flow: builds a distinct,
// balance-aware customer list from ledger_entries so both paths
// see the same data for the current user only.
async function loadCustomers() {
  const ownerId = await requireCurrentUserId(); // 🚀 Isolated by user[cite: 20]
  const entries = await database
    .get('ledger_entries')
    .query(
      Q.where('owner_id', ownerId) // 🚀 Filter by owner_id[cite: 20]
    )
    .fetch();

  const byName = {};

  entries.forEach(e => {
    const key = e.customerId.toLowerCase();

    if (!byName[key]) {
      byName[key] = {
        name: e.customerId,
        phone: e.customerPhone || '',
        balance: 0,
      };
    }

    if (e.entryType === 'CREDIT') {
      byName[key].balance += e.amount;
    }

    if (e.entryType === 'PAYMENT') {
      byName[key].balance -= e.amount;
    }

    if (e.customerPhone) {
      byName[key].phone = e.customerPhone;
    }
  });

  return Object.values(byName).sort(
    (a, b) =>
      a.name.localeCompare(b.name)
  );
}

// Same shape used by the voice flow.
function buildEntry({
  customer,
  isNewCustomer,
  amount,
  type,
  phone,
}) {
  return {
    customerName: customer,
    matchedCustomer: isNewCustomer
      ? null
      : { name: customer },
    amount,
    type,
    customerPhone: phone || '',
  };
}

const ManualEntryScreen = ({
  onClose,
  onSaved,
  initialQuery = '',
}) => {
  const insets = useSafeAreaInsets();

  const {
    height: windowHeight,
    width: windowWidth,
  } = useWindowDimensions();

  /*
   * Responsive customer list.
   *
   * Small phones get less list height so the amount/type/footer
   * don't get pushed off-screen.
   *
   * Large phones/tablets can use more space.
   */
  const customerListMaxHeight =
    Math.min(
      220,
      Math.max(
        120,
        Math.round(windowHeight * 0.28)
      )
    );

  /*
   * Very narrow phones need slightly smaller horizontal
   * padding so the UI doesn't become cramped.
   */
  const horizontalPadding =
    windowWidth < 360 ? 14 : 20;

  const [allCustomers, setAllCustomers] =
    useState([]);

  const [searchQuery, setSearchQuery] =
    useState(initialQuery);

  const [selectedCustomer, setSelectedCustomer] =
    useState(null);

  const [newPhone, setNewPhone] =
    useState('');

  const [amount, setAmount] =
    useState(null);

  const [customAmount, setCustomAmount] =
    useState('');

  const [showCustomInput, setShowCustomInput] =
    useState(false);

  const [entryType, setEntryType] =
    useState(null);

  const [isSaving, setIsSaving] =
    useState(false);

  useEffect(() => {
    loadCustomers().then(
      setAllCustomers
    );
  }, []);

  const filteredCustomers =
    useMemo(() => {
      if (!searchQuery.trim()) {
        return allCustomers.slice(0, 20);
      }

      const q =
        searchQuery.toLowerCase();

      return allCustomers.filter(
        c =>
          c.name
            .toLowerCase()
            .includes(q)
      );
    }, [
      searchQuery,
      allCustomers,
    ]);

  const exactMatchExists =
    allCustomers.some(
      c =>
        c.name.toLowerCase() ===
        searchQuery
          .trim()
          .toLowerCase()
    );

  const handleSelectCustomer =
    customer => {
      setSelectedCustomer(
        customer
      );

      setSearchQuery(
        customer.name
      );
    };

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
    };

  const handlePresetTap =
    value => {
      setAmount(value);
      setShowCustomInput(false);
      setCustomAmount('');
    };

  const handleCustomConfirm =
    () => {
      const value =
        parseFloat(
          customAmount
        );

      if (!value || value <= 0) {
        Alert.alert(
          'Invalid amount',
          'Enter an amount greater than 0.'
        );
        return;
      }

      setAmount(value);
      setShowCustomInput(false);
    };

  const canSave =
    selectedCustomer &&
    amount &&
    entryType &&
    !isSaving;

  const handleSave =
    async () => {
      if (!canSave) {
        return;
      }

      setIsSaving(true);

      const entry =
        buildEntry({
          customer:
            selectedCustomer.name,
          isNewCustomer:
            !!selectedCustomer.isNew,
          amount,
          type: entryType,
          phone:
            selectedCustomer.isNew
              ? newPhone
              : selectedCustomer.phone,
        });

      try {
        const ownerId = await requireCurrentUserId(); // 🚀 Isolated by user[cite: 20]

        await database.write(
          async () => {
            await database
              .get('ledger_entries')
              .create(e => {
                e.ownerId = ownerId; // 🚀 Assign owner_id[cite: 20]

                e.customerId =
                  entry.customerName;

                e.amount =
                  entry.amount;

                e.entryType =
                  entry.type;

                e.customerPhone =
                  entry.customerPhone;

                e.isSynced =
                  false;

                e.createdAt =
                  Date.now();
              });
          }
        );

        onSaved &&
          onSaved(entry);

        onClose &&
          onClose();

        // Track successful manual entry.
        TelemetryService.trackEvent(
          'manual_entry_created',
          'khata',
          {
            type: entryType,
            amount: amount,
          }
        );
      } catch (error) {
        Alert.alert(
          'Could not save',
          error.message
        );
      } finally {
        setIsSaving(false);
      }
    };

  return (
    <KeyboardAvoidingView
      style={
        styles.keyboardContainer
      }
      behavior={
        Platform.OS === 'ios'
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

        {/* Header */}

        <View
          style={
            styles.headerRow
          }
        >
          <Text
            style={
              styles.header
            }
          >
            Add entry
          </Text>

          <TouchableOpacity
            onPress={onClose}
            style={
              styles.closeBtn
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

        {/* Step 1: Customer */}

        <Text
          style={
            styles.label
          }
        >
          Customer
        </Text>

        <TextInput
          style={
            styles.searchInput
          }
          placeholder="Search or type a name"
          placeholderTextColor="#8b949e"
          value={searchQuery}
          onChangeText={text => {
            setSearchQuery(text);
            setSelectedCustomer(
              null
            );
          }}
          returnKeyType="done"
        />

        {!selectedCustomer && (
          <FlatList
            style={[
              styles.customerList,
              {
                maxHeight:
                  customerListMaxHeight,
              },
            ]}
            data={
              filteredCustomers
            }
            keyExtractor={
              item => item.name
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
            ListFooterComponent={
              searchQuery.trim() &&
              !exactMatchExists ? (
                <TouchableOpacity
                  style={
                    styles.newCustomerRow
                  }
                  onPress={
                    handleUseNewName
                  }
                >
                  <Text
                    style={
                      styles.newCustomerText
                    }
                  >
                    + Add new customer "
                    {
                      searchQuery.trim()
                    }
                    "
                  </Text>
                </TouchableOpacity>
              ) : null
            }
            renderItem={({
              item,
            }) => (
              <TouchableOpacity
                style={
                  styles.customerRow
                }
                onPress={() =>
                  handleSelectCustomer(
                    item
                  )
                }
              >
                <Text
                  style={
                    styles.customerName
                  }
                >
                  {item.name}
                </Text>

                <Text
                  style={[
                    styles.customerBalance,
                    item.balance >
                      0 &&
                      styles.owesText,
                  ]}
                >
                  {item.balance >
                  0
                    ? `Owes ₹${item.balance.toFixed(
                        0
                      )}`
                    : item.balance <
                      0
                    ? `Advance ₹${Math.abs(
                        item.balance
                      ).toFixed(0)}`
                    : 'Settled'}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}

        {/* New customer phone */}

        {selectedCustomer?.isNew && (
          <TextInput
            style={
              styles.searchInput
            }
            placeholder="WhatsApp number (optional)"
            placeholderTextColor="#8b949e"
            keyboardType="numeric"
            maxLength={10}
            value={newPhone}
            onChangeText={
              setNewPhone
            }
          />
        )}

        {selectedCustomer && (
          <>
            {/* Step 2: Amount */}

            <Text
              style={
                styles.label
              }
            >
              Amount
            </Text>

            <View
              style={
                styles.presetRow
              }
            >
              {PRESET_AMOUNTS.map(
                value => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.presetBtn,
                      amount ===
                        value &&
                        styles.presetBtnActive,
                    ]}
                    onPress={() =>
                      handlePresetTap(
                        value
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.presetBtnText,
                        amount ===
                          value &&
                          styles.presetBtnTextActive,
                      ]}
                    >
                      ₹{value}
                    </Text>
                  </TouchableOpacity>
                )
              )}

              <TouchableOpacity
                style={[
                  styles.presetBtn,
                  showCustomInput &&
                    styles.presetBtnActive,
                ]}
                onPress={() =>
                  setShowCustomInput(
                    true
                  )
                }
              >
                <Text
                  style={[
                    styles.presetBtnText,
                    showCustomInput &&
                      styles.presetBtnTextActive,
                  ]}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>

            {showCustomInput && (
              <View
                style={
                  styles.customRow
                }
              >
                <TextInput
                  style={[
                    styles.searchInput,
                    {
                      flex: 1,
                    },
                  ]}
                  placeholder="Enter amount"
                  placeholderTextColor="#8b949e"
                  keyboardType="numeric"
                  value={
                    customAmount
                  }
                  onChangeText={
                    setCustomAmount
                  }
                  autoFocus
                />

                <TouchableOpacity
                  style={
                    styles.customConfirmBtn
                  }
                  onPress={
                    handleCustomConfirm
                  }
                >
                  <Text
                    style={
                      styles.customConfirmText
                    }
                  >
                    Set
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 3: Type */}

            <Text
              style={
                styles.label
              }
            >
              Type
            </Text>

            <View
              style={
                styles.typeRow
              }
            >
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  entryType ===
                    'CREDIT' &&
                    styles.typeBtnCredit,
                ]}
                onPress={() =>
                  setEntryType(
                    'CREDIT'
                  )
                }
              >
                <Text
                  style={[
                    styles.typeBtnText,
                    entryType ===
                      'CREDIT' &&
                      styles.typeBtnTextActive,
                  ]}
                >
                  Udhaar (gave credit)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  entryType ===
                    'PAYMENT' &&
                    styles.typeBtnPayment,
                ]}
                onPress={() =>
                  setEntryType(
                    'PAYMENT'
                  )
                }
              >
                <Text
                  style={[
                    styles.typeBtnText,
                    entryType ===
                      'PAYMENT' &&
                      styles.typeBtnTextActive,
                  ]}
                >
                  Payment (received)
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Summary + Save */}

        <View
          style={
            styles.footer
          }
        >
          {canSave && (
            <Text
              style={
                styles.summaryText
              }
              numberOfLines={2}
            >
              ₹{amount}{' '}
              {entryType ===
              'CREDIT'
                ? 'udhaar for'
                : 'received from'}{' '}
              {
                selectedCustomer.name
              }
            </Text>
          )}

          <TouchableOpacity
            style={[
              styles.saveBtn,
              !canSave &&
                styles.saveBtnDisabled,
            ]}
            onPress={
              handleSave
            }
            disabled={!canSave}
            activeOpacity={
              0.85
            }
          >
            <Text
              style={
                styles.saveBtnText
              }
            >
              {isSaving
                ? 'Saving...'
                : 'Save entry'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#0d1117',
  },

  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },

  header: {
    fontSize: 24,
    color: '#e6edf3',
    fontWeight: 'bold',
  },

  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#21262d',
    borderRadius: 8,
  },

  closeBtnText: {
    color: '#c9d1d9',
    fontWeight: '600',
  },

  label: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 8,
  },

  searchInput: {
    backgroundColor: '#010409',
    color: '#c9d1d9',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
    fontSize: 16,
    minHeight: 50,
  },

  customerList: {
    marginTop: 8,
  },

  customerRow: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },

  customerName: {
    color: '#e6edf3',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },

  customerBalance: {
    color: '#3fb950',
    fontSize: 13,
  },

  owesText: {
    color: '#da3633',
  },

  newCustomerRow: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },

  newCustomerText: {
    color: '#58a6ff',
    fontSize: 15,
    fontWeight: '600',
  },

  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  presetBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },

  presetBtnActive: {
    backgroundColor: '#1f6feb',
    borderColor: '#1f6feb',
  },

  presetBtnText: {
    color: '#c9d1d9',
    fontWeight: '600',
    fontSize: 15,
  },

  presetBtnTextActive: {
    color: '#fff',
  },

  customRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    alignItems: 'center',
  },

  customConfirmBtn: {
    backgroundColor: '#238636',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    minHeight: 50,
    justifyContent: 'center',
  },

  customConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
  },

  typeRow: {
    gap: 10,
  },

  typeBtn: {
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
    backgroundColor: '#161b22',
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },

  typeBtnCredit: {
    backgroundColor: '#da3633',
    borderColor: '#da3633',
  },

  typeBtnPayment: {
    backgroundColor: '#238636',
    borderColor: '#238636',
  },

  typeBtnText: {
    color: '#c9d1d9',
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'center',
  },

  typeBtnTextActive: {
    color: '#fff',
  },

  footer: {
    marginTop: 'auto',
    paddingTop: 16,
  },

  summaryText: {
    color: '#e6edf3',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },

  saveBtn: {
    backgroundColor: '#1f6feb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
  },

  saveBtnDisabled: {
    backgroundColor: '#30363d',
  },

  saveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default ManualEntryScreen;