import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  useWindowDimensions,
} from 'react-native';


// ============================================================
// COUNTR APP ALERT CONTEXT
// ============================================================

const AppAlertContext =
  createContext(null);


// ============================================================
// PROVIDER
// ============================================================

export const AppAlertProvider = ({ children }) => {
  const [alert, setAlert] = useState(null);

  const {
    width: windowWidth,
    height: windowHeight,
  } = useWindowDimensions();

  const horizontalPadding =
    windowWidth < 360
      ? 14
      : 20;

  const maxCardHeight =
    Math.max(
      300,
      Math.min(
        windowHeight * 0.86,
        windowHeight - 40
      )
    );
  


  const fadeAnim =
    useRef(
      new Animated.Value(0)
    ).current;


  const scaleAnim =
    useRef(
      new Animated.Value(0.92)
    ).current;


  // ==========================================================
  // SHOW ALERT
  // ==========================================================

  const showAlert = useCallback(
  (
    optionsOrTitle = {},
    messageArg = '',
    buttonsArg = null
  ) => {

    /*
     * ========================================================
     * NEW FORMAT
     *
     * showAlert({
     *   type: 'success',
     *   title: 'Saved',
     *   message: 'Done'
     * })
     * ========================================================
     */

    if (
      typeof optionsOrTitle === 'object' &&
      optionsOrTitle !== null &&
      !Array.isArray(optionsOrTitle)
    ) {

      const options =
        optionsOrTitle;

      setAlert({
        type:
          options.type ||
          'info',

        title:
          options.title ||
          'Countr',

        message:
          options.message ||
          '',

        confirmText:
          options.confirmText ||
          'OK',

        cancelText:
          options.cancelText ||
          'Cancel',

        showCancel:
          options.showCancel ??
          false,

        onConfirm:
          typeof options.onConfirm ===
          'function'
            ? options.onConfirm
            : null,

        onCancel:
          typeof options.onCancel ===
          'function'
            ? options.onCancel
            : null,

        closeOnConfirm:
          options.closeOnConfirm ??
          true,
      });

      return;
    }


    /*
     * ========================================================
     * OLD / ALERT.ALERT COMPATIBILITY
     *
     * showAlert(
     *   'Title',
     *   'Message'
     * )
     *
     * OR
     *
     * showAlert(
     *   'Title',
     *   'Message',
     *   [...]
     * )
     * ========================================================
     */

    const title =
      String(
        optionsOrTitle ||
          'Countr'
      );

    const message =
      typeof messageArg ===
      'string'
        ? messageArg
        : '';


    const buttons =
      Array.isArray(
        buttonsArg
      )
        ? buttonsArg
        : [];


    /*
     * Find Cancel button
     */

    const cancelButton =
      buttons.find(
        button =>
          button?.style ===
          'cancel'
      );


    /*
     * Find primary button.
     *
     * Prefer the last non-cancel button.
     */

    const actionButtons =
      buttons.filter(
        button =>
          button?.style !==
          'cancel'
      );


    const confirmButton =
      actionButtons.length
        ? actionButtons[
            actionButtons.length - 1
          ]
        : null;


    /*
     * Determine alert type
     */

    let type =
      'info';


    const lowerTitle =
      title.toLowerCase();


    if (
      lowerTitle.includes(
        'error'
      ) ||
      lowerTitle.includes(
        'failed'
      ) ||
      lowerTitle.includes(
        'failure'
      ) ||
      lowerTitle.includes(
        'could not'
      )
    ) {

      type =
        'error';

    } else if (
      lowerTitle.includes(
        'warning'
      ) ||
      lowerTitle.includes(
        'invalid'
      ) ||
      lowerTitle.includes(
        'required'
      )
    ) {

      type =
        'warning';

    } else if (
      lowerTitle.includes(
        'success'
      ) ||
      lowerTitle.includes(
        'saved'
      ) ||
      lowerTitle.includes(
        'complete'
      ) ||
      lowerTitle.includes(
        'thank'
      )
    ) {

      type =
        'success';

    } else if (
      buttons.length > 1
    ) {

      type =
        'confirm';
    }


    setAlert({

      type,

      title,

      message,

      confirmText:
        confirmButton?.text ||
        'OK',

      cancelText:
        cancelButton?.text ||
        'Cancel',

      showCancel:
        !!cancelButton,

      onConfirm:
        confirmButton?.onPress ||
        null,

      onCancel:
        cancelButton?.onPress ||
        null,

      closeOnConfirm:
        true,
    });

  },
  []
);


  // ==========================================================
  // HIDE ALERT
  // ==========================================================

  const hideAlert =
    useCallback(
      () => {

        Animated.parallel([
          Animated.timing(
            fadeAnim,
            {
              toValue: 0,

              duration: 160,

              easing:
                Easing.out(
                  Easing.ease
                ),

              useNativeDriver:
                true,
            }
          ),

          Animated.timing(
            scaleAnim,
            {
              toValue: 0.92,

              duration: 160,

              easing:
                Easing.out(
                  Easing.ease
                ),

              useNativeDriver:
                true,
            }
          ),

        ]).start(() => {

          setAlert(
            null
          );

        });
      },
      [
        fadeAnim,
        scaleAnim,
      ]
    );


  // ==========================================================
  // OPEN ANIMATION
  // ==========================================================

  useEffect(() => {

    if (!alert) {
      return;
    }


    fadeAnim.setValue(
      0
    );

    scaleAnim.setValue(
      0.92
    );


    Animated.parallel([

      Animated.timing(
        fadeAnim,
        {
          toValue: 1,

          duration: 220,

          easing:
            Easing.out(
              Easing.ease
            ),

          useNativeDriver:
            true,
        }
      ),

      Animated.spring(
        scaleAnim,
        {
          toValue: 1,

          damping: 16,

          stiffness: 180,

          mass: 0.8,

          useNativeDriver:
            true,
        }
      ),

    ]).start();

  }, [
    alert,
    fadeAnim,
    scaleAnim,
  ]);


  // ==========================================================
  // CONFIRM
  // ==========================================================

  const handleConfirm =
    async () => {

      const callback =
        alert?.onConfirm;

      const closeOnConfirm =
        alert?.closeOnConfirm;


      if (
        closeOnConfirm
      ) {

        hideAlert();
      }


      if (
        callback
      ) {

        try {

          await callback();

        } catch (error) {

          console.error(
            'AppAlert confirm error:',
            error
          );
        }
      }
    };


  // ==========================================================
  // CANCEL
  // ==========================================================

  const handleCancel =
    async () => {

      const callback =
        alert?.onCancel;


      hideAlert();


      if (
        callback
      ) {

        try {

          await callback();

        } catch (error) {

          console.error(
            'AppAlert cancel error:',
            error
          );
        }
      }
    };


  // ==========================================================
  // ALERT CONFIG
  // ==========================================================

  const getAlertConfig =
    () => {

      switch (
        alert?.type
      ) {

        case 'success':

          return {
            icon:
              '✓',

            iconBackground:
              '#EAF8D2',

            iconColor:
              '#477A18',

            buttonColor:
              '#147A50',
          };


        case 'error':

          return {
            icon:
              '!',

            iconBackground:
              '#FDE8E7',

            iconColor:
              '#C62828',

            buttonColor:
              '#C62828',
          };


        case 'warning':

          return {
            icon:
              '!',

            iconBackground:
              '#FFF3D6',

            iconColor:
              '#A66A00',

            buttonColor:
              '#A66A00',
          };


        case 'confirm':

          return {
            icon:
              '?',

            iconBackground:
              '#EAF8D2',

            iconColor:
              '#477A18',

            buttonColor:
              '#147A50',
          };


        case 'info':

        default:

          return {
            icon:
              'i',

            iconBackground:
              '#EAF8D2',

            iconColor:
              '#477A18',

            buttonColor:
              '#147A50',
          };
      }
    };


  const config =
    getAlertConfig();


  // ==========================================================
  // PROVIDER
  // ==========================================================

  return (

    <AppAlertContext.Provider
      value={{
        showAlert,
        hideAlert,
      }}
    >

      {children}


      <Modal
        visible={
          !!alert
        }

        transparent

        animationType="none"

        statusBarTranslucent

        onRequestClose={
          hideAlert
        }
      >

        <View
          style={
            styles.overlay
          }
        >

          <Animated.View
            style={[
                styles.card,
                {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
                maxHeight: maxCardHeight,
                width: Math.min(
                    windowWidth - horizontalPadding * 2,
                    420
                ),
                },
            ]}
            >

            {/* ==================================================
                ICON
            ================================================== */}

            <View
              style={[
                styles.iconContainer,

                {
                  backgroundColor:
                    config.iconBackground,
                },
              ]}
            >

              <Text
                style={[
                  styles.icon,

                  {
                    color:
                      config.iconColor,
                  },
                ]}
              >
                {config.icon}
              </Text>

            </View>


            {/* ==================================================
                TITLE
            ================================================== */}

            <Text
              style={
                styles.title
              }
            >
              {alert?.title}
            </Text>


            {/* ==================================================
                MESSAGE
            ================================================== */}

            {!!alert?.message && (
                <View style={styles.messageContainer}>
                    <ScrollView
                    style={styles.messageScroll}
                    contentContainerStyle={styles.messageScrollContent}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    >
                    <Text style={styles.message}>
                        {alert.message}
                    </Text>
                    </ScrollView>
                </View>
                )}


            {/* ==================================================
                BUTTONS
            ================================================== */}

            <View
              style={[
                styles.buttonRow,

                !alert?.showCancel &&
                  styles.singleButtonRow,
              ]}
            >

              {alert?.showCancel && (

                <Pressable
                  onPress={
                    handleCancel
                  }

                  style={({
                    pressed,
                  }) => [
                    styles.cancelButton,

                    pressed &&
                      styles.buttonPressed,
                  ]}
                >

                  <Text
                    style={
                      styles.cancelText
                    }
                  >
                    {alert.cancelText}
                  </Text>

                </Pressable>

              )}


              <Pressable
                onPress={
                  handleConfirm
                }

                style={({
                  pressed,
                }) => [

                  styles.confirmButton,

                  {
                    backgroundColor:
                      config.buttonColor,
                  },

                  pressed &&
                    styles.buttonPressed,
                ]}
              >

                <Text
                  style={
                    styles.confirmText
                  }
                >
                  {alert?.confirmText}
                </Text>

              </Pressable>

            </View>

          </Animated.View>

        </View>

      </Modal>

    </AppAlertContext.Provider>
  );
};


