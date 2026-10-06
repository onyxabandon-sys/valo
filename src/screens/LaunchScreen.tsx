import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../ui/tokens';

type LaunchScreenProps = {
  readyToExit: boolean;
  onFinished: () => void;
};

const MINIMUM_DISPLAY_MS = 420;

export function LaunchScreen({ readyToExit, onFinished }: LaunchScreenProps) {
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.92)).current;
  const copyOffset = useRef(new Animated.Value(10)).current;
  const [entranceFinished, setEntranceFinished] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let reducedMotionTimer: ReturnType<typeof setTimeout> | undefined;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (!isMounted) {
          return;
        }

        if (reduceMotion) {
          markOpacity.setValue(1);
          markScale.setValue(1);
          copyOffset.setValue(0);
          reducedMotionTimer = setTimeout(() => {
            if (isMounted) {
              setEntranceFinished(true);
            }
          }, MINIMUM_DISPLAY_MS);
          return;
        }

        Animated.parallel([
          Animated.timing(markOpacity, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(markScale, {
            toValue: 1,
            damping: 15,
            stiffness: 180,
            mass: 0.8,
            useNativeDriver: true,
          }),
          Animated.timing(copyOffset, {
            toValue: 0,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished && isMounted) {
            setEntranceFinished(true);
          }
        });
      })
      .catch(() => {
        markOpacity.setValue(1);
        markScale.setValue(1);
        copyOffset.setValue(0);
        reducedMotionTimer = setTimeout(() => {
          if (isMounted) {
            setEntranceFinished(true);
          }
        }, MINIMUM_DISPLAY_MS);
      });

    return () => {
      isMounted = false;
      if (reducedMotionTimer) {
        clearTimeout(reducedMotionTimer);
      }
      overlayOpacity.stopAnimation();
      markOpacity.stopAnimation();
      markScale.stopAnimation();
      copyOffset.stopAnimation();
    };
  }, [copyOffset, markOpacity, markScale]);

  useEffect(() => {
    if (!entranceFinished || !readyToExit) {
      return;
    }

    const exit = Animated.sequence([
      Animated.delay(180),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 240,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    exit.start(({ finished }) => {
      if (finished) {
        onFinished();
      }
    });

    return () => exit.stop();
  }, [entranceFinished, onFinished, overlayOpacity, readyToExit]);

  return (
    <Animated.View
      accessibilityLabel="Valet POS is starting"
      accessibilityRole="progressbar"
      style={[styles.container, { opacity: overlayOpacity }]}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.ink} />
      <View pointerEvents="none" style={styles.ambientTop} />
      <View pointerEvents="none" style={styles.ambientBottom} />

      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <View style={styles.brandStage}>
          <View style={styles.brandBlock}>
            <Animated.View style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}>
              <View style={styles.markFrame}>
                <Image
                  accessibilityIgnoresInvertColors
                  source={require('../../assets/branding/valet-mark.png')}
                  style={styles.mark}
                />
              </View>
            </Animated.View>

            <Animated.View style={[styles.copy, { transform: [{ translateY: copyOffset }] }]}>
              <Text style={styles.wordmark}>VALET</Text>
              <View style={styles.productRow}>
                <View style={styles.productLine} />
                <Text style={styles.product}>POINT OF SERVICE</Text>
                <View style={styles.productLine} />
              </View>
              <Text style={styles.promise}>Fast entry. Reliable receipts.</Text>
            </Animated.View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.readyDot} />
          <Text style={styles.footerText}>BUILT FOR THE CHECKPOINT</Text>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  ambientTop: {
    position: 'absolute',
    width: 360,
    height: 360,
    top: -205,
    right: -145,
    borderRadius: 180,
    borderWidth: 54,
    borderColor: 'rgba(47, 107, 255, 0.11)',
  },
  ambientBottom: {
    position: 'absolute',
    width: 260,
    height: 260,
    bottom: -150,
    left: -135,
    borderRadius: 130,
    backgroundColor: 'rgba(22, 166, 120, 0.07)',
  },
  brandStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  brandBlock: {
    alignItems: 'center',
  },
  markFrame: {
    width: 182,
    height: 182,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  mark: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  copy: {
    alignItems: 'center',
    marginTop: 20,
  },
  wordmark: {
    color: colors.surface,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 8,
    marginLeft: 8,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 9,
  },
  productLine: {
    width: 24,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  product: {
    color: '#AAB6CA',
    fontFamily: fonts.utility,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.7,
  },
  promise: {
    color: '#D4DBE7',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 22,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  readyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.mint,
  },
  footerText: {
    color: '#8390A5',
    fontFamily: fonts.utility,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
});
