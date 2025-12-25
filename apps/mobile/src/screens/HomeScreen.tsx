/**
 * Home Screen - Main dashboard showing vaults and pending requests
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { VaultCard } from '../components/VaultCard';
import { AccessRequestCard } from '../components/AccessRequestCard';
import { Vault, AccessRequest, VaultType, PermissionLevel } from '../types';

// Skeleton loader component
function SkeletonLoader({ style }: { style?: object }) {
  return (
    <View style={[{ backgroundColor: colors.border, borderRadius: borderRadius.md }, style]} />
  );
}

// Error display component
function ErrorDisplay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorContainer}>
      <Ionicons name="alert-circle-outline" size={48} color={colors.levelLocked} />
      <Text style={styles.errorTitle}>Failed to Load</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Ionicons name="refresh" size={20} color={colors.textPrimary} />
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

// Mock data fetcher
async function fetchHomeData(): Promise<{ vaults: Vault[]; requests: AccessRequest[] }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    vaults: [
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
    ],
    requests: [
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
    ],
  };
}

interface HomeScreenProps {
  onVaultPress?: (vault: Vault) => void;
  onSettingsPress?: () => void;
}

export function HomeScreen({ onVaultPress, onSettingsPress }: HomeScreenProps) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      const data = await fetchHomeData();
      setVaults(data.vaults);
      setRequests(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pendingRequests = requests.filter(r => r.status === 'pending');

  const handleVaultPress = (vault: Vault) => {
    if (onVaultPress) {
      onVaultPress(vault);
    } else {
      console.log('Open vault:', vault.name);
    }
  };

  const handleApprove = async (request: AccessRequest) => {
    setActionInProgress(request.id);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      setRequests(prev => prev.map(r =>
        r.id === request.id ? { ...r, status: 'approved' as const } : r
      ));
    } catch (err) {
      setError('Failed to approve request');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeny = async (request: AccessRequest) => {
    setActionInProgress(request.id);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      setRequests(prev => prev.map(r =>
        r.id === request.id ? { ...r, status: 'denied' as const } : r
      ));
    } catch (err) {
      setError('Failed to deny request');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSettingsPress = () => {
    if (onSettingsPress) {
      onSettingsPress();
    } else {
      console.log('Open settings');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your vaults...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error && vaults.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorDisplay message={error} onRetry={() => loadData()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadData(true)}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
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

        {/* Error banner (non-fatal) */}
        {error && vaults.length > 0 && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.levelLocked} />
            <Text style={styles.errorBannerText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

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
              <View key={request.id} style={actionInProgress === request.id ? styles.requestLoading : undefined}>
                <AccessRequestCard
                  request={request}
                  onApprove={() => handleApprove(request)}
                  onDeny={() => handleDeny(request)}
                />
                {actionInProgress === request.id && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                )}
              </View>
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

          {vaults.map(vault => (
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
  // Loading styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.textMuted,
  },
  // Error styles
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    marginTop: spacing.md,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.levelLocked,
  },
  errorMessage: {
    marginTop: spacing.sm,
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    color: colors.textPrimary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.levelLocked + '20',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.levelLocked + '40',
  },
  errorBannerText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: colors.levelLocked,
  },
  requestLoading: {
    opacity: 0.6,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: borderRadius.lg,
  },
});