// ============================================================
// HOOK
// ============================================================

export const useAppAlert =
  () => {

    const context =
      useContext(
        AppAlertContext
      );


    if (!context) {

      throw new Error(
        'useAppAlert must be used inside AppAlertProvider'
      );
    }


    return context;
  };


// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({

  /* ==========================================================
     FULL SCREEN OVERLAY
     ========================================================== */

  overlay: {
    flex: 1,

    backgroundColor:
      'rgba(15, 20, 17, 0.58)',

    justifyContent:
      'center',

    alignItems:
      'center',

    paddingHorizontal:
      20,

    paddingVertical:
      20,
  },


  /* ==========================================================
     ALERT CARD
     ========================================================== */

  card: {
    width: '100%',

    backgroundColor:
      '#FFFFFF',

    borderRadius:
      26,

    paddingHorizontal:
      24,

    paddingTop:
      28,

    paddingBottom:
      20,

    alignItems:
      'center',

    /*
     * VERY IMPORTANT:
     *
     * The inline maxHeight calculated from
     * useWindowDimensions() prevents the alert
     * from becoming taller than the phone screen.
     */

    overflow:
      'hidden',

    shadowColor:
      '#000000',

    shadowOffset: {
      width: 0,
      height: 12,
    },

    shadowOpacity:
      0.18,

    shadowRadius:
      24,

    elevation:
      12,
  },


  /* ==========================================================
     ICON
     ========================================================== */

  iconContainer: {
    width:
      58,

    height:
      58,

    borderRadius:
      29,

    alignItems:
      'center',

    justifyContent:
      'center',

    marginBottom:
      16,

    flexShrink:
      0,
  },

  icon: {
    fontSize:
      28,

    fontWeight:
      '800',

    textAlign:
      'center',
  },


  /* ==========================================================
     TITLE
     ========================================================== */

  title: {
    fontSize:
      23,

    lineHeight:
      29,

    fontWeight:
      '800',

    color:
      '#151816',

    textAlign:
      'center',

    letterSpacing:
      -0.4,

    width:
      '100%',

    flexShrink:
      0,

    marginBottom:
      2,
  },


  /* ==========================================================
     MESSAGE CONTAINER
     ========================================================== */

  messageContainer: {
    width:
      '100%',

    maxHeight:
      240,

    marginTop:
      8,

    flexShrink:
      1,

    minHeight:
      0,
  },


  /* ==========================================================
     MESSAGE SCROLL
     ========================================================== */

  messageScroll: {
    width:
      '100%',

    flexGrow:
      0,

    flexShrink:
      1,
  },

  messageScrollContent: {
    paddingHorizontal:
      2,

    paddingVertical:
      2,
  },


  /* ==========================================================
     MESSAGE
     ========================================================== */

  message: {
    fontSize:
      16,

    lineHeight:
      23,

    fontWeight:
      '400',

    color:
      '#606762',

    textAlign:
      'center',

    width:
      '100%',
  },


  /* ==========================================================
     BUTTON ROW
     ========================================================== */

  buttonRow: {
    width:
      '100%',

    flexDirection:
      'row',

    alignItems:
      'stretch',

    justifyContent:
      'center',

    gap:
      10,

    marginTop:
      20,

    flexShrink:
      0,
  },

  singleButtonRow: {
    justifyContent:
      'center',
  },


  /* ==========================================================
     CANCEL BUTTON
     ========================================================== */

  cancelButton: {
    minHeight:
      48,

    minWidth:
      110,

    flex:
      1,

    paddingHorizontal:
      14,

    borderRadius:
      14,

    alignItems:
      'center',

    justifyContent:
      'center',

    backgroundColor:
      '#F3F5F3',

    flexShrink:
      1,
  },


  /* ==========================================================
     CONFIRM BUTTON
     ========================================================== */

  confirmButton: {
    minHeight:
      48,

    minWidth:
      110,

    flex:
      1,

    paddingHorizontal:
      14,

    borderRadius:
      14,

    alignItems:
      'center',

    justifyContent:
      'center',

    flexShrink:
      1,
  },


  /* ==========================================================
     BUTTON TEXT
     ========================================================== */

  cancelText: {
    fontSize:
      15,

    fontWeight:
      '700',

    color:
      '#4F5752',

    textAlign:
      'center',
  },

  confirmText: {
    fontSize:
      15,

    fontWeight:
      '800',

    color:
      '#FFFFFF',

    textAlign:
      'center',
  },


  buttonPressed: {
    opacity:
      0.72,
  },

});


export default AppAlertProvider;