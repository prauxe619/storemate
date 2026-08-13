import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { database } from '../core/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

const BACKUP_FILENAME = 'storemate_backup.json';
const BACKUP_MIME_TYPE = 'application/json';

const RESTORE_PROMPT_SHOWN_KEY =
  'driveBackup_restorePromptShown';

const BACKUP_VERSION = 2;


/*
 * ============================================================
 * DATABASE TABLES
 * ============================================================
 */

const BACKED_UP_TABLES = [
  'inventory_items',
  'ledger_entries',
  'sales_transactions',
];


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
    '106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com',
});


/*
 * ============================================================
 * PROFILE STORAGE KEYS
 * ============================================================
 *
 * These are the keys currently used by ProfileScreen.
 *
 * We deliberately keep the existing keys so that we don't
 * break the rest of StoreMate.
 */

const PROFILE_STORAGE_KEYS = [
  'userEmail',
  'shopName',
  'userPhone',
  'userAddress',
  'shopUpi',
  'avatarUri',
];


/*
 * ============================================================
 * IMAGE BACKUP KEY
 * ============================================================
 *
 * avatarUri is only a LOCAL reference.
 *
 * We additionally store the actual image in the backup as:
 *
 * avatarBase64
 *
 * We do NOT put this in AsyncStorage permanently.
 * It is generated when backupNow() runs.
 */

const IMAGE_FILE_NAME =
  'storemate_profile_avatar.jpg';


/*
 * ============================================================
 * GOOGLE ACCOUNT EMAIL EXTRACTION
 * ============================================================
 */

function extractGoogleEmail(googleUser) {

  if (!googleUser) {
    return null;
  }


  /*
   * Google Sign-In v12 and older
   */

  if (
    googleUser.user &&
    googleUser.user.email
  ) {

    return googleUser.user.email;
  }


  /*
   * Google Sign-In v13+
   */

  if (
    googleUser.data &&
    googleUser.data.user &&
    googleUser.data.user.email
  ) {

    return googleUser.data.user.email;
  }


  /*
   * Fallback
   */

  if (
    googleUser.email
  ) {

    return googleUser.email;
  }


  return null;
}


/*
 * ============================================================
 * ENSURE GOOGLE SIGN-IN
 * ============================================================
 */

async function ensureSignedInAndGetToken() {

  if (
    typeof GoogleSignin.hasPlayServices ===
    'function'
  ) {

    await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    });
  }


  /*
   * StoreMate account email.
   */

  const expectedEmail =
    await AsyncStorage.getItem(
      'userEmail'
    );


  if (!expectedEmail) {

    throw new Error(
      'StoreMate profile email not found. Please log in again.'
    );
  }


  /*
   * Configure Google Sign-In for
   * the correct Google account.
   */

  GoogleSignin.configure({
    scopes: [
      'https://www.googleapis.com/auth/drive.appdata',
    ],

    webClientId:
      '106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com',

    accountName:
      expectedEmail,
  });


  let currentUser = null;


  if (
    typeof GoogleSignin.getCurrentUser ===
    'function'
  ) {

    currentUser =
      await GoogleSignin.getCurrentUser();
  }


  let currentEmail =
    extractGoogleEmail(
      currentUser
    );


  /*
   * If the currently selected Google
   * account is wrong, sign it out.
   */

  if (
    currentEmail &&
    currentEmail.toLowerCase() !==
      expectedEmail.toLowerCase()
  ) {

    await GoogleSignin.signOut();

    currentUser = null;

    currentEmail = null;
  }


  /*
   * Sign in if there is no valid
   * current session.
   */

  if (!currentUser) {

    currentUser =
      await GoogleSignin.signIn();


    /*
     * Google Sign-In v13+
     * cancellation response.
     */

    if (
      currentUser &&
      currentUser.type ===
        'cancelled'
    ) {

      throw new Error(
        'Google Sign-In was cancelled.'
      );
    }


    currentEmail =
      extractGoogleEmail(
        currentUser
      );
  }


  /*
   * Final security check.
   */

  if (
    !currentEmail ||
    currentEmail.toLowerCase() !==
      expectedEmail.toLowerCase()
  ) {

    await GoogleSignin.signOut();

    throw new Error(
      `Security Mismatch: You must select the Google Drive account for ${expectedEmail}`
    );
  }


  const tokens =
    await GoogleSignin.getTokens();


  return tokens.accessToken;
}


/*
 * ============================================================
 * READ LOCAL PROFILE
 * ============================================================
 */

