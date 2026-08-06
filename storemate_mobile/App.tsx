import React, { useState, useEffect, createContext } from 'react';
import { StatusBar, Text, View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { database } from './src/core/database';
import { startAutoSyncListener } from './src/core/sync/autoSync';

import HomeScreen from './src/screens/HomeScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import KhataScreen from './src/screens/KhataScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LoginScreen from './src/screens/LoginScreen';

const Tab = createBottomTabNavigator();

// Matches the flat white/green KhataBook-style palette used across the app now.
// Swapped DarkTheme -> DefaultTheme as the base since we're no longer on a dark UI.
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

// ✅ NEW: Create a global Auth Context
export const AuthContext = createContext();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);

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
    const unsubscribe = startAutoSyncListener();
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [userToken]);

  // ✅ NEW: Centralized Logout Function
  const logout = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('shopName');
    setUserToken(null); // This instantly flips the gatekeeper below!
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
    // ✅ NEW: Wrap the app in the AuthContext Provider
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
            <Tab.Screen
              name="Home"
              component={HomeScreen}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>🏠</Text> }}
            />
            <Tab.Screen
              name="Inventory"
              component={InventoryScreen}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>📦</Text> }}
            />
            <Tab.Screen
              name="Khata"
              component={KhataScreen}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>📒</Text> }}
            />
            <Tab.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>👤</Text> }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </DatabaseProvider>
    </AuthContext.Provider>
  );
}