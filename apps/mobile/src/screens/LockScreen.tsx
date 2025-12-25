/**
 * Lock Screen - Biometric/passphrase unlock
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

interface LockScreenProps {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'fingerprint' | 'facial' | null>(null);

  useEffect(() => {
    checkBiometric();
  }, []);

  const checkBiometric = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (compatible && enrolled) {
      setBiometricAvailable(true);

      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('facial');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('fingerprint');
      }

      // Automatically prompt for biometric
      handleBiometricAuth();
    }
  };

  const handleBiometricAuth = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock HMAN',
        fallbackLabel: 'Use passphrase',
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        onUnlock();
      }
    } catch (error) {
      console.error('Biometric auth error:', error);
    }
  };

  const handlePassphraseUnlock = () => {
    if (passphrase.length < 8) {
      Alert.alert('Invalid Passphrase', 'Passphrase must be at least 8 characters');
      return;
    }

    // In a real app, this would verify the passphrase cryptographically
    onUnlock();
  };

  const biometricIcon = biometricType === 'facial' ? 'scan-outline' : 'finger-print-outline';
  const biometricLabel = biometricType === 'facial' ? 'Face ID' : 'Fingerprint';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Ionicons name="shield-checkmark" size={48} color={colors.primary} />
          </View>
          <Text style={styles.title}>HMAN</Text>
          <Text style={styles.subtitle}>Human Managed Access Network</Text>
        </View>

        {/* Biometric Button */}
        {biometricAvailable && (
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={handleBiometricAuth}
            activeOpacity={0.7}
          >
            <Ionicons name={biometricIcon} size={32} color={colors.primary} />
            <Text style={styles.biometricText}>Unlock with {biometricLabel}</Text>
          </TouchableOpacity>
        )}

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or use passphrase</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Passphrase Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter passphrase"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showPassphrase}
            value={passphrase}
            onChangeText={setPassphrase}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.showButton}
            onPress={() => setShowPassphrase(!showPassphrase)}
          >
            <Ionicons
              name={showPassphrase ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.unlockButton,
            passphrase.length < 8 && styles.unlockButtonDisabled,
          ]}
          onPress={handlePassphraseUnlock}
          disabled={passphrase.length < 8}
          activeOpacity={0.7}
        >
          <Text style={styles.unlockButtonText}>Unlock</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
        <Text style={styles.footerText}>Your data never leaves this device</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  biometricButton: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
  },
  biometricText: {
    fontSize: typography.fontSizes.md,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    paddingHorizontal: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.textPrimary,
  },
  showButton: {
    padding: spacing.md,
  },
  unlockButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  unlockButtonDisabled: {
    backgroundColor: colors.primary + '50',
  },
  unlockButtonText: {
    color: colors.textPrimary,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
});
