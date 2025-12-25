/**
 * Root Layout - App entry point with navigation
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LockScreen } from '../src/screens/LockScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { colors } from '../src/constants/theme';

export default function RootLayout() {
  const [isUnlocked, setIsUnlocked] = useState(false);

  const handleUnlock = () => {
    setIsUnlocked(true);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {isUnlocked ? (
        <HomeScreen />
      ) : (
        <LockScreen onUnlock={handleUnlock} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
