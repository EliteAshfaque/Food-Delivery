import React, { useState } from "react";
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
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import type { Restaurant } from "@food-delivery/types";

import { api } from "@/lib/axios";
import {
  getAddressForCoordinates,
  getCurrentCoordinates,
  type Coordinates,
} from "@/lib/location";
import { LocationPicker } from "@/components/location-picker";
import { RequestErrorState } from "@/components/request-error-state";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  validateCoordinates,
  validateRestaurantDetails,
} from "@/lib/form-validation";
import { useImageUploader } from "../../../lib/uploadthing";

type RestaurantDraft = {
  address?: string;
  coordinates?: Coordinates | null;
  cuisineType?: string;
  description?: string;
  imageUrl?: string | null;
  name?: string;
};

function coordinatesFromRestaurant(restaurant: Restaurant | null | undefined) {
  return restaurant?.latitude != null && restaurant.longitude != null
    ? { latitude: restaurant.latitude, longitude: restaurant.longitude }
    : null;
}

export default function UpdateRestaurantScreen() {
  const queryClient = useQueryClient();
  const {
    data: restaurant,
    error: restaurantError,
    isError: restaurantIsError,
    isLoading,
    refetch: refetchRestaurant,
  } = useQuery<Restaurant | null>({
    queryKey: ["my-restaurants"],
    queryFn: () => api.get("/restaurants/mine").then((res) => res.data),
  });

  // Keep only operator changes in local state. The untouched values are
  // derived from the query result, which avoids an effect that copies API data
  // into state and can overwrite a draft during a background refetch.
  const [draft, setDraft] = useState<RestaurantDraft>({});
  const name = draft.name ?? restaurant?.name ?? "";
  const description = draft.description ?? restaurant?.description ?? "";
  const address = draft.address ?? restaurant?.address ?? "";
  const cuisineType = draft.cuisineType ?? restaurant?.cuisineType ?? "";
  const imageUrl = Object.hasOwn(draft, "imageUrl")
    ? (draft.imageUrl ?? null)
    : (restaurant?.imageUrl ?? null);
  const coordinates = Object.hasOwn(draft, "coordinates")
    ? (draft.coordinates ?? null)
    : coordinatesFromRestaurant(restaurant);
  const setName = (value: string) =>
    setDraft((current) => ({ ...current, name: value }));
  const setDescription = (value: string) =>
    setDraft((current) => ({ ...current, description: value }));
  const setAddress = (value: string) =>
    setDraft((current) => ({ ...current, address: value }));
  const setCuisineType = (value: string) =>
    setDraft((current) => ({ ...current, cuisineType: value }));
  const setImageUrl = (value: string | null) =>
    setDraft((current) => ({ ...current, imageUrl: value }));
  const setCoordinates = (value: Coordinates | null) =>
    setDraft((current) => ({ ...current, coordinates: value }));
  const [locating, setLocating] = useState(false);
  const [isMapPickerVisible, setMapPickerVisible] = useState(false);

  const { openImagePicker, isUploading } = useImageUploader("restaurantImage", {
    onClientUploadComplete: (result) => {
      const image = result[0];
      if (!image?.url) {
        Alert.alert("Image upload failed", "Please choose the image again.");
        return;
      }
      setImageUrl(image.url);
      Alert.alert("Image uploaded successfully");
    },
    onUploadError: (error: Error) => {
      Alert.alert("Image upload failed", getApiErrorMessage(error));
    },
  });

  const { mutate: updateRestaurant, isPending } = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch(`/restaurants/${restaurant?.id}`, {
        name: name.trim(),
        description: description.trim() || undefined,
        address: address.trim(),
        cuisineType: cuisineType.trim(),
        imageUrl,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
      });
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["my-restaurants"], updated);
      Alert.alert("Restaurant updated successfully", "", [
        {
          text: "OK",
          onPress: goHome,
        },
      ]);
    },
    onError: (error) => {
      Alert.alert("Could not update restaurant", getApiErrorMessage(error));
    },
  });

  function handleSubmit() {
    if (!restaurant?.id) {
      Alert.alert("Restaurant unavailable", "Refresh the page and try again.");
      return;
    }

    const detailsError = validateRestaurantDetails({
      name,
      description,
      address,
      cuisineType,
    });
    if (detailsError) {
      Alert.alert("Check restaurant details", detailsError);
      return;
    }

    if (coordinates) {
      const coordinateError = validateCoordinates(coordinates);
      if (coordinateError) {
        Alert.alert("Check restaurant location", coordinateError);
        return;
      }
    }

    updateRestaurant();
  }

  function pickImage() {
    if (!restaurant?.id) {
      Alert.alert("Restaurant unavailable", "Refresh the page and try again.");
      return;
    }

    void openImagePicker({
      source: "library",
      input: { restaurantId: restaurant.id },
      onInsufficientPermissions: () => {
        Alert.alert(
          "No permissions",
          "You need to grant permission to your Photos",
          [
            { text: "Dismiss" },
            {
              text: "Open Settings",
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
      },
    });
  }

  async function requestCurrentLocation() {
    setLocating(true);
    try {
      const coords = await getCurrentCoordinates();
      if (!coords) {
        Alert.alert(
          "Location not shared",
          "You can keep your existing restaurant pin.",
        );
        return;
      }
      setCoordinates(coords);
      const detectedAddress = await getAddressForCoordinates(coords).catch(
        () => null,
      );
      if (detectedAddress) {
        setAddress(detectedAddress);
      } else {
        Alert.alert(
          "Location pin selected",
          "Add the street, building, or area so drivers can find your restaurant.",
        );
      }
      setMapPickerVisible(true);
    } catch {
      Alert.alert(
        "Location unavailable",
        "Please check your device location settings and try again.",
      );
    } finally {
      setLocating(false);
    }
  }

  const isBusy = isPending || isUploading;

  function goHome() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(owner)/(index)");
  }

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  if (restaurantIsError && !restaurant) {
    return (
      <View style={styles.loading}>
        <RequestErrorState
          error={restaurantError}
          onRetry={() => void refetchRestaurant()}
          title="Couldn’t load your restaurant"
        />
      </View>
    );
  }

  if (!restaurant) {
    return (
      <View style={styles.loading}>
        <Text style={styles.emptyTitle}>Restaurant not found</Text>
        <Pressable style={styles.button} onPress={goHome}>
          <Text style={styles.buttonText}>Back to dashboard</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.back} onPress={goHome} hitSlop={12}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Edit restaurant</Text>
          <Text style={styles.subtitle}>
            Update your photo and details so customers see the latest info
          </Text>
        </View>

        <Pressable
          style={styles.imagePicker}
          onPress={pickImage}
          disabled={isBusy}
        >
          {imageUrl ? (
            <>
              <Image source={{ uri: imageUrl }} style={styles.image} />
              <View style={styles.imageOverlay}>
                <Text style={styles.imageOverlayText}>
                  {isUploading ? "Uploading…" : "Change photo"}
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
                  <Text style={styles.imagePickerHint}>
                    Tap to upload from gallery
                  </Text>
                </>
              )}
            </View>
          )}
        </Pressable>

        <View style={styles.field}>
          <Text style={styles.label}>Restaurant name</Text>
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={100}
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
            autoCapitalize="sentences"
            maxLength={500}
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
            autoCapitalize="words"
            maxLength={300}
            style={styles.input}
            placeholder="Street, city"
            placeholderTextColor="#999"
            value={address}
            onChangeText={setAddress}
          />
          <Pressable
            style={styles.locationButton}
            onPress={() => void requestCurrentLocation()}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator color="#FF6B35" />
            ) : (
              <Text style={styles.locationButtonText}>
                {coordinates
                  ? "Update restaurant map pin"
                  : "Use my current restaurant location"}
              </Text>
            )}
          </Pressable>
          <Pressable
            style={styles.mapButton}
            onPress={() => setMapPickerVisible(true)}
          >
            <Text style={styles.mapButtonText}>
              Choose restaurant location on map
            </Text>
          </Pressable>
          <Text style={styles.locationHint}>
            The pin is used to calculate customer distance.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Cuisine type</Text>
          <TextInput
            autoCapitalize="words"
            maxLength={100}
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
          disabled={isBusy}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Save changes</Text>
          )}
        </Pressable>
      </ScrollView>
      <LocationPicker
        initialCoordinates={coordinates}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={(selected) => {
          setCoordinates(selected);
          setMapPickerVisible(false);
          void getAddressForCoordinates(selected)
            .then((detectedAddress) => {
              if (detectedAddress) {
                setAddress(detectedAddress);
                return;
              }
              Alert.alert(
                "Map pin selected",
                "Add the street, building, or area before saving changes.",
              );
            })
            .catch(() =>
              Alert.alert(
                "Map pin selected",
                "Add the street, building, or area before saving changes.",
              ),
            );
        }}
        title="Restaurant location"
        visible={isMapPickerVisible}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  emptyTitle: {
    color: "#111",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  container: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  back: {
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  backText: {
    fontSize: 16,
    color: "#FF6B35",
    fontWeight: "600",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    lineHeight: 22,
  },
  imagePicker: {
    height: 200,
    borderRadius: 16,
    backgroundColor: "#FFF4EF",
    borderWidth: 1.5,
    borderColor: "#FFD4C2",
    marginBottom: 24,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageOverlayText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  imageIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FF6B35",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  imageIconText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "600",
    lineHeight: 30,
  },
  imagePickerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
  },
  imagePickerHint: {
    fontSize: 13,
    color: "#888",
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: "#fafafa",
    color: "#111",
  },
  locationButton: {
    alignItems: "center",
    borderColor: "#FF6B35",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  locationButtonText: { color: "#FF6B35", fontWeight: "600" },
  mapButton: { alignItems: "center", marginTop: 10, padding: 8 },
  mapButtonText: { color: "#444", fontWeight: "600" },
  locationHint: { color: "#666", fontSize: 12, lineHeight: 17, marginTop: 8 },
  multiline: {
    minHeight: 96,
    paddingTop: 14,
  },
  button: {
    backgroundColor: "#FF6B35",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
