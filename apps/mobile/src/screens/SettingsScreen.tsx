/**
 * Settings Screen - App preferences and account management
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

interface SettingsScreenProps {
  onBack: () => void;
}

interface SettingItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}

function SettingItem({ icon, iconColor, title, subtitle, rightElement, onPress, danger }: SettingItemProps) {
  return (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.settingIcon, { backgroundColor: (iconColor ?? colors.primary) + '20' }]}>
        <Ionicons name={icon} size={20} color={iconColor ?? colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, danger && styles.dangerText]}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {rightElement ?? (onPress && (
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      ))}
    </TouchableOpacity>
  );
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoLockEnabled, setAutoLockEnabled] = useState(true);
  const [syncEnabled, setSyncEnabled] = useState(true);

  const handleExportData = () => {
    Alert.alert(
      'Export Data',
      'This will create an encrypted backup of all your vault data.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export', onPress: () => console.log('Export data') },
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear temporary files but keep your vault data.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', onPress: () => console.log('Clear cache') },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is irreversible. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => console.log('Delete account') },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionContent}>
            <SettingItem
              icon="person-circle-outline"
              title="Profile"
              subtitle="Manage your identity information"
              onPress={() => console.log('Profile')}
            />
            <SettingItem
              icon="people-outline"
              title="Delegations"
              subtitle="Manage trusted contacts"
              onPress={() => console.log('Delegations')}
            />
            <SettingItem
              icon="phone-portrait-outline"
              title="Connected Devices"
              subtitle="3 devices"
              onPress={() => console.log('Devices')}
            />
          </View>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.sectionContent}>
            <SettingItem
              icon="finger-print-outline"
              iconColor={colors.levelGated}
              title="Biometric Unlock"
              subtitle="Use Face ID or Touch ID"
              rightElement={
                <Switch
                  value={biometricEnabled}
                  onValueChange={setBiometricEnabled}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.textPrimary}
                />
              }
            />
            <SettingItem
              icon="lock-closed-outline"
              iconColor={colors.levelGated}
              title="Auto-Lock"
              subtitle="Lock when app is in background"
              rightElement={
                <Switch
                  value={autoLockEnabled}
                  onValueChange={setAutoLockEnabled}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.textPrimary}
                />
              }
            />
            <SettingItem
              icon="key-outline"
              iconColor={colors.levelGated}
              title="Change Passphrase"
              subtitle="Update your master passphrase"
              onPress={() => console.log('Change passphrase')}
            />
            <SettingItem
              icon="shield-checkmark-outline"
              iconColor={colors.success}
              title="Recovery Key"
              subtitle="View or regenerate"
              onPress={() => console.log('Recovery key')}
            />
          </View>
        </View>

        {/* Sync Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync & Backup</Text>
          <View style={styles.sectionContent}>
            <SettingItem
              icon="sync-outline"
              iconColor={colors.info}
              title="Cross-Device Sync"
              subtitle="Sync vaults across devices"
              rightElement={
                <Switch
                  value={syncEnabled}
                  onValueChange={setSyncEnabled}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.textPrimary}
                />
              }
            />
            <SettingItem
              icon="cloud-download-outline"
              iconColor={colors.info}
              title="Export Data"
              subtitle="Create encrypted backup"
              onPress={handleExportData}
            />
            <SettingItem
              icon="cloud-upload-outline"
              iconColor={colors.info}
              title="Import Data"
              subtitle="Restore from backup"
              onPress={() => console.log('Import')}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.sectionContent}>
            <SettingItem
              icon="notifications-outline"
              title="Push Notifications"
              subtitle="Access requests and alerts"
              rightElement={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.textPrimary}
                />
              }
            />
          </View>
        </View>

        {/* AI & Integrations Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI & Integrations</Text>
          <View style={styles.sectionContent}>
            <SettingItem
              icon="logo-capacitor"
              title="Connected AI Models"
              subtitle="2 active connections"
              onPress={() => console.log('AI connections')}
            />
            <SettingItem
              icon="apps-outline"
              title="Bot Permissions"
              subtitle="Manage third-party access"
              onPress={() => console.log('Bot permissions')}
            />
            <SettingItem
              icon="document-text-outline"
              title="Access Policies"
              subtitle="Default permission rules"
              onPress={() => console.log('Access policies')}
            />
          </View>
        </View>

        {/* Advanced Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advanced</Text>
          <View style={styles.sectionContent}>
            <SettingItem
              icon="analytics-outline"
              title="Audit Log"
              subtitle="View access history"
              onPress={() => console.log('Audit log')}
            />
            <SettingItem
              icon="trash-outline"
              title="Clear Cache"
              subtitle="Free up storage space"
              onPress={handleClearCache}
            />
            <SettingItem
              icon="bug-outline"
              title="Debug Mode"
              subtitle="For troubleshooting"
              onPress={() => console.log('Debug mode')}
            />
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.sectionContent}>
            <SettingItem
              icon="information-circle-outline"
              title="Version"
              subtitle="0.1.0 (Build 1)"
            />
            <SettingItem
              icon="document-outline"
              title="Privacy Policy"
              onPress={() => console.log('Privacy')}
            />
            <SettingItem
              icon="help-circle-outline"
              title="Help & Support"
              onPress={() => console.log('Help')}
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerText]}>Danger Zone</Text>
          <View style={styles.sectionContent}>
            <SettingItem
              icon="warning-outline"
              iconColor={colors.error}
              title="Delete All Data"
              subtitle="Permanently delete your account"
              onPress={handleDeleteAccount}
              danger
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>HMAN - Human Managed Access Network</Text>
          <Text style={styles.footerSubtext}>Your data, your control</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  sectionContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    color: colors.textPrimary,
  },
  settingSubtitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  dangerText: {
    color: colors.error,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.xl,
  },
  footerText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  footerSubtext: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
