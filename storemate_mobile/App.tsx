import React, { useState, useEffect, createContext } from 'react';
import { StatusBar, Text, View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startHourlyBackupScheduler, stopHourlyBackupScheduler } from './src/services/BackupService';

import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { DatabaseProvider } from '@nozbe/watermelondb/react';
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

import { GoogleSignin } from '@react-native-google-signin/google-signin';

const Tab = createBottomTabNavigator();

const MyLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F5F7F6',
    card: '#FFFFFF',
    text: '#1B1F23',
    primary: '#0C9C4C',
    border: '#EAECEC',
  },
};

// Fix 1: Added <any> to provide a type for the Context
export const AuthContext = createContext<any>(null);

export default function App() {
  // Fix 2: Added explicit types so TypeScript accepts strings instead of just null
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userToken, setUserToken] = useState<string | null>(null);

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        setUserToken(token);
      } catch (e) {
        console.error("Auth check failed:", e);
      } finally {
        setIsLoading(false);
      }
    };
    checkLoginStatus();
  }, []);

  useEffect(() => {
  if (!userToken) return; 

  // Start your real-time sync listener
  const unsubscribeSync = startAutoSyncListener();

  // 🚀 Start the hourly Google Drive background backup timer
  startHourlyBackupScheduler();

  return () => {
    if (unsubscribeSync && typeof unsubscribeSync === 'function') {
      unsubscribeSync();
    }
    // Stop timer on logout
    stopHourlyBackupScheduler();
  };
}, [userToken]);

  const logout = async () => {
    setIsLoading(true);
    try {
      GoogleSignin.configure({
        webClientId: '106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com', 
      });

      // Fix 3: Cast to 'any' to bypass strict TS checks for removed legacy functions
      const gs = GoogleSignin as any;
      if (typeof gs.hasPlayServices === 'function') {
        let signedIn = false;
        if (typeof gs.isSignedIn === 'function') {
          signedIn = await gs.isSignedIn();
        } else if (typeof gs.getCurrentUser === 'function') {
          signedIn = !!(await gs.getCurrentUser());
        }
        
        if (signedIn) {
          await gs.signOut();
        }
      }

      const keysToClear = [
        'userToken', 'shopName', 'userEmail', 'userPhone', 
        'userAddress', 'avatarUri', 'shopUpi', 'driveBackup_restorePromptShown'
      ];
      
      // Fix 4: Loop through standard removeItem to satisfy TypeScript
      await Promise.all(keysToClear.map(key => AsyncStorage.removeItem(key)));

      await database.write(async () => {
        await database.unsafeResetDatabase();
      });

    } catch (error) {
      console.error("Logout Cleanup Error:", error);
    } finally {
      setUserToken(null); 
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7F6', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0C9C4C" />
      </View>
    );
  }

  // Gatekeeper
  if (!userToken) {
    return <LoginScreen onLoginSuccess={() => setUserToken('active_session')} />;
  }

  return (
    <AuthContext.Provider value={{ logout }}>
      <DatabaseProvider database={database}>
        <NavigationContainer theme={MyLightTheme}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle: {
                backgroundColor: '#FFFFFF',
                borderTopColor: '#EAECEC',
                height: 65, 
                paddingBottom: 10,
                paddingTop: 10,
              },
              tabBarActiveTintColor: '#0C9C4C',
              tabBarInactiveTintColor: '#9CA3AF',
              tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: 4 }
            }}
          >
            {/* Fix 5: Cast components as 'any' to prevent React Navigation prop mismatch errors */}
            <Tab.Screen
              name="Home"
              component={HomeScreen as any}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>🏠</Text> }}
            />
            <Tab.Screen
              name="Inventory"
              component={InventoryScreen as any}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>📦</Text> }}
            />
            <Tab.Screen
              name="Khata"
              component={KhataScreen as any}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>📒</Text> }}
            />
            <Tab.Screen
              name="Profile"
              component={ProfileScreen as any}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>👤</Text> }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </DatabaseProvider>
    </AuthContext.Provider>
  );
}