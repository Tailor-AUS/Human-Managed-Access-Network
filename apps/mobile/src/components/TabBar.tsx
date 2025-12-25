/**
 * Custom Tab Bar Component
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

export type TabName = 'home' | 'messages' | 'audit' | 'settings';

interface TabBarProps {
  activeTab: TabName;
  onTabPress: (tab: TabName) => void;
  unreadMessages?: number;
  pendingRequests?: number;
}

interface TabItem {
  name: TabName;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const tabs: TabItem[] = [
  { name: 'home', icon: 'home-outline', activeIcon: 'home', label: 'Home' },
  { name: 'messages', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles', label: 'Messages' },
  { name: 'audit', icon: 'shield-outline', activeIcon: 'shield', label: 'Activity' },
  { name: 'settings', icon: 'settings-outline', activeIcon: 'settings', label: 'Settings' },
];

export function TabBar({ activeTab, onTabPress, unreadMessages = 0, pendingRequests = 0 }: TabBarProps) {
  const getBadgeCount = (tabName: TabName): number => {
    switch (tabName) {
      case 'messages':
        return unreadMessages;
      case 'home':
        return pendingRequests;
      default:
        return 0;
    }
  };

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.name;
        const badgeCount = getBadgeCount(tab.name);

        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => onTabPress(tab.name)}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name={isActive ? tab.activeIcon : tab.icon}
                size={24}
                color={isActive ? colors.primary : colors.textMuted}
              />
              {badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: spacing.xs,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.error,
    borderRadius: borderRadius.full,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
  },
  label: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: typography.fontWeights.medium,
  },
});
