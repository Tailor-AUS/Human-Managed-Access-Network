/**
 * Access Request Card Component
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/theme';
import { AccessRequest } from '../types';

interface AccessRequestCardProps {
  request: AccessRequest;
  onApprove: () => void;
  onDeny: () => void;
}

const requesterIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  ai_model: 'sparkles-outline',
  bot: 'hardware-chip-outline',
  delegate: 'people-outline',
};

export function AccessRequestCard({ request, onApprove, onDeny }: AccessRequestCardProps) {
  const icon = requesterIcons[request.requesterType] ?? 'help-outline';
  const timeLeft = Math.max(0, request.expiresAt.getTime() - Date.now());
  const minutesLeft = Math.ceil(timeLeft / 60000);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.requesterInfo}>
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={24} color={colors.levelGated} />
          </View>
          <View>
            <Text style={styles.requesterName}>{request.requesterName}</Text>
            <Text style={styles.requesterType}>{request.requesterType.replace('_', ' ')}</Text>
          </View>
        </View>
        <Text style={styles.expiresIn}>
          {minutesLeft > 0 ? `${minutesLeft}m left` : 'Expired'}
        </Text>
      </View>

      <View style={styles.resourceSection}>
        <Text style={styles.label}>Wants to access:</Text>
        <Text style={styles.resourceName}>{request.resourceName}</Text>
        <Text style={styles.resourceUri}>{request.resourceUri}</Text>
      </View>

      <View style={styles.purposeSection}>
        <Text style={styles.label}>Purpose:</Text>
        <Text style={styles.purpose}>{request.purpose}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.denyButton]}
          onPress={onDeny}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={20} color={colors.error} />
          <Text style={[styles.buttonText, styles.denyText]}>Deny</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.approveButton]}
          onPress={onApprove}
          activeOpacity={0.7}
        >
          <Ionicons name="checkmark" size={20} color={colors.success} />
          <Text style={[styles.buttonText, styles.approveText]}>Allow</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.levelGated,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  requesterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.levelGated + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  requesterName: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textPrimary,
  },
  requesterType: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
  expiresIn: {
    fontSize: typography.fontSizes.xs,
    color: colors.warning,
    fontWeight: typography.fontWeights.medium,
  },
  resourceSection: {
    marginBottom: spacing.md,
  },
  purposeSection: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resourceName: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    color: colors.textPrimary,
  },
  resourceUri: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  purpose: {
    fontSize: typography.fontSizes.md,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  denyButton: {
    backgroundColor: colors.error + '15',
    borderWidth: 1,
    borderColor: colors.error + '30',
  },
  approveButton: {
    backgroundColor: colors.success + '15',
    borderWidth: 1,
    borderColor: colors.success + '30',
  },
  buttonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  denyText: {
    color: colors.error,
  },
  approveText: {
    color: colors.success,
  },
});
