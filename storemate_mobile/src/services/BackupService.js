import {
  GoogleSignin,
} from '@react-native-google-signin/google-signin';

import {
  database,
} from '../core/database';

import AsyncStorage from '@react-native-async-storage/async-storage';

import RNFS from 'react-native-fs';


const BACKUP_FILENAME =
  'storemate_backup.json';

const BACKUP_MIME_TYPE =
  'application/json';

const RESTORE_PROMPT_SHOWN_KEY =
  'driveBackup_restorePromptShown';

const BACKUP_VERSION =
  3;


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
 * GOOGLE CONFIG
 * ============================================================
 */

const GOOGLE_WEB_CLIENT_ID =
  '106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com';


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
 * PROFILE
 * ============================================================
 */

const PROFILE_STORAGE_KEYS = [
  'userEmail',
  'shopName',
  'userPhone',
  'userAddress',
  'shopUpi',
  'avatarUri',
];


const IMAGE_FILE_NAME =
  'storemate_profile_avatar.jpg';


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
 * CHECK GOOGLE SESSION
 * ============================================================
 *
 * NEVER opens Google account selector.
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

      const currentUser =
        await GoogleSignin.getCurrentUser();

      return !!currentUser;
    }


    return false;

  } catch (
    error
  ) {

    console.log(
      'Google session check failed:',
      error?.message ||
        error
    );


    return false;
  }
}


/*
 * ============================================================
 * GET EXISTING GOOGLE TOKEN
 * ============================================================
 *
 * NEVER opens login.
 * ============================================================
 */

async function getExistingGoogleToken() {

  const signedIn =
    await isGoogleAlreadySignedIn();


  if (
    !signedIn
  ) {

    return null;
  }


  const expectedEmail =
    await AsyncStorage.getItem(
      'userEmail'
    );


  if (
    !expectedEmail
  ) {

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
    extractGoogleEmail(
      currentUser
    );


  if (
    !currentEmail
  ) {

    return null;
  }


  if (
    currentEmail.toLowerCase() !==
    expectedEmail.toLowerCase()
  ) {

    return null;
  }


  try {

    const tokens =
      await GoogleSignin.getTokens();


    if (
      !tokens ||
      !tokens.accessToken
    ) {

      return null;
    }


    return tokens.accessToken;

  } catch (
    error
  ) {

    console.log(
      'Existing Google token unavailable:',
      error?.message
    );


    return null;
  }
}


/*
 * ============================================================
 * EXPLICIT GOOGLE SIGN-IN
 * ============================================================
 *
 * ONLY call this from an explicit Backup/Restore action.
 * ============================================================
 */

async function ensureSignedInAndGetToken() {

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
    await AsyncStorage.getItem(
      'userEmail'
    );


  if (
    !expectedEmail
  ) {

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
    extractGoogleEmail(
      currentUser
    );


  /*
   * Wrong Google account:
   * remove it.
   */

  if (
    currentEmail &&
    currentEmail.toLowerCase() !==
      expectedEmail.toLowerCase()
  ) {

    try {

      await GoogleSignin.signOut();

    } catch (
      error
    ) {

      console.log(
        'Google account cleanup failed:',
        error?.message
      );
    }


    currentUser =
      null;

    currentEmail =
      null;
  }


  /*
   * ONLY HERE may the Google popup open.
   */

  if (
    !currentUser
  ) {

    currentUser =
      await GoogleSignin.signIn();


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
   * Security check.
   */

  if (
    !currentEmail ||
    currentEmail.toLowerCase() !==
      expectedEmail.toLowerCase()
  ) {

    try {

      await GoogleSignin.signOut();

    } catch (
      error
    ) {

      console.log(
        'Google security cleanup failed:',
        error?.message
      );
    }


    throw new Error(
      `Security Mismatch: Select the Google Drive account for ${expectedEmail}.`
    );
  }


  const tokens =
    await GoogleSignin.getTokens();


  if (
    !tokens ||
    !tokens.accessToken
  ) {

    throw new Error(
      'Google Drive access token could not be obtained.'
    );
  }


  return tokens.accessToken;
}


/*
 * ============================================================
 * EXPORT PROFILE
 * ============================================================
 */

async function exportLocalProfile() {

  const values =
    await AsyncStorage.multiGet(
      PROFILE_STORAGE_KEYS
    );


  const profile =
    {};


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
 * IMAGE -> BASE64
 * ============================================================
 */

async function imageUriToBase64(
  uri
) {

  if (!uri) {
    return null;
  }


  try {

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


    let filePath =
      uri;


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
      RNFS &&
      typeof RNFS.exists ===
        'function'
    ) {

      const exists =
        await RNFS.exists(
          filePath
        );


      if (
        exists &&
        typeof RNFS.readFile ===
          'function'
      ) {

        return await RNFS.readFile(
          filePath,
          'base64'
        );
      }
    }


    /*
     * Content URI fallback.
     */

    if (
      typeof fetch ===
      'function'
    ) {

      const response =
        await fetch(
          uri
        );


      if (
        !response.ok
      ) {

        return null;
      }


      if (
        typeof FileReader ===
        'undefined'
      ) {

        return null;
      }


      const blob =
        await response.blob();


      return await new Promise(
        (
          resolve
        ) => {

          try {

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

                } catch {

                  resolve(
                    null
                  );
                }
              };


            reader.onerror =
              () => resolve(null);


            reader.readAsDataURL(
              blob
            );

          } catch {

            resolve(
              null
            );
          }
        }
      );
    }


    return null;

  } catch (
    error
  ) {

    console.log(
      'Avatar conversion skipped:',
      error?.message ||
        error
    );


    return null;
  }
}


/*
 * ============================================================
 * EXPORT PROFILE DATA
 * ============================================================
 */

async function exportProfileData() {

  const profile =
    await exportLocalProfile();


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


    avatar:
      avatarBase64
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
 * EXPORT LOCAL DATABASE
 * ============================================================
 */

async function exportLocalData() {

  const payload = {

    version:
      BACKUP_VERSION,

    exportedAt:
      Date.now(),

    tables:
      {},

    profile:
      null,
  };


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


    payload.tables[
      tableName
    ] =
      records.map(
        record => ({
          ...record._raw,
        })
      );
  }


  payload.profile =
    await exportProfileData();


  return payload;
}


/*
 * ============================================================
 * FIND DRIVE BACKUP
 * ============================================================
 */

async function findExistingBackupFileId(
  accessToken
) {

  if (
    !accessToken
  ) {

    return null;
  }


  try {

    const query =
      encodeURIComponent(
        `name='${BACKUP_FILENAME}' and trashed=false`
      );


    const response =
      await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,modifiedTime)`,
        {
          headers: {

            Authorization:
              `Bearer ${accessToken}`,
          },
        }
      );


    if (
      !response.ok
    ) {

      console.log(
        `Drive lookup failed: ${response.status}`
      );


      return null;
    }


    const data =
      await response.json();


    if (
      data.files &&
      data.files.length > 0
    ) {

      return data.files[0];
    }


    return null;

  } catch (
    error
  ) {

    console.log(
      'Drive lookup error:',
      error?.message ||
        error
    );


    return null;
  }
}


/*
 * ============================================================
 * BACKUP NOW
 * ============================================================
 *
 * Explicit user action.
 *
 * Internet + Google login required.
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


  if (
    !response.ok
  ) {

    const errorText =
      await response
        .text()
        .catch(
          () => ''
        );


    throw new Error(
      `Drive upload failed (${response.status})${errorText ? `: ${errorText}` : ''}`
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
 *
 * NEVER opens Google Sign-In.
 * ============================================================
 */

export async function checkForExistingBackup() {

  try {

    const accessToken =
      await getExistingGoogleToken();


    if (
      !accessToken
    ) {

      return {

        found:
          false,

        googleNotSignedIn:
          true,
      };
    }


    const existing =
      await findExistingBackupFileId(
        accessToken
      );


    if (
      existing
    ) {

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

  } catch (
    error
  ) {

    console.log(
      'Drive backup check skipped:',
      error?.message ||
        error
    );


    return {

      found:
        false,

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
  avatar
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
      `${directory}/${IMAGE_FILE_NAME}`;


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

    } catch {
      /*
       * Ignore old image cleanup errors.
       */
    }


    await RNFS.writeFile(
      filePath,
      avatar.base64,
      'base64'
    );


    return `file://${filePath}`;

  } catch (
    error
  ) {

    console.log(
      'Avatar restore skipped:',
      error?.message ||
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


  const values =
    [];


  const keys = [
    'userEmail',
    'shopName',
    'userPhone',
    'userAddress',
    'shopUpi',
  ];


  keys.forEach(
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

        values.push([
          key,
          String(
            value
          ),
        ]);
      }
    }
  );


  if (
    values.length > 0
  ) {

    await AsyncStorage.multiSet(
      values
    );
  }


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
      values.length >
      0,

    avatarRestored,
  };
}


