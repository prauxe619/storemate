import React, { useState } from 'react';
import { 
  SafeAreaView, View, Text, TextInput, TouchableOpacity, 
  StyleSheet, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'http://192.168.31.65:5050';

const LoginScreen = ({ onLoginSuccess }) => { 
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) return Alert.alert("Error", "Please fill in all fields");
    if (!isLoginMode && !shopName) return Alert.alert("Error", "Shop name is required");

    setIsLoading(true);
    const endpoint = isLoginMode ? '/api/v1/auth/login' : '/api/v1/auth/register';
    
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, shop_name: shopName })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      if (isLoginMode) {
        // ✅ Securely save the token to the device
        await AsyncStorage.setItem('userToken', data.access_token);
        await AsyncStorage.setItem('shopName', data.shop_name);
        onLoginSuccess(); // Tell App.js to switch to HomeScreen
      } else {
        Alert.alert("Success", "Shop registered! You can now log in.");
        setIsLoginMode(true);
      }
    } catch (error) {
      Alert.alert("Authentication Failed", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.logoCircle}>
              <Text style={styles.logo}>📦</Text>
            </View>
            <Text style={styles.header}>Storemate</Text>
            <Text style={styles.subHeader}>
              {isLoginMode ? 'Welcome back to your shop' : 'Create your digital khata'}
            </Text>

            <View style={styles.form}>
              {!isLoginMode && (
                <TextInput
                  style={styles.input}
                  placeholder="Shop Name"
                  placeholderTextColor="#9CA3AF"
                  value={shopName}
                  onChangeText={setShopName}
                />
              )}

              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={isLoading} activeOpacity={0.88}>
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>{isLoginMode ? 'Login' : 'Register Shop'}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={styles.toggleBtn}>
                <Text style={styles.toggleText}>
                  {isLoginMode ? "Don't have an account? " : "Already have a shop? "}
                  <Text style={styles.toggleTextBold}>{isLoginMode ? "Register" : "Login"}</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ---- Palette (matches HomeScreen / App.js / Inventory / Khata / POS / Profile) ----
// Background #F5F7F6   Card #FFFFFF   Ink #1B1F23   Muted #6B7280
// Brand Green #0C9C4C  Hairline #EAECEC
// First screen a shopkeeper sees, so it leans slightly more "branded" than the
// utility screens: a soft green logo badge and a bit more breathing room,
// while staying on the exact same palette as the rest of the app.

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F6' },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 28, alignItems: 'center', paddingVertical: 40 },

  logoCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#E7F7EE',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  logo: { fontSize: 40 },
  header: { color: '#1B1F23', fontSize: 28, fontWeight: '800' },
  subHeader: { color: '#6B7280', fontSize: 15, marginTop: 6, marginBottom: 36, textAlign: 'center' },

  form: { width: '100%' },
  input: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    color: '#1B1F23',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAECEC',
    marginBottom: 14,
    fontSize: 15,
  },
  submitBtn: {
    width: '100%',
    backgroundColor: '#0C9C4C',
    paddingVertical: 17,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#0C9C4C',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  toggleBtn: { marginTop: 22, padding: 10 },
  toggleText: { color: '#6B7280', fontSize: 14.5 },
  toggleTextBold: { color: '#0C9C4C', fontWeight: '700' }
});

export default LoginScreen;