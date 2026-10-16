import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from 'react-native-vector-icons/Feather';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../hooks/useColors';
import { speakText, stopSpeech } from '../services/speech';
import { hapticLight, hapticMedium, hapticSelection } from '../services/haptics';
import { useBLE } from '../hooks/useBLE';
import type { GloveGesture } from '../services/ble';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';
type RecentSign = {
  id: string;
  label: string;
  time: string;
  confidence: number;
};

export type AuditEvent = {
  id: string;
  type: 'sign' | 'system' | 'calibration';
  title: string;
  detail: string;
  time: string;
  date: string;
  confidence?: number;
  badge: 'VERIFIED' | 'SYSTEM' | 'INFO';
};

const INITIAL_AUDIT_LOGS: AuditEvent[] = [
  {
    id: 'aud-1',
    type: 'sign',
    title: 'Hello',
    detail: 'Detected via ISL_GLOVE flex sensors • TTS output triggered',
    time: '11:24:18 AM',
    date: 'Today',
    confidence: 0.98,
    badge: 'VERIFIED',
  },
  {
    id: 'aud-2',
    type: 'system',
    title: 'Glove connected',
    detail: 'BLE GATT notifications subscribed for characteristic 12345678-1234-1234-1234-1234567890cd',
    time: '11:22:05 AM',
    date: 'Today',
    badge: 'SYSTEM',
  },
  {
    id: 'aud-3',
    type: 'sign',
    title: 'Thank you',
    detail: 'Detected via IMU orientation & bend resistance',
    time: '11:20:41 AM',
    date: 'Today',
    confidence: 0.95,
    badge: 'VERIFIED',
  },
  {
    id: 'aud-4',
    type: 'calibration',
    title: 'Sensor baseline calibrated',
    detail: '5-finger resting resistance calibrated to neutral 0.0V baseline',
    time: '11:15:30 AM',
    date: 'Today',
    badge: 'INFO',
  },
];

// Demo gestures used as fallback when BLE glove is not connected
const DEMO_GESTURES = [
  { label: 'Hello', confidence: 0.98 },
  { label: 'Thank you', confidence: 0.94 },
  { label: 'I am okay', confidence: 0.89 },
  { label: 'Please', confidence: 0.96 },
];

/**
 * Deduplicates repeated words or phrases within a raw incoming gesture string.
 * E.g.
 *   "Hello Hello Hello Hello" -> "Hello"
 *   "Hello, Hello, Hello, Hello" -> "Hello"
 *   "A A A A" -> "A"
 *   "Thank you Thank you" -> "Thank you"
 */
function sanitizeGestureLabel(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // 1. Check if tokenized by whitespace or comma is repeating the exact same word
  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  if (tokens.length > 1) {
    const firstLower = tokens[0].toLowerCase();
    const allSame = tokens.every((t) => t.toLowerCase() === firstLower);
    if (allSame) {
      return tokens[0];
    }
  }

  // 2. Check for repeated multi-word phrases (e.g. "Thank you Thank you")
  const repeatedPhraseMatch = trimmed.match(/^(.+?)(?:\s*[, ]\s*\1)+$/i);
  if (repeatedPhraseMatch && repeatedPhraseMatch[1]) {
    return repeatedPhraseMatch[1].trim();
  }

  return trimmed;
}

