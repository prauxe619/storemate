import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { database } from '../core/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKUP_FILENAME = 'storemate_backup.json';
const BACKUP_MIME_TYPE = 'application/json';
const RESTORE_PROMPT_SHOWN_KEY = 'driveBackup_restorePromptShown';

// Collections we back up.
const BACKED_UP_TABLES = ['inventory_items', 'ledger_entries', 'sales_transactions'];

GoogleSignin.configure({
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  webClientId: '106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com',
});

async function ensureSignedInAndGetToken() {
  if (typeof GoogleSignin.hasPlayServices === 'function') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  // 1. Fetch the exact email the user logged into the app with
  const expectedEmail = await AsyncStorage.getItem('userEmail');
  if (!expectedEmail) {
    throw new Error("StoreMate profile email not found. Please log in again.");
  }

  // 2. Re-configure Google Sign-In to strictly hint this specific email
  GoogleSignin.configure({
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    webClientId: '106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com', 
    accountName: expectedEmail, 
  });

  let currentUser = null;
  if (typeof GoogleSignin.getCurrentUser === 'function') {
    currentUser = await GoogleSignin.getCurrentUser();
  }

  // 🚀 SMART HELPER: Extracts email perfectly on both old and v13+ Google libraries
  const extractEmail = (googleUser) => {
    if (!googleUser) return null;
    if (googleUser.user && googleUser.user.email) return googleUser.user.email; // v12 and below
    if (googleUser.data && googleUser.data.user && googleUser.data.user.email) return googleUser.data.user.email; // v13+
    if (googleUser.email) return googleUser.email; // Safest fallback
    return null;
  };

  let currentEmail = extractEmail(currentUser);

  // 3. If signed into the WRONG Google account, force a sign-out behind the scenes
  if (currentEmail && currentEmail.toLowerCase() !== expectedEmail.toLowerCase()) {
    await GoogleSignin.signOut();
    currentUser = null;
    currentEmail = null;
  }

  // 4. Prompt Sign-In if no valid session exists
  if (!currentUser) {
    currentUser = await GoogleSignin.signIn();
    
    // Catch manual cancellations in v13+
    if (currentUser && currentUser.type === 'cancelled') {
      throw new Error("Google Sign-In was cancelled.");
    }
    
    currentEmail = extractEmail(currentUser);
  }

  // 5. Final Security Check: Did they manually pick the wrong email from the pop-up?
  if (!currentEmail || currentEmail.toLowerCase() !== expectedEmail.toLowerCase()) {
    await GoogleSignin.signOut(); // Kick them out of the Google session
    throw new Error(`Security Mismatch: You must select the Google Drive account for ${expectedEmail}`);
  }

  const tokens = await GoogleSignin.getTokens();
  return tokens.accessToken;
}

async function exportLocalData() {
  const exportPayload = { version: 1, exportedAt: Date.now(), tables: {} };

  for (const tableName of BACKED_UP_TABLES) {
    const records = await database.get(tableName).query().fetch();
    exportPayload.tables[tableName] = records.map(r => ({ ...r._raw }));
  }

  return exportPayload;
}

async function findExistingBackupFileId(accessToken) {
  const query = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,modifiedTime)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new Error(`Drive lookup failed (${res.status})`);
  }

  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

export async function backupNow() {
  const accessToken = await ensureSignedInAndGetToken();
  const payload = await exportLocalData();
  const jsonBody = JSON.stringify(payload);

  const existing = await findExistingBackupFileId(accessToken);

  const metadata = existing
    ? { name: BACKUP_FILENAME, mimeType: BACKUP_MIME_TYPE }
    : { name: BACKUP_FILENAME, mimeType: BACKUP_MIME_TYPE, parents: ['appDataFolder'] };

  const boundary = 'storemate-backup-boundary';
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${BACKUP_MIME_TYPE}\r\n\r\n` +
    `${jsonBody}\r\n` +
    `--${boundary}--`;

  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Drive upload failed (${res.status}): ${errText}`);
  }

  return { success: true, tablesBackedUp: Object.keys(payload.tables), timestamp: payload.exportedAt };
}

export async function checkForExistingBackup() {
  try {
    const accessToken = await ensureSignedInAndGetToken();
    const existing = await findExistingBackupFileId(accessToken);
    return existing ? { found: true, modifiedTime: existing.modifiedTime, fileId: existing.id } : { found: false };
  } catch (error) {
    // 🚀 Gracefully handle offline / NETWORK_ERROR without crashing login flows
    if (error.message && (error.message.includes('NETWORK_ERROR') || error.message.includes('network'))) {
      console.log('Google Drive backup check skipped: Device is offline or network error encountered.');
      return { found: false };
    }
    console.error('checkForExistingBackup failed:', error);
    return { found: false, error: error.message };
  }
}

export async function restoreFromDrive(fileId) {
  const accessToken = await ensureSignedInAndGetToken();

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new Error(`Drive download failed (${res.status})`);
  }

  const payload = await res.json();

  if (!payload || !payload.tables) {
    throw new Error('Backup file is malformed or empty');
  }

  await database.write(async () => {
    for (const tableName of BACKED_UP_TABLES) {
      const rows = payload.tables[tableName] || [];
      const collection = database.get(tableName);
      const validColumns = collection.schema.columns;

      for (const row of rows) {
        try {
          await collection.find(row.id);
          continue; // Record already exists locally, skip overwriting
        } catch {
          // Record does not exist locally, safe to restore
        }

        await collection.create((record) => {
          Object.keys(validColumns).forEach((colName) => {
            if (row[colName] !== undefined) {
              record._setRaw(colName, row[colName]);
            }
          });
        });
      }
    }
  });

  return { success: true, restoredTables: Object.keys(payload.tables) };
}

export async function offerRestoreIfFirstLaunch(onFoundBackup) {
  try {
    const alreadyShown = await AsyncStorage.getItem(RESTORE_PROMPT_SHOWN_KEY);
    if (alreadyShown) return;

    let signedIn = false;
    if (typeof GoogleSignin.isSignedIn === 'function') {
      signedIn = await GoogleSignin.isSignedIn();
    } else if (typeof GoogleSignin.getCurrentUser === 'function') {
      const currentUser = await GoogleSignin.getCurrentUser();
      signedIn = !!currentUser;
    }
    
    if (!signedIn) return;

    const result = await checkForExistingBackup();
    await AsyncStorage.setItem(RESTORE_PROMPT_SHOWN_KEY, 'true');

    if (result.found && typeof onFoundBackup === 'function') {
      onFoundBackup(result);
    }
  } catch (error) {
    console.error('offerRestoreIfFirstLaunch failed:', error);
  }
}

// 🚀 NEW: Hourly Background Backup Scheduler
let backupInterval = null;

export function startHourlyBackupScheduler() {
  if (backupInterval) return; // Prevent duplicate timers

  // 1 hour in milliseconds = 3600000 ms
  const ONE_HOUR = 60 * 60 * 1000;

  backupInterval = setInterval(async () => {
    try {
      const userEmail = await AsyncStorage.getItem('userEmail');
      if (!userEmail) return; // Skip if logged out

      console.log("⏰ Running automated hourly Google Drive backup...");
      await backupNow();
      console.log("✅ Hourly Google Drive backup completed successfully.");
    } catch (error) {
      // Fail silently in the background so it never disturbs the shopkeeper
      console.log("⏰ Hourly background backup skipped/failed silently:", error.message);
    }
  }, ONE_HOUR);
}

export function stopHourlyBackupScheduler() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}