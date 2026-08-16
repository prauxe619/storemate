import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

import {
  requireCurrentUserId,
  getCurrentUserEmail,
} from '../core/auth/localUser';

import {
  SecureStorage,
} from '../../utils/secureStorage';

import {
  syncWithCloud,
  restoreFromCloud,
} from '../core/sync/sync';


/*
 * ============================================================
 * CONFIG
 * ============================================================
 */

const BACKUP_MIME_TYPE =
  'application/json';

const BACKUP_VERSION =
  7;

const GOOGLE_WEB_CLIENT_ID =
  '106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com';

const RESTORE_PROMPT_SHOWN_KEY =
  'driveBackup_restorePromptShown';

const BACKED_UP_TABLES = [
  'inventory_items',
  'ledger_entries',
  'sales_transactions',
];

const PROFILE_KEY_PREFIX =
  'storemate_profile_';

const PROFILE_IMAGE_PREFIX =
  'storemate_profile_avatar_';

const MAX_AVATAR_BASE64_SIZE =
  15 * 1024 * 1024;


/*
 * ============================================================
 * GOOGLE SIGN-IN
 * ============================================================
 */

GoogleSignin.configure({

  scopes: [
    'https://www.googleapis.com/auth/drive.appdata',
  ],

  webClientId:
    GOOGLE_WEB_CLIENT_ID,

  offlineAccess:
    true,

});


/*
 * ============================================================
 * PROFILE KEY
 * ============================================================
 */

function getProfileStorageKey(
  ownerId
) {

  return `${PROFILE_KEY_PREFIX}${ownerId}`;

}


/*
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

function normalizeUserId(
  value
) {

  return String(
    value || ''
  )
    .trim()
    .toLowerCase();

}


function normalizeEmail(
  value
) {

  return String(
    value || ''
  )
    .trim()
    .toLowerCase();

}


/*
 * ============================================================
 * GOOGLE EMAIL
 * ============================================================
 */

function extractGoogleEmail(
  googleUser
) {

  if (!googleUser) {
    return null;
  }


  if (
    googleUser.user &&
    googleUser.user.email
  ) {

    return googleUser.user.email;

  }


  if (
    googleUser.data &&
    googleUser.data.user &&
    googleUser.data.user.email
  ) {

    return googleUser.data.user.email;

  }


  if (
    googleUser.email
  ) {

    return googleUser.email;

  }


  return null;

}


/*
 * ============================================================
 * GOOGLE SESSION CHECK
 * ============================================================
 */

async function isGoogleAlreadySignedIn() {

  try {

    if (
      typeof GoogleSignin.isSignedIn ===
      'function'
    ) {

      return await GoogleSignin.isSignedIn();

    }


    if (
      typeof GoogleSignin.getCurrentUser ===
      'function'
    ) {

      return !!(
        await GoogleSignin.getCurrentUser()
      );

    }


    return false;

  } catch (error) {

    console.log(
      'Google session check failed:',
      error?.message || error
    );

    return false;

  }

}


/*
 * ============================================================
 * EXISTING GOOGLE TOKEN
 * ============================================================
 *
 * NEVER opens Google Sign-In.
 *
 * Used by background backup.
 * ============================================================
 */

async function getExistingGoogleToken() {

  try {

    const signedIn =
      await isGoogleAlreadySignedIn();


    if (!signedIn) {
      return null;
    }


    const expectedEmail =
      normalizeEmail(
        await getCurrentUserEmail()
      );


    if (!expectedEmail) {
      return null;
    }


    let currentUser =
      null;


    if (
      typeof GoogleSignin.getCurrentUser ===
      'function'
    ) {

      currentUser =
        await GoogleSignin.getCurrentUser();

    }


    const currentEmail =
      normalizeEmail(
        extractGoogleEmail(
          currentUser
        )
      );


    if (
      currentEmail &&
      currentEmail !== expectedEmail
    ) {

      console.log(
        'Google Drive session belongs to another Google account.'
      );

      return null;

    }


    if (
      typeof GoogleSignin.getTokens !==
      'function'
    ) {

      return null;

    }


    const tokens =
      await GoogleSignin.getTokens();


    return (
      tokens?.accessToken ||
      null
    );


  } catch (error) {

    console.log(
      'Existing Google token unavailable:',
      error?.message || error
    );

    return null;

  }

}


