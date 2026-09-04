import { StyleSheet, Text, View } from 'react-native';

import { BottomTabInset } from '@/constants/theme';

export default function CustomerOrdersScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Customer Orders Screen</Text>
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