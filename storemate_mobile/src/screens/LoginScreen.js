import React, {
  useState,
} from 'react';

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

import {
  setActiveUser,
} from '../core/auth/localUser';

import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import {
  checkForExistingBackup,
  restoreFromDrive,
} from '../services/BackupService';

import TelemetryService from '../services/TelemetryService';

import {
  BASE_URL,
} from '../config/api';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';


/* =============================================================
 * COUNTR LOGIN SCREEN
 * ============================================================= */

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
   */

  const horizontalPadding =
    windowWidth < 360
      ? 18
      : windowWidth < 600
      ? 24
      : 40;


  /*
   * Authentication modes:
   *
   * login
   * register
   * forgot
   * verify_otp
   */

  const [
    authMode,
    setAuthMode,
  ] = useState(
    'login'
  );


  const [
    email,
    setEmail,
  ] = useState('');


  const [
    password,
    setPassword,
  ] = useState('');


  const [
    shopName,
    setShopName,
  ] = useState('');


  const [
    otp,
    setOtp,
  ] = useState('');


  const [
    newPassword,
    setNewPassword,
  ] = useState('');


  const [
    isLoading,
    setIsLoading,
  ] = useState(false);


  /* ===========================================================
   * HELPERS
   * =========================================================== */

  const getUserId =
    data => {

      return (
        data?.user_id ||
        data?.user?.id ||
        data?.email ||
        email
      );
    };


  const saveSession =
    async data => {

      await AsyncStorage.setItem(
        'userToken',
        data.access_token
      );


      await AsyncStorage.setItem(
        'shopName',
        data.shop_name ||
          shopName ||
          ''
      );


      await setActiveUser({

        userId:
          getUserId(
            data
          ),

        email:
          data.email ||
          email,

      });


      TelemetryService.setAuthToken(
        data.access_token
      );
    };


  /* ===========================================================
   * EMAIL LOGIN / REGISTER / PASSWORD RESET
   * =========================================================== */

  const handleSubmit =
    async () => {

      /*
       * =======================================================
       * FORGOT PASSWORD
       * =======================================================
       */

      if (
        authMode ===
        'forgot'
      ) {

        if (
          !email.trim()
        ) {

          return Alert.alert(
            'Email required',
            'Please enter your registered email address.'
          );
        }


        setIsLoading(
          true
        );


        try {

          const response =
            await fetch(
              `${BASE_URL}/api/v1/auth/forgot-password`,
              {

                method:
                  'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body:
                  JSON.stringify({
                    email:
                      email.trim(),
                  }),

              }
            );


          const data =
            await response.json();


          if (
            !response.ok
          ) {

            throw new Error(
              data.error ||
                'Failed to send OTP'
            );
          }


          Alert.alert(
            'OTP sent 📩',
            'Check your email inbox for the 6-digit reset code.'
          );


          setAuthMode(
            'verify_otp'
          );

        } catch (
          error
        ) {

          Alert.alert(
            'Unable to send OTP',
            error.message
          );

        } finally {

          setIsLoading(
            false
          );
        }


        return;
      }


      /*
       * =======================================================
       * VERIFY OTP / RESET PASSWORD
       * =======================================================
       */

      if (
        authMode ===
        'verify_otp'
      ) {

        if (
          !otp.trim() ||
          !newPassword
        ) {

          return Alert.alert(
            'Missing information',
            'Please enter the 6-digit OTP and your new password.'
          );
        }


        if (
          otp.trim().length !==
          6
        ) {

          return Alert.alert(
            'Invalid OTP',
            'Please enter the complete 6-digit OTP.'
          );
        }


        setIsLoading(
          true
        );


        try {

          /*
           * A. RESET PASSWORD
           */

          const resetResponse =
            await fetch(
              `${BASE_URL}/api/v1/auth/reset-password`,
              {

                method:
                  'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body:
                  JSON.stringify({

                    email:
                      email.trim(),

                    otp:
                      otp.trim(),

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
           * B. AUTOMATIC LOGIN
           */

          const loginResponse =
            await fetch(
              `${BASE_URL}/api/v1/auth/login`,
              {

                method:
                  'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body:
                  JSON.stringify({

                    email:
                      email.trim(),

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
              'Password updated, but automatic login failed. Please log in manually.'
            );
          }


          /*
           * C. SAVE SESSION
           */

          await saveSession(
            loginData
          );


          TelemetryService.trackEvent(
            'password_reset_login',
            'auth',
            {
              email:
                loginData.email ||
                email,
            }
          );


          onLoginSuccess();

        } catch (
          error
        ) {

          Alert.alert(
            'Password reset failed',
            error.message
          );

        } finally {

          setIsLoading(
            false
          );
        }


        return;
      }


      /*
       * =======================================================
       * NORMAL LOGIN / REGISTER
       * =======================================================
       */

      if (
        !email.trim() ||
        !password
      ) {

        return Alert.alert(
          'Missing information',
          'Please enter your email and password.'
        );
      }


      if (
        authMode ===
          'register' &&
        !shopName.trim()
      ) {

        return Alert.alert(
          'Shop name required',
          'Please enter your shop name.'
        );
      }


      setIsLoading(
        true
      );


      const endpoint =
        authMode ===
        'login'

          ? '/api/v1/auth/login'

          : '/api/v1/auth/register';


      try {

        const response =
          await fetch(
            `${BASE_URL}${endpoint}`,
            {

              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({

                  email:
                    email.trim(),

                  password:
                    password,

                  shop_name:
                    shopName.trim(),

                }),

            }
          );


        const data =
          await response.json();


        if (
          !response.ok
        ) {

          throw new Error(
            data.error ||
              'Something went wrong'
          );
        }


        /*
         * =====================================================
         * LOGIN
         * =====================================================
         */

        if (
          authMode ===
          'login'
        ) {

          await saveSession(
            data
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

          /*
           * ===================================================
           * REGISTER
           * ===================================================
           */

          Alert.alert(
            'Shop created 🎉',
            'Your Countr shop has been registered. You can now log in.'
          );


          setAuthMode(
            'login'
          );


          setPassword(
            ''
          );
        }

      } catch (
        error
      ) {

        Alert.alert(
          'Authentication failed',
          error.message
        );

      } finally {

        setIsLoading(
          false
        );
      }
    };


  /* ===========================================================
   * GOOGLE AUTHENTICATION
   * =========================================================== */

  const handleGoogleAuth =
    async () => {

      try {

        setIsLoading(
          true
        );


        await GoogleSignin.hasPlayServices();


        const userInfo =
          await GoogleSignin.signIn();


        /*
         * Compatible with different
         * Google Sign-In versions.
         */

        let idToken =
          userInfo?.idToken;


        if (
          !idToken &&
          userInfo?.data?.idToken
        ) {

          idToken =
            userInfo.data.idToken;
        }


        if (
          !idToken
        ) {

          const tokens =
            await GoogleSignin.getTokens();


          idToken =
            tokens?.idToken;
        }


        if (
          !idToken
        ) {

          throw new Error(
            'Could not retrieve Google security token. Please try again.'
          );
        }


        const response =
          await fetch(
            `${BASE_URL}/api/v1/auth/google`,
            {

              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({

                  token:
                    idToken,

                  shop_name:
                    shopName.trim(),

                }),

            }
          );


        const data =
          await response.json();


        if (
          !response.ok
        ) {

          throw new Error(
            data.error ||
              'Google authentication failed'
          );
        }


        /*
         * Save normal Countr session.
         */

        await saveSession(
          data
        );


        TelemetryService.trackEvent(
          'google_login',
          'auth',
          {
            email:
              data.email,
          }
        );


        /*
         * Google Drive restore is
         * intentionally ONLY called
         * after Google authentication.
         */

        await checkAndPromptRestore();

      } catch (
        error
      ) {

        if (
          error?.code !==
            statusCodes.SIGN_IN_CANCELLED &&
          error?.message !==
            'Google Sign-In was cancelled.'
        ) {

          Alert.alert(
            'Google login error',
            error.message
          );
        }

      } finally {

        setIsLoading(
          false
        );
      }
    };


  /* ===========================================================
   * GOOGLE DRIVE RESTORE
   * =========================================================== */

  const checkAndPromptRestore =
    async () => {

      try {

        const backupResult =
          await checkForExistingBackup();


        if (
          backupResult?.found &&
          backupResult?.fileId
        ) {

          const backupDate =
            new Date(
              backupResult.modifiedTime
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
            );


          Alert.alert(

            'Backup found ☁️',

            `We found a Google Drive backup for your shop from ${backupDate}.\n\nWould you like to restore your records?`,

            [

              {
                text:
                  'Start Fresh',

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
                        'Restored 🎉',
                        'Your shop records have been restored successfully.'
                      );

                    } catch (
                      error
                    ) {

                      Alert.alert(

                        'Restore warning',

                        'Could not complete the full restore: ' +
                          error.message

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

      } catch (
        error
      ) {

        console.log(
          'Drive backup check skipped:',
          error?.message
        );


        onLoginSuccess();
      }
    };


  /* ===========================================================
   * MODE HELPERS
   * =========================================================== */

  const isLogin =
    authMode ===
    'login';

  const isRegister =
    authMode ===
    'register';

  const isForgot =
    authMode ===
    'forgot';

  const isVerify =
    authMode ===
    'verify_otp';


  /* ===========================================================
   * SCREEN
   * =========================================================== */

  return (

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
              12
            ),
        },
      ]}
    >

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

        keyboardVerticalOffset={
          0
        }
      >

        <ScrollView

          contentContainerStyle={[
            styles.scrollContent,

            {
              paddingBottom:
                Math.max(
                  insets.bottom +
                    30,
                  45
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

          bounces={
            true
          }
        >

          <View
            style={[
              styles.content,

              {
                paddingHorizontal:
                  horizontalPadding,

                maxWidth:
                  600,

                width:
                  '100%',

                alignSelf:
                  'center',
              },
            ]}
          >

            {/* =================================================
                TOP BRAND
                ================================================= */}

            <View
              style={
                styles.brandArea
              }
            >

              <View
                style={
                  styles.brandMark
                }
              >

                <View
                  style={
                    styles.brandMarkInner
                  }
                >

                  <Text
                    style={
                      styles.brandMarkText
                    }
                  >
                    C
                  </Text>

                </View>

              </View>


              <Text
                style={
                  styles.brandName
                }
              >
                countr
              </Text>


              <Text
                style={
                  styles.brandTagline
                }
              >
                Your shop. Your voice. Your control.
              </Text>

            </View>


            {/* =================================================
                WELCOME CARD
                ================================================= */}

            <View
              style={
                styles.welcomeCard
              }
            >

              <View
                style={
                  styles.welcomeTopRow
                }
              >

                <View
                  style={
                    styles.welcomeIcon
                  }
                >

                  <Text
                    style={
                      styles.welcomeIconText
                    }
                  >
                    {isLogin
                      ? '→'
                      : isRegister
                      ? '+'
                      : isForgot
                      ? '?'
                      : '✓'}
                  </Text>

                </View>


                <View
                  style={
                    styles.secureBadge
                  }
                >

                  <View
                    style={
                      styles.secureDot
                    }
                  />

                  <Text
                    style={
                      styles.secureText
                    }
                  >
                    SECURE
                  </Text>

                </View>

              </View>


              <Text
                style={
                  styles.title
                }
              >

                {isLogin &&
                  'Welcome back.'}

                {isRegister &&
                  'Start your shop.'}

                {isForgot &&
                  'Reset your password.'}

                {isVerify &&
                  'Verify your account.'}

              </Text>


              <Text
                style={
                  styles.subtitle
                }
              >

                {isLogin &&
                  'Manage sales, Khata and inventory from one simple place.'}

                {isRegister &&
                  'Create your Countr account and bring your shop online.'}

                {isForgot &&
                  'We’ll send a secure OTP to your registered email.'}

                {isVerify &&
                  'Enter the OTP we sent and create a new password.'}

              </Text>

            </View>


            {/* =================================================
                FORM
                ================================================= */}

            <View
              style={
                styles.form
              }
            >

              {/* SHOP NAME */}

              {isRegister && (

                <View
                  style={
                    styles.fieldGroup
                  }
                >

                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    SHOP NAME
                  </Text>


                  <View
                    style={
                      styles.inputShell
                    }
                  >

                    <Text
                      style={
                        styles.inputIcon
                      }
                    >
                      ⌂
                    </Text>


                    <TextInput

                      style={
                        styles.input
                      }

                      placeholder="e.g. Sharma General Store"

                      placeholderTextColor={
                        '#A2AAA5'
                      }

                      value={
                        shopName
                      }

                      onChangeText={
                        setShopName
                      }

                      returnKeyType="next"

                      autoCapitalize="words"

                      autoCorrect={
                        false
                      }

                    />

                  </View>

                </View>

              )}


              {/* EMAIL */}

              {!isVerify && (

                <View
                  style={
                    styles.fieldGroup
                  }
                >

                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    EMAIL ADDRESS
                  </Text>


                  <View
                    style={
                      styles.inputShell
                    }
                  >

                    <Text
                      style={
                        styles.inputIcon
                      }
                    >
                      @
                    </Text>


                    <TextInput

                      style={
                        styles.input
                      }

                      placeholder="you@example.com"

                      placeholderTextColor={
                        '#A2AAA5'
                      }

                      keyboardType="email-address"

                      autoCapitalize="none"

                      autoCorrect={
                        false
                      }

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

                  </View>

                </View>

              )}


              {/* PASSWORD */}

              {(isLogin ||
                isRegister) && (

                <View
                  style={
                    styles.fieldGroup
                  }
                >

                  <View
                    style={
                      styles.labelRow
                    }
                  >

                    <Text
                      style={
                        styles.fieldLabel
                      }
                    >
                      PASSWORD
                    </Text>


                    {isLogin && (

                      <TouchableOpacity

                        onPress={() =>
                          setAuthMode(
                            'forgot'
                          )
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
                          Forgot password?
                        </Text>

                      </TouchableOpacity>

                    )}

                  </View>


                  <View
                    style={
                      styles.inputShell
                    }
                  >

                    <Text
                      style={
                        styles.inputIcon
                      }
                    >
                      •
                    </Text>


                    <TextInput

                      style={
                        styles.input
                      }

                      placeholder="Enter your password"

                      placeholderTextColor={
                        '#A2AAA5'
                      }

                      secureTextEntry

                      autoCapitalize="none"

                      autoCorrect={
                        false
                      }

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

                  </View>

                </View>

              )}


              {/* =================================================
                  OTP
                  ================================================= */}

              {isVerify && (

                <View>

                  <View
                    style={
                      styles.otpInfo
                    }
                  >

                    <Text
                      style={
                        styles.otpInfoTitle
                      }
                    >
                      OTP sent to
                    </Text>


                    <Text
                      style={
                        styles.otpEmail
                      }
                    >
                      {email}
                    </Text>

                  </View>


                  <View
                    style={
                      styles.fieldGroup
                    }
                  >

                    <Text
                      style={
                        styles.fieldLabel
                      }
                    >
                      6-DIGIT OTP
                    </Text>


                    <View
                      style={
                        styles.inputShell
                      }
                    >

                      <Text
                        style={
                          styles.inputIcon
                        }
                      >
                        #
                      </Text>


                      <TextInput

                        style={[
                          styles.input,

                          styles.otpInput,
                        ]}

                        placeholder="000000"

                        placeholderTextColor={
                          '#A2AAA5'
                        }

                        keyboardType="numeric"

                        maxLength={
                          6
                        }

                        value={
                          otp
                        }

                        onChangeText={
                          setOtp
                        }

                        returnKeyType="next"

                        autoFocus

                      />

                    </View>

                  </View>


                  <View
                    style={
                      styles.fieldGroup
                    }
                  >

                    <Text
                      style={
                        styles.fieldLabel
                      }
                    >
                      NEW PASSWORD
                    </Text>


                    <View
                      style={
                        styles.inputShell
                      }
                    >

                      <Text
                        style={
                          styles.inputIcon
                        }
                      >
                        •
                      </Text>


                      <TextInput

                        style={
                          styles.input
                        }

                        placeholder="Create a new password"

                        placeholderTextColor={
                          '#A2AAA5'
                        }

                        secureTextEntry

                        autoCapitalize="none"

                        autoCorrect={
                          false
                        }

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

                  </View>

                </View>

              )}


              {/* =================================================
                  SUBMIT
                  ================================================= */}

              <TouchableOpacity

                style={[
                  styles.submitButton,

                  isLoading &&
                    styles.submitButtonLoading,
                ]}

                onPress={
                  handleSubmit
                }

                disabled={
                  isLoading
                }

                activeOpacity={
                  0.86
                }
              >

                {isLoading ? (

                  <ActivityIndicator
                    color="#FFFFFF"
                  />

                ) : (

                  <>

                    <Text
                      style={
                        styles.submitText
                      }
                    >

                      {isLogin &&
                        'Login to Countr'}

                      {isRegister &&
                        'Create My Shop'}

                      {isForgot &&
                        'Send Reset OTP'}

                      {isVerify &&
                        'Update Password'}

                    </Text>


                    <Text
                      style={
                        styles.submitArrow
                      }
                    >
                      →
                    </Text>

                  </>

                )}

              </TouchableOpacity>


              {/* =================================================
                  GOOGLE
                  ================================================= */}

              {!isForgot &&
                !isVerify && (

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
                      styles.googleButton
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

                    <View
                      style={
                        styles.googleIcon
                      }
                    >

                      <Text
                        style={
                          styles.googleG
                        }
                      >
                        G
                      </Text>

                    </View>


                    <Text
                      style={
                        styles.googleText
                      }
                    >
                      Continue with Google
                    </Text>

                  </TouchableOpacity>

                </>

              )}


              {/* =================================================
                  MODE SWITCH
                  ================================================= */}

              <View
                style={
                  styles.bottomSwitch
                }
              >

                <Text
                  style={
                    styles.bottomText
                  }
                >

                  {isLogin &&
                    "Don't have a Countr account? "}

                  {isRegister &&
                    'Already have an account? '}

                  {(isForgot ||
                    isVerify) &&
                    'Remember your password? '}

                </Text>


                <TouchableOpacity

                  onPress={() => {

                    if (
                      isForgot ||
                      isVerify
                    ) {

                      setAuthMode(
                        'login'
                      );

                    } else {

                      setAuthMode(
                        isLogin
                          ? 'register'
                          : 'login'
                      );

                    }

                  }}

                  activeOpacity={
                    0.7
                  }
                >

                  <Text
                    style={
                      styles.bottomLink
                    }
                  >

                    {isLogin
                      ? 'Create account'

                      : 'Login'}

                  </Text>

                </TouchableOpacity>

              </View>

            </View>


            {/* =================================================
                TRUST FOOTER
                ================================================= */}

            <View
              style={
                styles.trustFooter
              }
            >

              <View
                style={
                  styles.trustItem
                }
              >

                <Text
                  style={
                    styles.trustIcon
                  }
                >
                  ✓
                </Text>

                <Text
                  style={
                    styles.trustText
                  }
                >
                  Secure login
                </Text>

              </View>


              <View
                style={
                  styles.trustSeparator
                }
              />


              <View
                style={
                  styles.trustItem
                }
              >

                <Text
                  style={
                    styles.trustIcon
                  }
                >
                  ☁
                </Text>

                <Text
                  style={
                    styles.trustText
                  }
                >
                  Your shop data
                </Text>

              </View>

            </View>


            <Text
              style={
                styles.companyText
              }
            >
              COUNTR TECHNOLOGY PVT. LTD.
            </Text>

          </View>

        </ScrollView>

      </KeyboardAvoidingView>

    </View>
  );
};


/* =============================================================
 * STYLES
 * ============================================================= */

const styles =
  StyleSheet.create({

    /* ========================================================
       BASE
       ======================================================== */

    container: {
      flex: 1,

      backgroundColor:
        '#F5F7F5',
    },


    keyboardContainer: {
      flex: 1,
    },


    scrollContent: {
      flexGrow: 1,

      justifyContent:
        'center',
    },


    content: {
      paddingTop: 24,

      paddingBottom: 20,
    },


    /* ========================================================
       BRAND
       ======================================================== */

    brandArea: {
      alignItems:
        'center',

      marginBottom: 22,
    },


    brandMark: {
      width: 62,

      height: 62,

      borderRadius: 21,

      backgroundColor:
        '#DFFFAD',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 10,

      transform: [
        {
          rotate:
            '-4deg',
        },
      ],
    },


    brandMarkInner: {
      width: 46,

      height: 46,

      borderRadius: 16,

      backgroundColor:
        '#172019',

      alignItems:
        'center',

      justifyContent:
        'center',

      transform: [
        {
          rotate:
            '4deg',
        },
      ],
    },


    brandMarkText: {
      color:
        '#DFFFAD',

      fontSize: 25,

      fontWeight:
        '900',

      letterSpacing:
        -1,
    },


    brandName: {
      color:
        '#172019',

      fontSize: 28,

      fontWeight:
        '900',

      letterSpacing:
        -1.3,
    },


    brandTagline: {
      color:
        '#7C867F',

      fontSize: 10,

      fontWeight:
        '600',

      marginTop: 3,

      textAlign:
        'center',
    },


    /* ========================================================
       WELCOME
       ======================================================== */

    welcomeCard: {
      backgroundColor:
        '#FFFFFF',

      borderRadius: 22,

      borderWidth: 1,

      borderColor:
        '#E1E7E1',

      padding: 17,

      marginBottom: 18,
    },


    welcomeTopRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      marginBottom: 12,
    },


    welcomeIcon: {
      width: 38,

      height: 38,

      borderRadius: 12,

      backgroundColor:
        '#ECF7E4',

      alignItems:
        'center',

      justifyContent:
        'center',
    },


    welcomeIconText: {
      color:
        '#6C9637',

      fontSize: 19,

      fontWeight:
        '900',
    },


    secureBadge: {
      flexDirection:
        'row',

      alignItems:
        'center',

      backgroundColor:
        '#F5F8F4',

      borderRadius: 8,

      paddingHorizontal: 8,

      paddingVertical: 5,
    },


    secureDot: {
      width: 5,

      height: 5,

      borderRadius: 5,

      backgroundColor:
        '#6C9637',

      marginRight: 5,
    },


    secureText: {
      color:
        '#71806F',

      fontSize: 7,

      fontWeight:
        '900',

      letterSpacing:
        0.8,
    },


    title: {
      color:
        '#172019',

      fontSize: 24,

      lineHeight: 29,

      fontWeight:
        '900',

      letterSpacing:
        -0.8,
    },


    subtitle: {
      color:
        '#7A847D',

      fontSize: 10,

      lineHeight: 15,

      fontWeight:
        '500',

      marginTop: 5,

      maxWidth: 470,
    },


    /* ========================================================
       FORM
       ======================================================== */

    form: {
      width:
        '100%',
    },


    fieldGroup: {
      marginBottom: 13,
    },


    labelRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      marginBottom: 6,
    },


    fieldLabel: {
      color:
        '#59645D',

      fontSize: 7.5,

      fontWeight:
        '900',

      letterSpacing:
        1.1,

      marginBottom: 6,
    },


    labelRow: {
      marginBottom: 0,
    },


    forgotText: {
      color:
        '#6C9637',

      fontSize: 8.5,

      fontWeight:
        '800',

      marginBottom: 6,
    },


    inputShell: {
      minHeight: 52,

      backgroundColor:
        '#FFFFFF',

      borderRadius: 14,

      borderWidth: 1,

      borderColor:
        '#DDE4DE',

      flexDirection:
        'row',

      alignItems:
        'center',

      paddingHorizontal:
        11,
    },


    inputShellFocused: {
      borderColor:
        '#6C9637',
    },


    inputIcon: {
      width: 27,

      height: 27,

      borderRadius: 9,

      backgroundColor:
        '#F1F5EF',

      color:
        '#6C9637',

      fontSize: 11,

      fontWeight:
        '900',

      textAlign:
        'center',

      textAlignVertical:
        'center',

      marginRight: 8,
    },


    input: {
      flex: 1,

      minHeight: 50,

      color:
        '#172019',

      fontSize: 11,

      fontWeight:
        '600',

      paddingVertical: 8,

      paddingHorizontal: 0,
    },


    otpInput: {
      fontSize: 17,

      letterSpacing:
        5,

      fontWeight:
        '800',
    },


    /* ========================================================
       OTP
       ======================================================== */

    otpInfo: {
      backgroundColor:
        '#ECF7E4',

      borderRadius: 13,

      padding: 11,

      marginBottom: 14,
    },


    otpInfoTitle: {
      color:
        '#78916B',

      fontSize: 7.5,

      fontWeight:
        '700',
    },


    otpEmail: {
      color:
        '#385126',

      fontSize: 10,

      fontWeight:
        '900',

      marginTop: 2,
    },


    /* ========================================================
       SUBMIT
       ======================================================== */

    submitButton: {
      minHeight: 56,

      borderRadius: 16,

      backgroundColor:
        '#6C9637',

      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      paddingHorizontal:
        17,

      marginTop: 3,

      shadowColor:
        '#527A28',

      shadowOffset: {
        width: 0,

        height: 5,
      },

      shadowOpacity:
        0.18,

      shadowRadius:
        10,

      elevation: 3,
    },


    submitButtonLoading: {
      justifyContent:
        'center',
    },


    submitText: {
      color:
        '#FFFFFF',

      fontSize: 11.5,

      fontWeight:
        '900',
    },


    submitArrow: {
      color:
        '#FFFFFF',

      fontSize: 22,

      fontWeight:
        '300',
    },


    /* ========================================================
       DIVIDER
       ======================================================== */

    dividerRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      marginVertical: 17,
    },


    dividerLine: {
      flex: 1,

      height: 1,

      backgroundColor:
        '#E2E7E3',
    },


    dividerText: {
      color:
        '#A0A8A2',

      fontSize: 7.5,

      fontWeight:
        '900',

      marginHorizontal: 11,

      letterSpacing:
        1,
    },


    /* ========================================================
       GOOGLE
       ======================================================== */

    googleButton: {
      minHeight: 53,

      borderRadius: 15,

      backgroundColor:
        '#FFFFFF',

      borderWidth: 1,

      borderColor:
        '#DDE4DE',

      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'center',
    },


    googleIcon: {
      width: 28,

      height: 28,

      borderRadius: 9,

      backgroundColor:
        '#F5F7F5',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 8,
    },


    googleG: {
      color:
        '#4285F4',

      fontSize: 13,

      fontWeight:
        '900',
    },


    googleText: {
      color:
        '#28322C',

      fontSize: 10,

      fontWeight:
        '800',
    },


    /* ========================================================
       BOTTOM SWITCH
       ======================================================== */

    bottomSwitch: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'center',

      flexWrap:
        'wrap',

      marginTop: 18,
    },


    bottomText: {
      color:
        '#87918A',

      fontSize: 8.5,

      fontWeight:
        '600',

      textAlign:
        'center',
    },


    bottomLink: {
      color:
        '#6C9637',

      fontSize: 8.5,

      fontWeight:
        '900',

      marginLeft: 3,
    },


    /* ========================================================
       TRUST FOOTER
       ======================================================== */

    trustFooter: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginTop: 21,

      paddingTop: 14,

      borderTopWidth: 1,

      borderTopColor:
        '#E5E9E5',
    },


    trustItem: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },


    trustIcon: {
      width: 19,

      height: 19,

      borderRadius: 6,

      backgroundColor:
        '#EAF4E3',

      color:
        '#6C9637',

      fontSize: 9,

      fontWeight:
        '900',

      textAlign:
        'center',

      textAlignVertical:
        'center',

      marginRight: 5,
    },


    trustText: {
      color:
        '#87918A',

      fontSize: 7.5,

      fontWeight:
        '700',
    },


    trustSeparator: {
      width: 1,

      height: 14,

      backgroundColor:
        '#DDE3DE',

      marginHorizontal: 13,
    },


    companyText: {
      color:
        '#B0B7B1',

      fontSize: 6.5,

      fontWeight:
        '800',

      letterSpacing:
        1.1,

      textAlign:
        'center',

      marginTop: 11,
    },

  });


export default LoginScreen;