/*
 * ============================================================
 * EXPLICIT GOOGLE SIGN-IN
 * ============================================================
 *
 * Used only when user explicitly chooses
 * Google Drive backup / restore.
 * ============================================================
 */

async function ensureSignedInAndGetToken() {

  try {

    if (
      typeof GoogleSignin.hasPlayServices ===
      'function'
    ) {

      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog:
          true,
      });

    }


    const expectedEmail =
      normalizeEmail(
        await getCurrentUserEmail()
      );


    if (!expectedEmail) {

      throw new Error(
        'StoreMate profile email not found. Please log in again.'
      );

    }


    let currentUser =
      null;


    if (
      typeof GoogleSignin.getCurrentUser ===
      'function'
    ) {

      currentUser =
        await GoogleSignin.getCurrentUser();

    }


    let currentEmail =
      normalizeEmail(
        extractGoogleEmail(
          currentUser
        )
      );


    if (
      currentEmail &&
      currentEmail !== expectedEmail
    ) {

      try {
        await GoogleSignin.signOut();
      } catch {}

      currentUser =
        null;

      currentEmail =
        null;

    }


    if (
      !currentUser ||
      !currentEmail
    ) {

      if (
        typeof GoogleSignin.signIn !==
        'function'
      ) {

        throw new Error(
          'Google Sign-In is unavailable on this device.'
        );

      }


      currentUser =
        await GoogleSignin.signIn();


      currentEmail =
        normalizeEmail(
          extractGoogleEmail(
            currentUser
          )
        );

    }


    if (
      currentEmail !== expectedEmail
    ) {

      try {
        await GoogleSignin.signOut();
      } catch {}


      throw new Error(
        `Please select the Google account connected to StoreMate (${expectedEmail}).`
      );

    }


    const tokens =
      await GoogleSignin.getTokens();


    if (
      !tokens?.accessToken
    ) {

      throw new Error(
        'Google Drive authorization failed.'
      );

    }


    return tokens.accessToken;


  } catch (error) {

    throw new Error(
      error?.message ||
      'Google Drive authentication failed.'
    );

  }

}


/*
 * ============================================================
 * BACKUP FILE NAME
 * ============================================================
 */

function getBackupFilename(
  ownerId
) {

  const safeOwner =
    String(
      ownerId ||
      'unknown'
    )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      )
      .slice(
        0,
        100
      );


  return `storemate_backup_${safeOwner}.json`;

}


function getAvatarFilename(
  ownerId
) {

  const safeOwner =
    String(
      ownerId ||
      'unknown'
    )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      )
      .slice(
        0,
        80
      );


  return `${PROFILE_IMAGE_PREFIX}${safeOwner}.jpg`;

}


/*
 * ============================================================
 * EXPORT PROFILE
 * ============================================================
 */

async function exportLocalProfile(
  ownerId
) {

  const profileKey =
    getProfileStorageKey(
      ownerId
    );


  const storedProfile =
    await AsyncStorage.getItem(
      profileKey
    );


  let profile = {};


  if (storedProfile) {

    try {

      const parsed =
        JSON.parse(
          storedProfile
        );


      if (
        parsed &&
        typeof parsed ===
          'object' &&
        !Array.isArray(
          parsed
        )
      ) {

        profile =
          parsed;

      }

    } catch (error) {

      console.log(
        'Profile JSON invalid:',
        error?.message || error
      );

    }

  }


  const currentEmail =
    await getCurrentUserEmail();


  return {

    email:
      profile.email ||
      currentEmail ||
      '',

    shopName:
      profile.shopName ||
      '',

    phone:
      profile.phone ||
      '',

    address:
      profile.address ||
      '',

    upiId:
      profile.upiId ||
      '',

    avatarUri:
      profile.avatarUri ||
      null,

  };

}