async function exportLocalProfile() {

  const values =
    await AsyncStorage.multiGet(
      PROFILE_STORAGE_KEYS
    );


  const profile = {};


  values.forEach(
    ([key, value]) => {

      profile[key] =
        value || null;

    }
  );


  return profile;
}


/*
 * ============================================================
 * GET FILE PATH FROM AVATAR URI
 * ============================================================
 *
 * avatarUri can be:
 *
 * file:///...
 * content://...
 * /data/...
 *
 * react-native-fs works best with
 * actual filesystem paths.
 *
 * We first try the URI directly.
 */

function normalizeFileUri(
  uri
) {

  if (!uri) {
    return null;
  }


  if (
    uri.startsWith(
      'file://'
    )
  ) {

    return uri.replace(
      'file://',
      ''
    );
  }


  return uri;
}


/*
 * ============================================================
 * CONVERT IMAGE URI TO BASE64
 * ============================================================
 *
 * This function attempts to read the
 * actual image from the device.
 *
 * First method:
 * react-native-fs
 *
 * Second method:
 * fetch(uri)
 *
 * This makes it more tolerant of
 * Android content:// URIs.
 */

async function imageUriToBase64(
  uri
) {

  if (!uri) {
    return null;
  }


  /*
   * Already a data URI.
   */

  if (
    uri.startsWith(
      'data:image/'
    )
  ) {

    const commaIndex =
      uri.indexOf(',');


    if (
      commaIndex !== -1
    ) {

      return uri.substring(
        commaIndex + 1
      );
    }

    return null;
  }


  /*
   * Try react-native-fs.
   */

  try {

    const normalizedPath =
      normalizeFileUri(
        uri
      );


    if (
      normalizedPath &&
      await RNFS.exists(
        normalizedPath
      )
    ) {

      return await RNFS.readFile(
        normalizedPath,
        'base64'
      );
    }

  } catch (
    fsError
  ) {

    console.log(
      'Avatar RNFS read failed:',
      fsError?.message
    );
  }


  /*
   * Try fetch().
   *
   * This can work with Android
   * content:// URIs.
   */

  try {

    const response =
      await fetch(uri);


    if (!response.ok) {

      throw new Error(
        `Unable to read avatar (${response.status})`
      );
    }


    const blob =
      await response.blob();


    return await new Promise(
      (
        resolve,
        reject
      ) => {

        const reader =
          new FileReader();


        reader.onloadend =
          () => {

            try {

              const result =
                String(
                  reader.result ||
                    ''
                );


              const commaIndex =
                result.indexOf(
                  ','
                );


              if (
                commaIndex ===
                -1
              ) {

                resolve(
                  null
                );

                return;
              }


              resolve(
                result.substring(
                  commaIndex + 1
                )
              );

            } catch (
              error
            ) {

              reject(
                error
              );
            }
          };


        reader.onerror =
          reject;


        reader.readAsDataURL(
          blob
        );

      }
    );

  } catch (
    fetchError
  ) {

    console.log(
      'Avatar fetch/base64 conversion failed:',
      fetchError?.message
    );

    return null;
  }
}


/*
 * ============================================================
 * EXPORT PROFILE + IMAGE
 * ============================================================
 */

async function exportProfileData() {

  const profile =
    await exportLocalProfile();


  let avatarBase64 =
    null;


  /*
   * Existing local avatar.
   */

  if (
    profile.avatarUri
  ) {

    avatarBase64 =
      await imageUriToBase64(
        profile.avatarUri
      );
  }


  return {

    /*
     * Normal profile values.
     */

    data: {
      userEmail:
        profile.userEmail,

      shopName:
        profile.shopName,

      userPhone:
        profile.userPhone,

      userAddress:
        profile.userAddress,

      shopUpi:
        profile.shopUpi,
    },


    /*
     * Image is stored separately
     * because it is binary data.
     */

    avatar: avatarBase64
      ? {
          base64:
            avatarBase64,

          fileName:
            IMAGE_FILE_NAME,

          mimeType:
            'image/jpeg',
        }
      : null,
  };
}


/*
 * ============================================================
 * EXPORT COMPLETE LOCAL DATA
 * ============================================================
 */

async function exportLocalData() {

  const exportPayload = {

    version:
      BACKUP_VERSION,

    exportedAt:
      Date.now(),

    tables:
      {},

    profile:
      null,
  };


  /*
   * DATABASE
   */

  for (
    const tableName of
      BACKED_UP_TABLES
  ) {

    const records =
      await database
        .get(
          tableName
        )
        .query()
        .fetch();


    exportPayload.tables[
      tableName
    ] =
      records.map(
        record => ({
          ...record._raw,
        })
      );
  }


  /*
   * PROFILE
   */

  exportPayload.profile =
    await exportProfileData();


  return exportPayload;
}


