import React, {
  useState,
  useEffect,
  createContext,
} from 'react';

import {
  AppAlertProvider,
} from './src/components/AppAlert';

import {
  StatusBar,
  Text,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearActiveUser,
} from './src/core/auth/localUser';

import JailMonkey from 'jail-monkey';

import RNExitApp from 'react-native-exit-app';

import {
  startHourlyBackupScheduler,
  stopHourlyBackupScheduler,
} from './src/services/BackupService';

import NetworkHeader from './src/components/NetworkHeader';

import {
  NavigationContainer,
  DefaultTheme,
} from '@react-navigation/native';

import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';

import {
  DatabaseProvider,
} from '@nozbe/watermelondb/react';

import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  database,
} from './src/core/database';

import {
  startAutoSyncListener,
} from './src/core/sync/autoSync';

import HomeScreen from './src/screens/HomeScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import KhataScreen from './src/screens/KhataScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LoginScreen from './src/screens/LoginScreen';

import {
  GoogleSignin,
} from '@react-native-google-signin/google-signin';


// ============================================================
// GOOGLE
// ============================================================

const GOOGLE_WEB_CLIENT_ID =
  '106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com';

GoogleSignin.configure({
  webClientId:
    GOOGLE_WEB_CLIENT_ID,

  scopes: [
    'https://www.googleapis.com/auth/drive.appdata',
  ],

  offlineAccess:
    true,
});


// ============================================================
// TAB NAVIGATOR
// ============================================================

const Tab =
  createBottomTabNavigator();


// ============================================================
// THEME
// ============================================================

const MyLightTheme = {
  ...DefaultTheme,

  colors: {
    ...DefaultTheme.colors,

    background:
      '#F5F7F6',

    card:
      '#FFFFFF',

    text:
      '#1B1F23',

    primary:
      '#0C9C4C',

    border:
      '#EAECEC',
  },
};


// ============================================================
// AUTH CONTEXT
// ============================================================

export const AuthContext =
  createContext<any>(null);


// ============================================================
// APP
// ============================================================
function MainNavigator() {

  const insets =
    useSafeAreaInsets();

  const bottomInset =
    Math.max(
      insets.bottom,
      0
    );

  const tabBarHeight =
    62 + bottomInset;


  return (

    <NavigationContainer
      theme={
        MyLightTheme
      }
    >

      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
      />

      <NetworkHeader
        syncStatus="synced"
      />

      <Tab.Navigator

        screenOptions={{
          headerShown: false,

          tabBarStyle: {
            backgroundColor:
              '#FFFFFF',

            borderTopColor:
              '#EAECEC',

            borderTopWidth:
              1,

            height:
              tabBarHeight,

            paddingBottom:
              bottomInset,

            paddingTop:
              4,

            elevation:
              10,

            shadowColor:
              '#000000',

            shadowOffset: {
              width: 0,

              height: -2,
            },

            shadowOpacity:
              0.08,

            shadowRadius:
              8,
          },

          tabBarActiveTintColor:
            '#0C9C4C',

          tabBarInactiveTintColor:
            '#9CA3AF',

          tabBarLabelStyle: {
            fontSize:
              12,

            fontWeight:
              '600',

            marginTop:
              2,
          },

          tabBarItemStyle: {
            paddingTop:
              2,

            /*
             * IMPORTANT:
             * Don't add bottom padding here.
             * The parent tab bar handles the
             * Android safe-area inset.
             */
          },
        }}
      >

        <Tab.Screen
          name="Home"
          component={
            HomeScreen as any
          }
          options={{
            tabBarIcon:
              ({
                focused,
              }) => (

                <Text
                  style={{
                    fontSize:
                      22,

                    opacity:
                      focused
                        ? 1
                        : 0.4,
                  }}
                >
                  🏠
                </Text>

              ),
          }}
        />


        <Tab.Screen
          name="Inventory"
          component={
            InventoryScreen as any
          }
          options={{
            tabBarIcon:
              ({
                focused,
              }) => (

                <Text
                  style={{
                    fontSize:
                      22,

                    opacity:
                      focused
                        ? 1
                        : 0.4,
                  }}
                >
                  📦
                </Text>

              ),
          }}
        />


        <Tab.Screen
          name="Khata"
          component={
            KhataScreen as any
          }
          options={{
            tabBarIcon:
              ({
                focused,
              }) => (

                <Text
                  style={{
                    fontSize:
                      22,

                    opacity:
                      focused
                        ? 1
                        : 0.4,
                  }}
                >
                  📒
                </Text>

              ),
          }}
        />


        <Tab.Screen
          name="Profile"
          component={
            ProfileScreen as any
          }
          options={{
            tabBarIcon:
              ({
                focused,
              }) => (

                <Text
                  style={{
                    fontSize:
                      22,

                    opacity:
                      focused
                        ? 1
                        : 0.4,
                  }}
                >
                  👤
                </Text>

              ),
          }}
        />

      </Tab.Navigator>

    </NavigationContainer>
  );
}