/*
 * ============================================================
 * IMAGE TO BASE64
 * ============================================================
 */

async function imageUriToBase64(
  uri
) {

  if (!uri) {
    return null;
  }


  try {

    let filePath =
      String(uri);


    if (
      filePath.startsWith(
        'file://'
      )
    ) {

      filePath =
        filePath.replace(
          'file://',
          ''
        );

    }


    if (
      typeof RNFS.exists ===
        'function' &&
      typeof RNFS.readFile ===
        'function'
    ) {

      const exists =
        await RNFS.exists(
          filePath
        );


      if (!exists) {
        return null;
      }


      const base64 =
        await RNFS.readFile(
          filePath,
          'base64'
        );


      if (
        base64 &&
        base64.length >
          MAX_AVATAR_BASE64_SIZE
      ) {

        console.log(
          'Avatar too large, skipping backup.'
        );

        return null;

      }


      return base64;

    }


    return null;


  } catch (error) {

    console.log(
      'Avatar conversion skipped:',
      error?.message || error
    );

    return null;

  }

}


/*
 * ============================================================
 * EXPORT PROFILE + AVATAR
 * ============================================================
 */

async function exportProfileData(
  ownerId
) {

  const profile =
    await exportLocalProfile(
      ownerId
    );


  let avatarBase64 =
    null;


  if (
    profile.avatarUri
  ) {

    avatarBase64 =
      await imageUriToBase64(
        profile.avatarUri
      );

  }


  return {

    ownerId,

    data: {

      email:
        profile.email,

      shopName:
        profile.shopName,

      phone:
        profile.phone,

      address:
        profile.address,

      upiId:
        profile.upiId,

    },

    avatar:
      avatarBase64
        ? {

            base64:
              avatarBase64,

            fileName:
              getAvatarFilename(
                ownerId
              ),

            mimeType:
              'image/jpeg',

          }

        : null,

  };

}


/*
 * ============================================================
 * EXPORT ALL LOCAL DATA
 * ============================================================
 *
 * IMPORTANT:
 *
 * Only records belonging to the
 * current owner are exported.
 * ============================================================
 */

async function exportLocalData() {

  const ownerId =
    await requireCurrentUserId();


  const payload = {

    version:
      BACKUP_VERSION,

    ownerId,

    exportedAt:
      Date.now(),

    tables: {},

    profile:
      null,

  };


  for (
    const tableName of
      BACKED_UP_TABLES
  ) {

    const collection =
      database.get(
        tableName
      );


    const records =
      await collection
        .query(
          Q.where(
            'owner_id',
            ownerId
          )
        )
        .fetch();


    payload.tables[
      tableName
    ] =
      records.map(
        record => ({

          ...record._raw,

          owner_id:
            ownerId,

        })
      );

  }


  payload.profile =
    await exportProfileData(
      ownerId
    );


  return payload;

}


/*
 * ============================================================
 * FIND EXISTING GOOGLE DRIVE BACKUP
 * ============================================================
 */

