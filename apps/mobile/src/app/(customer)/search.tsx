import { StyleSheet, Text, View } from 'react-native';

import { BottomTabInset } from '@/constants/theme';

export default function CustomerSearchScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Customer Search</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: BottomTabInset,
    backgroundColor: '#fff',
  },
    text: {
        fontSize: 24,
        fontWeight: '700',
    },
});