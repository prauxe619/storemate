import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

const NetworkHeader = ({ syncStatus }) => {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsOffline(!state.isConnected);
        });
        return () => unsubscribe();
    }, []);

    // 1. Online & Synced (Clean UI)[cite: 6]
    if (!isOffline && syncStatus === 'synced') return null; 

    // 2. Offline Active (Yellow Pill)[cite: 6]
    if (isOffline) {
        return (
            <View style={[styles.badge, styles.offline]}>
                <Text style={styles.text}>⚠️ Working Offline</Text>
            </View>
        );
    }

    // 3. Syncing Restored (Blue Pill)[cite: 6]
    if (syncStatus === 'syncing') {
        return (
            <View style={[styles.badge, styles.syncing]}>
                <Text style={styles.text}>🔄 Syncing...</Text>
            </View>
        );
    }

    // 4. Sync Failed / Conflict (Red Pill)[cite: 6]
    if (syncStatus === 'conflict') {
        return (
            <View style={[styles.badge, styles.conflict]}>
                <Text style={styles.text}>❌ Tap to fix sync error</Text>
            </View>
        );
    }

    return null;
};

const styles = StyleSheet.create({
    badge: { padding: 6, borderRadius: 20, alignSelf: 'center', marginVertical: 5, paddingHorizontal: 15 },
    offline: { backgroundColor: '#FEF08A' }, // Yellow[cite: 6]
    syncing: { backgroundColor: '#BAE6FD' }, // Blue[cite: 6]
    conflict: { backgroundColor: '#FECACA' }, // Red[cite: 6]
    text: { fontSize: 12, fontWeight: 'bold', color: '#333' }
});

export default NetworkHeader;