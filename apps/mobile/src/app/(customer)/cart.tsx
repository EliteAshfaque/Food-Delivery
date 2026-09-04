import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/lib/axios';
import { useCartStore } from '@/store/cart-store';
import { BottomTabInset } from '@/constants/theme';

function formatPrice(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function CustomerCartScreen() {
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const {
    items,
    restaurantId,
    restaurantName,
    incrementItem,
    decrementItem,
    removeItem,
    clearCart,
    totalItems,
    totalPrice,
  } = useCartStore();

  const { mutate: placeOrder, isPending } = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error('No restaurant selected');
      const { data } = await api.post('/orders', {
        restaurantId,
        deliveryAddress: deliveryAddress.trim(),
        items: items.map((item) => ({
          menuItemId: item.id,
          quantity: String(item.quantity),
        })),
      });
      return data;
    },
    onSuccess: (order) => {
      clearCart();
      router.replace({
        pathname: '/(customer)/(index)/oder/[id]',
        params: { id: order.id },
      });
    },
    onError: (error: Error) => {
      Alert.alert('Order failed', error.message);
    },
  });

  function handlePlaceOrder() {
    if (!deliveryAddress.trim()) {
      Alert.alert('Delivery address required', 'Please enter your delivery address.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Cart is empty', 'Add items from a restaurant menu first.');
      return;
    }
    placeOrder();
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>🛒</Text>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptyText}>Browse restaurants and add items to get started</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/(customer)/(index)')}>
          <Text style={styles.primaryButtonText}>Browse restaurants</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>Your cart</Text>
        <Text style={styles.restaurantName}>{restaurantName}</Text>

        {items.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
            ) : (
              <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                <Text>🍕</Text>
              </View>
            )}
            <View style={styles.itemBody}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>
                {formatPrice(parseFloat(item.price) * item.quantity)}
              </Text>
              <View style={styles.qtyRow}>
                <Pressable style={styles.qtyButton} onPress={() => decrementItem(item.id)}>
                  <Text style={styles.qtyButtonText}>−</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{item.quantity}</Text>
                <Pressable style={styles.qtyButton} onPress={() => incrementItem(item.id)}>
                  <Text style={styles.qtyButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Pressable onPress={() => removeItem(item.id)}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.field}>
          <Text style={styles.label}>Delivery address</Text>
          <TextInput
            style={styles.input}
            placeholder="Street, building, apartment..."
            placeholderTextColor="#999"
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{totalItems()} items</Text>
          <Text style={styles.summaryTotal}>{formatPrice(totalPrice())}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.placeOrderButton, isPending && styles.buttonDisabled]}
          onPress={handlePlaceOrder}
          disabled={isPending}>
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.placeOrderText}>
              Place order · {formatPrice(totalPrice())}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingBottom: BottomTabInset,
    backgroundColor: '#fff',
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  restaurantName: {
    fontSize: 15,
    color: '#FF6B35',
    fontWeight: '600',
    marginBottom: 16,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  itemImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#F3F3F3',
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '700',
    marginBottom: 8,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  qtyValue: {
    minWidth: 18,
    textAlign: 'center',
    fontWeight: '700',
    color: '#111',
  },
  removeText: {
    color: '#FF3B30',
    fontWeight: '600',
    fontSize: 12,
  },
  field: {
    marginTop: 8,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#111',
    minHeight: 80,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
  },
  summaryTotal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 16 + BottomTabInset,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  placeOrderButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  placeOrderText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
