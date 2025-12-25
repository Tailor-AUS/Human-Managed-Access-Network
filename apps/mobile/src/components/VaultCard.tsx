/**
 * Vault Card Component
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/theme';
import { Vault, PermissionLevel } from '../types';

interface VaultCardProps {
  vault: Vault;
  onPress: () => void;
}

const levelColors: Record<PermissionLevel, string> = {
  [PermissionLevel.Open]: colors.levelOpen,
  [PermissionLevel.Standard]: colors.levelStandard,
  [PermissionLevel.Gated]: colors.levelGated,
  [PermissionLevel.Locked]: colors.levelLocked,
};

const levelLabels: Record<PermissionLevel, string> = {
  [PermissionLevel.Open]: 'Open',
  [PermissionLevel.Standard]: 'Standard',
  [PermissionLevel.Gated]: 'Gated',
  [PermissionLevel.Locked]: 'Locked',
};

const vaultIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  identity: 'person-outline',
  finance: 'wallet-outline',
  health: 'heart-outline',
  diary: 'book-outline',
  calendar: 'calendar-outline',
  secrets: 'key-outline',
};

export function VaultCard({ vault, onPress }: VaultCardProps) {
  const levelColor = levelColors[vault.defaultPermissionLevel];
  const levelLabel = levelLabels[vault.defaultPermissionLevel];
  const icon = vaultIcons[vault.type] ?? 'folder-outline';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconContainer, { backgroundColor: levelColor + '20' }]}>
        <Ionicons name={icon} size={28} color={levelColor} />
      </View>

      <View style={styles.content}>
        <Text style={styles.name}>{vault.name}</Text>
        <Text style={styles.itemCount}>
          {vault.itemCount} {vault.itemCount === 1 ? 'item' : 'items'}
        </Text>
      </View>

      <View style={styles.rightSection}>
        <View style={[styles.levelBadge, { backgroundColor: levelColor + '20' }]}>
          <Text style={[styles.levelText, { color: levelColor }]}>{levelLabel}</Text>
        </View>
        {vault.isUnlocked ? (
          <Ionicons name="lock-open-outline" size={16} color={colors.textMuted} />
        ) : (
          <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  itemCount: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  rightSection: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  levelBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  levelText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
  },
});
