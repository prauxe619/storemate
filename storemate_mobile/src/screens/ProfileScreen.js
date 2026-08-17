import React, {
  useState,
  useEffect,
  useContext,
} from 'react';
import { useAppAlert } from '../components/AppAlert';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
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

import {
  launchImageLibrary,
} from 'react-native-image-picker';

import AnalyticsScreen from './AnalyticsScreen';

import {
  backupNow,
} from '../services/BackupService';

import {
  BASE_URL,
} from '../config/api';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  getCurrentUserId,
} from '../core/auth/localUser';


/* ============================================================
   PROFILE STORAGE
   ============================================================ */

const PROFILE_KEY_PREFIX =
  'storemate_profile_';

const profileStorageKey = userId =>
  `${PROFILE_KEY_PREFIX}${String(
    userId
  ).trim()}`;


/* ============================================================
   PROFILE SCREEN
   ============================================================ */

const ProfileScreen = () => {
  const { logout } = useContext(AuthContext);
  const { showAlert } = useAppAlert();

  const insets =
    useSafeAreaInsets();

  const {
    width: windowWidth,
  } = useWindowDimensions();


  /* ==========================================================
     STATE
     ========================================================== */

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    isExporting,
    setIsExporting,
  ] = useState(false);

  const [
    isBackingUp,
    setIsBackingUp,
  ] = useState(false);

  const [
    isEditing,
    setIsEditing,
  ] = useState(false);


  /* ==========================================================
     PROFILE
     ========================================================== */

  const [
    email,
    setEmail,
  ] = useState('');

  const [
    shopName,
    setShopName,
  ] = useState('');

  const [
    phone,
    setPhone,
  ] = useState('');

  const [
    address,
    setAddress,
  ] = useState('');

  const [
    avatarUri,
    setAvatarUri,
  ] = useState(null);

  const [
    upiId,
    setUpiId,
  ] = useState('');

  const [
    currentUserId,
    setCurrentUserId,
  ] = useState(null);


  /* ==========================================================
     MODALS
     ========================================================== */

  const [
    showAdmin,
    setShowAdmin,
  ] = useState(false);

  const [
    showAnalytics,
    setShowAnalytics,
  ] = useState(false);

  const [
    isFeedbackModalVisible,
    setFeedbackModalVisible,
  ] = useState(false);


  /* ==========================================================
     FEEDBACK
     ========================================================== */

  const [
    feedbackText,
    setFeedbackText,
  ] = useState('');

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);


  /* ==========================================================
     INITIAL LOAD
     ========================================================== */

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      await fetchProfile(
        mounted
      );
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);


  /* ==========================================================
     FETCH PROFILE
     ========================================================== */

  const fetchProfile =
    async mounted => {
      try {
        const userId =
          await getCurrentUserId();

        if (!userId) {
          console.warn(
            'Profile: no active user found.'
          );

          if (mounted) {
            setCurrentUserId(
              null
            );

            setIsLoading(
              false
            );
          }

          return;
        }

        if (mounted) {
          setCurrentUserId(
            userId
          );
        }


        /* ------------------------------------------------------
           LOCAL PROFILE
           ------------------------------------------------------ */

        const key =
          profileStorageKey(
            userId
          );

        const stored =
          await AsyncStorage.getItem(
            key
          );

        if (stored) {
          try {
            const parsed =
              JSON.parse(
                stored
              );

            if (mounted) {
              setEmail(
                parsed.email || ''
              );

              setShopName(
                parsed.shopName || ''
              );

              setPhone(
                parsed.phone || ''
              );

              setAddress(
                parsed.address || ''
              );

              setAvatarUri(
                parsed.avatarUri ||
                  null
              );

              setUpiId(
                parsed.upiId || ''
              );
            }
          } catch (error) {
            console.warn(
              'Profile JSON parse error:',
              error
            );
          }
        }


        /* ------------------------------------------------------
           SERVER PROFILE
           ------------------------------------------------------ */

        const token =
          await AsyncStorage.getItem(
            'userToken'
          );

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
                  Authorization:
                    `Bearer ${token}`,
                },
              }
            );

          if (!response.ok) {
            return;
          }

          const serverProfile =
            await response.json();

          if (!mounted) {
            return;
          }

          setEmail(
            serverProfile?.email ||
              serverProfile?.user?.email ||
              ''
          );

          setShopName(
            serverProfile?.shop_name ||
              serverProfile?.shopName ||
              ''
          );

          setPhone(
            serverProfile?.phone ||
              ''
          );

          setAddress(
            serverProfile?.address ||
              ''
          );

          setUpiId(
            serverProfile?.upi_id ||
              serverProfile?.upiId ||
              ''
          );
        } catch (
          serverError
        ) {
          console.log(
            'Server profile unavailable:',
            serverError?.message
          );
        }
      } catch (error) {
        console.error(
          'Failed to load profile:',
          error
        );

        if (mounted) {
          showAlert(
            'Profile',
            'Unable to load your shop profile.'
          );
        }
      } finally {
        if (mounted) {
          setIsLoading(
            false
          );
        }
      }
    };


  /* ==========================================================
     SAVE PROFILE
     ========================================================== */

  const saveProfile =
    async () => {
      if (!currentUserId) {
        showAlert(
          'Profile',
          'No active user found.'
        );

        return;
      }

      if (!shopName.trim()) {
        showAlert(
          'Shop name required',
          'Please enter your shop name.'
        );

        return;
      }

      setIsSaving(
        true
      );

      try {
        const profile = {
          email:
            email.trim(),

          shopName:
            shopName.trim(),

          phone:
            phone.trim(),

          address:
            address.trim(),

          avatarUri:
            avatarUri || null,

          upiId:
            upiId.trim(),

          onboardingCompleted:
            true,
        };


        /* ------------------------------------------------------
           LOCAL SAVE
           ------------------------------------------------------ */

        await AsyncStorage.setItem(
          profileStorageKey(
            currentUserId
          ),
          JSON.stringify(
            profile
          )
        );


        /* ------------------------------------------------------
           SERVER SAVE
           ------------------------------------------------------ */

        const token =
          await AsyncStorage.getItem(
            'userToken'
          );

        if (token) {
          try {
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
                      shopName.trim(),

                    phone:
                      phone.trim(),

                    address:
                      address.trim(),

                    upi_id:
                      upiId.trim(),
                  }),
              }
            );
          } catch (
            serverError
          ) {
            console.log(
              'Profile server update failed:',
              serverError?.message
            );
          }
        }

        setIsEditing(
          false
        );

        showAlert(
          'Saved',
          'Your shop profile has been updated.'
        );
      } catch (error) {
        console.error(
          'Save profile error:',
          error
        );

        showAlert(
          'Save failed',
          'Could not save your profile. Please try again.'
        );
      } finally {
        setIsSaving(
          false
        );
      }
    };


  /* ==========================================================
     SELECT AVATAR
     ========================================================== */

  const selectAvatar =
    async () => {
      try {
        const result =
          await launchImageLibrary({
            mediaType:
              'photo',

            selectionLimit:
              1,

            quality:
              0.85,
          });

        if (
          result.didCancel ||
          !result.assets ||
          !result.assets.length
        ) {
          return;
        }

        const selected =
          result.assets[0];

        if (selected.uri) {
          setAvatarUri(
            selected.uri
          );
        }
      } catch (error) {
        console.error(
          'Avatar selection error:',
          error
        );

        showAlert(
          'Photo',
          'Unable to select the shop photo.'
        );
      }
    };


  /* ==========================================================
     BACKUP
     ========================================================== */

  const handleBackup =
    async () => {
      if (isBackingUp) {
        return;
      }

      setIsBackingUp(
        true
      );

      try {
        await backupNow();

        showAlert(
          'Backup complete',
          'Your Countr data backup has been completed.'
        );
      } catch (error) {
        console.error(
          'Backup error:',
          error
        );

        showAlert(
          'Backup failed',
          error?.message ||
            'Unable to create backup right now.'
        );
      } finally {
        setIsBackingUp(
          false
        );
      }
    };


  /* ==========================================================
     EXPORT KHATA
     ========================================================== */

  const exportData =
    async () => {
      if (isExporting) {
        return;
      }

      setIsExporting(
        true
      );

      try {
        if (!currentUserId) {
          throw new Error(
            'No active user found.'
          );
        }

        const entries =
          await database
            .get(
              'ledger_entries'
            )
            .query(
              Q.where(
                'owner_id',
                currentUserId
              )
            )
            .fetch();

        const rows = [
          [
            'Date',
            'Customer',
            'Type',
            'Amount',
            'Note',
          ],
        ];

        entries.forEach(
          entry => {
            rows.push([
              new Date(
                entry.createdAt ||
                  Date.now()
              ).toISOString(),

              entry.customerName ||
                '',

              entry.entryType ||
                '',

              String(
                entry.amount ||
                  0
              ),

              entry.note ||
                '',
            ]);
          }
        );

        const csv =
          rows
            .map(
              row =>
                row
                  .map(
                    value => {
                      const text =
                        String(
                          value ??
                            ''
                        );

                      return `"${text.replace(
                        /"/g,
                        '""'
                      )}"`;
                    }
                  )
                  .join(',')
            )
            .join('\n');

        const path =
          `${RNFS.CachesDirectoryPath}/countr-khata-${Date.now()}.csv`;

        await RNFS.writeFile(
          path,
          csv,
          'utf8'
        );

        await Share.open({
          url:
            `file://${path}`,

          type:
            'text/csv',

          filename:
            'countr-khata.csv',

          failOnCancel:
            false,
        });
      } catch (error) {
        console.error(
          'Export error:',
          error
        );

        showAlert(
          'Export failed',
          error?.message ||
            'Unable to export your Khata.'
        );
      } finally {
        setIsExporting(
          false
        );
      }
    };


  /* ==========================================================
     FEEDBACK
     ========================================================== */

  const submitFeedback =
    async () => {
      const message =
        feedbackText.trim();

      if (!message) {
        showAlert(
          'Feedback',
          'Please write your feedback first.'
        );

        return;
      }

      setIsSubmitting(
        true
      );

      try {
        const token =
          await AsyncStorage.getItem(
            'userToken'
          );

        const response =
          await fetch(
            `${BASE_URL}/api/v1/feedback`,
            {
              method:
                'POST',

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
                  message,

                  user_id:
                    currentUserId,

                  source:
                    'profile_screen',
                }),
            }
          );

        if (!response.ok) {
          throw new Error(
            'Feedback submission failed.'
          );
        }

        setFeedbackText(
          ''
        );

        setFeedbackModalVisible(
          false
        );

        showAlert(
          'Thank you',
          'Your feedback has been sent to the Countr team.'
        );
      } catch (error) {
        console.error(
          'Feedback error:',
          error
        );

        showAlert(
          'Could not send',
          'Please try again later.'
        );
      } finally {
        setIsSubmitting(
          false
        );
      }
    };


  /* ==========================================================
     LOGOUT
     ========================================================== */

  const handleLogout =
    () => {
      showAlert(
        'Log out of Countr?',

        'You can sign back in anytime. Your shop data stays associated with your account.',

        [
          {
            text:
              'Cancel',

            style:
              'cancel',
          },

          {
            text:
              'Log out',

            style:
              'destructive',

            onPress:
              async () => {
                try {
                  await logout();
                } catch (
                  error
                ) {
                  console.error(
                    'Logout error:',
                    error
                  );
                }
              },
          },
        ]
      );
    };


  /* ==========================================================
     INITIALS
     ========================================================== */

  const getInitials =
    value => {
      const text =
        String(
          value ||
            'Countr'
        ).trim();

      if (!text) {
        return 'C';
      }

      const parts =
        text.split(
          /\s+/
        );

      if (
        parts.length ===
        1
      ) {
        return parts[0]
          .slice(
            0,
            2
          )
          .toUpperCase();
      }

      return (
        parts[0][0] +
        parts[1][0]
      ).toUpperCase();
    };


  /* ==========================================================
     RESPONSIVE WIDTH
     ========================================================== */

  const isTablet =
    windowWidth >=
    600;

  const contentWidth =
    isTablet
      ? 560
      : windowWidth -
        32;


  /* ==========================================================
     LOADING
     ========================================================== */

  if (isLoading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          {
            paddingTop:
              insets.top,
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

        <Text
          style={
            styles.loadingTitle
          }
        >
          countr
        </Text>

        <ActivityIndicator
          size="small"
          color="#B8FF3D"
          style={
            styles.loadingSpinner
          }
        />

        <Text
          style={
            styles.loadingSubtitle
          }
        >
          Loading your shop…
        </Text>
      </View>
    );
  }


  /* ==========================================================
     MAIN UI
     ========================================================== */

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

      {/* ======================================================
          HEADER
          ====================================================== */}

      <View
        style={
          styles.topBar
        }
      >
        <View>
          <Text
            style={
              styles.brandLabel
            }
          >
            COUNTR
          </Text>

          <Text
            style={
              styles.pageTitle
            }
          >
            Dukaan Profile
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.editButton,
            isEditing &&
              styles.editButtonActive,
          ]}
          onPress={() =>
            setIsEditing(
              previous =>
                !previous
            )
          }
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.editButtonText,
              isEditing &&
                styles.editButtonTextActive,
            ]}
          >
            {isEditing
              ? 'Cancel'
              : 'Edit'}
          </Text>
        </TouchableOpacity>
      </View>


      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          {
            width:
              Math.min(
                contentWidth,
                680
              ),

            alignSelf:
              'center',

            paddingBottom:
              40 +
              insets.bottom,
          },
        ]}
      >

        {/* ==================================================
            SHOP IDENTITY
            ================================================== */}

        <View
          style={
            styles.identityCard
          }
        >
          <View
            style={
              styles.identityTop
            }
          >

            <TouchableOpacity
              style={
                styles.avatarWrapper
              }
              onPress={
                isEditing
                  ? selectAvatar
                  : undefined
              }
              activeOpacity={
                isEditing
                  ? 0.75
                  : 1
              }
            >
              {avatarUri ? (
                <Image
                  source={{
                    uri:
                      avatarUri,
                  }}
                  style={
                    styles.avatar
                  }
                />
              ) : (
                <View
                  style={
                    styles.avatarFallback
                  }
                >
                  <Text
                    style={
                      styles.avatarInitials
                    }
                  >
                    {getInitials(
                      shopName
                    )}
                  </Text>
                </View>
              )}

              {isEditing && (
                <View
                  style={
                    styles.cameraBadge
                  }
                >
                  <Text
                    style={
                      styles.cameraBadgeText
                    }
                  >
                    ✎
                  </Text>
                </View>
              )}
            </TouchableOpacity>


            <View
              style={
                styles.identityDetails
              }
            >
              <View
                style={
                  styles.activeRow
                }
              >
                <View
                  style={
                    styles.activeDot
                  }
                />

                <Text
                  style={
                    styles.activeText
                  }
                >
                  ACTIVE SHOP
                </Text>
              </View>

              <Text
                style={
                  styles.identityShopName
                }
                numberOfLines={
                  2
                }
              >
                {shopName ||
                  'Your Dukaan'}
              </Text>

              <Text
                style={
                  styles.identityEmail
                }
                numberOfLines={
                  1
                }
              >
                {email ||
                  'No email added'}
              </Text>
            </View>
          </View>


          <View
            style={
              styles.identityDivider
            }
          />


          <View
            style={
              styles.identityStats
            }
          >
            <View
              style={
                styles.identityStat
              }
            >
              <Text
                style={
                  styles.identityStatLabel
                }
              >
                MOBILE
              </Text>

              <Text
                style={
                  styles.identityStatValue
                }
                numberOfLines={
                  1
                }
              >
                {phone ||
                  'Not added'}
              </Text>
            </View>


            <View
              style={
                styles.identityStatDivider
              }
            />


            <View
              style={
                styles.identityStat
              }
            >
              <Text
                style={
                  styles.identityStatLabel
                }
              >
                KHATA UPI
              </Text>

              <Text
                style={
                  styles.identityStatValue
                }
                numberOfLines={
                  1
                }
              >
                {upiId ||
                  'Not added'}
              </Text>
            </View>
          </View>
        </View>


        {/* ==================================================
            SHOP DETAILS
            ================================================== */}

        <View
          style={
            styles.sectionHeader
          }
        >
          <Text
            style={
              styles.sectionEyebrow
            }
          >
            SHOP DETAILS
          </Text>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Your dukaan information
          </Text>
        </View>


        <View
          style={
            styles.detailsCard
          }
        >

          {/* SHOP NAME */}

          <View
            style={
              styles.fieldBlock
            }
          >
            <View
              style={
                styles.fieldIcon
              }
            >
              <Text
                style={
                  styles.fieldIconText
                }
              >
                🏪
              </Text>
            </View>

            <View
              style={
                styles.fieldContent
              }
            >
              <Text
                style={
                  styles.fieldLabel
                }
              >
                Shop Name
              </Text>

              {isEditing ? (
                <TextInput
                  value={
                    shopName
                  }
                  onChangeText={
                    setShopName
                  }
                  placeholder="Your shop name"
                  placeholderTextColor="#68756D"
                  style={
                    styles.input
                  }
                  autoCapitalize="words"
                />
              ) : (
                <Text
                  style={
                    styles.fieldValue
                  }
                  numberOfLines={
                    1
                  }
                >
                  {shopName ||
                    'Add your shop name'}
                </Text>
              )}
            </View>
          </View>


          <View
            style={
              styles.fieldDivider
            }
          />


          {/* PHONE */}

          <View
            style={
              styles.fieldBlock
            }
          >
            <View
              style={
                styles.fieldIcon
              }
            >
              <Text
                style={
                  styles.fieldIconText
                }
              >
                📱
              </Text>
            </View>

            <View
              style={
                styles.fieldContent
              }
            >
              <Text
                style={
                  styles.fieldLabel
                }
              >
                Mobile Number
              </Text>

              {isEditing ? (
                <TextInput
                  value={
                    phone
                  }
                  onChangeText={
                    setPhone
                  }
                  placeholder="Shop mobile number"
                  placeholderTextColor="#68756D"
                  style={
                    styles.input
                  }
                  keyboardType="phone-pad"
                  maxLength={
                    15
                  }
                />
              ) : (
                <Text
                  style={
                    styles.fieldValue
                  }
                >
                  {phone ||
                    'Add mobile number'}
                </Text>
              )}
            </View>
          </View>


          <View
            style={
              styles.fieldDivider
            }
          />


          {/* ADDRESS */}

          <View
            style={
              styles.fieldBlock
            }
          >
            <View
              style={
                styles.fieldIcon
              }
            >
              <Text
                style={
                  styles.fieldIconText
                }
              >
                📍
              </Text>
            </View>

            <View
              style={
                styles.fieldContent
              }
            >
              <Text
                style={
                  styles.fieldLabel
                }
              >
                Shop Address
              </Text>

              {isEditing ? (
                <TextInput
                  value={
                    address
                  }
                  onChangeText={
                    setAddress
                  }
                  placeholder="Add shop address"
                  placeholderTextColor="#68756D"
                  style={[
                    styles.input,
                    styles.multilineInput,
                  ]}
                  multiline
                  numberOfLines={
                    3
                  }
                  textAlignVertical="top"
                />
              ) : (
                <Text
                  style={
                    styles.fieldValue
                  }
                  numberOfLines={
                    2
                  }
                >
                  {address ||
                    'Add your shop address'}
                </Text>
              )}
            </View>
          </View>
        </View>


        {/* ==================================================
            SAVE
            ================================================== */}

        {isEditing && (
          <TouchableOpacity
            style={
              styles.saveButton
            }
            onPress={
              saveProfile
            }
            disabled={
              isSaving
            }
            activeOpacity={
              0.85
            }
          >
            {isSaving ? (
              <ActivityIndicator
                color="#071009"
              />
            ) : (
              <>
                <Text
                  style={
                    styles.saveButtonText
                  }
                >
                  Save Shop Details
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
        )}


        {/* ==================================================
            PAYMENTS
            ================================================== */}

        <View
          style={[
            styles.sectionHeader,
            {
              marginTop:
                30,
            },
          ]}
        >
          <Text
            style={
              styles.sectionEyebrow
            }
          >
            PAYMENTS
          </Text>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Khata payment setup
          </Text>
        </View>


        <View
          style={
            styles.upiCard
          }
        >
          <View
            style={
              styles.upiIcon
            }
          >
            <Text
              style={
                styles.upiIconText
              }
            >
              ₹
            </Text>
          </View>

          <View
            style={
              styles.upiContent
            }
          >
            <View
              style={
                styles.upiHeaderRow
              }
            >
              <Text
                style={
                  styles.upiLabel
                }
              >
                Shop UPI ID
              </Text>

              <View
                style={
                  styles.readyBadge
                }
              >
                <View
                  style={
                    styles.readyDot
                  }
                />

                <Text
                  style={
                    styles.readyText
                  }
                >
                  {upiId
                    ? 'READY'
                    : 'SET UP'}
                </Text>
              </View>
            </View>

            {isEditing ? (
              <TextInput
                value={
                  upiId
                }
                onChangeText={
                  setUpiId
                }
                placeholder="yourshop@upi"
                placeholderTextColor="#68756D"
                style={
                  styles.upiInput
                }
                autoCapitalize="none"
                keyboardType="email-address"
              />
            ) : (
              <Text
                style={
                  styles.upiValue
                }
                numberOfLines={
                  1
                }
              >
                {upiId ||
                  'Add UPI ID for Khata payments'}
              </Text>
            )}
          </View>
        </View>


        {/* ==================================================
            TOOLS
            ================================================== */}

        <View
          style={[
            styles.sectionHeader,
            {
              marginTop:
                30,
            },
          ]}
        >
          <Text
            style={
              styles.sectionEyebrow
            }
          >
            DUKAAN TOOLS
          </Text>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Manage your business
          </Text>
        </View>


        <View
          style={
            styles.toolsGrid
          }
        >

          {/* ANALYTICS */}

          <TouchableOpacity
            style={
              styles.toolCard
            }
            onPress={() =>
              setShowAnalytics(
                true
              )
            }
            activeOpacity={
              0.8
            }
          >
            <View
              style={
                styles.toolIcon
              }
            >
              <Text
                style={
                  styles.toolIconText
                }
              >
                ↗
              </Text>
            </View>

            <Text
              style={
                styles.toolTitle
              }
            >
              Analytics
            </Text>

            <Text
              style={
                styles.toolSubtitle
              }
            >
              Sales & reports
            </Text>

            <Text
              style={
                styles.toolArrow
              }
            >
              →
            </Text>
          </TouchableOpacity>


          {/* BACKUP */}

          <TouchableOpacity
            style={
              styles.toolCard
            }
            onPress={
              handleBackup
            }
            disabled={
              isBackingUp
            }
            activeOpacity={
              0.8
            }
          >
            <View
              style={
                styles.toolIcon
              }
            >
              {isBackingUp ? (
                <ActivityIndicator
                  size="small"
                  color="#B8FF3D"
                />
              ) : (
                <Text
                  style={
                    styles.toolIconText
                  }
                >
                  ☁
                </Text>
              )}
            </View>

            <Text
              style={
                styles.toolTitle
              }
            >
              Backup
            </Text>

            <Text
              style={
                styles.toolSubtitle
              }
            >
              Save your data
            </Text>

            <Text
              style={
                styles.toolArrow
              }
            >
              →
            </Text>
          </TouchableOpacity>


          {/* EXPORT */}

          <TouchableOpacity
            style={
              styles.toolCard
            }
            onPress={
              exportData
            }
            disabled={
              isExporting
            }
            activeOpacity={
              0.8
            }
          >
            <View
              style={
                styles.toolIcon
              }
            >
              {isExporting ? (
                <ActivityIndicator
                  size="small"
                  color="#B8FF3D"
                />
              ) : (
                <Text
                  style={
                    styles.toolIconText
                  }
                >
                  ↓
                </Text>
              )}
            </View>

            <Text
              style={
                styles.toolTitle
              }
            >
              Export
            </Text>

            <Text
              style={
                styles.toolSubtitle
              }
            >
              Khata CSV
            </Text>

            <Text
              style={
                styles.toolArrow
              }
            >
              →
            </Text>
          </TouchableOpacity>


          {/* ADMIN */}

          <TouchableOpacity
            style={
              styles.toolCard
            }
            onPress={() =>
              setShowAdmin(
                true
              )
            }
            activeOpacity={
              0.8
            }
          >
            <View
              style={
                styles.toolIcon
              }
            >
              <Text
                style={
                  styles.toolIconText
                }
              >
                ★
              </Text>
            </View>

            <Text
              style={
                styles.toolTitle
              }
            >
              Admin
            </Text>

            <Text
              style={
                styles.toolSubtitle
              }
            >
              Shop controls
            </Text>

            <Text
              style={
                styles.toolArrow
              }
            >
              →
            </Text>
          </TouchableOpacity>
        </View>


        {/* ==================================================
            FEEDBACK
            ================================================== */}

        <TouchableOpacity
          style={
            styles.feedbackCard
          }
          onPress={() =>
            setFeedbackModalVisible(
              true
            )
          }
          activeOpacity={
            0.8
          }
        >
          <View
            style={
              styles.feedbackIcon
            }
          >
            <Text
              style={
                styles.feedbackIconText
              }
            >
              ?
            </Text>
          </View>

          <View
            style={
              styles.feedbackContent
            }
          >
            <Text
              style={
                styles.feedbackTitle
              }
            >
              Something not working?
            </Text>

            <Text
              style={
                styles.feedbackSubtitle
              }
            >
              Tell the Countr team
            </Text>
          </View>

          <Text
            style={
              styles.feedbackArrow
            }
          >
            →
          </Text>
        </TouchableOpacity>


        {/* ==================================================
            TRUST
            ================================================== */}

        <View
          style={
            styles.trustCard
          }
        >
          <View
            style={
              styles.trustIcon
            }
          >
            <Text
              style={
                styles.trustIconText
              }
            >
              ✓
            </Text>
          </View>

          <View
            style={
              styles.trustContent
            }
          >
            <Text
              style={
                styles.trustTitle
              }
            >
              Your shop, your data
            </Text>

            <Text
              style={
                styles.trustText
              }
            >
              Countr is designed
              offline-first. Your
              shop should keep
              working even when
              the internet doesn't.
            </Text>
          </View>
        </View>


        {/* ==================================================
            LOGOUT
            ================================================== */}

        <TouchableOpacity
          style={
            styles.logoutButton
          }
          onPress={
            handleLogout
          }
          activeOpacity={
            0.8
          }
        >
          <Text
            style={
              styles.logoutIcon
            }
          >
            ↪
          </Text>

          <Text
            style={
              styles.logoutText
            }
          >
            Log out of Countr
          </Text>
        </TouchableOpacity>


        <Text
          style={
            styles.versionText
          }
        >
          COUNTR • SHOP MANAGEMENT
        </Text>

      </ScrollView>


      {/* ======================================================
          ANALYTICS
          ====================================================== */}

      <Modal
        visible={
          showAnalytics
        }
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() =>
          setShowAnalytics(
            false
          )
        }
      >
        <View
          style={
            styles.modalScreen
          }
        >
          <View
            style={
              styles.modalHeader
            }
          >
            <Text
              style={
                styles.modalTitle
              }
            >
              Analytics
            </Text>

            <TouchableOpacity
              style={
                styles.modalClose
              }
              onPress={() =>
                setShowAnalytics(
                  false
                )
              }
            >
              <Text
                style={
                  styles.modalCloseText
                }
              >
                ×
              </Text>
            </TouchableOpacity>
          </View>

          <AnalyticsScreen />
        </View>
      </Modal>


      {/* ======================================================
          ADMIN
          ====================================================== */}

      <Modal
        visible={
          showAdmin
        }
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() =>
          setShowAdmin(
            false
          )
        }
      >
        <View
          style={
            styles.modalScreen
          }
        >
          <View
            style={
              styles.modalHeader
            }
          >
            <Text
              style={
                styles.modalTitle
              }
            >
              Admin
            </Text>

            <TouchableOpacity
              style={
                styles.modalClose
              }
              onPress={() =>
                setShowAdmin(
                  false
                )
              }
            >
              <Text
                style={
                  styles.modalCloseText
                }
              >
                ×
              </Text>
            </TouchableOpacity>
          </View>

          <AdminDashboard />
        </View>
      </Modal>


      {/* ======================================================
          FEEDBACK
          ====================================================== */}

      <Modal
        visible={
          isFeedbackModalVisible
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setFeedbackModalVisible(
            false
          )
        }
      >
        <KeyboardAvoidingView
          style={
            styles.feedbackOverlay
          }
          behavior={
            Platform.OS ===
            'ios'
              ? 'padding'
              : undefined
          }
        >
          <View
            style={
              styles.feedbackModal
            }
          >

            <View
              style={
                styles.feedbackModalHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.feedbackModalEyebrow
                  }
                >
                  COUNTR SUPPORT
                </Text>

                <Text
                  style={
                    styles.feedbackModalTitle
                  }
                >
                  Tell us what's happening
                </Text>
              </View>

              <TouchableOpacity
                style={
                  styles.modalClose
                }
                onPress={() =>
                  setFeedbackModalVisible(
                    false
                  )
                }
              >
                <Text
                  style={
                    styles.modalCloseText
                  }
                >
                  ×
                </Text>
              </TouchableOpacity>
            </View>


            <Text
              style={
                styles.feedbackModalDescription
              }
            >
              Your feedback helps us
              make Countr better for
              shopkeepers.
            </Text>


            <TextInput
              value={
                feedbackText
              }
              onChangeText={
                setFeedbackText
              }
              placeholder="What happened?"
              placeholderTextColor="#68756D"
              style={
                styles.feedbackInput
              }
              multiline
              numberOfLines={
                7
              }
              textAlignVertical="top"
              maxLength={
                2000
              }
            />


            <TouchableOpacity
              style={
                styles.feedbackSubmit
              }
              onPress={
                submitFeedback
              }
              disabled={
                isSubmitting
              }
              activeOpacity={
                0.85
              }
            >
              {isSubmitting ? (
                <ActivityIndicator
                  color="#071009"
                />
              ) : (
                <Text
                  style={
                    styles.feedbackSubmitText
                  }
                >
                  Send Feedback →
                </Text>
              )}
            </TouchableOpacity>

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
};


