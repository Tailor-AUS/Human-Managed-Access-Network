/**
 * Audit Log Screen - View access history and activity
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { AuditEntry } from '../types';

interface AuditLogScreenProps {
  onBack: () => void;
}

const mockAuditEntries: AuditEntry[] = [
  {
    id: '1',
    action: 'ACCESS_GRANTED',
    actorName: 'Claude',
    actorType: 'ai_model',
    resourceUri: 'hman://finance/transactions',
    success: true,
    timestamp: new Date(Date.now() - 10 * 60 * 1000),
  },
  {
    id: '2',
    action: 'ACCESS_DENIED',
    actorName: 'Unknown Bot',
    actorType: 'bot',
    resourceUri: 'hman://health/records',
    success: false,
    timestamp: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: '3',
    action: 'ITEM_VIEWED',
    actorName: 'Claude',
    actorType: 'ai_model',
    resourceUri: 'hman://finance/budget',
    success: true,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: '4',
    action: 'DELEGATION_CREATED',
    actorName: 'You',
    actorType: 'user',
    resourceUri: 'hman://delegation/sarah-johnson',
    success: true,
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
  {
    id: '5',
    action: 'VAULT_UNLOCKED',
    actorName: 'You',
    actorType: 'user',
    resourceUri: 'hman://finance',
    success: true,
    timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000),
  },
  {
    id: '6',
    action: 'ACCESS_GRANTED',
    actorName: 'Energy Australia Bot',
    actorType: 'bot',
    resourceUri: 'hman://identity/address',
    success: true,
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: '7',
    action: 'ITEM_CREATED',
    actorName: 'You',
    actorType: 'user',
    resourceUri: 'hman://finance/tax-2024',
    success: true,
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    id: '8',
    action: 'ACCESS_EXPIRED',
    actorName: 'GPT-4',
    actorType: 'ai_model',
    resourceUri: 'hman://diary/entries',
    success: true,
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
];

function getActionIcon(action: string): keyof typeof Ionicons.glyphMap {
  switch (action) {
    case 'ACCESS_GRANTED': return 'checkmark-circle-outline';
    case 'ACCESS_DENIED': return 'close-circle-outline';
    case 'ITEM_VIEWED': return 'eye-outline';
    case 'ITEM_CREATED': return 'add-circle-outline';
    case 'ITEM_UPDATED': return 'create-outline';
    case 'ITEM_DELETED': return 'trash-outline';
    case 'VAULT_UNLOCKED': return 'lock-open-outline';
    case 'VAULT_LOCKED': return 'lock-closed-outline';
    case 'DELEGATION_CREATED': return 'people-outline';
    case 'DELEGATION_REVOKED': return 'person-remove-outline';
    case 'ACCESS_EXPIRED': return 'time-outline';
    default: return 'information-circle-outline';
  }
}

function getActionColor(action: string, success: boolean): string {
  if (!success) return colors.error;

  switch (action) {
    case 'ACCESS_GRANTED': return colors.success;
    case 'ACCESS_DENIED': return colors.error;
    case 'ITEM_VIEWED': return colors.info;
    case 'ITEM_CREATED': return colors.success;
    case 'ITEM_UPDATED': return colors.info;
    case 'ITEM_DELETED': return colors.error;
    case 'VAULT_UNLOCKED': return colors.success;
    case 'VAULT_LOCKED': return colors.levelGated;
    case 'DELEGATION_CREATED': return colors.primary;
    case 'DELEGATION_REVOKED': return colors.warning;
    case 'ACCESS_EXPIRED': return colors.textMuted;
    default: return colors.textSecondary;
  }
}

function getActionLabel(action: string): string {
  switch (action) {
    case 'ACCESS_GRANTED': return 'Access Granted';
    case 'ACCESS_DENIED': return 'Access Denied';
    case 'ITEM_VIEWED': return 'Item Viewed';
    case 'ITEM_CREATED': return 'Item Created';
    case 'ITEM_UPDATED': return 'Item Updated';
    case 'ITEM_DELETED': return 'Item Deleted';
    case 'VAULT_UNLOCKED': return 'Vault Unlocked';
    case 'VAULT_LOCKED': return 'Vault Locked';
    case 'DELEGATION_CREATED': return 'Delegation Created';
    case 'DELEGATION_REVOKED': return 'Delegation Revoked';
    case 'ACCESS_EXPIRED': return 'Access Expired';
    default: return action;
  }
}

function getActorIcon(actorType: string): keyof typeof Ionicons.glyphMap {
  switch (actorType) {
    case 'ai_model': return 'hardware-chip-outline';
    case 'bot': return 'cube-outline';
    case 'user': return 'person-outline';
    case 'delegate': return 'people-outline';
    default: return 'help-circle-outline';
  }
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function parseResourceUri(uri: string): { vault: string; item?: string } {
  const parts = uri.replace('hman://', '').split('/');
  return {
    vault: parts[0],
    item: parts[1],
  };
}

type FilterType = 'all' | 'access' | 'changes' | 'security';

export function AuditLogScreen({ onBack }: AuditLogScreenProps) {
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredEntries = mockAuditEntries.filter(entry => {
    switch (filter) {
      case 'access':
        return ['ACCESS_GRANTED', 'ACCESS_DENIED', 'ACCESS_EXPIRED', 'ITEM_VIEWED'].includes(entry.action);
      case 'changes':
        return ['ITEM_CREATED', 'ITEM_UPDATED', 'ITEM_DELETED'].includes(entry.action);
      case 'security':
        return ['VAULT_UNLOCKED', 'VAULT_LOCKED', 'DELEGATION_CREATED', 'DELEGATION_REVOKED', 'ACCESS_DENIED'].includes(entry.action);
      default:
        return true;
    }
  });

  const groupedEntries = filteredEntries.reduce((groups, entry) => {
    const date = entry.timestamp.toLocaleDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {} as Record<string, AuditEntry[]>);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Audit Log</Text>
        <TouchableOpacity style={styles.exportButton}>
          <Ionicons name="download-outline" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {(['all', 'access', 'changes', 'security'] as FilterType[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, filter === f && styles.filterTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Stats Summary */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.statText}>{mockAuditEntries.filter(e => e.success).length} Successful</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="close-circle" size={16} color={colors.error} />
          <Text style={styles.statText}>{mockAuditEntries.filter(e => !e.success).length} Denied</Text>
        </View>
      </View>

      {/* Audit Log List */}
      <ScrollView style={styles.logList} showsVerticalScrollIndicator={false}>
        {Object.entries(groupedEntries).map(([date, entries]) => (
          <View key={date} style={styles.dateGroup}>
            <Text style={styles.dateHeader}>{date}</Text>
            {entries.map((entry) => {
              const resource = parseResourceUri(entry.resourceUri);
              return (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.logEntry}
                  onPress={() => setSelectedEntry(entry)}
                >
                  <View style={[styles.actionIcon, { backgroundColor: getActionColor(entry.action, entry.success) + '20' }]}>
                    <Ionicons
                      name={getActionIcon(entry.action)}
                      size={20}
                      color={getActionColor(entry.action, entry.success)}
                    />
                  </View>
                  <View style={styles.entryContent}>
                    <View style={styles.entryHeader}>
                      <Text style={styles.actionLabel}>{getActionLabel(entry.action)}</Text>
                      <Text style={styles.timestamp}>{formatTimestamp(entry.timestamp)}</Text>
                    </View>
                    <View style={styles.entryDetails}>
                      <View style={styles.actorRow}>
                        <Ionicons name={getActorIcon(entry.actorType)} size={12} color={colors.textMuted} />
                        <Text style={styles.actorName}>{entry.actorName}</Text>
                      </View>
                      <Text style={styles.resourcePath}>
                        {resource.vault}{resource.item ? ` / ${resource.item}` : ''}
                      </Text>
                    </View>
                  </View>
                  {!entry.success && (
                    <View style={styles.failedBadge}>
                      <Text style={styles.failedText}>Failed</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Entry Detail Modal */}
      <Modal
        visible={selectedEntry !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedEntry(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Activity Details</Text>
            <TouchableOpacity onPress={() => setSelectedEntry(null)}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {selectedEntry && (
            <ScrollView style={styles.modalContent}>
              <View style={[styles.actionIconLarge, { backgroundColor: getActionColor(selectedEntry.action, selectedEntry.success) + '20' }]}>
                <Ionicons
                  name={getActionIcon(selectedEntry.action)}
                  size={32}
                  color={getActionColor(selectedEntry.action, selectedEntry.success)}
                />
              </View>
              <Text style={styles.modalActionLabel}>{getActionLabel(selectedEntry.action)}</Text>

              <View style={styles.detailSection}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[styles.statusBadge, { backgroundColor: selectedEntry.success ? colors.success + '20' : colors.error + '20' }]}>
                    <Text style={[styles.statusText, { color: selectedEntry.success ? colors.success : colors.error }]}>
                      {selectedEntry.success ? 'Success' : 'Failed'}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Actor</Text>
                  <View style={styles.actorDetail}>
                    <Ionicons name={getActorIcon(selectedEntry.actorType)} size={16} color={colors.primary} />
                    <Text style={styles.detailValue}>{selectedEntry.actorName}</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Actor Type</Text>
                  <Text style={styles.detailValue}>{selectedEntry.actorType.replace('_', ' ')}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Resource</Text>
                  <Text style={styles.detailValue}>{selectedEntry.resourceUri}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Timestamp</Text>
                  <Text style={styles.detailValue}>
                    {selectedEntry.timestamp.toLocaleString()}
                  </Text>
                </View>
              </View>

              <View style={styles.actionButtonsModal}>
                <TouchableOpacity style={styles.secondaryButton}>
                  <Ionicons name="copy-outline" size={20} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>Copy Details</Text>
                </TouchableOpacity>
                {selectedEntry.actorType !== 'user' && (
                  <TouchableOpacity style={styles.dangerButton}>
                    <Ionicons name="ban-outline" size={20} color={colors.error} />
                    <Text style={styles.dangerButtonText}>Block Actor</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
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
  exportButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterScroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.medium,
  },
  filterTextActive: {
    color: colors.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  logList: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  dateGroup: {
    marginTop: spacing.lg,
  },
  dateHeader: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  logEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  entryContent: {
    flex: 1,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  actionLabel: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    color: colors.textPrimary,
  },
  timestamp: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  entryDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actorName: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  resourcePath: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  failedBadge: {
    backgroundColor: colors.error + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  failedText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    color: colors.error,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
  },
  modalContent: {
    padding: spacing.md,
  },
  actionIconLarge: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: spacing.lg,
  },
  modalActionLabel: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  detailSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: typography.fontSizes.md,
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.medium,
  },
  actorDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  actionButtonsModal: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  secondaryButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    color: colors.primary,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.error + '10',
    borderRadius: borderRadius.md,
  },
  dangerButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    color: colors.error,
  },
});
