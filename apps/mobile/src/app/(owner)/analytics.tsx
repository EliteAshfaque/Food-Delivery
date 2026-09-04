import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function OwnerAnalyticsScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Owner Analytics</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff', // optional, for better visibility
    },
    text: {
        fontSize: 24,
        fontWeight: '700',
        color: '#000', // optional
    },
});