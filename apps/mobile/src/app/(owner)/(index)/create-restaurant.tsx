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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

import { api } from "@/lib/axios";
import {
  getAddressForCoordinates,
  getCurrentCoordinates,
  type Coordinates,
} from "@/lib/location";
import { LocationPicker } from "@/components/location-picker";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  validateCoordinates,
  validateRestaurantDetails,
} from "@/lib/form-validation";
import { useImageUploader } from "../../../lib/uploadthing";

export default function CreateRestaurantScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [cuisineType, setCuisineType] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
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
  const { mutate: createRestaurant, isPending } = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/restaurants", {
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
    onSuccess: (restaurant) => {
      queryClient.setQueryData(["my-restaurants"], restaurant);
      Alert.alert(
        "Restaurant submitted",
        "Your restaurant has been submitted for administrator approval. You can prepare your menu while it is reviewed.",
      );
      router.replace("/(owner)/(index)");
    },
    onError: (error) => {
      Alert.alert("Could not create restaurant", getApiErrorMessage(error));
    },
  });

  function handleSubmit() {
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
    createRestaurant();
  }

  function pickImage() {
    void openImagePicker({
      source: "library",
      input: {},
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
          "You can enter your address manually.",
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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create restaurant</Text>
          <Text style={styles.subtitle}>
            Add a photo and the basics so customers can find you
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
                  ? "Restaurant location saved"
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
            This pin is used for delivery distance. Your address remains visible
            to customers.
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
            <Text style={styles.buttonText}>Create restaurant</Text>
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
                "Add the street, building, or area before creating the restaurant.",
              );
            })
            .catch(() =>
              Alert.alert(
                "Map pin selected",
                "Add the street, building, or area before creating the restaurant.",
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
