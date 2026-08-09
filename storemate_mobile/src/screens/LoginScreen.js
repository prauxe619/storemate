import React, { useState, useEffect } from 'react';
import { 
  SafeAreaView, View, Text, TextInput, TouchableOpacity, 
  StyleSheet, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { checkForExistingBackup, restoreFromDrive } from '../services/BackupService';
import { BASE_URL } from '../config/api';

const LoginScreen = ({ onLoginSuccess }) => { 
  // authMode options: 'login' | 'register' | 'forgot' | 'verify_otp'
  const [authMode, setAuthMode] = useState('login'); 
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com', 
      offlineAccess: true,
      // 🚀 FIX 1: Ask for Drive permissions at the exact moment they log in!
      scopes: ['https://www.googleapis.com/auth/drive.appdata'], 
    });
  }, []);

  const handleSubmit = async () => {
    // 1. Forgot Password: Request OTP
    if (authMode === 'forgot') {
      if (!email) return Alert.alert("Error", "Please enter your registered email address.");
      
      setIsLoading(true);
      try {
        const response = await fetch(`${BASE_URL}/api/v1/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || "Failed to send OTP");
        
        Alert.alert("OTP Sent 📩", "Check your email inbox for the 6-digit reset code.");
        setAuthMode('verify_otp'); // 🚀 Switch UI to OTP & New Password entry view
      } catch (error) {
        Alert.alert("Error", error.message);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 2. Verify OTP & Submit New Password (Auto-login & Check Backup)
    if (authMode === 'verify_otp') {
      if (!otp || !newPassword) return Alert.alert("Error", "Please enter both the 6-digit OTP and your new password.");
      
      setIsLoading(true);
      try {
        // A. Reset the password on the backend
        const resetResponse = await fetch(`${BASE_URL}/api/v1/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp, new_password: newPassword })
        });
        const resetData = await resetResponse.json();
        if (!resetResponse.ok) throw new Error(resetData.error || "Password reset failed");

        // B. 🚀 Automatically log them in with the new password so they don't have to type it again
        const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: newPassword })
        });
        const loginData = await loginResponse.json();
        if (!loginResponse.ok) throw new Error("Password updated, but auto-login failed. Please log in manually.");

        // C. Save session tokens
        await AsyncStorage.setItem('userToken', loginData.access_token);
        await AsyncStorage.setItem('shopName', loginData.shop_name);
        await AsyncStorage.setItem('userEmail', email);

        Alert.alert("Success 🎉", "Password updated successfully!");

        // D. Trigger the Google Drive Backup Restore Check!
        await checkAndPromptRestore();

      } catch (error) {
        Alert.alert("Error", error.message);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Standard Login & Register Logic
    if (!email || !password) return Alert.alert("Error", "Please fill in all fields");
    if (authMode === 'register' && !shopName) return Alert.alert("Error", "Shop name is required");

    setIsLoading(true);
    const endpoint = authMode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
    
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, shop_name: shopName })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong");

      if (authMode === 'login') {
        await AsyncStorage.setItem('userToken', data.access_token);
        await AsyncStorage.setItem('shopName', data.shop_name);
        await AsyncStorage.setItem('userEmail', email);
        await checkAndPromptRestore();
      } else {
        Alert.alert("Success", "Shop registered! You can now log in.");
        setAuthMode('login');
      }
    } catch (error) {
      Alert.alert("Authentication Failed", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      setIsLoading(true);
      await GoogleSignin.hasPlayServices();
      
      const userInfo = await GoogleSignin.signIn();
      
      // 🚀 FIX 2: Bulletproof token extraction for all versions of React Native
      let idToken = userInfo.idToken;
      if (!idToken && userInfo.data && userInfo.data.idToken) {
        idToken = userInfo.data.idToken;
      }
      if (!idToken) {
        const tokens = await GoogleSignin.getTokens();
        idToken = tokens.idToken;
      }

      if (!idToken) {
         throw new Error("Could not retrieve Google Security Token. Please try again.");
      }

      const response = await fetch(`${BASE_URL}/api/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: idToken,
          shop_name: shopName 
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Google Auth Failed");

      await AsyncStorage.setItem('userToken', data.access_token);
      await AsyncStorage.setItem('shopName', data.shop_name);
      await AsyncStorage.setItem('userEmail', data.email);
      
      // Because we added the Drive Scope in Step 1, this will now successfully trigger!
      await checkAndPromptRestore();

    } catch (error) {
      if (error.code !== statusCodes.SIGN_IN_CANCELLED && error.message !== "Google Sign-In was cancelled.") {
        Alert.alert("Google Login Error", error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const checkAndPromptRestore = async () => {
    try {
      const backupResult = await checkForExistingBackup();

      if (backupResult.found && backupResult.fileId) {
        const backupDate = new Date(backupResult.modifiedTime).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        Alert.alert(
          "Backup Found ☁️",
          `We found a Google Drive backup for your store from ${backupDate}.\n\nWould you like to restore your records?`,
          [
            { text: "Skip & Start Fresh", style: "cancel", onPress: () => onLoginSuccess() },
            {
              text: "Restore Data",
              onPress: async () => {
                setIsLoading(true);
                try {
                  await restoreFromDrive(backupResult.fileId);
                  Alert.alert("Restored! 🎉", "Your shop records have been restored.");
                } catch (err) {
                  Alert.alert("Restore Warning", "Could not complete full restore: " + err.message);
                } finally {
                  setIsLoading(false);
                  onLoginSuccess();
                }
              }
            }
          ],
          { cancelable: false }
        );
      } else {
        onLoginSuccess();
      }
    } catch (err) {
      console.log("Drive backup check skipped:", err.message);
      onLoginSuccess();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.logoCircle}>
              <Text style={styles.logo}>📦</Text>
            </View>
            <Text style={styles.header}>Storemate</Text>
            
            <Text style={styles.subHeader}>
              {authMode === 'login' && 'Welcome back to your shop'}
              {authMode === 'register' && 'Create your digital khata'}
              {authMode === 'forgot' && 'Reset your password'}
              {authMode === 'verify_otp' && 'Enter your 6-digit OTP'}
            </Text>

            <View style={styles.form}>
              {authMode === 'register' && (
                <TextInput
                  style={styles.input}
                  placeholder="Shop Name (Optional for Google)"
                  placeholderTextColor="#9CA3AF"
                  value={shopName}
                  onChangeText={setShopName}
                />
              )}

              {/* Email field (shown everywhere except during OTP confirmation where it's locked/read-only info) */}
              {authMode !== 'verify_otp' && (
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              )}

              {/* Standard Password field for Login & Register */}
              {(authMode === 'login' || authMode === 'register') && (
                <View>
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                  {authMode === 'login' && (
                    <TouchableOpacity onPress={() => setAuthMode('forgot')} style={styles.forgotBtn}>
                      <Text style={styles.forgotText}>Forgot Password?</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* 🚀 NEW: OTP and New Password Fields for verify_otp mode */}
              {authMode === 'verify_otp' && (
                <View>
                  <Text style={styles.helperText}>OTP sent to: {email}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    maxLength={6}
                    value={otp}
                    onChangeText={setOtp}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter New Password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                </View>
              )}

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={isLoading} activeOpacity={0.88}>
                {isLoading ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.submitBtnText}>
                    {authMode === 'login' && 'Login'}
                    {authMode === 'register' && 'Register Shop'}
                    {authMode === 'forgot' && 'Send Reset OTP'}
                    {authMode === 'verify_otp' && 'Update Password'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Hide Google Auth during forgot/verify steps */}
              {authMode !== 'forgot' && authMode !== 'verify_otp' && (
                <>
                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleAuth} disabled={isLoading} activeOpacity={0.85}>
                    {isLoading ? <ActivityIndicator color="#1B1F23" /> : <Text style={styles.googleBtnText}>Continue with Google</Text>}
                  </TouchableOpacity>
                </>
              )}

              {/* Bottom Toggle */}
              <TouchableOpacity 
                onPress={() => {
                  if (authMode === 'verify_otp' || authMode === 'forgot') {
                    setAuthMode('login');
                  } else {
                    setAuthMode(authMode === 'login' ? 'register' : 'login');
                  }
                }} 
                style={styles.toggleBtn}
              >
                <Text style={styles.toggleText}>
                  {authMode === 'login' && "Don't have an account? "}
                  {authMode === 'register' && "Already have a shop? "}
                  {(authMode === 'forgot' || authMode === 'verify_otp') && "Remembered your password? "}
                  <Text style={styles.toggleTextBold}>
                    {authMode === 'login' ? "Register" : "Login"}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

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
    width: '100%', backgroundColor: '#FFFFFF', color: '#1B1F23', padding: 16,
    borderRadius: 12, borderWidth: 1, borderColor: '#EAECEC', marginBottom: 14, fontSize: 15,
  },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 14, marginTop: -6 },
  forgotText: { color: '#0C9C4C', fontWeight: '600', fontSize: 13.5 },
  helperText: { color: '#6B7280', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  
  submitBtn: {
    width: '100%', backgroundColor: '#0C9C4C', paddingVertical: 17, borderRadius: 12,
    alignItems: 'center', marginTop: 6, shadowColor: '#0C9C4C', shadowOpacity: 0.28,
    shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#EAECEC' },
  dividerText: { marginHorizontal: 14, color: '#9CA3AF', fontWeight: '600', fontSize: 13 },
  
  googleBtn: {
    width: '100%', backgroundColor: '#FFFFFF', paddingVertical: 16, borderRadius: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#EAECEC',
  },
  googleBtnText: { color: '#1B1F23', fontSize: 16, fontWeight: '700' },

  toggleBtn: { marginTop: 22, padding: 10, alignItems: 'center' },
  toggleText: { color: '#6B7280', fontSize: 14.5 },
  toggleTextBold: { color: '#0C9C4C', fontWeight: '700' }
});

export default LoginScreen;