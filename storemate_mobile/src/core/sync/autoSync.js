import NetInfo from "@react-native-community/netinfo";
import { synchronizeOfflineData } from './syncService';

let isSyncing = false;

export const startAutoSyncListener = () => {
  console.log("📡 Auto-Sync Listener Activated");

  const unsubscribe = NetInfo.addEventListener(state => {
    // 1. Check for connection + lock the sync process
    if (state.isConnected && state.isInternetReachable && !isSyncing) {
      
      isSyncing = true;
      console.log("🌐 Internet detected! Triggering background sync...");
      
      // 2. Perform the sync with a timeout safeguard
      synchronizeOfflineData()
        .then(result => {
          if (result && result.success) {
            console.log("✅ Auto-Sync Complete:", result.message);
          } else {
            console.log("ℹ️ Sync completed with no new data or handled offline:", result.message);
          }
        })
        .catch(err => {
          // Silent failure: Background sync errors should never crash the app
          console.error("❌ Auto-Sync Failed in background:", err.message);
        })
        .finally(() => {
          // 3. Always unlock the sync flag
          isSyncing = false;
        });
    }
  });

  return unsubscribe;
};