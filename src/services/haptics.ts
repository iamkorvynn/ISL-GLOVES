import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const feedbackOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export const hapticLight = () => {
  try {
    ReactNativeHapticFeedback.trigger('impactLight', feedbackOptions);
  } catch {
    // Graceful fallback
  }
};

export const hapticMedium = () => {
  try {
    ReactNativeHapticFeedback.trigger('impactMedium', feedbackOptions);
  } catch {
    // Graceful fallback
  }
};

export const hapticSelection = () => {
  try {
    ReactNativeHapticFeedback.trigger('selection', feedbackOptions);
  } catch {
    // Graceful fallback
  }
};