/*
 * ============================================================
 * RESTORE FROM DRIVE
 * ============================================================
 *
 * Explicit user action only.
 * ============================================================
 */

export async function restoreFromDrive(
  fileId
) {

  if (
    !fileId
  ) {

    throw new Error(
      'Backup file ID is missing.'
    );
  }


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


  if (
    !response.ok
  ) {

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
   * DATABASE RESTORE
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

          if (
            !row ||
            !row.id
          ) {

            continue;
          }


          try {

            await collection.find(
              row.id
            );


            /*
             * Already exists locally.
             * Do not overwrite local data.
             */

            continue;

          } catch {
            /*
             * Record does not exist.
             * Create it below.
             */
          }


          await collection.create(
            record => {

              Object.keys(
                validColumns
              ).forEach(
                columnName => {

                  if (
                    row[columnName] !==
                    undefined
                  ) {

                    record._setRaw(
                      columnName,
                      row[columnName]
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


  const profileResult =
    await restoreProfileData(
      payload.profile
    );


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
 * FIRST LAUNCH RESTORE
 * ============================================================
 *
 * NEVER opens Google login.
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


    const result =
      await checkForExistingBackup();


    /*
     * Do not mark it permanently as shown
     * when Google is not connected.
     *
     * This allows the check again later
     * when the user intentionally connects Drive.
     */

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

  } catch (
    error
  ) {

    console.log(
      'Restore offer skipped:',
      error?.message ||
        error
    );
  }
}


/*
 * ============================================================
 * HOURLY BACKUP
 * ============================================================
 *
 * NEVER opens Google account selector.
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


          /*
           * Get existing Google token ONLY.
           *
           * If unavailable:
           * silently skip.
           */

          const accessToken =
            await getExistingGoogleToken();


          if (
            !accessToken
          ) {

            console.log(
              'Hourly backup skipped: no existing Google Drive session.'
            );

            return;
          }


          /*
           * Export local data.
           */

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
            `storemate-auto-${Date.now()}`;


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


          if (
            !response.ok
          ) {

            console.log(
              `Hourly backup failed: ${response.status}`
            );


            return;
          }


          console.log(
            'Hourly StoreMate backup completed.'
          );

        } catch (
          error
        ) {

          /*
           * VERY IMPORTANT:
           *
           * Never show an Alert here.
           * Never change app state.
           * Never block Home/POS.
           */

          console.log(
            'Hourly backup skipped:',
            error?.message ||
              error
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