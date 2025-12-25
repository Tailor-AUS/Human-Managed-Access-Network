/**
 * Root Layout - App entry point with navigation
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LockScreen } from '../src/screens/LockScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { VaultDetailScreen } from '../src/screens/VaultDetailScreen';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { MessagesScreen } from '../src/screens/MessagesScreen';
import { AuditLogScreen } from '../src/screens/AuditLogScreen';
import { TabBar, TabName } from '../src/components/TabBar';
import { colors } from '../src/constants/theme';
import { Vault } from '../src/types';

type Screen =
  | { type: 'home' }
  | { type: 'vault'; vault: Vault }
  | { type: 'settings' }
  | { type: 'messages' }
  | { type: 'audit' };

export default function RootLayout() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<TabName>('home');
  const [currentScreen, setCurrentScreen] = useState<Screen>({ type: 'home' });

  const handleUnlock = () => {
    setIsUnlocked(true);
  };

  const handleTabPress = (tab: TabName) => {
    setActiveTab(tab);
    switch (tab) {
      case 'home':
        setCurrentScreen({ type: 'home' });
        break;
      case 'messages':
        setCurrentScreen({ type: 'messages' });
        break;
      case 'audit':
        setCurrentScreen({ type: 'audit' });
        break;
      case 'settings':
        setCurrentScreen({ type: 'settings' });
        break;
    }
  };

  const handleVaultPress = (vault: Vault) => {
    setCurrentScreen({ type: 'vault', vault });
  };

  const handleBackToHome = () => {
    setCurrentScreen({ type: 'home' });
    setActiveTab('home');
  };

  const handleSettingsPress = () => {
    setCurrentScreen({ type: 'settings' });
    setActiveTab('settings');
  };

  const renderScreen = () => {
    switch (currentScreen.type) {
      case 'vault':
        return (
          <VaultDetailScreen
            vault={currentScreen.vault}
            onBack={handleBackToHome}
          />
        );
      case 'settings':
        return <SettingsScreen onBack={handleBackToHome} />;
      case 'messages':
        return <MessagesScreen onBack={handleBackToHome} />;
      case 'audit':
        return <AuditLogScreen onBack={handleBackToHome} />;
      case 'home':
      default:
        return (
          <HomeScreen
            onVaultPress={handleVaultPress}
            onSettingsPress={handleSettingsPress}
          />
        );
    }
  };

  if (!isUnlocked) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <LockScreen onUnlock={handleUnlock} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        {renderScreen()}
      </View>
      <TabBar
        activeTab={activeTab}
        onTabPress={handleTabPress}
        unreadMessages={1}
        pendingRequests={1}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
});