/*
 * ============================================================
 * FIND EXISTING BACKUP
 * ============================================================
 */

async function findExistingBackupFileId(
  accessToken
) {

  const query =
    encodeURIComponent(
      `name='${BACKUP_FILENAME}' and trashed=false`
    );


  const res =
    await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,modifiedTime)`,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    );


  if (!res.ok) {

    throw new Error(
      `Drive lookup failed (${res.status})`
    );
  }


  const data =
    await res.json();


  return (
    data.files &&
    data.files.length > 0
  )
    ? data.files[0]
    : null;
}


/*
 * ============================================================
 * BACKUP NOW
 * ============================================================
 */

export async function backupNow() {

  const accessToken =
    await ensureSignedInAndGetToken();


  const payload =
    await exportLocalData();


  const jsonBody =
    JSON.stringify(
      payload
    );


  const existing =
    await findExistingBackupFileId(
      accessToken
    );


  const metadata =
    existing

      ? {
          name:
            BACKUP_FILENAME,

          mimeType:
            BACKUP_MIME_TYPE,
        }

      : {
          name:
            BACKUP_FILENAME,

          mimeType:
            BACKUP_MIME_TYPE,

          parents: [
            'appDataFolder',
          ],
        };


  const boundary =
    'storemate-backup-boundary';


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


  const res =
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


  if (!res.ok) {

    const errText =
      await res
        .text()
        .catch(
          () => ''
        );


    throw new Error(
      `Drive upload failed (${res.status}): ${errText}`
    );
  }


  return {

    success:
      true,

    tablesBackedUp:
      Object.keys(
        payload.tables
      ),

    profileBackedUp:
      !!payload.profile,

    avatarBackedUp:
      !!(
        payload.profile &&
        payload.profile.avatar
      ),

    timestamp:
      payload.exportedAt,
  };
}


/*
 * ============================================================
 * CHECK EXISTING BACKUP
 * ============================================================
 */

export async function checkForExistingBackup() {

  try {

    const accessToken =
      await ensureSignedInAndGetToken();


    const existing =
      await findExistingBackupFileId(
        accessToken
      );


    return existing

      ? {
          found:
            true,

          modifiedTime:
            existing.modifiedTime,

          fileId:
            existing.id,
        }

      : {
          found:
            false,
        };

  } catch (
    error
  ) {

    /*
     * Don't crash login when the
     * device is offline.
     */

    if (
      error.message &&
      (
        error.message.includes(
          'NETWORK_ERROR'
        ) ||
        error.message.includes(
          'network'
        )
      )
    ) {

      console.log(
        'Google Drive backup check skipped: Device is offline or network error encountered.'
      );


      return {
        found:
          false,
      };
    }


    console.error(
      'checkForExistingBackup failed:',
      error
    );


    return {
      found:
        false,

      error:
        error.message,
    };
  }
}


/*
 * ============================================================
 * WRITE RESTORED IMAGE
 * ============================================================
 */

async function restoreAvatarImage(
  avatar
) {

  if (
    !avatar ||
    !avatar.base64
  ) {

    return null;
  }


  try {

    /*
     * Make sure the directory exists.
     */

    const directory =
      RNFS.DocumentDirectoryPath;


    await RNFS.mkdir(
      directory
    ).catch(
      () => {}
    );


    const filePath =
      `${directory}/${IMAGE_FILE_NAME}`;


    /*
     * Remove an old restored
     * profile image first.
     */

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

    } catch (
      deleteError
    ) {

      console.log(
        'Old avatar cleanup skipped:',
        deleteError?.message
      );
    }


    /*
     * Write actual binary image.
     */

    await RNFS.writeFile(
      filePath,
      avatar.base64,
      'base64'
    );


    /*
     * Return a NEW local URI.
     *
     * This URI belongs to the
     * current Android installation.
     */

    return `file://${filePath}`;

  } catch (
    error
  ) {

    console.error(
      'Profile image restore failed:',
      error
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
  profile
) {

  if (
    !profile
  ) {

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


  /*
   * IMPORTANT:
   *
   * We only restore non-empty values.
   *
   * This prevents an old backup with
   * missing profile fields from
   * deleting valid current values.
   */

  const valuesToRestore =
    [];


  const profileKeys = [
    'userEmail',
    'shopName',
    'userPhone',
    'userAddress',
    'shopUpi',
  ];


  profileKeys.forEach(
    key => {

      const value =
        data[key];


      if (
        value !== null &&
        value !== undefined &&
        String(
          value
        ).trim() !== ''
      ) {

        valuesToRestore.push([
          key,
          String(
            value
          ),
        ]);
      }

    }
  );


  /*
   * Restore profile fields.
   */

  if (
    valuesToRestore.length >
    0
  ) {

    await AsyncStorage.multiSet(
      valuesToRestore
    );
  }


  /*
   * Restore image.
   */

  let avatarRestored =
    false;


  if (
    profile.avatar
  ) {

    const avatarUri =
      await restoreAvatarImage(
        profile.avatar
      );


    if (
      avatarUri
    ) {

      await AsyncStorage.setItem(
        'avatarUri',
        avatarUri
      );


      avatarRestored =
        true;
    }
  }


  return {

    restored:
      valuesToRestore.length >
      0,

    avatarRestored:
      avatarRestored,
  };
}


/*
 * ============================================================
 * RESTORE DATABASE + PROFILE
 * ============================================================
 */

export async function restoreFromDrive(
  fileId
) {

  const accessToken =
    await ensureSignedInAndGetToken();


  /*
   * Download backup.
   */

  const res =
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    );


  if (!res.ok) {

    throw new Error(
      `Drive download failed (${res.status})`
    );
  }


  const payload =
    await res.json();


  /*
   * Validate backup.
   */

  if (
    !payload ||
    !payload.tables
  ) {

    throw new Error(
      'Backup file is malformed or empty'
    );
  }


  /*
   * ==========================================================
   * RESTORE DATABASE
   * ==========================================================
   */

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
          const row of
            rows
        ) {

          try {

            /*
             * Existing record:
             *
             * Keep existing behavior.
             */

            await collection.find(
              row.id
            );

            continue;

          } catch {

            /*
             * Record does not exist.
             *
             * Restore it.
             */
          }


          await collection.create(
            record => {

              Object.keys(
                validColumns
              ).forEach(
                colName => {

                  if (
                    row[colName] !==
                    undefined
                  ) {

                    record._setRaw(
                      colName,
                      row[colName]
                    );
                  }

                }
              );

            }
          );
        }
      }

    }
  );


  /*
   * ==========================================================
   * RESTORE PROFILE
   * ==========================================================
   *
   * This is the new part that fixes
   * your UPI/profile restoration.
   */

  const profileResult =
    await restoreProfileData(
      payload.profile
    );


  /*
   * ==========================================================
   * RESULT
   * ==========================================================
   */

  return {

    success:
      true,

    restoredTables:
      Object.keys(
        payload.tables
      ),

    profileRestored:
      profileResult.restored,

    avatarRestored:
      profileResult.avatarRestored,

    backupVersion:
      payload.version ||
      1,
  };
}


