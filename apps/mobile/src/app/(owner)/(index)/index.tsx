import React, { useEffect } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, Alert } from 'react-native';
import { api } from '@/lib/axios';
import { Restaurant } from '@food-delivery/types';

export default function OwnerHomeScreen() {
    const queryClient = useQueryClient();
    const { data: restaurant, isLoading, isFetching } = useQuery<Restaurant | null>({
        queryKey: ['my-restaurants'],
        queryFn: () => api.get('/restaurants/mine').then((res) => res.data),
    });
    const { mutate: toggleOpen } = useMutation({
        mutationFn: () =>
            api
                .patch(`/restaurants/${restaurant?.id}`, {
                    isOpen: !restaurant?.isOpen,
                })
                .then((res) => res.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-restaurants'] });
        },
        onError: (error) => {
            Alert.alert('Error', error.message);
        },
    });
    useEffect(() => {
        if (isLoading || isFetching) return;
        if (!restaurant) {
            router.replace('/(owner)/(index)/create-restaurant');
        }
    }, [restaurant, isLoading, isFetching]);
    if (isLoading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#FF6B35" />
            </View>
        );
    }
    return (
        <View style={styles.container}>
            <Text style={styles.name}>{restaurant?.name}</Text>
    
            <Pressable
                style={[styles.toggleButton, restaurant?.isOpen ? styles.open : styles.closed]}
                onPress={() => toggleOpen()}
            >
                <Text style={styles.toggleText}>
                    {restaurant?.isOpen ? 'Open - tap to close' : 'Closed - tap to open'}
                </Text>
            </Pressable>
    
            <Pressable
                style={styles.editButton}
                onPress={() => router.push('/(owner)/(index)/update-restaurant')}
            >
                <Text style={styles.editButtonText}>Edit Restaurant</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    name: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 24,
    },
    toggleButton: {
        width: '100%',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 12,
    },
    open: {
        backgroundColor: '#22C55E',
    },
    closed: {
        backgroundColor: '#EF4444',
    },
    toggleText: {
        color: '#FFFFFF',
        fontWeight: '600',
    },
    editButton: {
        width: '100%',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
    },
    editButtonText: {
        color: '#000',
        fontWeight: '600',
    },
});
