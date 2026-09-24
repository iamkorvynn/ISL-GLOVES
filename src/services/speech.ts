import Tts from 'react-native-tts';

let ttsInitialized = false;

export const initSpeech = async (): Promise<boolean> => {
  if (ttsInitialized) return true;
  try {
    await Tts.getInitStatus();
    Tts.setDefaultRate(0.5, true);
    Tts.setDefaultPitch(1.0);
    ttsInitialized = true;
    return true;
  } catch (err) {
    console.warn('TTS init status:', err);
    return false;
  }
};

export const speakText = async (
  text: string,
  options?: {
    rate?: number;
    onDone?: () => void;
    onError?: () => void;
    onStopped?: () => void;
  },
): Promise<void> => {
  try {
    await initSpeech();
    stopSpeech();

    if (options?.rate !== undefined) {
      // Map normal 0.7 - 1.2 scale to TTS 0.1 - 0.9 scale
      const rate = Math.min(Math.max(options.rate * 0.5, 0.2), 0.9);
      Tts.setDefaultRate(rate, true);
    }

    const onFinish = () => {
      Tts.removeEventListener('tts-finish', onFinish);
      options?.onDone?.();
    };

    const onCancel = () => {
      Tts.removeEventListener('tts-cancel', onCancel);
      options?.onStopped?.();
    };

    const onError = () => {
      Tts.removeEventListener('tts-error', onError);
      options?.onError?.();
    };

    Tts.addEventListener('tts-finish', onFinish);
    Tts.addEventListener('tts-cancel', onCancel);
    Tts.addEventListener('tts-error', onError);

    Tts.speak(text);
  } catch (err) {
    console.warn('TTS speak error:', err);
    options?.onError?.();
  }
};

export const stopSpeech = (): void => {
  try {
    Tts.stop();
  } catch (e) {
    // Ignore error when stopping
  }
};
