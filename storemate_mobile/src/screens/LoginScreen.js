import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setActiveUser } from '../core/auth/localUser';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import {
  checkForExistingBackup,
  restoreFromDrive,
} from '../services/BackupService';

import TelemetryService from '../services/TelemetryService';
import { BASE_URL } from '../config/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LoginScreen = ({
  onLoginSuccess,
}) => {
  const insets =
    useSafeAreaInsets();

  const {
    width: windowWidth,
  } = useWindowDimensions();

  /*
   * Responsive horizontal spacing.
   *
   * Small phones:
   * slightly smaller side margins.
   *
   * Large phones/tablets:
   * form itself is capped below, so it
   * doesn't become excessively wide.
   */
  const horizontalPadding =
    windowWidth < 360
      ? 18
      : windowWidth < 600
      ? 28
      : 40;

  /*
   * authMode options:
   *
   * 'login'
   * 'register'
   * 'forgot'
   * 'verify_otp'
   */
  const [authMode, setAuthMode] =
    useState('login');

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [shopName, setShopName] =
    useState('');

  const [otp, setOtp] =
    useState('');

  const [newPassword, setNewPassword] =
    useState('');

  const [isLoading, setIsLoading] =
    useState(false);

  useEffect(() => {
  }, []);

  const handleSubmit =
    async () => {
      /*
       * =====================================
       * FORGOT PASSWORD
       * =====================================
       */

      if (
        authMode === 'forgot'
      ) {
        if (!email) {
          return Alert.alert(
            'Error',
            'Please enter your registered email address.'
          );
        }

        setIsLoading(true);

        try {
          const response =
            await fetch(
              `${BASE_URL}/api/v1/auth/forgot-password`,
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body: JSON.stringify({
                  email,
                }),
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                'Failed to send OTP'
            );
          }

          Alert.alert(
            'OTP Sent 📩',
            'Check your email inbox for the 6-digit reset code.'
          );

          setAuthMode(
            'verify_otp'
          );
        } catch (error) {
          Alert.alert(
            'Error',
            error.message
          );
        } finally {
          setIsLoading(false);
        }

        return;
      }

      /*
       * =====================================
       * VERIFY OTP / RESET PASSWORD
       * =====================================
       */

      if (
        authMode ===
        'verify_otp'
      ) {
        if (
          !otp ||
          !newPassword
        ) {
          return Alert.alert(
            'Error',
            'Please enter both the 6-digit OTP and your new password.'
          );
        }

        setIsLoading(true);

        try {
          /*
           * A. Reset password
           */

          const resetResponse =
            await fetch(
              `${BASE_URL}/api/v1/auth/reset-password`,
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body: JSON.stringify({
                  email,
                  otp,
                  new_password:
                    newPassword,
                }),
              }
            );

          const resetData =
            await resetResponse.json();

          if (
            !resetResponse.ok
          ) {
            throw new Error(
              resetData.error ||
                'Password reset failed'
            );
          }

          /*
           * B. Automatically login
           */

          const loginResponse =
            await fetch(
              `${BASE_URL}/api/v1/auth/login`,
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body: JSON.stringify({
                  email,
                  password:
                    newPassword,
                }),
              }
            );

          const loginData =
            await loginResponse.json();

          if (
            !loginResponse.ok
          ) {
            throw new Error(
              'Password updated, but auto-login failed. Please log in manually.'
            );
          }

          /*
           * C. Save session
           */

          await AsyncStorage.setItem(
              'userToken',
              loginData.access_token
            );

            await AsyncStorage.setItem(
              'shopName',
              loginData.shop_name || ''
            );

            await setActiveUser({
              userId:
                loginData.user_id ||
                loginData.user?.id ||
                loginData.email ||
                email,

              email:
                loginData.email ||
                email,
            });

            TelemetryService.setAuthToken(
              loginData.access_token
            );

            TelemetryService.trackEvent(
              'password_reset_login',
              'auth',
              {
                email,
              }
            );

            onLoginSuccess();
        } catch (error) {
          Alert.alert(
            'Error',
            error.message
          );
        } finally {
          setIsLoading(false);
        }

        return;
      }

      /*
       * =====================================
       * STANDARD LOGIN / REGISTER
       * =====================================
       */

      if (
        !email ||
        !password
      ) {
        return Alert.alert(
          'Error',
          'Please fill in all fields'
        );
      }

      if (
        authMode ===
          'register' &&
        !shopName.trim()
      ) {
        return Alert.alert(
          'Error',
          'Shop name is required'
        );
      }

      setIsLoading(true);

      const endpoint =
        authMode === 'login'
          ? '/api/v1/auth/login'
          : '/api/v1/auth/register';

      try {
        const response =
          await fetch(
            `${BASE_URL}${endpoint}`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                email,
                password,
                shop_name:
                  shopName,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Something went wrong'
          );
        }

        if (
            authMode === 'login'
          ) {

            /*
            * ============================================
            * NORMAL STOREMATE LOGIN
            * ============================================
            *
            * This login is completely independent
            * from Google Drive.
            *
            * NEVER call:
            *
            * checkForExistingBackup()
            * checkAndPromptRestore()
            * GoogleSignin.signIn()
            *
            * here.
            */

            await AsyncStorage.setItem(
              'userToken',
              data.access_token
            );

            await AsyncStorage.setItem(
              'shopName',
              data.shop_name || ''
            );

            await setActiveUser({
              userId:
                data.user_id ||
                data.user?.id ||
                data.email ||
                email,

              email:
                data.email ||
                email,
            });

            TelemetryService.setAuthToken(
              data.access_token
            );

            TelemetryService.trackEvent(
              'user_login',
              'auth',
              {
                email:
                  data.email ||
                  email,
              }
            );

            onLoginSuccess();
          } else {
          Alert.alert(
            'Success',
            'Shop registered! You can now log in.'
          );

          setAuthMode(
            'login'
          );

          setPassword('');
        }
      } catch (error) {
        Alert.alert(
          'Authentication Failed',
          error.message
        );
      } finally {
        setIsLoading(false);
      }
    };

  /*
   * =====================================
   * GOOGLE AUTHENTICATION
   * =====================================
   */

  const handleGoogleAuth =
    async () => {
      try {
        setIsLoading(true);

        await GoogleSignin.hasPlayServices();

        const userInfo =
          await GoogleSignin.signIn();

        /*
         * Token extraction compatible
         * with different versions of
         * react-native-google-signin.
         */

        let idToken =
          userInfo.idToken;

        if (
          !idToken &&
          userInfo.data &&
          userInfo.data.idToken
        ) {
          idToken =
            userInfo.data.idToken;
        }

        if (!idToken) {
          const tokens =
            await GoogleSignin.getTokens();

          idToken =
            tokens.idToken;
        }

        if (!idToken) {
          throw new Error(
            'Could not retrieve Google Security Token. Please try again.'
          );
        }

        const response =
          await fetch(
            `${BASE_URL}/api/v1/auth/google`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                token: idToken,
                shop_name:
                  shopName,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Google Auth Failed'
          );
        }

        await AsyncStorage.setItem('userToken', data.access_token);
        await AsyncStorage.setItem('shopName', data.shop_name);
        await setActiveUser({ userId: data.user_id || data.user?.id || data.email, email: data.email });

        TelemetryService.setAuthToken(
          data.access_token
        );

        TelemetryService.trackEvent(
          'google_login',
          'auth',
          {
            email: data.email,
          }
        );

        await checkAndPromptRestore();
      } catch (error) {
        if (
          error.code !==
            statusCodes.SIGN_IN_CANCELLED &&
          error.message !==
            'Google Sign-In was cancelled.'
        ) {
          Alert.alert(
            'Google Login Error',
            error.message
          );
        }
      } finally {
        setIsLoading(false);
      }
    };

  /*
   * =====================================
   * GOOGLE DRIVE RESTORE
   * =====================================
   */

  const checkAndPromptRestore =
    async () => {
      try {
        const backupResult =
          await checkForExistingBackup();

        if (
          backupResult.found &&
          backupResult.fileId
        ) {
          const backupDate =
            new Date(
              backupResult.modifiedTime
            ).toLocaleDateString(
              'en-IN',
              {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }
            );

          Alert.alert(
            'Backup Found ☁️',

            `We found a Google Drive backup for your store from ${backupDate}.\n\nWould you like to restore your records?`,

            [
              {
                text:
                  'Skip & Start Fresh',

                style:
                  'cancel',

                onPress:
                  () =>
                    onLoginSuccess(),
              },

              {
                text:
                  'Restore Data',

                onPress:
                  async () => {
                    setIsLoading(
                      true
                    );

                    try {
                      await restoreFromDrive(
                        backupResult.fileId
                      );

                      Alert.alert(
                        'Restored! 🎉',
                        'Your shop records have been restored.'
                      );
                    } catch (
                      err
                    ) {
                      Alert.alert(
                        'Restore Warning',
                        'Could not complete full restore: ' +
                          err.message
                      );
                    } finally {
                      setIsLoading(
                        false
                      );

                      onLoginSuccess();
                    }
                  },
              },
            ],

            {
              cancelable:
                false,
            }
          );
        } else {
          onLoginSuccess();
        }
      } catch (err) {
        console.log(
          'Drive backup check skipped:',
          err.message
        );

        onLoginSuccess();
      }
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

        /*
         * Dynamic system bar handling.
         *
         * top:
         * status bar / notch
         *
         * bottom:
         * Android navigation bar /
         * gesture area
         */
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
      <KeyboardAvoidingView
        style={
          styles.keyboardContainer
        }

        /*
         * Android needs height adjustment
         * when the keyboard opens.
         *
         * iOS uses padding.
         */
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : 'height'
        }

        keyboardVerticalOffset={
          0
        }
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,

            /*
             * Ensures the final controls
             * can always scroll above the
             * Android navigation area.
             */
            {
              paddingBottom:
                Math.max(
                  insets.bottom +
                    32,
                  48
                ),
            },
          ]}

          keyboardShouldPersistTaps="handled"

          keyboardDismissMode={
            Platform.OS ===
            'ios'
              ? 'interactive'
              : 'on-drag'
          }

          showsVerticalScrollIndicator={
            false
          }

          bounces={true}
        >
          <View
            style={[
              styles.content,

              {
                paddingHorizontal:
                  horizontalPadding,

                /*
                 * Prevent the form becoming
                 * excessively wide on tablets
                 * and large Android devices.
                 */
                maxWidth: 600,

                width: '100%',

                alignSelf:
                  'center',
              },
            ]}
          >
            {/* LOGO */}

            <View
              style={
                styles.logoCircle
              }
            >
              <Text
                style={
                  styles.logo
                }
              >
                📦
              </Text>
            </View>

            {/* HEADER */}

            <Text
              style={
                styles.header
              }
            >
              Storemate
            </Text>

            {/* SUBHEADER */}

            <Text
              style={
                styles.subHeader
              }
            >
              {authMode ===
                'login' &&
                'Welcome back to your shop'}

              {authMode ===
                'register' &&
                'Create your digital khata'}

              {authMode ===
                'forgot' &&
                'Reset your password'}

              {authMode ===
                'verify_otp' &&
                'Enter your 6-digit OTP'}
            </Text>

            <View
              style={
                styles.form
              }
            >
              {/* SHOP NAME */}

              {authMode ===
                'register' && (
                <TextInput
                  style={
                    styles.input
                  }

                  placeholder="Shop Name (Optional for Google)"

                  placeholderTextColor="#9CA3AF"

                  value={
                    shopName
                  }

                  onChangeText={
                    setShopName
                  }

                  returnKeyType="next"

                  autoCapitalize="words"

                  autoCorrect={false}
                />
              )}

              {/* EMAIL */}

              {authMode !==
                'verify_otp' && (
                <TextInput
                  style={
                    styles.input
                  }

                  placeholder="Email Address"

                  placeholderTextColor="#9CA3AF"

                  keyboardType="email-address"

                  autoCapitalize="none"

                  autoCorrect={false}

                  autoComplete="email"

                  textContentType="emailAddress"

                  value={
                    email
                  }

                  onChangeText={
                    setEmail
                  }

                  returnKeyType="next"
                />
              )}

              {/* PASSWORD */}

              {(
                authMode ===
                  'login' ||
                authMode ===
                  'register'
              ) && (
                <View>
                  <TextInput
                    style={
                      styles.input
                    }

                    placeholder="Password"

                    placeholderTextColor="#9CA3AF"

                    secureTextEntry

                    autoCapitalize="none"

                    autoCorrect={false}

                    value={
                      password
                    }

                    onChangeText={
                      setPassword
                    }

                    returnKeyType="done"

                    onSubmitEditing={
                      handleSubmit
                    }
                  />

                  {authMode ===
                    'login' && (
                    <TouchableOpacity
                      onPress={() =>
                        setAuthMode(
                          'forgot'
                        )
                      }

                      style={
                        styles.forgotBtn
                      }

                      activeOpacity={
                        0.7
                      }
                    >
                      <Text
                        style={
                          styles.forgotText
                        }
                      >
                        Forgot Password?
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* OTP + NEW PASSWORD */}

              {authMode ===
                'verify_otp' && (
                <View>
                  <Text
                    style={
                      styles.helperText
                    }
                  >
                    OTP sent to:{' '}
                    {email}
                  </Text>

                  <TextInput
                    style={
                      styles.input
                    }

                    placeholder="Enter 6-digit OTP"

                    placeholderTextColor="#9CA3AF"

                    keyboardType="numeric"

                    maxLength={6}

                    value={otp}

                    onChangeText={
                      setOtp
                    }

                    returnKeyType="next"

                    autoFocus
                  />

                  <TextInput
                    style={
                      styles.input
                    }

                    placeholder="Enter New Password"

                    placeholderTextColor="#9CA3AF"

                    secureTextEntry

                    autoCapitalize="none"

                    autoCorrect={false}

                    value={
                      newPassword
                    }

                    onChangeText={
                      setNewPassword
                    }

                    returnKeyType="done"

                    onSubmitEditing={
                      handleSubmit
                    }
                  />
                </View>
              )}

              {/* SUBMIT */}

              <TouchableOpacity
                style={
                  styles.submitBtn
                }

                onPress={
                  handleSubmit
                }

                disabled={
                  isLoading
                }

                activeOpacity={
                  0.88
                }
              >
                {isLoading ? (
                  <ActivityIndicator
                    color="#fff"
                  />
                ) : (
                  <Text
                    style={
                      styles.submitBtnText
                    }
                  >
                    {authMode ===
                      'login' &&
                      'Login'}

                    {authMode ===
                      'register' &&
                      'Register Shop'}

                    {authMode ===
                      'forgot' &&
                      'Send Reset OTP'}

                    {authMode ===
                      'verify_otp' &&
                      'Update Password'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* GOOGLE LOGIN */}

              {authMode !==
                'forgot' &&
                authMode !==
                  'verify_otp' && (
                  <>
                    <View
                      style={
                        styles.dividerRow
                      }
                    >
                      <View
                        style={
                          styles.dividerLine
                        }
                      />

                      <Text
                        style={
                          styles.dividerText
                        }
                      >
                        OR
                      </Text>

                      <View
                        style={
                          styles.dividerLine
                        }
                      />
                    </View>

                    <TouchableOpacity
                      style={
                        styles.googleBtn
                      }

                      onPress={
                        handleGoogleAuth
                      }

                      disabled={
                        isLoading
                      }

                      activeOpacity={
                        0.85
                      }
                    >
                      {isLoading ? (
                        <ActivityIndicator
                          color="#1B1F23"
                        />
                      ) : (
                        <Text
                          style={
                            styles.googleBtnText
                          }
                        >
                          Continue with Google
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}

              {/* BOTTOM TOGGLE */}

              <TouchableOpacity
                onPress={() => {
                  if (
                    authMode ===
                      'verify_otp' ||
                    authMode ===
                      'forgot'
                  ) {
                    setAuthMode(
                      'login'
                    );
                  } else {
                    setAuthMode(
                      authMode ===
                        'login'
                        ? 'register'
                        : 'login'
                    );
                  }
                }}

                style={
                  styles.toggleBtn
                }

                activeOpacity={
                  0.7
                }
              >
                <Text
                  style={
                    styles.toggleText
                  }
                >
                  {authMode ===
                    'login' &&
                    "Don't have an account? "}

                  {authMode ===
                    'register' &&
                    'Already have a shop? '}

                  {(authMode ===
                    'forgot' ||
                    authMode ===
                      'verify_otp') &&
                    'Remembered your password? '}

                  <Text
                    style={
                      styles.toggleTextBold
                    }
                  >
                    {authMode ===
                    'login'
                      ? 'Register'
                      : 'Login'}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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

    keyboardContainer: {
      flex: 1,
    },

    scrollContent: {
      flexGrow: 1,

      /*
       * Center on normal/large screens,
       * while still allowing the entire
       * form to scroll on short phones.
       */
      justifyContent:
        'center',
    },

    content: {
      alignItems:
        'center',

      paddingVertical: 32,
    },

    logoCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,

      backgroundColor:
        '#E7F7EE',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 16,
    },

    logo: {
      fontSize: 40,
    },

    header: {
      color: '#1B1F23',
      fontSize: 28,
      fontWeight: '800',

      textAlign:
        'center',
    },

    subHeader: {
      color: '#6B7280',
      fontSize: 15,

      marginTop: 6,
      marginBottom: 36,

      textAlign:
        'center',

      lineHeight: 21,

      maxWidth: 420,
    },

    form: {
      width: '100%',
    },

    input: {
      width: '100%',

      backgroundColor:
        '#FFFFFF',

      color: '#1B1F23',

      paddingHorizontal: 16,
      paddingVertical: 15,

      borderRadius: 12,

      borderWidth: 1,
      borderColor:
        '#EAECEC',

      marginBottom: 14,

      fontSize: 15,

      minHeight: 52,
    },

    forgotBtn: {
      alignSelf:
        'flex-end',

      marginBottom: 14,

      marginTop: -6,

      paddingVertical: 4,
      paddingHorizontal: 2,
    },

    forgotText: {
      color: '#0C9C4C',
      fontWeight: '600',
      fontSize: 13.5,
    },

    helperText: {
      color: '#6B7280',
      fontSize: 13,

      marginBottom: 10,

      textAlign:
        'center',
    },

    submitBtn: {
      width: '100%',

      backgroundColor:
        '#0C9C4C',

      paddingVertical: 17,

      minHeight: 54,

      borderRadius: 12,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginTop: 6,

      shadowColor:
        '#0C9C4C',

      shadowOpacity: 0.28,

      shadowRadius: 10,

      shadowOffset: {
        width: 0,
        height: 5,
      },

      elevation: 3,
    },

    submitBtnText: {
      color: '#fff',
      fontSize: 17,
      fontWeight: '700',
    },

    dividerRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      marginVertical: 24,
    },

    dividerLine: {
      flex: 1,
      height: 1,

      backgroundColor:
        '#EAECEC',
    },

    dividerText: {
      marginHorizontal: 14,

      color: '#9CA3AF',

      fontWeight: '600',

      fontSize: 13,
    },

    googleBtn: {
      width: '100%',

      backgroundColor:
        '#FFFFFF',

      paddingVertical: 16,

      minHeight: 52,

      borderRadius: 12,

      alignItems:
        'center',

      justifyContent:
        'center',

      borderWidth: 1,

      borderColor:
        '#EAECEC',
    },

    googleBtnText: {
      color: '#1B1F23',

      fontSize: 16,

      fontWeight: '700',
    },

    toggleBtn: {
      marginTop: 22,

      padding: 10,

      alignItems:
        'center',

      justifyContent:
        'center',

      minHeight: 44,
    },

    toggleText: {
      color: '#6B7280',
      fontSize: 14.5,

      textAlign:
        'center',
    },

    toggleTextBold: {
      color: '#0C9C4C',
      fontWeight: '700',
    },
  });

export default LoginScreen;