export default function App() {

  const [
    isLoading,
    setIsLoading,
  ] = useState<boolean>(
    true
  );


  const [
    userToken,
    setUserToken,
  ] = useState<
    string | null
  >(null);


  // ==========================================================
  // SECURITY + SESSION CHECK
  // ==========================================================

  useEffect(() => {

    let securityBlocked =
      false;


    const runSecurityAudit =
      () => {

        try {

          if (
            JailMonkey.isJailBroken() ||
            JailMonkey.isOnExternalStorage()
          ) {

            securityBlocked =
              true;


            Alert.alert(
              'Security Violation',

              'StoreMate cannot run on rooted or compromised devices in order to protect your financial data.',

              [
                {
                  text: 'OK',

                  onPress: () =>
                    RNExitApp.exitApp(),
                },
              ],

              {
                cancelable:
                  false,
              }
            );


            return;
          }


          if (
            JailMonkey.canMockLocation()
          ) {

            securityBlocked =
              true;


            Alert.alert(
              'Security Violation',

              "Please disable 'Mock Locations' in your developer settings to use StoreMate.",

              [
                {
                  text: 'OK',

                  onPress: () =>
                    RNExitApp.exitApp(),
                },
              ],

              {
                cancelable:
                  false,
              }
            );


            return;
          }

        } catch (error) {

          console.error(
            'Security audit failed:',
            error
          );

        }
      };


    runSecurityAudit();


    const checkLoginStatus =
      async () => {

        try {

          if (
            securityBlocked
          ) {
            return;
          }


          const token =
            await AsyncStorage.getItem(
              'userToken'
            );


          const userId =
            await AsyncStorage.getItem(
              'userId'
            );


          if (
            token &&
            userId
          ) {

            setUserToken(
              token
            );

          } else {

            setUserToken(
              null
            );

          }

        } catch (error) {

          console.error(
            'Auth check failed:',
            error
          );


          setUserToken(
            null
          );

        } finally {

          setIsLoading(
            false
          );

        }
      };


    checkLoginStatus();

  }, []);


  // ==========================================================
  // SYNC + HOURLY BACKUP
  // ==========================================================

  useEffect(() => {

    if (
      !userToken
    ) {
      return;
    }


    let unsubscribeSync:
      (() => void) | null =
      null;


    try {

      unsubscribeSync =
        startAutoSyncListener();

    } catch (error) {

      console.error(
        'Auto sync listener failed:',
        error
      );

    }


    try {

      startHourlyBackupScheduler();

    } catch (error) {

      console.error(
        'Hourly backup scheduler failed:',
        error
      );

    }


    return () => {

      if (
        unsubscribeSync &&
        typeof unsubscribeSync ===
          'function'
      ) {

        unsubscribeSync();

      }


      stopHourlyBackupScheduler();

    };

  }, [
    userToken,
  ]);


  // ==========================================================
  // LOGOUT
  // ==========================================================

  const logout =
    async () => {

      setIsLoading(
        true
      );


      try {

        stopHourlyBackupScheduler();


        // -----------------------------------------------
        // GOOGLE LOGOUT
        // -----------------------------------------------

        try {

          const gs =
            GoogleSignin as any;


          let signedIn =
            false;


          if (
            typeof gs.isSignedIn ===
            'function'
          ) {

            signedIn =
              await gs.isSignedIn();

          } else if (
            typeof gs.getCurrentUser ===
            'function'
          ) {

            const currentUser =
              await gs.getCurrentUser();


            signedIn =
              !!currentUser;

          }


          if (
            signedIn &&
            typeof gs.signOut ===
              'function'
          ) {

            await gs.signOut();

          }

        } catch (
          googleLogoutError
        ) {

          console.log(
            'Google session cleanup skipped:',
            googleLogoutError
          );

        }


        // -----------------------------------------------
        // CLEAR ACTIVE SESSION ONLY
        // -----------------------------------------------

        await clearActiveUser();

      } catch (error) {

        console.error(
          'Logout cleanup error:',
          error
        );

      } finally {

        setUserToken(
          null
        );

        setIsLoading(
          false
        );

      }
    };


  // ==========================================================
  // LOADING
  // ==========================================================

  if (
    isLoading
  ) {

    return (

      <SafeAreaProvider>

        <View
          style={{
            flex: 1,

            backgroundColor:
              '#F5F7F6',

            justifyContent:
              'center',

            alignItems:
              'center',
          }}
        >

          <ActivityIndicator
            size="large"
            color="#0C9C4C"
          />

        </View>

      </SafeAreaProvider>

    );
  }


  // ==========================================================
  // LOGIN
  // ==========================================================

  if (
    !userToken
  ) {

    return (

      <SafeAreaProvider>

        <AppAlertProvider>

          <LoginScreen
            onLoginSuccess={
              async () => {

                try {

                  const token =
                    await AsyncStorage.getItem(
                      'userToken'
                    );


                  const userId =
                    await AsyncStorage.getItem(
                      'userId'
                    );


                  if (
                    token &&
                    userId
                  ) {

                    setUserToken(
                      token
                    );

                  } else {

                    setUserToken(
                      null
                    );

                  }

                } catch (error) {

                  console.error(
                    'Login session refresh failed:',
                    error
                  );


                  setUserToken(
                    null
                  );

                }

              }
            }
          />

        </AppAlertProvider>

      </SafeAreaProvider>

    );
  }


  // ==========================================================
  // AUTHENTICATED APPLICATION
  // ==========================================================

  return (

    <SafeAreaProvider>

      <AppAlertProvider>

        <AuthContext.Provider
          value={{
            logout,
          }}
        >

          <DatabaseProvider
            database={
              database
            }
          >
            <MainNavigator />


          </DatabaseProvider>

        </AuthContext.Provider>

      </AppAlertProvider>

    </SafeAreaProvider>

  );
}