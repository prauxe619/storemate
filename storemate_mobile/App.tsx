import React, {
  useState,
  useEffect,
  createContext,
} from 'react';

import {
  StatusBar,
  Text,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import JailMonkey from 'jail-monkey';

import RNExitApp from 'react-native-exit-app';

import {
  startHourlyBackupScheduler,
  stopHourlyBackupScheduler,
  backupNow,
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
} from 'react-native-safe-area-context';

// @ts-ignore
import { database } from './src/core/database';

// @ts-ignore
import { startAutoSyncListener } from './src/core/sync/autoSync';

// @ts-ignore
import HomeScreen from './src/screens/HomeScreen';

// @ts-ignore
import InventoryScreen from './src/screens/InventoryScreen';

// @ts-ignore
import KhataScreen from './src/screens/KhataScreen';

// @ts-ignore
import ProfileScreen from './src/screens/ProfileScreen';

// @ts-ignore
import LoginScreen from './src/screens/LoginScreen';

import {
  GoogleSignin,
} from '@react-native-google-signin/google-signin';


const Tab =
  createBottomTabNavigator();


/*
 * ============================================================
 * STORE MATE THEME
 * ============================================================
 */

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


/*
 * ============================================================
 * AUTH CONTEXT
 * ============================================================
 */

export const AuthContext =
  createContext<any>(null);


/*
 * ============================================================
 * APP
 * ============================================================
 */

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
  ] = useState<string | null>(
    null
  );


  /*
   * ==========================================================
   * SECURITY + LOGIN CHECK
   * ==========================================================
   */

  useEffect(() => {

    const runSecurityAudit =
      () => {

        /*
         * Check rooted / jailbroken /
         * external-storage environments.
         */

        if (
          JailMonkey.isJailBroken() ||
          JailMonkey.isOnExternalStorage()
        ) {

          Alert.alert(
            'Security Violation',

            'StoreMate cannot run on rooted or compromised devices in order to protect your financial data.',

            [
              {
                text:
                  'OK',

                onPress:
                  () =>
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


        /*
         * Prevent mock-location usage.
         */

        if (
          JailMonkey.canMockLocation()
        ) {

          Alert.alert(
            'Security Violation',

            "Please disable 'Mock Locations' in your developer settings to use StoreMate.",

            [
              {
                text:
                  'OK',

                onPress:
                  () =>
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
      };


    /*
     * Run security audit.
     */

    runSecurityAudit();


    /*
     * Check existing StoreMate
     * authentication session.
     */

    const checkLoginStatus =
      async () => {

        try {

          const token =
            await AsyncStorage.getItem(
              'userToken'
            );


          setUserToken(
            token
          );

        } catch (
          error
        ) {

          console.error(
            'Auth check failed:',
            error
          );

        } finally {

          setIsLoading(
            false
          );
        }
      };


    checkLoginStatus();

  }, []);


  /*
   * ==========================================================
   * SYNC + HOURLY BACKUP
   * ==========================================================
   */

  useEffect(() => {

    /*
     * Nothing to start when logged out.
     */

    if (
      !userToken
    ) {

      return;
    }


    /*
     * Start real-time sync listener.
     */

    const unsubscribeSync =
      startAutoSyncListener();


    /*
     * Start hourly Google Drive
     * backup scheduler.
     */

    startHourlyBackupScheduler();


    /*
     * Cleanup when user logs out
     * or token changes.
     */

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


  /*
   * ==========================================================
   * LOGOUT
   * ==========================================================
   */

  const logout =
    async () => {

      setIsLoading(
        true
      );

      try {
        // 🚀 ADD THIS BLOCK: Force a final backup before logging out!
        try {
          await backupNow();
          console.log("Final backup completed successfully before logout.");
        } catch (backupError) {
          console.log("Final backup skipped or failed (offline):", backupError);
        }

        GoogleSignin.configure({
          webClientId:
            '106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com',
        });

        /*
         * Cast to any for compatibility
         * with Google Sign-In versions.
         */
        const gs =
          GoogleSignin as any;

        if (
          typeof gs.hasPlayServices ===
          'function'
        ) {
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
            signedIn =
              !!(
                await gs.getCurrentUser()
              );
          }

          if (
            signedIn
          ) {
            await gs.signOut();
          }
        }

        /*
         * Clear local StoreMate
         * session/profile cache.
         *
         * NOTE:
         * This removes the session tokens but 
         * safely leaves the local WatermelonDB intact.
         */
        const keysToClear = [
          'userToken',
          'shopName',
          'userEmail',
          'userPhone',
          'userAddress',
          'avatarUri',
          'shopUpi',
          'driveBackup_restorePromptShown',
        ];

        await Promise.all(
          keysToClear.map(
            key =>
              AsyncStorage.removeItem(
                key
              )
          )
        );

      } catch (
        error
      ) {
        console.error(
          'Logout Cleanup Error:',
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


  /*
   * ==========================================================
   * LOADING SCREEN
   * ==========================================================
   *
   * SafeAreaProvider is already
   * above this component in the
   * returned tree.
   */

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


  /*
   * ==========================================================
   * LOGIN GATEKEEPER
   * ==========================================================
   */

  if (
    !userToken
  ) {

    return (

      <SafeAreaProvider>

        <LoginScreen
          onLoginSuccess={() =>
            setUserToken(
              'active_session'
            )
          }
        />

      </SafeAreaProvider>
    );
  }


  /*
   * ==========================================================
   * AUTHENTICATED APPLICATION
   * ==========================================================
   */

  return (

    /*
     * ========================================================
     * IMPORTANT:
     *
     * SafeAreaProvider MUST be above:
     *
     * LoginScreen
     * HomeScreen
     * POSScreen
     * InventoryScreen
     * KhataScreen
     * ProfileScreen
     * AnalyticsScreen
     * AdminDashboard
     *
     * This is what fixes:
     *
     * "No safe area value available"
     * ========================================================
     */

    <SafeAreaProvider>

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

          <NavigationContainer
            theme={
              MyLightTheme
            }
          >

            <StatusBar
              barStyle="dark-content"
              backgroundColor="#FFFFFF"
            />


            {/* ==========================================
                GLOBAL OFFLINE / SYNC HEADER
                ========================================== */}

            <NetworkHeader
              syncStatus="synced"
            />


            {/* ==========================================
                MAIN NAVIGATION
                ========================================== */}

            <Tab.Navigator

              screenOptions={{
                headerShown:
                  false,

                tabBarStyle: {

                  backgroundColor:
                    '#FFFFFF',

                  borderTopColor:
                    '#EAECEC',

                  height:
                    65,

                  paddingBottom:
                    10,

                  paddingTop:
                    10,
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
                    4,
                },
              }}
            >

              {/* ========================================
                  HOME
                  ======================================== */}

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


              {/* ========================================
                  INVENTORY
                  ======================================== */}

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


              {/* ========================================
                  KHATA
                  ======================================== */}

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


              {/* ========================================
                  PROFILE
                  ======================================== */}

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

        </DatabaseProvider>

      </AuthContext.Provider>

    </SafeAreaProvider>
  );
}