/* ============================================================
   STYLES
   ============================================================ */

const styles = StyleSheet.create({

  /* ============================================================
     GLOBAL
     ============================================================ */

  container: {
    flex: 1,
    backgroundColor: '#F7F8F5',
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#F7F8F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  loadingLogo: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#B8FF3D',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  loadingLogoText: {
    color: '#102015',
    fontSize: 28,
    fontWeight: '900',
  },

  loadingTitle: {
    color: '#102015',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -1,
  },

  loadingSpinner: {
    marginTop: 28,
  },

  loadingSubtitle: {
    color: '#7B857E',
    fontSize: 13,
    marginTop: 12,
  },


  /* ============================================================
     HEADER
     ============================================================ */

  topBar: {
    minHeight: 76,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8ECE8',
  },

  brandLabel: {
    color: '#527D20',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.4,
    marginBottom: 3,
  },

  pageTitle: {
    color: '#142019',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.7,
  },

  editButton: {
    minWidth: 68,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: '#F0F3EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  editButtonActive: {
    backgroundColor: '#B8FF3D',
  },

  editButtonText: {
    color: '#142019',
    fontSize: 13,
    fontWeight: '900',
  },

  editButtonTextActive: {
    color: '#102015',
  },


  /* ============================================================
     SCROLL
     ============================================================ */

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },


  /* ============================================================
     SHOP IDENTITY
     ============================================================ */

  identityCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E9E3',
    borderRadius: 25,
    padding: 19,
    overflow: 'hidden',

    shadowColor: '#102015',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },

  identityTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatarWrapper: {
    width: 78,
    height: 78,
    borderRadius: 24,
    position: 'relative',
  },

  avatar: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: '#EEF2ED',
  },

  avatarFallback: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: '#B8FF3D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarInitials: {
    color: '#102015',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -1,
  },

  cameraBadge: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#142019',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  cameraBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  identityDetails: {
    flex: 1,
    marginLeft: 15,
    minWidth: 0,
  },

  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },

  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: '#65A52A',
    marginRight: 6,
  },

  activeText: {
    color: '#528320',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  identityShopName: {
    color: '#142019',
    fontSize: 23,
    lineHeight: 27,
    fontWeight: '900',
    letterSpacing: -0.8,
  },

  identityEmail: {
    color: '#7B857E',
    fontSize: 12,
    marginTop: 5,
  },

  identityDivider: {
    height: 1,
    backgroundColor: '#E8ECE8',
    marginTop: 19,
    marginBottom: 16,
  },

  identityStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  identityStat: {
    flex: 1,
    minWidth: 0,
  },

  identityStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E4E9E4',
    marginHorizontal: 15,
  },

  identityStatLabel: {
    color: '#87918A',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 4,
  },

  identityStatValue: {
    color: '#27342C',
    fontSize: 12,
    fontWeight: '700',
  },


  /* ============================================================
     SECTIONS
     ============================================================ */

  sectionHeader: {
    marginTop: 25,
    marginBottom: 10,
    paddingHorizontal: 3,
  },

  sectionEyebrow: {
    color: '#5C8D25',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.7,
    marginBottom: 4,
  },

  sectionTitle: {
    color: '#142019',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
  },


  /* ============================================================
     DETAILS
     ============================================================ */

  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E3E9E3',
    overflow: 'hidden',

    shadowColor: '#102015',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.035,
    shadowRadius: 10,
    elevation: 1,
  },

  fieldBlock: {
    minHeight: 78,
    paddingHorizontal: 15,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },

  fieldIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F0F4EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  fieldIconText: {
    fontSize: 18,
  },

  fieldContent: {
    flex: 1,
    minWidth: 0,
  },

  fieldLabel: {
    color: '#87918A',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
  },

  fieldValue: {
    color: '#27342C',
    fontSize: 14,
    fontWeight: '700',
  },

  fieldDivider: {
    height: 1,
    backgroundColor: '#E9EDE9',
    marginLeft: 70,
  },

  input: {
    color: '#142019',
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 3,
    paddingHorizontal: 0,
    margin: 0,
  },

  multilineInput: {
    minHeight: 62,
    paddingTop: 5,
  },


  /* ============================================================
     SAVE
     ============================================================ */

  saveButton: {
    marginTop: 12,
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: '#B8FF3D',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#5D8A2A',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 2,
  },

  saveButtonText: {
    color: '#102015',
    fontSize: 14,
    fontWeight: '900',
  },

  saveButtonArrow: {
    color: '#102015',
    fontSize: 20,
    fontWeight: '900',
    marginLeft: 10,
  },


  /* ============================================================
     UPI
     ============================================================ */

  upiCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE7D8',
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',

    shadowColor: '#102015',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.035,
    shadowRadius: 10,
    elevation: 1,
  },

  upiIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#B8FF3D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  upiIconText: {
    color: '#102015',
    fontSize: 22,
    fontWeight: '900',
  },

  upiContent: {
    flex: 1,
    minWidth: 0,
  },

  upiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  upiLabel: {
    color: '#7D8981',
    fontSize: 10,
    fontWeight: '800',
  },

  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#EEF8E8',
  },

  readyDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: '#65A52A',
    marginRight: 5,
  },

  readyText: {
    color: '#568A25',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  upiValue: {
    color: '#27342C',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 7,
  },

  upiInput: {
    color: '#142019',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 5,
    paddingHorizontal: 0,
    marginTop: 2,
  },


  /* ============================================================
     TOOLS
     ============================================================ */

  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  toolCard: {
    width: '48.5%',
    minHeight: 148,
    marginBottom: 10,
    padding: 16,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E9E3',
    position: 'relative',

    shadowColor: '#102015',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.035,
    shadowRadius: 10,
    elevation: 1,
  },

  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#F0F4EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  toolIconText: {
    color: '#5D8F27',
    fontSize: 20,
    fontWeight: '900',
  },

  toolTitle: {
    color: '#17231B',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 17,
  },

  toolSubtitle: {
    color: '#7D8981',
    fontSize: 10,
    marginTop: 4,
  },

  toolArrow: {
    position: 'absolute',
    right: 15,
    bottom: 14,
    color: '#829087',
    fontSize: 18,
    fontWeight: '800',
  },


  /* ============================================================
     FEEDBACK
     ============================================================ */

  feedbackCard: {
    minHeight: 74,
    marginTop: 8,
    borderRadius: 21,
    paddingHorizontal: 15,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E9DE',
    flexDirection: 'row',
    alignItems: 'center',

    shadowColor: '#102015',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.035,
    shadowRadius: 10,
    elevation: 1,
  },

  feedbackIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#B8FF3D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  feedbackIconText: {
    color: '#102015',
    fontSize: 18,
    fontWeight: '900',
  },

  feedbackContent: {
    flex: 1,
  },

  feedbackTitle: {
    color: '#17231B',
    fontSize: 13,
    fontWeight: '900',
  },

  feedbackSubtitle: {
    color: '#7D8981',
    fontSize: 10,
    marginTop: 4,
  },

  feedbackArrow: {
    color: '#5C8D25',
    fontSize: 20,
    fontWeight: '800',
    marginLeft: 10,
  },


  /* ============================================================
     TRUST
     ============================================================ */

  trustCard: {
    marginTop: 18,
    padding: 15,
    borderRadius: 20,
    backgroundColor: '#F0F8EC',
    borderWidth: 1,
    borderColor: '#DDEBD5',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  trustIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#E2F3D6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  trustIconText: {
    color: '#5A8C27',
    fontSize: 16,
    fontWeight: '900',
  },

  trustContent: {
    flex: 1,
  },

  trustTitle: {
    color: '#40513F',
    fontSize: 12,
    fontWeight: '900',
  },

  trustText: {
    color: '#748078',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },


  /* ============================================================
     LOGOUT
     ============================================================ */

  logoutButton: {
    marginTop: 25,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E8E5',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  logoutIcon: {
    color: '#A45D5D',
    fontSize: 18,
    fontWeight: '800',
    marginRight: 8,
  },

  logoutText: {
    color: '#A45D5D',
    fontSize: 12,
    fontWeight: '800',
  },

  versionText: {
    color: '#A2AAA4',
    textAlign: 'center',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 20,
    marginBottom: 10,
  },


  /* ============================================================
     MODALS
     ============================================================ */

  modalScreen: {
    flex: 1,
    backgroundColor: '#F7F8F5',
  },

  modalHeader: {
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5EAE5',
  },

  modalTitle: {
    color: '#142019',
    fontSize: 20,
    fontWeight: '900',
  },

  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#F0F3EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalCloseText: {
    color: '#27342C',
    fontSize: 26,
    fontWeight: '300',
    lineHeight: 28,
  },


  /* ============================================================
     FEEDBACK MODAL
     ============================================================ */

  feedbackOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,32,25,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  feedbackModal: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E7DF',
    padding: 20,

    shadowColor: '#102015',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.15,
    shadowRadius: 25,
    elevation: 8,
  },

  feedbackModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  feedbackModalEyebrow: {
    color: '#5C8D25',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 5,
  },

  feedbackModalTitle: {
    color: '#142019',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    maxWidth: 270,
  },

  feedbackModalDescription: {
    color: '#748078',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 15,
  },

  feedbackInput: {
    minHeight: 145,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#DDE4DD',
    backgroundColor: '#F7F9F6',
    color: '#142019',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 13,
    lineHeight: 20,
  },

  feedbackSubmit: {
    height: 53,
    borderRadius: 16,
    marginTop: 13,
    backgroundColor: '#B8FF3D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  feedbackSubmitText: {
    color: '#102015',
    fontSize: 13,
    fontWeight: '900',
  },
});

export default ProfileScreen;