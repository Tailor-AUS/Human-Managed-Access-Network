/**
 * Vault Detail Screen - View and manage items in a vault
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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { Vault, VaultItem, PermissionLevel, VaultType } from '../types';

interface VaultDetailScreenProps {
  vault: Vault;
  onBack: () => void;
}

// Demo items for different vault types
const getMockItems = (vaultType: VaultType): VaultItem[] => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  switch (vaultType) {
    case VaultType.Identity:
      return [
        { id: '1', vaultId: '1', title: 'Full Name', itemType: 'text', permissionLevel: PermissionLevel.Open, createdAt: yesterday, updatedAt: now },
        { id: '2', vaultId: '1', title: 'Date of Birth', itemType: 'date', permissionLevel: PermissionLevel.Standard, createdAt: yesterday, updatedAt: now },
        { id: '3', vaultId: '1', title: 'Address', itemType: 'address', permissionLevel: PermissionLevel.Gated, createdAt: yesterday, updatedAt: now },
      ];
    case VaultType.Finance:
      return [
        { id: '1', vaultId: '2', title: 'Bank Transactions', itemType: 'transactions', permissionLevel: PermissionLevel.Gated, createdAt: yesterday, updatedAt: now },
        { id: '2', vaultId: '2', title: 'Tax Records 2024', itemType: 'document', permissionLevel: PermissionLevel.Locked, createdAt: yesterday, updatedAt: now },
        { id: '3', vaultId: '2', title: 'Investment Portfolio', itemType: 'portfolio', permissionLevel: PermissionLevel.Gated, createdAt: yesterday, updatedAt: now },
        { id: '4', vaultId: '2', title: 'Monthly Budget', itemType: 'budget', permissionLevel: PermissionLevel.Standard, createdAt: yesterday, updatedAt: now },
      ];
    case VaultType.Health:
      return [
        { id: '1', vaultId: '3', title: 'Medical History', itemType: 'records', permissionLevel: PermissionLevel.Gated, createdAt: yesterday, updatedAt: now },
        { id: '2', vaultId: '3', title: 'Current Medications', itemType: 'medications', permissionLevel: PermissionLevel.Standard, createdAt: yesterday, updatedAt: now },
        { id: '3', vaultId: '3', title: 'Lab Results', itemType: 'labResults', permissionLevel: PermissionLevel.Gated, createdAt: yesterday, updatedAt: now },
      ];
    case VaultType.Secrets:
      return [
        { id: '1', vaultId: '4', title: 'Banking Passwords', itemType: 'password', permissionLevel: PermissionLevel.Locked, createdAt: yesterday, updatedAt: now },
        { id: '2', vaultId: '4', title: 'Recovery Phrases', itemType: 'secret', permissionLevel: PermissionLevel.Locked, createdAt: yesterday, updatedAt: now },
        { id: '3', vaultId: '4', title: '2FA Backup Codes', itemType: 'codes', permissionLevel: PermissionLevel.Locked, createdAt: yesterday, updatedAt: now },
      ];
    default:
      return [];
  }
};

const getPermissionColor = (level: PermissionLevel): string => {
  switch (level) {
    case PermissionLevel.Open: return colors.levelOpen;
    case PermissionLevel.Standard: return colors.levelStandard;
    case PermissionLevel.Gated: return colors.levelGated;
    case PermissionLevel.Locked: return colors.levelLocked;
    default: return colors.textMuted;
  }
};

const getPermissionLabel = (level: PermissionLevel): string => {
  switch (level) {
    case PermissionLevel.Open: return 'Open';
    case PermissionLevel.Standard: return 'Standard';
    case PermissionLevel.Gated: return 'Gated';
    case PermissionLevel.Locked: return 'Locked';
    default: return 'Unknown';
  }
};

const getItemIcon = (itemType: string): keyof typeof Ionicons.glyphMap => {
  switch (itemType) {
    case 'text': return 'document-text-outline';
    case 'date': return 'calendar-outline';
    case 'address': return 'location-outline';
    case 'transactions': return 'swap-horizontal-outline';
    case 'document': return 'document-outline';
    case 'portfolio': return 'trending-up-outline';
    case 'budget': return 'pie-chart-outline';
    case 'records': return 'folder-outline';
    case 'medications': return 'medkit-outline';
    case 'labResults': return 'flask-outline';
    case 'password': return 'key-outline';
    case 'secret': return 'shield-outline';
    case 'codes': return 'qr-code-outline';
    default: return 'document-outline';
  }
};

export function VaultDetailScreen({ vault, onBack }: VaultDetailScreenProps) {
  const [items] = useState<VaultItem[]>(getMockItems(vault.type));
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');

  const handleItemPress = (item: VaultItem) => {
    setSelectedItem(item);
  };

  const handleAddItem = () => {
    if (newItemTitle.trim()) {
      console.log('Add item:', newItemTitle);
      setNewItemTitle('');
      setShowAddModal(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Ionicons name={vault.icon as any} size={24} color={colors.primary} />
          <Text style={styles.title}>{vault.name}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
          <Ionicons name="add" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Vault Status */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <Ionicons
            name={vault.isUnlocked ? 'lock-open-outline' : 'lock-closed-outline'}
            size={16}
            color={vault.isUnlocked ? colors.success : colors.warning}
          />
          <Text style={styles.statusText}>
            {vault.isUnlocked ? 'Unlocked' : 'Locked'}
          </Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <View style={[styles.permissionDot, { backgroundColor: getPermissionColor(vault.defaultPermissionLevel) }]} />
          <Text style={styles.statusText}>
            Default: {getPermissionLabel(vault.defaultPermissionLevel)}
          </Text>
        </View>
        <View style={styles.statusDivider} />
        <Text style={styles.statusText}>{items.length} items</Text>
      </View>

      {/* Items List */}
      <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.itemCard}
            onPress={() => handleItemPress(item)}
          >
            <View style={styles.itemIcon}>
              <Ionicons name={getItemIcon(item.itemType)} size={24} color={colors.primary} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemMeta}>
                Updated {item.updatedAt.toLocaleDateString()}
              </Text>
            </View>
            <View style={[styles.permissionBadge, { backgroundColor: getPermissionColor(item.permissionLevel) + '20' }]}>
              <View style={[styles.permissionIndicator, { backgroundColor: getPermissionColor(item.permissionLevel) }]} />
              <Text style={[styles.permissionText, { color: getPermissionColor(item.permissionLevel) }]}>
                {getPermissionLabel(item.permissionLevel)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Item Detail Modal */}
      <Modal
        visible={selectedItem !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{selectedItem?.title}</Text>
            <TouchableOpacity onPress={() => setSelectedItem(null)}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {selectedItem && (
            <View style={styles.modalContent}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Type</Text>
                <Text style={styles.detailValue}>{selectedItem.itemType}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Permission Level</Text>
                <View style={[styles.permissionBadge, { backgroundColor: getPermissionColor(selectedItem.permissionLevel) + '20' }]}>
                  <View style={[styles.permissionIndicator, { backgroundColor: getPermissionColor(selectedItem.permissionLevel) }]} />
                  <Text style={[styles.permissionText, { color: getPermissionColor(selectedItem.permissionLevel) }]}>
                    {getPermissionLabel(selectedItem.permissionLevel)}
                  </Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Created</Text>
                <Text style={styles.detailValue}>{selectedItem.createdAt.toLocaleDateString()}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last Updated</Text>
                <Text style={styles.detailValue}>{selectedItem.updatedAt.toLocaleDateString()}</Text>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="shield-outline" size={20} color={colors.levelGated} />
                  <Text style={[styles.actionButtonText, { color: colors.levelGated }]}>Change Access</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.dangerButton]}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                  <Text style={[styles.actionButtonText, { color: colors.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Add Item Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Item</Text>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.textInput}
              value={newItemTitle}
              onChangeText={setNewItemTitle}
              placeholder="Enter item title..."
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity
              style={[styles.primaryButton, !newItemTitle.trim() && styles.disabledButton]}
              onPress={handleAddItem}
              disabled={!newItemTitle.trim()}
            >
              <Text style={styles.primaryButtonText}>Add Item</Text>
            </TouchableOpacity>
          </View>
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
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  statusText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  permissionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemsList: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  itemMeta: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  permissionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  permissionIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  permissionText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
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
  actionButtons: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  actionButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    color: colors.primary,
  },
  dangerButton: {
    backgroundColor: colors.error + '10',
  },
  inputLabel: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textPrimary,
  },
});
