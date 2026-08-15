import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_EMAIL_KEY = 'userEmail';
const USER_ID_KEY = 'userId';
const USER_TOKEN_KEY = 'userToken';

const LEGACY_GLOBAL_PROFILE_KEYS = [
  'shopName',
  'userPhone',
  'userAddress',
  'avatarUri',
  'shopUpi',
  'onboardingDetailsCompleted',
];

const TEMP_SESSION_KEYS = [
  'driveBackup_restorePromptShown',
];

export async function setActiveUser({ userId, email }) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();

  const normalizedUserId = String(userId || '')
    .trim();

  if (!normalizedEmail && !normalizedUserId) {
    throw new Error(
      'Cannot establish StoreMate user session.'
    );
  }

  const stableUserId =
    normalizedUserId ||
    normalizedEmail;

  /*
   * Active user identity is intentionally global.
   *
   * User-specific business/profile data must NEVER be stored
   * in these keys. Inventory, Khata, sales and profile data
   * must always be scoped using stableUserId.
   */

  await AsyncStorage.setItem(USER_ID_KEY, stableUserId);
await AsyncStorage.setItem(USER_EMAIL_KEY, normalizedEmail);

for (const key of [...LEGACY_GLOBAL_PROFILE_KEYS, ...TEMP_SESSION_KEYS]) {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.log(`setActiveUser: failed to remove ${key}`, error?.message);
  }
}

  return stableUserId;
}


export async function getCurrentUserId() {
  const storedUserId =
    await AsyncStorage.getItem(
      USER_ID_KEY
    );

  if (storedUserId) {
    const normalizedUserId =
      storedUserId
        .trim();

    if (normalizedUserId) {
      return normalizedUserId;
    }
  }

  /*
   * Migration fallback.
   *
   * Older StoreMate installations may have an email but no
   * stable userId.
   *
   * Until the backend supplies a real user ID, the normalized
   * email is used as the stable local owner identifier.
   */

  const email =
    await AsyncStorage.getItem(
      USER_EMAIL_KEY
    );

  if (!email) {
    return null;
  }

  const fallbackId =
    email
      .trim()
      .toLowerCase();

  if (!fallbackId) {
    return null;
  }

  await AsyncStorage.setItem(
    USER_ID_KEY,
    fallbackId
  );

  return fallbackId;
}


export async function getCurrentUserEmail() {
  const email =
    await AsyncStorage.getItem(
      USER_EMAIL_KEY
    );

  if (!email) {
    return null;
  }

  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  return normalizedEmail || null;
}


export async function requireCurrentUserId() {
  const userId =
    await getCurrentUserId();

  if (!userId) {
    throw new Error(
      'No active StoreMate user.'
    );
  }

  return userId;
}


export async function requireCurrentUserEmail() {
  const email =
    await getCurrentUserEmail();

  if (!email) {
    throw new Error(
      'No active StoreMate user email.'
    );
  }

  return email;
}


export async function clearActiveUser() {
  /*
   * IMPORTANT:
   *
   * Do NOT remove:
   *
   * storemate_profile_<userId>
   *
   * or any owner-scoped inventory/Khata/sales data.
   *
   * Logout should only clear the ACTIVE SESSION.
   *
   * This allows:
   *
   * User A logout
   *      ↓
   * User B login
   *      ↓
   * B sees B's data
   *      ↓
   * User A login again
   *      ↓
   * A's local data is still available.
   */

  const keysToRemove = [
  USER_ID_KEY,
  USER_EMAIL_KEY,
  USER_TOKEN_KEY,
  ...LEGACY_GLOBAL_PROFILE_KEYS,
  ...TEMP_SESSION_KEYS,
];

for (const key of keysToRemove) {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.log(`clearActiveUser: failed to remove ${key}`, error?.message);
  }
}
}