/*
 * ============================================================
 * FIRST-LAUNCH RESTORE OFFER
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


    if (
      alreadyShown
    ) {

      return;
    }


    let signedIn =
      false;


    if (
      typeof GoogleSignin.isSignedIn ===
      'function'
    ) {

      signedIn =
        await GoogleSignin.isSignedIn();

    } else if (
      typeof GoogleSignin.getCurrentUser ===
      'function'
    ) {

      const currentUser =
        await GoogleSignin.getCurrentUser();


      signedIn =
        !!currentUser;
    }


    if (
      !signedIn
    ) {

      return;
    }


    const result =
      await checkForExistingBackup();


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

  } catch (
    error
  ) {

    console.error(
      'offerRestoreIfFirstLaunch failed:',
      error
    );
  }
}


/*
 * ============================================================
 * HOURLY BACKUP
 * ============================================================
 */

let backupInterval =
  null;


export function startHourlyBackupScheduler() {

  if (
    backupInterval
  ) {

    return;
  }


  const ONE_HOUR =
    60 *
    60 *
    1000;


  backupInterval =
    setInterval(
      async () => {

        try {

          const userEmail =
            await AsyncStorage.getItem(
              'userEmail'
            );


          if (
            !userEmail
          ) {

            return;
          }


          console.log(
            '⏰ Running automated hourly Google Drive backup...'
          );


          const result =
            await backupNow();


          console.log(
            '✅ Hourly Google Drive backup completed successfully.',
            {
              profile:
                result.profileBackedUp,

              avatar:
                result.avatarBackedUp,
            }
          );

        } catch (
          error
        ) {

          /*
           * Never disturb the
           * shopkeeper.
           */

          console.log(
            '⏰ Hourly background backup skipped/failed silently:',
            error?.message
          );
        }

      },
      ONE_HOUR
    );
}


export function stopHourlyBackupScheduler() {

  if (
    backupInterval
  ) {

    clearInterval(
      backupInterval
    );

    backupInterval =
      null;
  }
}