async function findExistingBackupFileId(
  accessToken,
  ownerId
) {

  if (!accessToken) {
    return null;
  }


  try {

    const backupFilename =
      getBackupFilename(
        ownerId
      );


    const query =
      encodeURIComponent(
        `name='${backupFilename}' and trashed=false`
      );


    const response =
      await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`,
        {

          headers: {

            Authorization:
              `Bearer ${accessToken}`,

          },

        }
      );


    if (!response.ok) {
      return null;
    }


    const data =
      await response.json();


    return (
      data?.files?.[0] ||
      null
    );


  } catch (error) {

    console.log(
      'Drive lookup error:',
      error?.message || error
    );

    return null;

  }

}


/*
 * ============================================================
 * UPLOAD BACKUP TO GOOGLE DRIVE
 * ============================================================
 */

async function uploadBackupToDrive(
  accessToken,
  ownerId,
  payload
) {

  const jsonBody =
    JSON.stringify(
      payload
    );


  const existing =
    await findExistingBackupFileId(
      accessToken,
      ownerId
    );


  const backupFilename =
    getBackupFilename(
      ownerId
    );


  const metadata =
    existing

      ? {

          name:
            backupFilename,

          mimeType:
            BACKUP_MIME_TYPE,

        }

      : {

          name:
            backupFilename,

          mimeType:
            BACKUP_MIME_TYPE,

          parents: [
            'appDataFolder',
          ],

        };


  const boundary =
    `storemate-${Date.now()}`;


  const multipartBody =

    `--${boundary}\r\n` +

    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +

    `${JSON.stringify(metadata)}\r\n` +

    `--${boundary}\r\n` +

    `Content-Type: ${BACKUP_MIME_TYPE}\r\n\r\n` +

    `${jsonBody}\r\n` +

    `--${boundary}--`;


  const url =

    existing

      ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`

      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;


  const response =
    await fetch(
      url,
      {

        method:
          existing
            ? 'PATCH'
            : 'POST',

        headers: {

          Authorization:
            `Bearer ${accessToken}`,

          'Content-Type':
            `multipart/related; boundary=${boundary}`,

        },

        body:
          multipartBody,

      }
    );


  if (!response.ok) {

    const errorText =
      await response
        .text()
        .catch(
          () => ''
        );


    throw new Error(
      `Drive upload failed (${response.status})${
        errorText
          ? `: ${errorText}`
          : ''
      }`
    );

  }


  return existing;

}


/*
 * ============================================================
 * MANUAL BACKUP
 * ============================================================
 *
 * BACKUP ORDER:
 *
 * 1. PostgreSQL
 * 2. Google Drive
 *
 * Cloud and Drive are independent.
 * ============================================================
 */

export async function backupNow() {

  const ownerId =
    await requireCurrentUserId();


  /*
   * ==========================================================
   * 1. POSTGRESQL CLOUD SYNC
   * ==========================================================
   */

  let cloudSync = {

    success:
      false,

    message:
      'Cloud sync not attempted.',

  };


  try {

    cloudSync =
      await syncWithCloud();


    console.log(
      '☁️ StoreMate cloud backup:',
      cloudSync
    );


  } catch (error) {

    cloudSync = {

      success:
        false,

      message:
        error?.message ||
        'Cloud sync failed.',

    };


    console.log(
      'Cloud sync failed:',
      error?.message || error
    );

  }


  /*
   * ==========================================================
   * 2. GOOGLE DRIVE
   * ==========================================================
   */

  let driveBackup =
    false;

  let driveError =
    null;

  let payload =
    null;


  try {

    const accessToken =
      await ensureSignedInAndGetToken();


    payload =
      await exportLocalData();


    await uploadBackupToDrive(
      accessToken,
      ownerId,
      payload
    );


    driveBackup =
      true;


  } catch (error) {

    driveError =
      error?.message ||
      'Google Drive backup failed.';


    console.log(
      'Google Drive backup failed:',
      driveError
    );

  }


  /*
   * ==========================================================
   * LOCAL PAYLOAD
   * ==========================================================
   *
   * If Drive authentication failed before
   * exportLocalData(), we still export the
   * counts for reporting.
   */

  if (!payload) {

    try {

      payload =
        await exportLocalData();

    } catch {

      payload = {

        tables: {},

        profile:
          null,

        exportedAt:
          Date.now(),

      };

    }

  }


  /*
   * ==========================================================
   * FINAL STATUS
   * ==========================================================
   */

  const success =
    !!cloudSync?.success ||
    driveBackup;


  return {

    success,

    cloudBackup:
      !!cloudSync?.success,

    driveBackup,

    cloudSync,

    driveError,

    tablesBackedUp:
      Object.keys(
        payload.tables ||
        {}
      ),

    profileBackedUp:
      !!payload.profile,

    avatarBackedUp:
      !!(
        payload.profile &&
        payload.profile.avatar
      ),

    counts: {

      inventory:
        payload.tables
          ?.inventory_items
          ?.length || 0,

      ledger:
        payload.tables
          ?.ledger_entries
          ?.length || 0,

      sales:
        payload.tables
          ?.sales_transactions
          ?.length || 0,

    },

    profileIncluded:
      !!payload.profile,

    avatarIncluded:
      !!(
        payload.profile &&
        payload.profile.avatar
      ),

    ownerId,

    timestamp:
      payload.exportedAt,

  };

}


/*
 * ============================================================
 * CHECK EXISTING DRIVE BACKUP
 * ============================================================
 *
 * NEVER opens Google Sign-In.
 * ============================================================
 */

export async function checkForExistingBackup() {

  try {

    const ownerId =
      await requireCurrentUserId();


    const accessToken =
      await getExistingGoogleToken();


    if (!accessToken) {

      return {

        found:
          false,

        googleNotSignedIn:
          true,

      };

    }


    const existing =
      await findExistingBackupFileId(
        accessToken,
        ownerId
      );


    if (existing) {

      return {

        found:
          true,

        modifiedTime:
          existing.modifiedTime,

        fileId:
          existing.id,

      };

    }


    return {

      found:
        false,

    };


  } catch (error) {

    return {

      found:
        false,

      googleNotSignedIn:
        true,

      error:
        error?.message ||
        String(error),

    };

  }

}


/*
 * ============================================================
 * RESTORE AVATAR
 * ============================================================
 */

async function restoreAvatarImage(
  avatar,
  ownerId
) {

  if (
    !avatar ||
    !avatar.base64
  ) {

    return null;

  }


  try {

    const directory =
      RNFS.DocumentDirectoryPath;


    await RNFS.mkdir(
      directory
    ).catch(
      () => {}
    );


    const filePath =
      `${directory}/${getAvatarFilename(
        ownerId
      )}`;


    try {

      if (
        await RNFS.exists(
          filePath
        )
      ) {

        await RNFS.unlink(
          filePath
        );

      }

    } catch {}


    await RNFS.writeFile(
      filePath,
      avatar.base64,
      'base64'
    );


    return `file://${filePath}`;


  } catch (error) {

    console.log(
      'Avatar restore skipped:',
      error?.message || error
    );

    return null;

  }

}


/*
 * ============================================================
 * RESTORE PROFILE
 * ============================================================
 */

async function restoreProfileData(
  profile,
  ownerId
) {

  if (!profile) {

    return {

      restored:
        false,

      avatarRestored:
        false,

    };

  }


  const data =
    profile.data ||
    {};


  const profileKey =
    getProfileStorageKey(
      ownerId
    );


  let existingProfile =
    {};


  try {

    const stored =
      await AsyncStorage.getItem(
        profileKey
      );


    if (stored) {

      const parsed =
        JSON.parse(
          stored
        );


      if (
        parsed &&
        typeof parsed ===
          'object'
      ) {

        existingProfile =
          parsed;

      }

    }

  } catch {

    existingProfile =
      {};

  }


  const restoredProfile = {

    email:
      data.email ||
      existingProfile.email ||
      '',

    shopName:
      data.shopName ||
      existingProfile.shopName ||
      '',

    phone:
      data.phone ||
      existingProfile.phone ||
      '',

    address:
      data.address ||
      existingProfile.address ||
      '',

    upiId:
      data.upiId ||
      existingProfile.upiId ||
      '',

    avatarUri:
      existingProfile.avatarUri ||
      null,

  };


  let avatarRestored =
    false;


  if (
    profile.avatar
  ) {

    const avatarUri =
      await restoreAvatarImage(
        profile.avatar,
        ownerId
      );


    if (avatarUri) {

      restoredProfile.avatarUri =
        avatarUri;

      avatarRestored =
        true;

    }

  }


  await AsyncStorage.setItem(

    profileKey,

    JSON.stringify(
      restoredProfile
    )

  );


  return {

    restored:
      true,

    avatarRestored,

  };

}


/*
 * ============================================================
 * RESTORE FROM STOREMATE CLOUD
 * ============================================================
 *
 * PostgreSQL → WatermelonDB
 * ============================================================
 */

export async function restoreFromCloudBackup() {

  try {

    const ownerId =
      await requireCurrentUserId();


    if (!ownerId) {

      throw new Error(
        'No active StoreMate user.'
      );

    }


    console.log(
      '☁️ Starting StoreMate cloud restore...'
    );


    const result =
      await restoreFromCloud();


    if (
      !result ||
      result.success !== true
    ) {

      throw new Error(
        result?.message ||
        'Cloud restore failed.'
      );

    }


    console.log(
      '✅ StoreMate cloud restore completed:',
      result
    );


    /*
     * ========================================================
     * PROFILE
     * ========================================================
     */

    if (
      result.profile &&
      typeof result.profile ===
        'object'
    ) {

      await restoreProfileData(
        {
          data: {

            email:
              result.profile.email,

            shopName:
              result.profile.shop_name ||
              result.profile.name,

            phone:
              result.profile.phone,

          },

        },

        ownerId
      );

    }


    return result;


  } catch (error) {

    console.error(
      '❌ StoreMate cloud restore failed:',
      error?.message || error
    );


    return {

      success:
        false,

      message:
        error?.message ||
        'Cloud restore failed.',

    };

  }

}


/*
 * ============================================================
 * RESTORE FROM GOOGLE DRIVE
 * ============================================================
 */

export async function restoreFromDrive(
  fileId
) {

  if (!fileId) {

    throw new Error(
      'Backup file ID is missing.'
    );

  }


  const currentOwnerId =
    await requireCurrentUserId();


  const accessToken =
    await ensureSignedInAndGetToken();


  const response =
    await fetch(

      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,

      {

        headers: {

          Authorization:
            `Bearer ${accessToken}`,

        },

      }

    );


  if (!response.ok) {

    throw new Error(
      `Drive download failed (${response.status})`
    );

  }


  const payload =
    await response.json();


  if (
    !payload ||
    !payload.tables
  ) {

    throw new Error(
      'Backup file is malformed or empty.'
    );

  }


  /*
   * ==========================================================
   * STRICT ACCOUNT VERIFICATION
   * ==========================================================
   */

  const backupOwnerId =
    normalizeUserId(
      payload.ownerId
    );


  const activeOwnerId =
    normalizeUserId(
      currentOwnerId
    );


  if (backupOwnerId) {

    if (
      backupOwnerId !==
      activeOwnerId
    ) {

      throw new Error(
        'This backup belongs to another StoreMate account.'
      );

    }

  } else {

    /*
     * Legacy backup.
     *
     * Verify by email.
     */

    const backupEmail =
      normalizeEmail(
        payload.profile
          ?.data
          ?.email
      );


    const activeEmail =
      normalizeEmail(
        await getCurrentUserEmail()
      );


    if (
      !backupEmail ||
      !activeEmail ||
      backupEmail !==
        activeEmail
    ) {

      throw new Error(
        'This older backup cannot be safely restored because its StoreMate account could not be verified.'
      );

    }

  }


  /*
   * ==========================================================
   * RESTORE TABLES
   * ==========================================================
   */

  const restoredCounts = {

    inventory:
      0,

    ledger:
      0,

    sales:
      0,

  };


  await database.write(
    async () => {

      for (
        const tableName of
          BACKED_UP_TABLES
      ) {

        const rows =
          payload.tables[
            tableName
          ] || [];


        const collection =
          database.get(
            tableName
          );


        const validColumns =
          collection.schema.columns;


        for (
          const row of rows
        ) {

          if (
            !row ||
            !row.id
          ) {

            continue;

          }


          /*
           * Backup owner must match
           * current account.
           */

          if (
            row.owner_id &&
            normalizeUserId(
              row.owner_id
            ) !==
              activeOwnerId
          ) {

            throw new Error(
              'Backup contains records belonging to another StoreMate account.'
            );

          }


          /*
           * Never overwrite local data.
           */

          try {

            await collection.find(
              row.id
            );

            continue;

          } catch {

            // New record.

          }


          await collection.create(
            record => {

              Object.keys(
                validColumns
              ).forEach(
                columnName => {

                  if (
                    row[
                      columnName
                    ] !==
                    undefined
                  ) {

                    record._setRaw(
                      columnName,
                      row[
                        columnName
                      ]
                    );

                  }

                }
              );


              /*
               * ALWAYS assign the active
               * account as owner.
               */

              if (
                validColumns.owner_id
              ) {

                record._setRaw(
                  'owner_id',
                  currentOwnerId
                );

              }


              /*
               * Restored records came from
               * a verified backup.
               */

              if (
                validColumns.is_synced
              ) {

                record._setRaw(
                  'is_synced',
                  true
                );

              }

            }
          );


          if (
            tableName ===
            'inventory_items'
          ) {

            restoredCounts.inventory +=
              1;

          }


          if (
            tableName ===
            'ledger_entries'
          ) {

            restoredCounts.ledger +=
              1;

          }


          if (
            tableName ===
            'sales_transactions'
          ) {

            restoredCounts.sales +=
              1;

          }

        }

      }

    }
  );


  /*
   * ==========================================================
   * RESTORE PROFILE
   * ==========================================================
   */

  const profileResult =
    await restoreProfileData(
      payload.profile,
      currentOwnerId
    );


  return {

    success:
      true,

    restoredTables:
      Object.keys(
        payload.tables
      ),

    restoredCounts,

    profileRestored:
      profileResult.restored,

    avatarRestored:
      profileResult.avatarRestored,

    backupVersion:
      payload.version ||
      1,

    ownerId:
      currentOwnerId,

  };

}


/*
 * ============================================================
 * FIRST LAUNCH RESTORE OFFER
 * ============================================================
 */

export async function offerRestoreIfFirstLaunch(
  onFoundBackup
) {

  try {

    const alreadyShown =
      await AsyncStorage.getItem(
        RESTORE_PROMPT_SHOWN_KEY
      );


    if (alreadyShown) {
      return;
    }


    const result =
      await checkForExistingBackup();


    if (
      result.googleNotSignedIn
    ) {

      return;

    }


    await AsyncStorage.setItem(
      RESTORE_PROMPT_SHOWN_KEY,
      'true'
    );


    if (
      result.found &&
      typeof onFoundBackup ===
        'function'
    ) {

      onFoundBackup(
        result
      );

    }


  } catch (error) {

    console.log(
      'Restore offer skipped:',
      error?.message || error
    );

  }

}


/*
 * ============================================================
 * HOURLY GOOGLE DRIVE BACKUP
 * ============================================================
 *
 * Background backup NEVER opens Google Sign-In.
 * ============================================================
 */

let backupInterval =
  null;


export function startHourlyBackupScheduler() {

  if (backupInterval) {
    return;
  }


  const ONE_HOUR =
    60 * 60 * 1000;


  backupInterval =
    setInterval(
      async () => {

        try {

          const ownerId =
            await requireCurrentUserId();


          const accessToken =
            await getExistingGoogleToken();


          if (!accessToken) {
            return;
          }


          const payload =
            await exportLocalData();


          await uploadBackupToDrive(
            accessToken,
            ownerId,
            payload
          );


          console.log(
            'Hourly Google Drive backup completed.'
          );


        } catch (error) {

          /*
           * Background backup failure
           * must never disturb the user.
           */

          console.log(
            'Hourly backup skipped:',
            error?.message || error
          );

        }

      },

      ONE_HOUR

    );

}


/*
 * ============================================================
 * STOP HOURLY BACKUP
 * ============================================================
 */

export function stopHourlyBackupScheduler() {

  if (backupInterval) {

    clearInterval(
      backupInterval
    );

    backupInterval =
      null;

  }

}