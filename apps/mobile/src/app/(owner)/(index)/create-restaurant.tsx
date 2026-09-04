import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { api } from '@/lib/axios';
import { useImageUploader } from '../../../lib/uploadthing';

export default function CreateRestaurantScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const { openImagePicker, isUploading } = useImageUploader('restaurantImage', {
    onClientUploadComplete: (result) => {
      setImageUrl(result[0].url);
      Alert.alert('Image uploaded successfully');
    },
    onUploadError: (error: Error) => {
      Alert.alert('Error While Uploading Image', error.message);
    },
  });
  const { mutate: createRestaurant, isPending } = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/restaurants', {
        name,
        description,
        address,
        cuisineType,
        imageUrl,
      });
      return data;
    },
    onSuccess: (restaurant) => {
      queryClient.setQueryData(['my-restaurants'], restaurant);
      Alert.alert('Restaurant created successfully');
      router.replace('/(owner)/(index)');
    },
    onError: (error) => {
      Alert.alert('Error While Creating Restaurant', error.message);
    },
  });

  function handleSubmit() {
    if (!name.trim() || !address.trim() || !cuisineType.trim()) {
      Alert.alert('Please fill all fields');
      return;
    }
    createRestaurant();
  }

  function pickImage() {
    void openImagePicker({
      source: 'library',
      onInsufficientPermissions: () => {
        Alert.alert(
          'No permissions',
          'You need to grant permission to your Photos',
          [
            { text: 'Dismiss' },
            {
              text: 'Open Settings',
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
      },
    });
  }

  const isBusy = isPending || isUploading;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Create restaurant</Text>
          <Text style={styles.subtitle}>
            Add a photo and the basics so customers can find you
          </Text>
        </View>

        <Pressable
          style={styles.imagePicker}
          onPress={pickImage}
          disabled={isBusy}>
          {imageUrl ? (
            <>
              <Image source={{ uri: imageUrl }} style={styles.image} />
              <View style={styles.imageOverlay}>
                <Text style={styles.imageOverlayText}>
                  {isUploading ? 'Uploading…' : 'Change photo'}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.imagePlaceholder}>
              {isUploading ? (
                <ActivityIndicator color="#FF6B35" />
              ) : (
                <>
                  <View style={styles.imageIcon}>
                    <Text style={styles.imageIconText}>+</Text>
                  </View>
                  <Text style={styles.imagePickerTitle}>Add cover photo</Text>
                  <Text style={styles.imagePickerHint}>Tap to upload from gallery</Text>
                </>
              )}
            </View>
          )}
        </Pressable>

        <View style={styles.field}>
          <Text style={styles.label}>Restaurant name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Spice Garden"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Tell customers what you serve"
            placeholderTextColor="#999"
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Street, city"
            placeholderTextColor="#999"
            value={address}
            onChangeText={setAddress}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Cuisine type</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Italian, Chinese"
            placeholderTextColor="#999"
            value={cuisineType}
            onChangeText={setCuisineType}
          />
        </View>

        <Pressable
          style={[styles.button, isBusy && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isBusy}>
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create restaurant</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  imagePicker: {
    height: 200,
    borderRadius: 16,
    backgroundColor: '#FFF4EF',
    borderWidth: 1.5,
    borderColor: '#FFD4C2',
    marginBottom: 24,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageOverlayText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imageIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  imageIconText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },
  imagePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  imagePickerHint: {
    fontSize: 13,
    color: '#888',
  },
  field: {
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
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#111',
  },
  multiline: {
    minHeight: 96,
    paddingTop: 14,
  },
  button: {
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
