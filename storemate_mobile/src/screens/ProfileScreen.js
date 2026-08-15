import React, { useState, useEffect, useContext } from 'react';

import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Share as RNShare,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';

import AdminDashboard from './AdminDashboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { Q } from '@nozbe/watermelondb';
import { database } from '../core/database';
import { AuthContext } from '../../App';
import Share from 'react-native-share';
import { launchImageLibrary } from 'react-native-image-picker';
import AnalyticsScreen from './AnalyticsScreen';
import { SecureStorage } from '../utils/secureStorage';
import { backupNow } from '../services/BackupService';
import { BASE_URL } from '../config/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentUserId } from '../core/auth/localUser';

const PROFILE_KEY_PREFIX = 'storemate_profile_';

const profileStorageKey = userId =>
  `${PROFILE_KEY_PREFIX}${String(userId).trim()}`;

const ProfileScreen = () => {
  const { logout } = useContext(AuthContext);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [email, setEmail] = useState('');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);
  const [upiId, setUpiId] = useState('');

  const [currentUserId, setCurrentUserId] = useState(null);

  const [showAdmin, setShowAdmin] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isFeedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /*
   * ============================================================
   * INITIAL LOAD
   * ============================================================
   */

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      await fetchProfile(mounted);
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * ============================================================
   * FETCH PROFILE
   * ============================================================
   *
   * IMPORTANT:
   *
   * Profile data is ONLY loaded from:
   *
   * storemate_profile_<currentUserId>
   *
   * We intentionally DO NOT read:
   *
   * shopName
   * userPhone
   * userAddress
   * avatarUri
   * shopUpi
   *
   * from global AsyncStorage keys.
   *
   * Those old global keys could belong to another user.
   * ============================================================
   */

  const fetchProfile = async mounted => {
    try {
      const userId = await getCurrentUserId();

      if (!userId) {
        console.warn('Profile: no active user found.');

        if (mounted) {
          setCurrentUserId(null);
          setIsLoading(false);
        }

        return;
      }

      if (mounted) {
        setCurrentUserId(userId);
      }

      const key = profileStorageKey(userId);

      let localProfile = {};

      /*
       * ========================================================
       * USER-SPECIFIC LOCAL PROFILE
       * ========================================================
       */

      const storedProfile =
        await AsyncStorage.getItem(key);

      if (storedProfile) {
        try {
          const parsed =
            JSON.parse(storedProfile);

          if (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed)
          ) {
            localProfile = parsed;
          }
        } catch (error) {
          console.warn(
            'Profile data parse failed:',
            error
          );
        }
      }

      /*
       * ========================================================
       * LOAD LOCAL DATA FIRST
       * ========================================================
       *
       * Offline-first.
       */

      const localEmail =
        String(localProfile.email || '').trim();

      const localShopName =
        String(localProfile.shopName || '').trim();

      const localPhone =
        String(localProfile.phone || '').trim();

      const localAddress =
        String(localProfile.address || '').trim();

      const localAvatar =
        localProfile.avatarUri || null;

      const localUpiId =
        String(localProfile.upiId || '').trim();

      if (mounted) {
        setEmail(localEmail);
        setShopName(localShopName);
        setPhone(localPhone);
        setAddress(localAddress);
        setAvatarUri(localAvatar);
        setUpiId(localUpiId);
      }

      /*
       * ========================================================
       * SERVER PROFILE
       * ========================================================
       *
       * Local profile is already loaded.
       *
       * Server data is only an enhancement when online.
       */

      const token =
        (await SecureStorage.getToken()) ||
        (await AsyncStorage.getItem('userToken'));

      if (!token) {
        return;
      }

      try {
        const response =
          await fetch(
            `${BASE_URL}/api/v1/auth/profile`,
            {
              method: 'GET',

              headers: {
                'Content-Type':
                  'application/json',

                Authorization:
                  `Bearer ${token}`,
              },
            }
          );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        /*
         * NEVER replace valid local values with
         * empty server values.
         */

        const updatedEmail =
          String(
            data?.email ||
              localEmail ||
              ''
          ).trim();

        const updatedShopName =
          String(
            data?.shop_name ||
              localShopName ||
              ''
          ).trim();

        const updatedPhone =
          String(
            data?.phone ||
              localPhone ||
              ''
          ).trim();

        const updatedAddress =
          String(
            data?.address ||
              localAddress ||
              ''
          ).trim();

        const updatedUpi =
          String(
            data?.upi_id ||
              localUpiId ||
              ''
          ).trim();

        const updatedAvatar =
          localAvatar;

        const updatedProfile = {
          email:
            updatedEmail,

          shopName:
            updatedShopName,

          phone:
            updatedPhone,

          address:
            updatedAddress,

          avatarUri:
            updatedAvatar,

          upiId:
            updatedUpi,
        };

        /*
         * Save ONLY under the current user's key.
         */

        await AsyncStorage.setItem(
          key,
          JSON.stringify(updatedProfile)
        );

        if (mounted) {
          setEmail(updatedEmail);
          setShopName(updatedShopName);
          setPhone(updatedPhone);
          setAddress(updatedAddress);
          setAvatarUri(updatedAvatar);
          setUpiId(updatedUpi);
        }

      } catch (serverError) {
        /*
         * No internet/server unavailable.
         *
         * This is completely valid.
         *
         * Local profile remains active.
         */

        console.log(
          'Server unavailable. Using offline profile data.'
        );
      }

    } catch (error) {
      console.error(
        'fetchProfile failed:',
        error
      );
    } finally {
      if (mounted) {
        setIsLoading(false);
      }
    }
  };

  /*
   * ============================================================
   * SAVE LOCAL PROFILE
   * ============================================================
   */

  const saveLocalProfile = async profile => {
    if (!currentUserId) {
      throw new Error(
        'No active StoreMate user.'
      );
    }

    const key =
      profileStorageKey(
        currentUserId
      );

    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        email:
          String(profile.email || '').trim(),

        shopName:
          String(profile.shopName || '').trim(),

        phone:
          String(profile.phone || '').trim(),

        address:
          String(profile.address || '').trim(),

        avatarUri:
          profile.avatarUri || null,

        upiId:
          String(profile.upiId || '').trim(),
      })
    );
  };

  /*
   * ============================================================
   * PICK AVATAR
   * ============================================================
   */

  const handlePickAvatar = async () => {
    try {
      if (!currentUserId) {
        Alert.alert(
          'Session Error',
          'No active StoreMate user was found.'
        );

        return;
      }

      const result =
        await launchImageLibrary({
          mediaType: 'photo',
          quality: 0.5,
        });

      if (
        result.didCancel ||
        result.errorCode ||
        !result.assets ||
        !result.assets.length
      ) {
        return;
      }

      const uri =
        result.assets[0]?.uri;

      if (!uri) {
        return;
      }

      setAvatarUri(uri);

      /*
       * Save immediately to THIS USER'S profile.
       */

      await saveLocalProfile({
        email,
        shopName,
        phone,
        address,
        avatarUri: uri,
        upiId,
      });

    } catch (error) {
      console.error(
        'Avatar selection failed:',
        error
      );

      Alert.alert(
        'Error',
        'Could not pick an image.'
      );
    }
  };

  /*
   * ============================================================
   * SAVE PROFILE
   * ============================================================
   */

  const handleSave = async () => {
    if (!shopName.trim()) {
      return Alert.alert(
        'Validation',
        'Shop name cannot be empty.'
      );
    }

    if (!currentUserId) {
      return Alert.alert(
        'Session Error',
        'No active StoreMate user was found. Please log in again.'
      );
    }

    setIsSaving(true);

    const profile = {
      email:
        email.trim(),

      shopName:
        shopName.trim(),

      phone:
        phone.trim(),

      address:
        address.trim(),

      avatarUri,

      upiId:
        upiId.trim(),
    };

    try {
      /*
       * ======================================================
       * OFFLINE-FIRST
       * ======================================================
       *
       * Local save ALWAYS happens first.
       */

      await saveLocalProfile(
        profile
      );

      /*
       * ======================================================
       * SERVER UPDATE
       * ======================================================
       */

      const token =
        (await SecureStorage.getToken()) ||
        (await AsyncStorage.getItem('userToken'));

      if (token) {
        try {
          const response =
            await fetch(
              `${BASE_URL}/api/v1/auth/profile`,
              {
                method: 'PUT',

                headers: {
                  'Content-Type':
                    'application/json',

                  Authorization:
                    `Bearer ${token}`,
                },

                body:
                  JSON.stringify({
                    shop_name:
                      profile.shopName,

                    phone:
                      profile.phone,

                    upi_id:
                      profile.upiId,

                    address:
                      profile.address,
                  }),
              }
            );

          if (!response.ok) {
            throw new Error(
              `Profile server update failed (${response.status})`
            );
          }

        } catch (serverError) {
          /*
           * Local profile has already been saved.
           *
           * Therefore the user does not lose data
           * when offline.
           */

          console.log(
            'Profile saved locally; server update deferred:',
            serverError.message
          );
        }
      }

      setIsEditing(false);

      Alert.alert(
        'Saved',
        'Profile updated on this device. It will sync when online.'
      );

    } catch (error) {
      console.error(
        'handleSave failed:',
        error
      );

      Alert.alert(
        'Save Failed',
        error.message ||
          'Could not save your profile.'
      );

    } finally {
      setIsSaving(false);
    }
  };

  /*
   * ============================================================
   * GOOGLE DRIVE BACKUP
   * ============================================================
   */

  const handleDriveBackup = async () => {
    if (isBackingUp) {
      return;
    }

    if (!currentUserId) {
      Alert.alert(
        'Session Error',
        'No active StoreMate user was found.'
      );

      return;
    }

    setIsBackingUp(true);

    try {
      const result =
        await backupNow();

      const profileStatus =
        result?.profileIncluded === false
          ? 'Profile: ⚠'
          : 'Profile: ✓';

      const avatarStatus =
        result?.avatarIncluded === false
          ? 'Photo: ⚠'
          : 'Photo: ✓';

      const inventoryCount =
        result?.counts?.inventory ??
        result?.inventoryCount ??
        '—';

      const ledgerCount =
        result?.counts?.ledger ??
        result?.ledgerCount ??
        '—';

      const salesCount =
        result?.counts?.sales ??
        result?.salesCount ??
        '—';

      Alert.alert(
        'Backup Successful ☁️',
        'Your shop data is safely saved to Google Drive.'
      );

    } catch (error) {
      console.error(
        'BACKUP ERROR:',
        error
      );

      Alert.alert(
        'Backup Error',
        error?.message ||
          'Failed to back up to Google Drive.'
      );

    } finally {
      setIsBackingUp(false);
    }
  };

  /*
   * ============================================================
   * CSV EXPORT
   * ============================================================
   */

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);

      if (!currentUserId) {
        throw new Error(
          'No active StoreMate user.'
        );
      }

      const ledgerEntries =
        await database
          .get('ledger_entries')
          .query(
            Q.where(
              'owner_id',
              currentUserId
            )
          )
          .fetch();

      if (
        !ledgerEntries ||
        ledgerEntries.length === 0
      ) {
        Alert.alert(
          'No Data',
          'There are no ledger entries to export yet.'
        );

        return;
      }

      const csvHeader =
        'Customer Name,Amount (INR),Entry Type,Date\n';

      const csvRows =
        ledgerEntries
          .map(entry => {
            const dateFormatted =
              new Date(
                entry.createdAt ||
                  Date.now()
              ).toLocaleDateString(
                'en-IN'
              );

            const customerName =
              String(
                entry.customerId ||
                  ''
              ).replace(
                /"/g,
                '""'
              );

            const amount =
              Number(
                entry.amount ||
                  0
              );

            const entryType =
              String(
                entry.entryType ||
                  ''
              ).replace(
                /"/g,
                '""'
              );

            return (
              `"${customerName}",` +
              `${amount},` +
              `"${entryType}",` +
              `"${dateFormatted}"`
            );
          })
          .join('\n');

      const path =
        `${RNFS.CachesDirectoryPath}/Storemate_Ledger.csv`;

      await RNFS.writeFile(
        path,
        csvHeader + csvRows,
        'utf8'
      );

      await Share.open({
        url:
          `file://${path}`,

        type:
          'text/csv',

        filename:
          'Storemate_Ledger',
      });

    } catch (error) {

      if (
        error?.message ===
        'User did not share'
      ) {
        return;
      }

      try {
        if (!currentUserId) {
          throw new Error(
            'No active StoreMate user.'
          );
        }

        const textRows =
          await database
            .get('ledger_entries')
            .query(
              Q.where(
                'owner_id',
                currentUserId
              )
            )
            .fetch();

        const simpleText =
          textRows
            .map(
              entry =>
                `${entry.customerId} | ₹${entry.amount} | ${entry.entryType}`
            )
            .join('\n');

        await RNShare.share({
          message:
            `📊 Storemate Ledger Report\n\n${simpleText}`,
        });

      } catch {
        Alert.alert(
          'Export Failed',
          'Could not open the share menu on this device.'
        );
      }

    } finally {
      setIsExporting(false);
    }
  };

  /*
   * ============================================================
   * FEEDBACK
   * ============================================================
   */

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim()) {
      return Alert.alert(
        'Empty',
        'Please type a message first.'
      );
    }

    setIsSubmitting(true);

    try {
      const userId =
        currentUserId ||
        (await AsyncStorage.getItem(
          'userEmail'
        ));

      const token =
        (await SecureStorage.getToken()) ||
        (await AsyncStorage.getItem('userToken'));

      const response =
        await fetch(
          `${BASE_URL}/api/v1/feedback`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',

              ...(token
                ? {
                    Authorization:
                      `Bearer ${token}`,
                  }
                : {}),
            },

            body:
              JSON.stringify({
                user_id:
                  userId,

                message:
                  feedbackText.trim(),
              }),
          }
        );

      if (response.ok) {
        Alert.alert(
          'Sent!',
          'Thanks for your feedback. We will look into it.'
        );

        setFeedbackText('');

        setFeedbackModalVisible(false);

      } else {
        throw new Error(
          `Failed to send (${response.status})`
        );
      }

    } catch (error) {
      Alert.alert(
        'Error',
        'Could not send feedback. Check your internet connection.'
      );

    } finally {
      setIsSubmitting(false);
    }
  };

  /*
   * ============================================================
   * LOGOUT
   * ============================================================
   */

  const handleLogout = () => {
    Alert.alert(
      'Logout',

      'Are you sure you want to securely log out of your shop?',

      [
        {
          text: 'Cancel',
          style: 'cancel',
        },

        {
          text: 'Logout',
          style: 'destructive',

          onPress: async () => {
            /*
             * AuthContext.logout() is responsible for:
             *
             * 1. clearing the active session
             * 2. clearing the token
             * 3. navigating to login
             *
             * We DO NOT delete user-specific profile data,
             * inventory, Khata or sales here.
             */

            try {
              await logout();
            } catch (error) {
              console.error(
                'Logout failed:',
                error
              );

              Alert.alert(
                'Logout Error',
                error?.message ||
                  'Could not log out safely.'
              );
            }
          },
        },
      ]
    );
  };

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (isLoading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          {
            paddingTop:
              insets.top,

            paddingBottom:
              insets.bottom,
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

  const feedbackModalWidth =
    Math.min(
      windowWidth - 32,
      520
    );

  /*
   * ============================================================
   * SCREEN
   * ============================================================
   */

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop:
            insets.top,

          paddingBottom:
            insets.bottom,
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : 'height'
        }
        style={
          styles.keyboardContainer
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.header}>
            Profile & Settings
          </Text>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() =>
              isEditing
                ? handleSave()
                : setIsEditing(true)
            }
            disabled={isSaving}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator
                color="#fff"
                size="small"
              />
            ) : (
              <Text
                style={
                  styles.actionBtnText
                }
              >
                {isEditing
                  ? 'Save'
                  : 'Edit'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom:
                Math.max(
                  insets.bottom + 24,
                  40
                ),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.card}>
            <View style={styles.avatarRow}>
              <TouchableOpacity
                onPress={
                  handlePickAvatar
                }
                activeOpacity={0.8}
              >
                <View
                  style={
                    styles.avatarCircle
                  }
                >
                  {avatarUri ? (
                    <Image
                      source={{
                        uri:
                          avatarUri,
                      }}
                      style={
                        styles.avatarImage
                      }
                    />
                  ) : (
                    <Text
                      style={
                        styles.avatarText
                      }
                    >
                      {(
                        shopName ||
                        email ||
                        'S'
                      )
                        .trim()
                        .charAt(0)
                        .toUpperCase()}
                    </Text>
                  )}

                  <View
                    style={
                      styles.editBadge
                    }
                  >
                    <Text
                      style={{
                        fontSize: 10,
                      }}
                    >
                      📷
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <View
                style={
                  styles.avatarInfo
                }
              >
                <Text
                  style={
                    styles.avatarShopName
                  }
                  numberOfLines={1}
                >
                  {shopName ||
                    'Your Shop'}
                </Text>

                <Text
                  style={
                    styles.avatarEmail
                  }
                  numberOfLines={1}
                >
                  {email ||
                    'No email registered'}
                </Text>
              </View>
            </View>

            <View
              style={styles.divider}
            />

            <Text style={styles.label}>
              Shop Name
            </Text>

            <TextInput
              style={[
                styles.input,
                isEditing
                  ? styles.inputEditable
                  : styles.inputDisabled,
              ]}
              value={shopName}
              onChangeText={
                setShopName
              }
              editable={isEditing}
              placeholder="Enter Shop Name"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>
              Mobile Number
            </Text>

            <TextInput
              style={[
                styles.input,
                isEditing
                  ? styles.inputEditable
                  : styles.inputDisabled,
              ]}
              value={phone}
              onChangeText={setPhone}
              editable={isEditing}
              keyboardType="phone-pad"
              placeholder="e.g. 9876543210"
              placeholderTextColor="#9CA3AF"
              maxLength={10}
            />

            <Text style={styles.label}>
              Store Address
            </Text>

            <TextInput
              style={[
                styles.input,
                styles.textArea,
                isEditing
                  ? styles.inputEditable
                  : styles.inputDisabled,
              ]}
              value={address}
              onChangeText={
                setAddress
              }
              editable={isEditing}
              multiline
              placeholder="Full shop address"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.card}>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Payment Integration
            </Text>

            <Text style={styles.label}>
              Shop UPI ID (For Khata Payments)
            </Text>

            <TextInput
              style={[
                styles.input,
                isEditing
                  ? styles.inputEditable
                  : styles.inputDisabled,
              ]}
              value={upiId}
              onChangeText={setUpiId}
              editable={isEditing}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="e.g. 9876543210@paytm"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View
            style={
              styles.toolsSection
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Business Tools
            </Text>

            {email ===
              'connect.manim@gmail.com' && (
              <TouchableOpacity
                style={[
                  styles.exportCard,
                  styles.adminCard,
                ]}
                onPress={() =>
                  setShowAdmin(true)
                }
                activeOpacity={0.85}
              >
                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={[
                      styles.exportTitle,
                      {
                        color:
                          '#B7791F',
                      },
                    ]}
                  >
                    👑 Super Admin Dashboard
                  </Text>

                  <Text
                    style={
                      styles.exportSubtitle
                    }
                  >
                    Manage users and monitor system health.
                  </Text>
                </View>

                <Text
                  style={{
                    fontSize: 24,
                  }}
                >
                  🚀
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={
                styles.exportCard
              }
              onPress={() =>
                setShowAnalytics(true)
              }
              activeOpacity={0.85}
            >
              <View
                style={{
                  flex: 1,
                  marginRight: 10,
                }}
              >
                <Text
                  style={
                    styles.exportTitle
                  }
                >
                  Business Analytics
                </Text>

                <Text
                  style={
                    styles.exportSubtitle
                  }
                >
                  View your profit, total sales, and market dues.
                </Text>
              </View>

              <Text
                style={{
                  fontSize: 24,
                }}
              >
                📈
              </Text>
            </TouchableOpacity>

            <View
              style={
                styles.exportCard
              }
            >
              <View
                style={{
                  flex: 1,
                  marginRight: 10,
                }}
              >
                <Text
                  style={
                    styles.exportTitle
                  }
                >
                  Google Drive Cloud Backup
                </Text>

                <Text
                  style={
                    styles.exportSubtitle
                  }
                >
                  Save your shop records to your private Google Drive space.
                </Text>
              </View>

              <TouchableOpacity
                style={
                  styles.exportBtn
                }
                onPress={
                  handleDriveBackup
                }
                disabled={
                  isBackingUp
                }
                activeOpacity={0.85}
              >
                {isBackingUp ? (
                  <ActivityIndicator
                    color="#fff"
                    size="small"
                  />
                ) : (
                  <Text
                    style={
                      styles.exportBtnText
                    }
                  >
                    Backup
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View
              style={
                styles.exportCard
              }
            >
              <View
                style={{
                  flex: 1,
                  marginRight: 10,
                }}
              >
                <Text
                  style={
                    styles.exportTitle
                  }
                >
                  Export Khata for Accountant
                </Text>

                <Text
                  style={
                    styles.exportSubtitle
                  }
                >
                  Generate an Excel-ready (.csv) report of credits.
                </Text>
              </View>

              <TouchableOpacity
                style={
                  styles.exportBtn
                }
                onPress={
                  handleExportCSV
                }
                disabled={
                  isExporting
                }
                activeOpacity={0.85}
              >
                {isExporting ? (
                  <ActivityIndicator
                    color="#fff"
                    size="small"
                  />
                ) : (
                  <Text
                    style={
                      styles.exportBtnText
                    }
                  >
                    Export
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={
              styles.feedbackBtn
            }
            onPress={() =>
              setFeedbackModalVisible(
                true
              )
            }
            activeOpacity={0.85}
          >
            <Text
              style={
                styles.feedbackBtnText
              }
            >
              🐞 Report a Bug / Feedback
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              styles.logoutBtn
            }
            onPress={
              handleLogout
            }
            activeOpacity={0.85}
          >
            <Text
              style={
                styles.logoutBtnText
              }
            >
              Logout of Storemate
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={
          isFeedbackModalVisible
        }
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() =>
          setFeedbackModalVisible(
            false
          )
        }
      >
        <KeyboardAvoidingView
          style={
            styles.modalKeyboardContainer
          }
          behavior={
            Platform.OS === 'ios'
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
              },
            ]}
          >
            <View
              style={[
                styles.modalContent,
                {
                  width:
                    feedbackModalWidth,
                },
              ]}
            >
              <Text
                style={
                  styles.modalTitle
                }
              >
                How can we improve?
              </Text>

              <Text
                style={
                  styles.modalSubtitle
                }
              >
                Found a bug or need a new feature? Let us know!
              </Text>

              <TextInput
                style={
                  styles.feedbackInput
                }
                placeholder="Describe the issue here..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                value={feedbackText}
                onChangeText={
                  setFeedbackText
                }
                textAlignVertical="top"
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
                    setFeedbackModalVisible(
                      false
                    )
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
                    styles.submitBtn
                  }
                  onPress={
                    handleFeedbackSubmit
                  }
                  disabled={
                    isSubmitting
                  }
                  activeOpacity={0.85}
                >
                  {isSubmitting ? (
                    <ActivityIndicator
                      color="#fff"
                      size="small"
                    />
                  ) : (
                    <Text
                      style={
                        styles.submitBtnText
                      }
                    >
                      Send Feedback
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showAdmin}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() =>
          setShowAdmin(false)
        }
      >
        <View
          style={{
            flex: 1,

            paddingTop:
              insets.top,

            paddingBottom:
              insets.bottom,
          }}
        >
          <AdminDashboard
            onClose={() =>
              setShowAdmin(false)
            }
          />
        </View>
      </Modal>

      <Modal
        visible={showAnalytics}
        animationType="slide"
        onRequestClose={() =>
          setShowAnalytics(false)
        }
      >
        <View
          style={{
            flex: 1,

            paddingTop:
              insets.top,

            paddingBottom:
              insets.bottom,
          }}
        >
          <AnalyticsScreen
            onClose={() =>
              setShowAnalytics(false)
            }
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F6',
  },

  keyboardContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#F5F7F6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 6,
  },

  header: {
    fontSize: 22,
    color: '#1B1F23',
    fontWeight: '800',
    flex: 1,
    marginRight: 12,
  },

  actionBtn: {
    backgroundColor: '#0C9C4C',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
    minWidth: 75,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },

  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAECEC',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0C9C4C',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },

  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },

  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EAECEC',
  },

  avatarInfo: {
    marginLeft: 14,
    flex: 1,
  },

  avatarShopName: {
    color: '#1B1F23',
    fontSize: 18,
    fontWeight: '800',
  },

  avatarEmail: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 2,
  },

  divider: {
    height: 1,
    backgroundColor: '#EAECEC',
    marginBottom: 14,
  },

  label: {
    color: '#6B7280',
    fontSize: 12.5,
    marginBottom: 6,
    fontWeight: '600',
  },

  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
    fontSize: 14.5,
    minHeight: 46,
  },

  inputEditable: {
    backgroundColor: '#FFFFFF',
    color: '#1B1F23',
    borderColor: '#0C9C4C',
  },

  inputDisabled: {
    borderColor: '#EAECEC',
    color: '#6B7280',
    backgroundColor: '#F9FAFB',
  },

  textArea: {
    height: 65,
    textAlignVertical: 'top',
  },

  toolsSection: {
    marginBottom: 6,
  },

  exportCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAECEC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },

  adminCard: {
    borderColor: '#F3D9A8',
    backgroundColor: '#FFF9EE',
  },

  exportTitle: {
    color: '#1B1F23',
    fontSize: 14.5,
    fontWeight: '700',
    marginBottom: 3,
  },

  exportSubtitle: {
    color: '#6B7280',
    fontSize: 11.5,
    lineHeight: 15,
  },

  exportBtn: {
    backgroundColor: '#0C9C4C',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },

  exportBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  feedbackBtn: {
    backgroundColor: '#FDECEA',
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F7C9C4',
  },

  feedbackBtnText: {
    color: '#E0433B',
    fontWeight: '700',
    fontSize: 15,
  },

  logoutBtn: {
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    marginBottom: 20,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAECEC',
  },

  logoutBtnText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '700',
  },

  modalKeyboardContainer: {
    flex: 1,
  },

  modalOverlay: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(27,31,35,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  modalContent: {
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 16,
    maxWidth: 520,
    borderWidth: 1,
    borderColor: '#EAECEC',
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1B1F23',
    marginBottom: 5,
  },

  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },

  feedbackInput: {
    backgroundColor: '#F5F7F6',
    borderRadius: 10,
    padding: 15,
    minHeight: 100,
    maxHeight: 180,
    textAlignVertical: 'top',
    color: '#1B1F23',
    borderWidth: 1,
    borderColor: '#EAECEC',
    marginBottom: 20,
    fontSize: 16,
  },

  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },

  cancelBtn: {
    padding: 15,
    marginRight: 10,
  },

  cancelBtnText: {
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 15,
  },

  submitBtn: {
    backgroundColor: '#0C9C4C',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },

  submitBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default ProfileScreen;