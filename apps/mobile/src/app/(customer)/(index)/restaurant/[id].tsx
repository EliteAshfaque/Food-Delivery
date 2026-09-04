import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/axios';
import { useCartStore } from '@/store/cart-store';
import type { MenuCategory, MenuItem, Restaurant } from '@food-delivery/types';

function formatPrice(price: string | number) {
  const value = typeof price === 'number' ? price : Number.parseFloat(price);
  if (Number.isNaN(value)) return String(price);
  return `$${value.toFixed(2)}`;
}

function formatRating(rating: number | string) {
  const value = typeof rating === 'number' ? rating : Number.parseFloat(rating);
  if (Number.isNaN(value) || value <= 0) return 'New';
  return value.toFixed(1);
}

export default function RestaurantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const {
    items: cartItems,
    restaurantId: cartRestaurantId,
    restaurantName: cartRestaurantName,
    addItem,
    incrementItem,
    decrementItem,
    clearCart,
    totalItems,
    totalPrice,
  } = useCartStore();

  const { data: restaurant, isLoading: restaurantLoading } = useQuery<Restaurant | null>({
    queryKey: ['restaurant', id],
    queryFn: () => api.get(`/restaurants/${id}`).then((res) => res.data),
    enabled: Boolean(id),
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<MenuCategory[]>({
    queryKey: ['menu-categories', id],
    queryFn: () => api.get(`/menu/categories/${id}`).then((res) => res.data),
    enabled: Boolean(id),
  });

  const { data: menuItems = [], isLoading: itemsLoading } = useQuery<MenuItem[]>({
    queryKey: ['menu-items', id],
    queryFn: () => api.get(`/menu/items/${id}`).then((res) => res.data),
    enabled: Boolean(id),
  });

  const availableItems = useMemo(
    () => menuItems.filter((item) => item.isAvailable),
    [menuItems],
  );

  const visibleItems = useMemo(() => {
    if (!selectedCategoryId) return availableItems;
    return availableItems.filter((item) => item.categoryId === selectedCategoryId);
  }, [availableItems, selectedCategoryId]);

  const groupedSections = useMemo(() => {
    if (selectedCategoryId) {
      const category = categories.find((c) => c.id === selectedCategoryId);
      return [{ title: category?.name ?? 'Items', data: visibleItems }];
    }
    return categories
      .map((category) => ({
        title: category.name,
        data: availableItems.filter((item) => item.categoryId === category.id),
      }))
      .filter((section) => section.data.length > 0);
  }, [categories, availableItems, selectedCategoryId, visibleItems]);

  const isLoading = restaurantLoading || categoriesLoading || itemsLoading;
  const cartCount = cartRestaurantId === id ? totalItems() : 0;
  const cartTotal = cartRestaurantId === id ? totalPrice() : 0;

  function getItemQuantity(menuItemId: string) {
    return cartItems.find((item) => item.id === menuItemId)?.quantity ?? 0;
  }

  function addToCart(menuItem: MenuItem) {
    if (!restaurant) return;

    const cartItem = {
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      imageUrl: menuItem.imageUrl,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      quantity: 1,
    };

    if (cartRestaurantId && cartRestaurantId !== restaurant.id) {
      Alert.alert(
        'Replace cart?',
        `Your cart has items from ${cartRestaurantName}. Clear it and add from ${restaurant.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear & Add',
            style: 'destructive',
            onPress: () => {
              clearCart();
              addItem(cartItem);
            },
          },
        ],
      );
      return;
    }

    addItem(cartItem);
  }

  function goToCart() {
    router.push('/(customer)/cart');
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  if (!restaurant) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundTitle}>Restaurant not found</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          cartCount > 0 && styles.scrollContentWithBar,
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          {restaurant.imageUrl ? (
            <Image source={{ uri: restaurant.imageUrl }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Text style={styles.heroPlaceholderText}>🍽️</Text>
            </View>
          )}
          <View style={styles.heroOverlay} />
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{restaurant.name}</Text>
            <View
              style={[
                styles.statusBadge,
                restaurant.isOpen ? styles.statusOpen : styles.statusClosed,
              ]}>
              <Text
                style={[
                  styles.statusText,
                  restaurant.isOpen ? styles.statusTextOpen : styles.statusTextClosed,
                ]}>
                {restaurant.isOpen ? 'Open' : 'Closed'}
              </Text>
            </View>
          </View>

          <Text style={styles.cuisine}>{restaurant.cuisineType}</Text>
          {restaurant.description ? (
            <Text style={styles.description}>{restaurant.description}</Text>
          ) : null}
          <Text style={styles.address}>{restaurant.address}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>⭐ {formatRating(restaurant.rating)}</Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.metaText}>25-35 min</Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.metaText}>Free delivery</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}>
          <Pressable
            style={[styles.categoryChip, !selectedCategoryId && styles.categoryChipActive]}
            onPress={() => setSelectedCategoryId(null)}>
            <Text
              style={[
                styles.categoryChipText,
                !selectedCategoryId && styles.categoryChipTextActive,
              ]}>
              All
            </Text>
          </Pressable>
          {categories.map((category) => {
            const active = selectedCategoryId === category.id;
            return (
              <Pressable
                key={category.id}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setSelectedCategoryId(category.id)}>
                <Text
                  style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.menuHeading}>Menu</Text>

        {groupedSections.length === 0 ? (
          <View style={styles.emptyMenu}>
            <Text style={styles.emptyMenuEmoji}>🍴</Text>
            <Text style={styles.emptyMenuTitle}>No items available</Text>
            <Text style={styles.emptyMenuText}>Check back later for this restaurant&apos;s menu</Text>
          </View>
        ) : (
          groupedSections.map((section) => (
            <View key={section.title} style={styles.section}>
              {!selectedCategoryId ? (
                <Text style={styles.sectionTitle}>{section.title}</Text>
              ) : null}
              {section.data.map((item) => {
                const quantity = getItemQuantity(item.id);
                return (
                  <View key={item.id} style={styles.menuCard}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.menuImage} />
                    ) : (
                      <View style={[styles.menuImage, styles.menuImagePlaceholder]}>
                        <Text>🍕</Text>
                      </View>
                    )}
                    <View style={styles.menuBody}>
                      <Text style={styles.menuName}>{item.name}</Text>
                      {item.description ? (
                        <Text style={styles.menuDescription} numberOfLines={2}>
                          {item.description}
                        </Text>
                      ) : null}
                      <Text style={styles.menuPrice}>{formatPrice(item.price)}</Text>
                    </View>

                    {quantity > 0 ? (
                      <View style={styles.qtyControls}>
                        <Pressable
                          style={styles.qtyButton}
                          onPress={() => decrementItem(item.id)}>
                          <Text style={styles.qtyButtonText}>−</Text>
                        </Pressable>
                        <Text style={styles.qtyValue}>{quantity}</Text>
                        <Pressable
                          style={styles.qtyButton}
                          onPress={() => incrementItem(item.id)}>
                          <Text style={styles.qtyButtonText}>+</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.addButton}
                        onPress={() => addToCart(item)}
                        disabled={!restaurant.isOpen}>
                        <Text style={styles.addButtonText}>Add</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {cartCount > 0 ? (
        <Pressable style={styles.cartBar} onPress={goToCart}>
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount}</Text>
          </View>
          <Text style={styles.cartBarText}>View cart</Text>
          <Text style={styles.cartBarPrice}>{formatPrice(cartTotal)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  scrollContentWithBar: {
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  notFoundTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  heroWrap: {
    position: 'relative',
    height: 220,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: {
    fontSize: 48,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  backButton: {
    position: 'absolute',
    top: 48,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#111',
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: -24,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusOpen: {
    backgroundColor: '#DCFCE7',
  },
  statusClosed: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextOpen: {
    color: '#16A34A',
  },
  statusTextClosed: {
    color: '#DC2626',
  },
  cuisine: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '600',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  address: {
    fontSize: 13,
    color: '#777',
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 13,
    color: '#444',
    fontWeight: '600',
  },
  dot: {
    marginHorizontal: 6,
    color: '#CCC',
  },
  categoryRow: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  categoryChipActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  menuHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 8,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
    marginTop: 4,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  menuImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#F3F3F3',
  },
  menuImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBody: {
    flex: 1,
  },
  menuName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 12,
    color: '#777',
    marginBottom: 6,
    lineHeight: 16,
  },
  menuPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF6B35',
  },
  addButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF4EF',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
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
    lineHeight: 20,
  },
  qtyValue: {
    minWidth: 18,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  emptyMenu: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyMenuEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyMenuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  emptyMenuText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  cartBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#FF6B35',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cartBadge: {
    backgroundColor: '#fff',
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cartBadgeText: {
    color: '#FF6B35',
    fontWeight: '800',
    fontSize: 13,
  },
  cartBarText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cartBarPrice: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
