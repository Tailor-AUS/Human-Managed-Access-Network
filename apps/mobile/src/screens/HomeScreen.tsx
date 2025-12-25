/**
 * Home Screen - Main dashboard showing vaults and pending requests
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { VaultCard } from '../components/VaultCard';
import { AccessRequestCard } from '../components/AccessRequestCard';
import { Vault, AccessRequest, VaultType, PermissionLevel } from '../types';

// Demo data
const mockVaults: Vault[] = [
  {
    id: '1',
    type: VaultType.Identity,
    name: 'Identity',
    description: 'Personal information',
    defaultPermissionLevel: PermissionLevel.Open,
    itemCount: 3,
    isUnlocked: true,
    icon: 'person',
  },
  {
    id: '2',
    type: VaultType.Finance,
    name: 'Finance',
    description: 'Financial data',
    defaultPermissionLevel: PermissionLevel.Gated,
    itemCount: 12,
    isUnlocked: true,
    icon: 'wallet',
  },
  {
    id: '3',
    type: VaultType.Health,
    name: 'Health',
    description: 'Medical records',
    defaultPermissionLevel: PermissionLevel.Gated,
    itemCount: 5,
    isUnlocked: false,
    icon: 'heart',
  },
  {
    id: '4',
    type: VaultType.Secrets,
    name: 'Secrets',
    description: 'Passwords & keys',
    defaultPermissionLevel: PermissionLevel.Locked,
    itemCount: 8,
    isUnlocked: false,
    icon: 'key',
  },
];

const mockRequests: AccessRequest[] = [
  {
    id: '1',
    requesterName: 'Claude',
    requesterType: 'ai_model',
    resourceUri: 'hman://finance/transactions',
    resourceName: 'Financial Transactions',
    purpose: 'Analyze your spending patterns to provide budget recommendations',
    timestamp: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    status: 'pending',
  },
];

interface HomeScreenProps {
  onVaultPress?: (vault: Vault) => void;
  onSettingsPress?: () => void;
}

export function HomeScreen({ onVaultPress, onSettingsPress }: HomeScreenProps) {
  const pendingRequests = mockRequests.filter(r => r.status === 'pending');

  const handleVaultPress = (vault: Vault) => {
    if (onVaultPress) {
      onVaultPress(vault);
    } else {
      console.log('Open vault:', vault.name);
    }
  };

  const handleApprove = (request: AccessRequest) => {
    console.log('Approved:', request.id);
  };

  const handleDeny = (request: AccessRequest) => {
    console.log('Denied:', request.id);
  };

  const handleSettingsPress = () => {
    if (onSettingsPress) {
      onSettingsPress();
    } else {
      console.log('Open settings');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.title}>Your Vaults</Text>
          </View>
          <TouchableOpacity style={styles.settingsButton} onPress={handleSettingsPress}>
            <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <Ionicons name="alert-circle" size={20} color={colors.levelGated} />
                <Text style={styles.sectionTitle}>Pending Requests</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingRequests.length}</Text>
              </View>
            </View>

            {pendingRequests.map(request => (
              <AccessRequestCard
                key={request.id}
                request={request}
                onApprove={() => handleApprove(request)}
                onDeny={() => handleDeny(request)}
              />
            ))}
          </View>
        )}

        {/* Vaults */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <Ionicons name="folder-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.sectionTitle}>Vaults</Text>
            </View>
          </View>

          {mockVaults.map(vault => (
            <VaultCard
              key={vault.id}
              vault={vault}
              onPress={() => handleVaultPress(vault)}
            />
          ))}
        </View>

        {/* Quick Stats */}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>28</Text>
            <Text style={styles.statLabel}>Total Items</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>3</Text>
            <Text style={styles.statLabel}>Active AI</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>47</Text>
            <Text style={styles.statLabel}>Audit Entries</Text>
          </View>
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
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  greeting: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textSecondary,
  },
  badge: {
    backgroundColor: colors.levelGated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    color: colors.background,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
  },
  statsSection: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
});