export default function HomeScreen() {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;
  const mascotFloat = useRef(new Animated.Value(0)).current;
  const mascotPulse = useRef(new Animated.Value(1)).current;

  // ── UI state ─────────────────────────────────────────────────────────────
  // Navigation tabs (matching PDF Home Page bottom navigation)
  const [navTab, setNavTab] = useState<'home' | 'audit' | 'insights'>('home');
  const [translateOpen, setTranslateOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>(INITIAL_AUDIT_LOGS);
  const [auditFilter, setAuditFilter] = useState<'all' | 'sign' | 'system'>('all');

  // Only show translation and recent signs when an actual input arrives
  const [currentSign, setCurrentSign] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [recentSigns, setRecentSigns] = useState<RecentSign[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);

  // Keep track of the last processed gesture to prevent repeating identical words in quick succession
  const lastGestureRef = useRef<{ label: string; time: number } | null>(null);

  // ── Process incoming gesture ─────────────────────────────────────────────
  const processGesture = useCallback(
    (rawLabel: string, gestureConfidence: number = 1.0) => {
      const cleanLabel = sanitizeGestureLabel(rawLabel);
      if (!cleanLabel) return;

      const lower = cleanLabel.toLowerCase();
      // If the glove sends an idle/rest/none status, clear the debounce tracker
      if (lower === 'idle' || lower === 'none' || lower === 'rest' || lower === 'neutral') {
        lastGestureRef.current = null;
        return;
      }

      const now = Date.now();
      // Prevent repeating the same word (e.g. ESP32 microcontroller sending 4 duplicate packets in a loop)
      if (
        lastGestureRef.current &&
        lastGestureRef.current.label.toLowerCase() === lower &&
        now - lastGestureRef.current.time < 2500
      ) {
        lastGestureRef.current.time = now;
        return;
      }

      lastGestureRef.current = { label: cleanLabel, time: now };

      hapticLight();
      setIsRecognizing(true);
      setTimeout(() => setIsRecognizing(false), 850);

      setCurrentSign(cleanLabel);
      setConfidence(gestureConfidence);

      const timeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const timeWithSeconds = new Date(now).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      // Update Recent Signs list
      setRecentSigns((items) => {
        // Double-check: do not add consecutive duplicate words to recent signs
        if (items.length > 0 && items[0].label.toLowerCase() === lower) {
          return items;
        }

        return [
          {
            id: `${now}-${items.length}`,
            label: cleanLabel,
            time: 'Now',
            confidence: gestureConfidence,
          },
          ...items
            .map((item, index) =>
              index === 0 && item.time === 'Now' ? { ...item, time: timeStr } : item,
            )
            .slice(0, 5),
        ].slice(0, 6);
      });

      // Automatically append verified event to Audit Log
      const newAuditEntry: AuditEvent = {
        id: `${now}-audit`,
        type: 'sign',
        title: cleanLabel,
        detail: `Gesture recognized with ${(gestureConfidence * 100).toFixed(0)}% confidence • BLE Notification`,
        time: timeWithSeconds,
        date: 'Today',
        confidence: gestureConfidence,
        badge: 'VERIFIED',
      };
      setAuditLogs((prevLogs) => [newAuditEntry, ...prevLogs].slice(0, 100));

      // Auto-speak is announced once per unique gesture
      announceRef.current(cleanLabel);
    },
    [],
  );

  // ── BLE ──────────────────────────────────────────────────────────────────
  /** Called by useBLE each time the ESP32 sends a new gesture notification */
  const handleBleGesture = useCallback(
    (gesture: GloveGesture) => {
      processGesture(gesture.label, 1.0);
    },
    [processGesture],
  );

  const { connectionState, bleError, isConnecting, startConnection, stopConnection } =
    useBLE(handleBleGesture);

  // Map BLE connectionState to the ConnectionState type the UI already uses
  const connection: ConnectionState = (() => {
    if (connectionState === 'connected') return 'connected';
    if (isConnecting) return 'connecting';
    return 'disconnected';
  })();

  // Audit logger for connection state changes
  const prevConnRef = useRef(connectionState);
  useEffect(() => {
    if (prevConnRef.current !== connectionState) {
      prevConnRef.current = connectionState;
      if (connectionState === 'connected' || connectionState === 'disconnected') {
        const timeWithSeconds = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const isConn = connectionState === 'connected';
        const sysEntry: AuditEvent = {
          id: `${Date.now()}-audit-sys`,
          type: 'system',
          title: isConn ? 'Glove connected' : 'Glove disconnected',
          detail: isConn
            ? 'BLE link active: ISL_GLOVE device discovered & notification stream established.'
            : 'BLE link terminated: ISL_GLOVE disconnected from session.',
          time: timeWithSeconds,
          date: 'Today',
          badge: 'SYSTEM',
        };
        setAuditLogs((logs) => [sysEntry, ...logs].slice(0, 100));
      }
    }
  }, [connectionState]);

  const handleClearAuditLogs = useCallback(() => {
    setAuditLogs([]);
  }, []);

  const handleAddSampleLog = useCallback(() => {
    const timeWithSeconds = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const sampleEntry: AuditEvent = {
      id: `${Date.now()}-audit-test`,
      type: 'sign',
      title: 'Thank you',
      detail: 'Sample audit event verified • Gesture recognition match 97%',
      time: timeWithSeconds,
      date: 'Today',
      confidence: 0.97,
      badge: 'VERIFIED',
    };
    setAuditLogs((logs) => [sampleEntry, ...logs]);
  }, []);

  // ── BLE error banner ─────────────────────────────────────────────────────
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissBanner = useCallback(() => {
    Animated.timing(bannerAnim, {
      toValue: 0,
      duration: 280,
      useNativeDriver: true,
    }).start(() => setBannerMessage(null));
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, [bannerAnim]);

  const showBanner = useCallback(
    (msg: string) => {
      setBannerMessage(msg);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      Animated.spring(bannerAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 6,
      }).start();
      bannerTimer.current = setTimeout(dismissBanner, 5000);
    },
    [bannerAnim, dismissBanner],
  );

  // Show banner whenever bleError changes to a non-null value
  useEffect(() => {
    if (bleError) showBanner(bleError);
  }, [bleError, showBanner]);

  const styles = useMemo(() => makeStyles(palette), [palette]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.multiGet(['mitzy-auto-speak', 'mitzy-speech-rate']).then(
      (values) => {
        if (!mounted) return;
        const storedAutoSpeak = values[0][1];
        const storedRate = values[1][1];
        if (storedAutoSpeak !== null) setAutoSpeak(storedAutoSpeak === 'true');
        if (storedRate !== null) setSpeechRate(Number(storedRate));
      },
    );
    return () => {
      mounted = false;
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    if (connection !== 'connected') {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [connection, pulse]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(mascotFloat, {
          toValue: -5,
          duration: 1900,
          useNativeDriver: true,
        }),
        Animated.timing(mascotFloat, {
          toValue: 0,
          duration: 1900,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [mascotFloat]);

  useEffect(() => {
    if (!isSpeaking && !isRecognizing) {
      mascotPulse.stopAnimation();
      Animated.spring(mascotPulse, {
        toValue: 1,
        useNativeDriver: true,
        speed: 14,
        bounciness: 5,
      }).start();
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(mascotPulse, {
          toValue: 1.06,
          duration: 360,
          useNativeDriver: true,
        }),
        Animated.timing(mascotPulse, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [isSpeaking, isRecognizing, mascotPulse]);

  const announce = async (text: string) => {
    if (!autoSpeak) return;
    stopSpeech();
    setIsSpeaking(true);
    await speakText(text, {
      rate: speechRate,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  // Stable ref so the BLE gesture callback can call the latest version of announce
  // without causing re-subscription on every render.
  const announceRef = useRef(announce);
  useEffect(() => {
    announceRef.current = announce;
  });

  const recognizeDemoGesture = async () => {
    const next = DEMO_GESTURES[recentSigns.length % DEMO_GESTURES.length];
    // Reset tracker so simulation always responds when clicked
    lastGestureRef.current = null;
    processGesture(next.label, next.confidence);
  };

  const connectGlove = async () => {
    if (connectionState === 'connected' || isConnecting) {
      hapticSelection();
      stopSpeech();
      setIsSpeaking(false);
      await stopConnection();
      return;
    }
    hapticMedium();
    await startConnection();
  };

  const setStoredAutoSpeak = (value: boolean) => {
    setAutoSpeak(value);
    AsyncStorage.setItem('mitzy-auto-speak', String(value));
    if (!value) stopSpeech();
  };

  const setStoredSpeechRate = (value: number) => {
    setSpeechRate(value);
    AsyncStorage.setItem('mitzy-speech-rate', String(value));
  };

  const statusLabel =
    connection === 'connected'
      ? 'Glove connected'
      : connection === 'connecting'
        ? 'Connecting…'
        : 'Glove disconnected';

  const confidenceLabel =
    confidence === null
      ? 'Waiting for gesture'
      : confidence >= 0.94
        ? 'High confidence'
        : confidence >= 0.86
          ? 'Good confidence'
          : 'Check gesture';

  return (
    <View style={styles.screen}>
      {/* ── BLE Error Banner ── */}
      {bannerMessage && (
        <Animated.View
          style={[
            styles.bleBanner,
            {
              transform: [
                {
                  translateY: bannerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-120, insets.top + 12],
                  }),
                },
              ],
              opacity: bannerAnim,
            },
          ]}
          pointerEvents="box-none"
        >
          <Feather name="bluetooth-off" size={16} color="#fff" style={styles.bleBannerIcon} />
          <Text style={styles.bleBannerText} numberOfLines={2}>
            {bannerMessage}
          </Text>
          <Pressable
            onPress={dismissBanner}
            style={styles.bleBannerClose}
            accessibilityLabel="Dismiss error"
          >
            <Feather name="x" size={15} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => { dismissBanner(); connectGlove(); }}
            style={styles.bleBannerRetry}
            accessibilityLabel="Retry BLE connection"
          >
            <Text style={styles.bleBannerRetryText}>Retry</Text>
          </Pressable>
        </Animated.View>
      )}
      {navTab === 'audit' ? (
        <AuditLogView
          palette={palette}
          styles={styles}
          auditLogs={auditLogs}
          auditFilter={auditFilter}
          setAuditFilter={setAuditFilter}
          onClearLogs={handleClearAuditLogs}
          onAddSample={handleAddSampleLog}
          insets={insets}
          connection={connection}
        />
      ) : navTab === 'insights' ? (
        <InsightsView
          palette={palette}
          styles={styles}
          auditLogs={auditLogs}
          insets={insets}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 16,
              paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 18) + 110,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.header}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}>
              <View style={styles.brandEye} />
              <View style={styles.brandEye} />
              <View style={styles.brandSmile} />
            </View>
            <View>
              <Text style={styles.wordmark}>mitzy</Text>
              <Text style={styles.eyebrow}>ISL companion</Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="Open Mitzy settings"
            testID="settings-button"
            onPress={() => setSettingsOpen(true)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Feather name="sliders" size={19} color={palette.foreground} />
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                connection === 'connected'
                  ? styles.statusConnected
                  : connection === 'connecting'
                    ? styles.statusConnecting
                    : styles.statusDisconnected,
              ]}
            />
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            testID="connection-button"
            onPress={connectGlove}
            style={({ pressed }) => [styles.connectionAction, pressed && styles.pressed]}
          >
            {connection === 'connecting' ? (
              <ActivityIndicator size="small" color={palette.primary} />
            ) : (
              <Feather
                name={connection === 'connected' ? 'wifi' : 'bluetooth'}
                size={14}
                color={palette.primary}
              />
            )}
            <Text style={styles.connectionActionText}>
              {connection === 'connected'
                ? 'Disconnect'
                : connection === 'connecting'
                  ? 'Finding glove'
                  : 'Connect glove'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.intro}>
          <Text style={styles.greeting}>Good morning,</Text>
          <Text style={styles.title}>Let your hands speak.</Text>
          <Text style={styles.subtitle}>
            Your signs appear here as words, in real time.
          </Text>
        </View>

        <View style={styles.mascotStage}>
          <Animated.View
            style={[
              styles.mascotWrap,
              {
                transform: [
                  { translateY: mascotFloat },
                  { scale: mascotPulse },
                ],
              },
            ]}
          >
            <Image
              accessibilityLabel="Mitzy mascot"
              source={require('../assets/images/mitzy-mascot.png')}
              style={styles.mascotImage}
            />
          </Animated.View>
          <View style={styles.mascotStatus}>
            <View
              style={[
                styles.mascotStatusDot,
                (isSpeaking || isRecognizing) && styles.mascotStatusDotActive,
              ]}
            />
            <Text style={styles.mascotStatusText}>
              {isSpeaking
                ? 'Mitzy is speaking'
                : isRecognizing
                  ? 'Recognizing your sign'
                  : currentSign
                    ? 'Mitzy is listening'
                    : 'Ready to listen'}
            </Text>
          </View>
          {isSpeaking && (
            <View style={styles.speechBubble}>
              <Feather name="volume-2" size={14} color={palette.primary} />
              <View style={styles.speechDots}>
                <View style={styles.speechDot} />
                <View style={styles.speechDot} />
                <View style={styles.speechDot} />
              </View>
            </View>
          )}
        </View>

        <View style={styles.liveCard}>
          <View style={styles.liveCardTop}>
            <View style={styles.liveLabelRow}>
              <View style={styles.livePulse}>
                <Animated.View
                  style={[styles.livePulseInner, { transform: [{ scale: pulse }] }]}
                />
              </View>
              <Text style={styles.liveLabel}>LIVE TRANSLATION</Text>
            </View>
            <View style={styles.sessionTag}>
              <Feather name="radio" size={12} color={palette.accentForeground} />
              <Text style={styles.sessionTagText}>Session 01</Text>
            </View>
          </View>

          <View style={styles.translationBody}>
            <Text style={styles.translationCaption}>
              {currentSign ? 'I SEE' : 'TRANSLATE'}
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.translationText,
                !currentSign && styles.translationPlaceholder,
              ]}
              numberOfLines={2}
              adjustsFontSizeToFit
            >
              {currentSign ?? 'Waiting for sign…'}
            </Text>
            {confidence !== null ? (
              <View style={styles.confidenceRow}>
                <View style={styles.confidenceTrack}>
                  <View
                    style={[
                      styles.confidenceFill,
                      { width: `${Math.round(confidence * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.confidenceText}>{confidenceLabel}</Text>
              </View>
            ) : (
              <View style={styles.confidenceRow}>
                <Feather name="activity" size={13} color="rgba(255,255,255,0.65)" />
                <Text style={styles.confidenceText}>
                  {connection === 'connected' ? 'Ready for sign input' : 'Connect glove to start'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.waveform} accessibilityLabel="Live listening waveform">
            {[18, 31, 24, 42, 30, 56, 36, 48, 22, 34, 19, 28, 16, 25, 17].map(
              (height, index) => (
                <View
                  key={`${height}-${index}`}
                  style={[
                    styles.waveBar,
                    {
                      height,
                      opacity: index > 10 ? 0.5 : 0.88,
                    },
                  ]}
                />
              ),
            )}
          </View>

          <View style={styles.liveCardFooter}>
            <View style={styles.speakingState}>
              <Feather
                name={isSpeaking ? 'volume-2' : 'volume-1'}
                size={16}
                color={palette.primary}
              />
              <Text style={styles.speakingText}>
                {isSpeaking
                  ? 'Speaking now'
                  : autoSpeak
                    ? 'Auto-speak on'
                    : 'Text only'}
              </Text>
            </View>
            {/* Show demo button only when BLE is not connected (fallback / demo mode) */}
            {connectionState !== 'connected' && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Simulate a glove gesture"
                testID="simulate-gesture-button"
                onPress={recognizeDemoGesture}
                disabled={isConnecting}
                style={({ pressed }) => [
                  styles.gestureButton,
                  isConnecting && styles.disabledButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.gestureButtonText}>Try a gesture</Text>
                <Feather name="arrow-up-right" size={15} color={palette.primaryForeground} />
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent signs</Text>
            <Text style={styles.sectionCaption}>
              {recentSigns.length > 0 ? 'From this conversation' : 'No signs recorded yet'}
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{recentSigns.length}</Text>
          </View>
        </View>

        {recentSigns.length === 0 ? (
          <View style={styles.emptySignsContainer}>
            <View style={styles.emptySignsIconWrap}>
              <Feather name="inbox" size={22} color={palette.primary} />
            </View>
            <Text style={styles.emptySignsTitle}>No signs yet</Text>
            <Text style={styles.emptySignsSubtitle}>
              When you perform a gesture with the glove, it will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={recentSigns}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.signList}
            renderItem={({ item, index }) => (
              <View style={[styles.signRow, index === 0 && styles.signRowActive]}>
                <View style={[styles.signIcon, index === 0 && styles.signIconActive]}>
                  <Feather
                    name={index === 0 ? 'radio' : index === 1 ? 'heart' : 'message-circle'}
                    size={17}
                    color={index === 0 ? palette.primary : palette.mutedForeground}
                  />
                </View>
                <View style={styles.signCopy}>
                  <Text style={styles.signLabel}>{item.label}</Text>
                  <Text style={styles.signTime}>
                    {item.time} · {Math.round(item.confidence * 100)}% match
                  </Text>
                </View>
                {index === 0 ? (
                  <View style={styles.nowBadge}>
                    <Text style={styles.nowBadgeText}>NOW</Text>
                  </View>
                ) : (
                  <Feather name="chevron-right" size={16} color={palette.mutedForeground} />
                )}
              </View>
            )}
          />
        )}

        <Pressable
          accessibilityRole="button"
          testID="calibration-button"
          onPress={() => {
            setCalibrationStep(0);
            setCalibrationOpen(true);
          }}
          style={({ pressed }) => [styles.calibrationCard, pressed && styles.pressed]}
        >
          <View style={styles.calibrationIcon}>
            <Feather name="sliders" size={18} color={palette.primary} />
          </View>
          <View style={styles.calibrationCopy}>
            <Text style={styles.calibrationTitle}>Make recognition yours</Text>
            <Text style={styles.calibrationText}>Calibrate your glove in under a minute.</Text>
          </View>
          <Feather name="arrow-up-right" size={18} color={palette.primary} />
        </Pressable>
      </ScrollView>
      )}

      {/* ── Bottom Navigation Bar (matches Mitzy PDF Home Page) ── */}
      <View style={[styles.bottomNavContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.bottomNavBar}>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Home tab"
            onPress={() => setNavTab('home')}
            style={styles.bottomNavItem}
          >
            <View style={[styles.bottomNavIconWrap, navTab === 'home' && styles.bottomNavIconActive]}>
              <Feather
                name="home"
                size={18}
                color={navTab === 'home' ? palette.primary : palette.mutedForeground}
              />
            </View>
            <Text style={[styles.bottomNavText, navTab === 'home' && styles.bottomNavTextActive]}>
              Home
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open translate view"
            onPress={() => setTranslateOpen(true)}
            style={styles.bottomNavItem}
          >
            <View style={styles.bottomNavIconWrap}>
              <Feather name="message-circle" size={18} color={palette.mutedForeground} />
            </View>
            <Text style={styles.bottomNavText}>Translate</Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Audit Log tab"
            onPress={() => setNavTab('audit')}
            style={styles.bottomNavItem}
          >
            <View style={[styles.bottomNavIconWrap, navTab === 'audit' && styles.bottomNavIconActive]}>
              <Feather
                name="file-text"
                size={18}
                color={navTab === 'audit' ? palette.primary : palette.mutedForeground}
              />
            </View>
            <Text style={[styles.bottomNavText, navTab === 'audit' && styles.bottomNavTextActive]}>
              Audit Log
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Insights tab"
            onPress={() => setNavTab('insights')}
            style={styles.bottomNavItem}
          >
            <View style={[styles.bottomNavIconWrap, navTab === 'insights' && styles.bottomNavIconActive]}>
              <Feather
                name="bar-chart-2"
                size={18}
                color={navTab === 'insights' ? palette.primary : palette.mutedForeground}
              />
            </View>
            <Text style={[styles.bottomNavText, navTab === 'insights' && styles.bottomNavTextActive]}>
              Insights
            </Text>
          </Pressable>
        </View>
      </View>

      <TranslateModal
        visible={translateOpen}
        onClose={() => setTranslateOpen(false)}
        currentSign={currentSign}
        palette={palette}
        styles={styles}
        mascotFloat={mascotFloat}
      />

      <SettingsModal
        visible={settingsOpen}
        palette={palette}
        styles={styles}
        autoSpeak={autoSpeak}
        speechRate={speechRate}
        connectionState={connectionState}
        isConnecting={isConnecting}
        bleError={bleError}
        onClose={() => setSettingsOpen(false)}
        onAutoSpeakChange={setStoredAutoSpeak}
        onSpeechRateChange={setStoredSpeechRate}
        onCalibrate={() => {
          setSettingsOpen(false);
          setCalibrationStep(0);
          setCalibrationOpen(true);
        }}
      />

      <CalibrationModal
        visible={calibrationOpen}
        step={calibrationStep}
        palette={palette}
        styles={styles}
        onClose={() => setCalibrationOpen(false)}
        onNext={() => {
          if (calibrationStep >= 2) {
            setCalibrationOpen(false);
            setCalibrationStep(0);
          } else {
            setCalibrationStep((value) => value + 1);
          }
        }}
      />
    </View>
  );
}

function SettingsModal({
  visible,
  palette,
  styles,
  autoSpeak,
  speechRate,
  connectionState,
  isConnecting,
  bleError,
  onClose,
  onAutoSpeakChange,
  onSpeechRateChange,
  onCalibrate,
}: {
  visible: boolean;
  palette: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
  autoSpeak: boolean;
  speechRate: number;
  connectionState: import('../services/ble').BleConnectionState;
  isConnecting: boolean;
  bleError: string | null;
  onClose: () => void;
  onAutoSpeakChange: (value: boolean) => void;
  onSpeechRateChange: (value: number) => void;
  onCalibrate: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalDismissArea} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Settings</Text>
              <Text style={styles.sheetSubtitle}>Tune Mitzy to your conversation.</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Close settings"
            >
              <Feather name="x" size={20} color={palette.foreground} />
            </Pressable>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Feather name="volume-2" size={18} color={palette.primary} />
            </View>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Speak each sign</Text>
              <Text style={styles.settingText}>Read recognized words out loud.</Text>
            </View>
            <Switch
              testID="auto-speak-switch"
              value={autoSpeak}
              onValueChange={onAutoSpeakChange}
              trackColor={{ false: palette.border, true: palette.primary }}
              thumbColor={palette.card}
            />
          </View>

          <Text style={styles.settingLabel}>Speech speed</Text>
          <View style={styles.rateRow}>
            {[0.72, 0.9, 1.08].map((rate) => (
              <Pressable
                key={rate}
                onPress={() => onSpeechRateChange(rate)}
                style={[
                  styles.rateOption,
                  speechRate === rate && styles.rateOptionSelected,
                ]}
              >
                <Text
                  style={[
                    styles.rateText,
                    speechRate === rate && styles.rateTextSelected,
                  ]}
                >
                  {rate === 0.72 ? 'Gentle' : rate === 0.9 ? 'Natural' : 'Quick'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onCalibrate}
            style={({ pressed }) => [styles.settingLink, pressed && styles.pressed]}
          >
            <View style={styles.settingIcon}>
              <Feather name="sliders" size={18} color={palette.primary} />
            </View>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Calibrate glove</Text>
              <Text style={styles.settingText}>Improve accuracy for your hand.</Text>
            </View>
            <Feather name="chevron-right" size={18} color={palette.mutedForeground} />
          </Pressable>

          <View style={styles.deviceInfo}>
            <Feather name="bluetooth" size={16} color={palette.mutedForeground} />
            <Text style={styles.deviceText}>
              ISL_GLOVE ·{' '}
              {connectionState === 'connected'
                ? 'Connected'
                : isConnecting
                  ? 'Connecting…'
                  : bleError
                    ? 'Error'
                    : 'Not connected'}
            </Text>
            <View
              style={[
                styles.deviceDot,
                connectionState === 'connected' && { backgroundColor: palette.success },
                isConnecting && { backgroundColor: palette.warning },
                connectionState === 'disconnected' &&
                  !isConnecting && { backgroundColor: palette.destructive },
              ]}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CalibrationModal({
  visible,
  step,
  palette,
  styles,
  onClose,
  onNext,
}: {
  visible: boolean;
  step: number;
  palette: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
  onClose: () => void;
  onNext: () => void;
}) {
  const steps = [
    {
      title: 'Let’s get to know your glove.',
      detail:
        'We’ll take three quick readings so Mitzy can recognize your natural hand position.',
      icon: 'sun',
    },
    {
      title: 'Rest your hand.',
      detail:
        'Keep your hand relaxed and still while we capture your neutral position.',
      icon: 'pause-circle',
    },
    {
      title: 'Make a gentle fist.',
      detail: 'Close your hand comfortably, then hold it for two seconds.',
      icon: 'circle',
    },
  ];
  const active = steps[step];
  const isLast = step === steps.length - 1;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.calibrationBackdrop}>
        <View style={styles.calibrationSheet}>
          <View style={styles.calibrationTop}>
            <Text style={styles.eyebrow}>CALIBRATION · {step + 1} OF 3</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close calibration">
              <Feather name="x" size={20} color={palette.foreground} />
            </Pressable>
          </View>
          <View style={styles.calibrationProgress}>
            {steps.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressSegment,
                  index <= step && styles.progressSegmentActive,
                ]}
              />
            ))}
          </View>
          <View style={styles.calibrationVisual}>
            <View style={styles.calibrationGlow} />
            <Feather name={active.icon} size={42} color={palette.primary} />
          </View>
          <Text style={styles.calibrationTitleLarge}>{active.title}</Text>
          <Text style={styles.calibrationDetail}>{active.detail}</Text>
          <Pressable
            onPress={onNext}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>
              {isLast ? 'Finish calibration' : step === 0 ? 'Begin' : 'I’m ready'}
            </Text>
            <Feather
              name={isLast ? 'check' : 'arrow-right'}
              size={17}
              color={palette.primaryForeground}
            />
          </Pressable>
          <Pressable onPress={onClose} style={styles.skipButton}>
            <Text style={styles.skipButtonText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function AuditLogView({
  palette,
  styles,
  auditLogs,
  auditFilter,
  setAuditFilter,
  onClearLogs,
  onAddSample,
  insets,
  connection,
}: {
  palette: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
  auditLogs: AuditEvent[];
  auditFilter: 'all' | 'sign' | 'system';
  setAuditFilter: (f: 'all' | 'sign' | 'system') => void;
  onClearLogs: () => void;
  onAddSample: () => void;
  insets: any;
  connection: ConnectionState;
}) {
  const filtered = useMemo(() => {
    if (auditFilter === 'sign') return auditLogs.filter((l) => l.type === 'sign');
    if (auditFilter === 'system') return auditLogs.filter((l) => l.type !== 'sign');
    return auditLogs;
  }, [auditLogs, auditFilter]);

  const signCount = auditLogs.filter((l) => l.type === 'sign').length;
  const sysCount = auditLogs.filter((l) => l.type !== 'sign').length;
  const avgConf = useMemo(() => {
    const signs = auditLogs.filter((l) => l.confidence !== undefined);
    if (!signs.length) return '—';
    const total = signs.reduce((acc, s) => acc + (s.confidence ?? 0), 0);
    return `${Math.round((total / signs.length) * 100)}%`;
  }, [auditLogs]);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: insets.top + 16,
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 18) + 110,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.auditTitle}>Audit Log</Text>
          <Text style={styles.auditSubtitle}>Verifiable gesture & system activity records</Text>
        </View>
        <View style={styles.auditHeaderActions}>
          <Pressable
            accessibilityLabel="Add sample log"
            onPress={onAddSample}
            style={({ pressed }) => [styles.auditHeaderBtn, pressed && styles.pressed]}
          >
            <Feather name="plus" size={16} color={palette.primary} />
          </Pressable>
          <Pressable
            accessibilityLabel="Clear audit log"
            onPress={onClearLogs}
            style={({ pressed }) => [styles.auditHeaderBtn, pressed && styles.pressed]}
          >
            <Feather name="trash-2" size={16} color={palette.destructive} />
          </Pressable>
        </View>
      </View>

      {/* Metrics Row */}
      <View style={styles.auditMetricsRow}>
        <View style={styles.auditMetricCard}>
          <Text style={styles.auditMetricValue}>{signCount}</Text>
          <Text style={styles.auditMetricLabel}>Signs Verified</Text>
        </View>
        <View style={styles.auditMetricCard}>
          <Text style={styles.auditMetricValue}>{avgConf}</Text>
          <Text style={styles.auditMetricLabel}>Avg Accuracy</Text>
        </View>
        <View style={styles.auditMetricCard}>
          <Text style={styles.auditMetricValue}>{sysCount}</Text>
          <Text style={styles.auditMetricLabel}>System Logs</Text>
        </View>
        <View style={styles.auditMetricCard}>
          <View
            style={[
              styles.auditStatusDot,
              connection === 'connected' ? styles.statusConnected : styles.statusDisconnected,
            ]}
          />
          <Text style={styles.auditMetricLabel}>
            {connection === 'connected' ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.auditFilterRow}>
        <Pressable
          onPress={() => setAuditFilter('all')}
          style={[styles.auditFilterChip, auditFilter === 'all' && styles.auditFilterChipActive]}
        >
          <Text style={[styles.auditFilterText, auditFilter === 'all' && styles.auditFilterTextActive]}>
            All ({auditLogs.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setAuditFilter('sign')}
          style={[styles.auditFilterChip, auditFilter === 'sign' && styles.auditFilterChipActive]}
        >
          <Text style={[styles.auditFilterText, auditFilter === 'sign' && styles.auditFilterTextActive]}>
            Signs ({signCount})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setAuditFilter('system')}
          style={[styles.auditFilterChip, auditFilter === 'system' && styles.auditFilterChipActive]}
        >
          <Text style={[styles.auditFilterText, auditFilter === 'system' && styles.auditFilterTextActive]}>
            System ({sysCount})
          </Text>
        </Pressable>
      </View>

      {/* Log Entries */}
      {filtered.length === 0 ? (
        <View style={styles.emptySignsContainer}>
          <View style={styles.emptySignsIconWrap}>
            <Feather name="file-text" size={22} color={palette.primary} />
          </View>
          <Text style={styles.emptySignsTitle}>No audit records</Text>
          <Text style={styles.emptySignsSubtitle}>
            When gestures are performed or hardware connects, verified logs will appear here.
          </Text>
          <Pressable
            onPress={onAddSample}
            style={[styles.gestureButton, { marginTop: 14 }]}
          >
            <Text style={styles.gestureButtonText}>Add test event</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.auditList}>
          {filtered.map((item) => (
            <View key={item.id} style={styles.auditCard}>
              <View style={styles.auditCardHeader}>
                <View style={styles.auditCardTitleRow}>
                  <View
                    style={[
                      styles.auditTypeIcon,
                      item.type === 'sign' ? styles.auditTypeSign : styles.auditTypeSystem,
                    ]}
                  >
                    <Feather
                      name={item.type === 'sign' ? 'check-circle' : item.type === 'calibration' ? 'sliders' : 'radio'}
                      size={14}
                      color={item.type === 'sign' ? palette.primary : palette.accentForeground}
                    />
                  </View>
                  <Text style={styles.auditItemTitle}>{item.title}</Text>
                </View>
                <View style={styles.auditBadge}>
                  <Text style={styles.auditBadgeText}>{item.badge}</Text>
                </View>
              </View>
              <Text style={styles.auditItemDetail}>{item.detail}</Text>
              <View style={styles.auditCardFooter}>
                <View style={styles.auditTimeRow}>
                  <Feather name="clock" size={11} color={palette.mutedForeground} />
                  <Text style={styles.auditItemTime}>{item.date} · {item.time}</Text>
                </View>
                {item.confidence !== undefined && (
                  <Text style={styles.auditItemConf}>
                    {Math.round(item.confidence * 100)}% match
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function InsightsView({
  palette,
  styles,
  auditLogs,
  insets,
}: {
  palette: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
  auditLogs: AuditEvent[];
  insets: any;
}) {
  const signs = auditLogs.filter((l) => l.type === 'sign');
  return (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: insets.top + 16,
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 18) + 110,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.auditTitle}>Insights</Text>
          <Text style={styles.auditSubtitle}>Usage analytics and gesture accuracy</Text>
        </View>
      </View>

      <View style={styles.insightsCard}>
        <Text style={styles.insightsCardTitle}>Today's Activity</Text>
        <View style={styles.insightsStatsRow}>
          <View style={styles.insightsStatCol}>
            <Text style={styles.insightsStatNum}>{signs.length}</Text>
            <Text style={styles.insightsStatLabel}>Signs Translated</Text>
          </View>
          <View style={styles.insightsStatDivider} />
          <View style={styles.insightsStatCol}>
            <Text style={styles.insightsStatNum}>96%</Text>
            <Text style={styles.insightsStatLabel}>Accuracy Rate</Text>
          </View>
          <View style={styles.insightsStatDivider} />
          <View style={styles.insightsStatCol}>
            <Text style={styles.insightsStatNum}>15m</Text>
            <Text style={styles.insightsStatLabel}>Session Time</Text>
          </View>
        </View>
      </View>

      <View style={styles.insightsSection}>
        <Text style={styles.insightsSectionTitle}>Top Signs</Text>
        {signs.length === 0 ? (
          <Text style={styles.insightsEmptyText}>No sign frequency data recorded yet.</Text>
        ) : (
          signs.slice(0, 5).map((s, idx) => (
            <View key={s.id} style={styles.frequencyRow}>
              <Text style={styles.frequencyName}>{s.title}</Text>
              <View style={styles.frequencyBarTrack}>
                <View style={[styles.frequencyBarFill, { width: `${Math.max(25, 100 - idx * 15)}%` }]} />
              </View>
              <Text style={styles.frequencyCount}>{Math.max(1, 5 - idx)}x</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function TranslateModal({
  visible,
  onClose,
  currentSign,
  palette,
  styles,
  mascotFloat,
}: {
  visible: boolean;
  onClose: () => void;
  currentSign: string | null;
  palette: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
  mascotFloat: Animated.Value;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.translateScreen}>
        <Pressable onPress={onClose} style={styles.translateCloseBtn} accessibilityLabel="Close Translate">
          <Feather name="x" size={20} color="#fff" />
        </Pressable>

        <View style={styles.translateBody}>
          <Text style={styles.translateSubtitle}>LIVE TRANSLATE</Text>
          <Text style={styles.translateSignText} numberOfLines={3} adjustsFontSizeToFit>
            {currentSign ?? 'Make a sign…'}
          </Text>
          <Text style={styles.translateHint}>
            {currentSign ? 'Translated from ISL glove in real time' : 'Waiting for glove input'}
          </Text>
        </View>

        <Animated.View
          style={[
            styles.translateMascotWrap,
            { transform: [{ translateY: mascotFloat }] },
          ]}
        >
          <Image
            source={require('../assets/images/mitzy-mascot.png')}
            style={styles.translateMascotImage}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (palette: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    scrollContent: { paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandMark: {
      width: 32,
      height: 32,
      borderRadius: 12,
      backgroundColor: palette.primary,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 5,
    },
    brandEye: { width: 4, height: 6, borderRadius: 4, backgroundColor: palette.primaryForeground },
    brandSmile: {
      width: 9,
      height: 4,
      borderBottomWidth: 1.5,
      borderBottomColor: palette.primaryForeground,
      borderRadius: 8,
      position: 'absolute',
      bottom: 7,
    },
    wordmark: {
      color: palette.foreground,
      fontWeight: '700',
      fontSize: 19,
      letterSpacing: -0.5,
    },
    eyebrow: {
      color: palette.mutedForeground,
      fontWeight: '600',
      fontSize: 9,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25 },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusDot: { width: 8, height: 8, borderRadius: 8 },
    statusConnected: { backgroundColor: palette.success },
    statusConnecting: { backgroundColor: palette.warning },
    statusDisconnected: { backgroundColor: palette.destructive },
    statusText: { color: palette.foreground, fontWeight: '600', fontSize: 12 },
    connectionAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: palette.secondary,
    },
    connectionActionText: { color: palette.primary, fontWeight: '600', fontSize: 11 },
    intro: { marginTop: 27, marginBottom: 20 },
    greeting: { color: palette.mutedForeground, fontWeight: '500', fontSize: 15, marginBottom: 3 },
    title: { color: palette.foreground, fontWeight: '700', fontSize: 29, letterSpacing: -1.1 },
    subtitle: { color: palette.mutedForeground, fontWeight: '400', fontSize: 13, lineHeight: 19, marginTop: 7 },
    mascotStage: {
      height: 160,
      borderRadius: 25,
      backgroundColor: palette.card,
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginBottom: 18,
      overflow: 'hidden',
      position: 'relative',
    },
    mascotWrap: { width: 210, height: 210, alignItems: 'center', justifyContent: 'center', marginBottom: -48 },
    mascotImage: { width: 210, height: 210 },
    mascotStatus: {
      position: 'absolute',
      bottom: 11,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    mascotStatusDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: palette.primary, opacity: 0.45 },
    mascotStatusDotActive: { backgroundColor: palette.success, opacity: 1 },
    mascotStatusText: { color: palette.accentForeground, fontWeight: '600', fontSize: 10 },
    speechBubble: {
      position: 'absolute',
      top: 22,
      right: 22,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: palette.card,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      shadowColor: palette.primary,
      shadowOpacity: 0.14,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    speechDots: { flexDirection: 'row', gap: 3, alignItems: 'center' },
    speechDot: { width: 3, height: 3, borderRadius: 3, backgroundColor: palette.primary },
    liveCard: {
      backgroundColor: palette.primary,
      borderRadius: 28,
      overflow: 'hidden',
      shadowColor: palette.primary,
      shadowOpacity: 0.22,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 5,
    },
    liveCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 19,
      paddingBottom: 0,
    },
    liveLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    livePulse: {
      width: 16,
      height: 16,
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    livePulseInner: { width: 7, height: 7, borderRadius: 5, backgroundColor: palette.primaryForeground },
    liveLabel: { color: 'rgba(255,255,255,0.78)', fontWeight: '700', fontSize: 9, letterSpacing: 1.2 },
    sessionTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.13)',
    },
    sessionTagText: { color: 'rgba(255,255,255,0.78)', fontWeight: '500', fontSize: 10 },
    translationBody: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 22 },
    translationCaption: { color: 'rgba(255,255,255,0.63)', fontWeight: '700', fontSize: 10, letterSpacing: 1.3 },
    translationText: {
      color: palette.primaryForeground,
      fontWeight: '700',
      fontSize: 44,
      letterSpacing: -1.7,
      marginTop: 3,
    },
    translationPlaceholder: {
      fontSize: 25,
      letterSpacing: -0.5,
      color: 'rgba(255,255,255,0.68)',
      fontWeight: '500',
      marginTop: 6,
    },
    confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16 },
    confidenceTrack: {
      width: 63,
      height: 4,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.23)',
      overflow: 'hidden',
    },
    confidenceFill: { height: '100%', backgroundColor: palette.mint, borderRadius: 3 },
    confidenceText: { color: 'rgba(255,255,255,0.78)', fontWeight: '500', fontSize: 11 },
    waveform: {
      height: 64,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 22,
      backgroundColor: 'rgba(29,34,119,0.14)',
    },
    waveBar: { width: 3, borderRadius: 3, backgroundColor: palette.mint },
    liveCardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
      paddingHorizontal: 17,
      backgroundColor: palette.card,
    },
    speakingState: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    speakingText: { color: palette.foreground, fontWeight: '500', fontSize: 11 },
    gestureButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: palette.foreground,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 11,
    },
    gestureButtonText: { color: palette.primaryForeground, fontWeight: '600', fontSize: 11 },
    disabledButton: { opacity: 0.42 },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 28,
      marginBottom: 12,
    },
    sectionTitle: { color: palette.foreground, fontWeight: '700', fontSize: 18, letterSpacing: -0.4 },
    sectionCaption: { color: palette.mutedForeground, fontWeight: '400', fontSize: 12, marginTop: 2 },
    countBadge: {
      width: 28,
      height: 28,
      borderRadius: 10,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countBadgeText: { color: palette.accentForeground, fontWeight: '700', fontSize: 12 },
    signList: { gap: 9 },
    emptySignsContainer: {
      backgroundColor: palette.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.border,
      borderStyle: 'dashed',
      paddingVertical: 28,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptySignsIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: palette.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    emptySignsTitle: {
      color: palette.foreground,
      fontWeight: '600',
      fontSize: 14,
      marginBottom: 4,
    },
    emptySignsSubtitle: {
      color: palette.mutedForeground,
      fontWeight: '400',
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 240,
    },
    signRow: {
      minHeight: 65,
      borderRadius: 17,
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.border,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 13,
      gap: 11,
    },
    signRowActive: { borderColor: palette.accent, backgroundColor: '#fbfbff' },
    signIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: palette.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signIconActive: { backgroundColor: palette.accent },
    signCopy: { flex: 1 },
    signLabel: { color: palette.foreground, fontWeight: '600', fontSize: 13 },
    signTime: { color: palette.mutedForeground, fontWeight: '400', fontSize: 11, marginTop: 4 },
    nowBadge: {
      paddingVertical: 5,
      paddingHorizontal: 7,
      borderRadius: 7,
      backgroundColor: palette.mint,
    },
    nowBadgeText: { color: '#23665d', fontWeight: '700', fontSize: 9, letterSpacing: 0.5 },
    calibrationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      backgroundColor: palette.secondary,
      borderRadius: 18,
      padding: 14,
      marginTop: 23,
    },
    calibrationIcon: {
      width: 37,
      height: 37,
      borderRadius: 13,
      backgroundColor: palette.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calibrationCopy: { flex: 1 },
    calibrationTitle: { color: palette.accentForeground, fontWeight: '600', fontSize: 12 },
    calibrationText: { color: palette.mutedForeground, fontWeight: '400', fontSize: 11, marginTop: 3 },
    pressed: { opacity: 0.76 },
    // ── BLE error banner
    bleBanner: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 999,
      backgroundColor: palette.destructive,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 8,
      shadowColor: '#000',
      shadowOpacity: 0.22,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    bleBannerIcon: { flexShrink: 0 },
    bleBannerText: {
      flex: 1,
      color: '#fff',
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 17,
    },
    bleBannerClose: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    bleBannerRetry: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.22)',
      flexShrink: 0,
    },
    bleBannerRetryText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
    },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(17,18,39,0.34)', justifyContent: 'flex-end' },
    modalDismissArea: { flex: 1 },
    sheet: {
      backgroundColor: palette.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 21,
      paddingBottom: 31,
    },
    sheetHandle: {
      width: 38,
      height: 4,
      borderRadius: 3,
      backgroundColor: palette.border,
      alignSelf: 'center',
      marginBottom: 20,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 24,
    },
    sheetTitle: { color: palette.foreground, fontWeight: '700', fontSize: 24, letterSpacing: -0.6 },
    sheetSubtitle: { color: palette.mutedForeground, fontWeight: '400', fontSize: 12, marginTop: 4 },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: palette.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.border,
    },
    settingRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
    settingLink: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 16 },
    settingIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingCopy: { flex: 1 },
    settingTitle: { color: palette.foreground, fontWeight: '600', fontSize: 13 },
    settingText: { color: palette.mutedForeground, fontWeight: '400', fontSize: 11, marginTop: 3 },
    settingLabel: {
      color: palette.mutedForeground,
      fontWeight: '600',
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginTop: 21,
      marginBottom: 9,
    },
    rateRow: { flexDirection: 'row', gap: 8 },
    rateOption: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
    },
    rateOptionSelected: { backgroundColor: palette.accent, borderColor: palette.primary },
    rateText: { color: palette.mutedForeground, fontWeight: '600', fontSize: 11 },
    rateTextSelected: { color: palette.accentForeground },
    deviceInfo: {
      borderTopWidth: 1,
      borderTopColor: palette.border,
      paddingTop: 17,
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    deviceText: { color: palette.mutedForeground, fontWeight: '400', fontSize: 11, flex: 1 },
    deviceDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: palette.success },
    calibrationBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(17,18,39,0.55)',
      justifyContent: 'center',
      padding: 20,
    },
    calibrationSheet: {
      backgroundColor: palette.background,
      borderRadius: 28,
      padding: 22,
      alignItems: 'center',
    },
    calibrationTop: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    calibrationProgress: { width: '100%', flexDirection: 'row', gap: 5, marginTop: 17 },
    progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: palette.border },
    progressSegmentActive: { backgroundColor: palette.primary },
    calibrationVisual: {
      width: 110,
      height: 110,
      borderRadius: 40,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 34,
      marginBottom: 24,
      overflow: 'hidden',
    },
    calibrationGlow: {
      position: 'absolute',
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: palette.mint,
      opacity: 0.55,
    },
    calibrationTitleLarge: {
      color: palette.foreground,
      fontWeight: '700',
      fontSize: 21,
      letterSpacing: -0.6,
      textAlign: 'center',
    },
    calibrationDetail: {
      color: palette.mutedForeground,
      fontWeight: '400',
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 9,
      maxWidth: 280,
    },
    primaryButton: {
      width: '100%',
      backgroundColor: palette.primary,
      borderRadius: 14,
      paddingVertical: 14,
      marginTop: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    primaryButtonText: { color: palette.primaryForeground, fontWeight: '700', fontSize: 13 },
    skipButton: { padding: 13, marginTop: 2 },
    skipButtonText: { color: palette.mutedForeground, fontWeight: '600', fontSize: 12 },

    // ── Bottom Navigation Bar ──
    bottomNavContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: 16,
      pointerEvents: 'box-none',
    },
    bottomNavBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: palette.card,
      borderRadius: 28,
      paddingVertical: 9,
      paddingHorizontal: 8,
      width: '100%',
      maxWidth: 420,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 6 },
      elevation: 7,
      borderWidth: 1,
      borderColor: palette.border,
    },
    bottomNavItem: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 2,
    },
    bottomNavIconWrap: {
      width: 36,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bottomNavIconActive: {
      backgroundColor: palette.secondary,
    },
    bottomNavText: {
      color: palette.mutedForeground,
      fontWeight: '500',
      fontSize: 10,
      marginTop: 2,
    },
    bottomNavTextActive: {
      color: palette.primary,
      fontWeight: '700',
    },

    // ── Audit Log View ──
    auditTitle: {
      color: palette.foreground,
      fontWeight: '800',
      fontSize: 26,
      letterSpacing: -0.8,
    },
    auditSubtitle: {
      color: palette.mutedForeground,
      fontWeight: '400',
      fontSize: 12,
      marginTop: 2,
    },
    auditHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    auditHeaderBtn: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    auditMetricsRow: {
      flexDirection: 'row',
      gap: 9,
      marginTop: 20,
      marginBottom: 16,
    },
    auditMetricCard: {
      flex: 1,
      backgroundColor: palette.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    auditMetricValue: {
      color: palette.foreground,
      fontWeight: '700',
      fontSize: 18,
    },
    auditMetricLabel: {
      color: palette.mutedForeground,
      fontWeight: '500',
      fontSize: 10,
      marginTop: 3,
      textAlign: 'center',
    },
    auditStatusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginBottom: 3,
    },
    auditFilterRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    auditFilterChip: {
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.border,
    },
    auditFilterChipActive: {
      backgroundColor: palette.primary,
      borderColor: palette.primary,
    },
    auditFilterText: {
      color: palette.mutedForeground,
      fontWeight: '600',
      fontSize: 11,
    },
    auditFilterTextActive: {
      color: palette.primaryForeground,
    },
    auditList: {
      gap: 10,
    },
    auditCard: {
      backgroundColor: palette.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 15,
    },
    auditCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    auditCardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    auditTypeIcon: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    auditTypeSign: {
      backgroundColor: palette.secondary,
    },
    auditTypeSystem: {
      backgroundColor: palette.accent,
    },
    auditItemTitle: {
      color: palette.foreground,
      fontWeight: '700',
      fontSize: 15,
    },
    auditBadge: {
      paddingVertical: 3,
      paddingHorizontal: 7,
      borderRadius: 6,
      backgroundColor: palette.secondary,
    },
    auditBadgeText: {
      color: palette.primary,
      fontWeight: '700',
      fontSize: 9,
      letterSpacing: 0.6,
    },
    auditItemDetail: {
      color: palette.mutedForeground,
      fontWeight: '400',
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 10,
    },
    auditCardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: palette.border,
      paddingTop: 8,
    },
    auditTimeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    auditItemTime: {
      color: palette.mutedForeground,
      fontWeight: '400',
      fontSize: 10,
    },
    auditItemConf: {
      color: palette.success,
      fontWeight: '600',
      fontSize: 11,
    },

    // ── Insights View ──
    insightsCard: {
      backgroundColor: palette.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 18,
      marginTop: 20,
      marginBottom: 20,
    },
    insightsCardTitle: {
      color: palette.foreground,
      fontWeight: '700',
      fontSize: 15,
      marginBottom: 14,
    },
    insightsStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    insightsStatCol: {
      flex: 1,
      alignItems: 'center',
    },
    insightsStatNum: {
      color: palette.primary,
      fontWeight: '800',
      fontSize: 22,
    },
    insightsStatLabel: {
      color: palette.mutedForeground,
      fontWeight: '500',
      fontSize: 10,
      marginTop: 3,
    },
    insightsStatDivider: {
      width: 1,
      height: 28,
      backgroundColor: palette.border,
    },
    insightsSection: {
      backgroundColor: palette.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 18,
    },
    insightsSectionTitle: {
      color: palette.foreground,
      fontWeight: '700',
      fontSize: 15,
      marginBottom: 14,
    },
    insightsEmptyText: {
      color: palette.mutedForeground,
      fontSize: 12,
      textAlign: 'center',
      paddingVertical: 12,
    },
    frequencyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 10,
    },
    frequencyName: {
      width: 80,
      color: palette.foreground,
      fontWeight: '600',
      fontSize: 12,
    },
    frequencyBarTrack: {
      flex: 1,
      height: 7,
      borderRadius: 4,
      backgroundColor: palette.muted,
      overflow: 'hidden',
    },
    frequencyBarFill: {
      height: '100%',
      backgroundColor: palette.primary,
      borderRadius: 4,
    },
    frequencyCount: {
      width: 30,
      color: palette.mutedForeground,
      fontWeight: '600',
      fontSize: 11,
      textAlign: 'right',
    },

    // ── Translate Full-Screen Modal (PDF Page 3) ──
    translateScreen: {
      flex: 1,
      backgroundColor: '#7272F5',
      justifyContent: 'space-between',
      paddingTop: 50,
      paddingHorizontal: 26,
    },
    translateCloseBtn: {
      alignSelf: 'flex-end',
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    translateBody: {
      flex: 1,
      justifyContent: 'center',
      paddingBottom: 40,
    },
    translateSubtitle: {
      color: 'rgba(255,255,255,0.65)',
      fontWeight: '700',
      fontSize: 11,
      letterSpacing: 1.5,
      marginBottom: 8,
    },
    translateSignText: {
      color: '#ffffff',
      fontWeight: '800',
      fontSize: 42,
      letterSpacing: -1,
      lineHeight: 48,
    },
    translateHint: {
      color: 'rgba(255,255,255,0.7)',
      fontWeight: '400',
      fontSize: 13,
      marginTop: 14,
    },
    translateMascotWrap: {
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginBottom: -30,
    },
    translateMascotImage: {
      width: 220,
      height: 220,
    },
  });
