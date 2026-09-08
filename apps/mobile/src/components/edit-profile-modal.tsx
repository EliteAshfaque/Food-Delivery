import { useState } from "react";
import { openSettings } from "expo-linking";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/wasil-icon-system";
import { ProfileAvatar } from "@/components/profile-avatar";
import { brand } from "@/constants/brand";
import { useAuth } from "@/context/auth-context";
import { getApiErrorMessage } from "@/lib/api-error";
import { useImageUploader } from "@/lib/uploadthing";

type EditProfileModalProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Short profile edits belong in a bottom sheet: stay in context, keyboard-friendly,
 * one primary action. Full-screen is reserved for denser settings later.
 */
export function EditProfileModal({ visible, onClose }: EditProfileModalProps) {
  const { user } = useAuth();
  // A profile edit is a disposable draft. Remounting it for each opening (and
  // when the authenticated profile changes) initializes the draft from the
  // latest user without a state-reset effect after render.
  const draftKey = [
    visible ? "open" : "closed",
    user?.id ?? "anonymous",
    user?.firstName ?? "",
    user?.lastName ?? "",
    user?.imageUrl ?? "",
  ].join("\u0000");

  return <EditProfileModalDraft key={draftKey} onClose={onClose} visible={visible} />;
}

function EditProfileModalDraft({ visible, onClose }: EditProfileModalProps) {
  const insets = useSafeAreaInsets();
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(() => user?.firstName ?? "");
  const [lastName, setLastName] = useState(() => user?.lastName ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(
    () => user?.imageUrl ?? null,
  );
  const [saving, setSaving] = useState(false);

  const { openImagePicker, isUploading } = useImageUploader("profileImage", {
    onClientUploadComplete: (result) => {
      const uploaded = result[0];
      if (!uploaded?.url) {
        Alert.alert("Photo upload failed", "Please choose the photo again.");
        return;
      }
      setImageUrl(uploaded.url);
    },
    onUploadError: (error: Error) => {
      Alert.alert("Photo upload failed", getApiErrorMessage(error));
    },
  });

  function pickPhoto() {
    void openImagePicker({
      source: "library",
      input: {},
      onInsufficientPermissions: () => {
        Alert.alert(
          "Photos permission needed",
          "Allow photo library access to update your profile picture.",
          [
            { text: "Dismiss" },
            { text: "Open Settings", onPress: () => void openSettings() },
          ],
        );
      },
    });
  }

  async function handleSave() {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      Alert.alert("Check your details", "First and last name are required.");
      return;
    }
    if (trimmedFirst.length > 80 || trimmedLast.length > 80) {
      Alert.alert(
        "Check your details",
        "Each name can be at most 80 characters.",
      );
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        firstName: trimmedFirst,
        lastName: trimmedLast,
        imageUrl,
      });
      onClose();
    } catch (error) {
      Alert.alert("Could not update profile", getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || isUploading;
  const dirty =
    firstName.trim() !== (user?.firstName ?? "").trim() ||
    lastName.trim() !== (user?.lastName ?? "").trim() ||
    imageUrl !== (user?.imageUrl ?? null);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable
          accessibilityLabel="Dismiss edit profile"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />

        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 12 },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Cancel"
              accessibilityRole="button"
              disabled={busy}
              hitSlop={8}
              onPress={onClose}
              style={styles.headerAction}
            >
              <Text style={styles.headerActionText}>Cancel</Text>
            </Pressable>
            <Text style={styles.title}>Edit profile</Text>
            <Pressable
              accessibilityLabel="Save profile"
              accessibilityRole="button"
              disabled={busy || !dirty}
              hitSlop={8}
              onPress={() => void handleSave()}
              style={styles.headerAction}
            >
              {saving ? (
                <ActivityIndicator color={brand.colors.light.primary} />
              ) : (
                <Text
                  style={[
                    styles.headerSaveText,
                    (!dirty || busy) && styles.headerSaveDisabled,
                  ]}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.photoHero}>
              <Pressable
                accessibilityHint="Opens photo library"
                accessibilityLabel="Change profile photo"
                accessibilityRole="button"
                disabled={busy}
                onPress={pickPhoto}
                style={({ pressed }) => [
                  styles.avatarTap,
                  pressed && !busy && styles.pressed,
                ]}
              >
                <ProfileAvatar
                  firstName={firstName}
                  imageUrl={imageUrl}
                  lastName={lastName}
                  size={104}
                />
                <View style={styles.cameraBadge}>
                  {isUploading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <AppIcon color="#FFFFFF" name="camera" size="xs" />
                  )}
                </View>
              </Pressable>
              <Text style={styles.photoHint}>
                {imageUrl ? "Tap to change photo" : "Tap to add a photo"}
              </Text>
              {imageUrl ? (
                <Pressable
                  accessibilityLabel="Remove profile photo"
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => setImageUrl(null)}
                  style={styles.removePhotoButton}
                >
                  <Text style={styles.removePhotoText}>Remove photo</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.fieldCard}>
              <View style={styles.fieldRow}>
                <Text style={styles.label}>First name</Text>
                <TextInput
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!busy}
                  maxLength={80}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor={brand.colors.light.inkMuted}
                  returnKeyType="next"
                  style={styles.input}
                  value={firstName}
                />
              </View>
              <View style={styles.fieldDivider} />
              <View style={styles.fieldRow}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!busy}
                  maxLength={80}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  placeholderTextColor={brand.colors.light.inkMuted}
                  returnKeyType="done"
                  style={styles.input}
                  value={lastName}
                />
              </View>
            </View>

            <View style={styles.emailCard}>
              <AppIcon
                color={brand.colors.light.inkMuted}
                name="email"
                size="sm"
              />
              <View style={styles.emailCopy}>
                <Text style={styles.emailLabel}>Email</Text>
                <Text numberOfLines={1} style={styles.emailValue}>
                  {user?.email ?? "On your account"}
                </Text>
              </View>
              <Text style={styles.emailLocked}>Locked</Text>
            </View>

            <Pressable
              accessibilityLabel="Save changes"
              accessibilityRole="button"
              disabled={busy || !dirty}
              onPress={() => void handleSave()}
              style={({ pressed }) => [
                styles.saveButton,
                (!dirty || busy) && styles.saveDisabled,
                pressed && dirty && !busy && styles.pressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>Save changes</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(37,25,42,0.48)",
  },
  sheet: {
    backgroundColor: brand.colors.light.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "92%",
    paddingHorizontal: 20,
    paddingTop: 10,
    ...brand.shadow,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "rgba(37,25,42,0.16)",
    borderRadius: 999,
    height: 5,
    marginBottom: 12,
    width: 40,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    minHeight: 36,
  },
  headerAction: {
    minWidth: 64,
  },
  headerActionText: {
    color: brand.colors.light.inkMuted,
    fontSize: 16,
    fontWeight: "700",
  },
  headerSaveText: {
    color: brand.colors.light.primary,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right",
  },
  headerSaveDisabled: {
    opacity: 0.35,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  photoHero: {
    alignItems: "center",
    marginBottom: 22,
    marginTop: 10,
  },
  avatarTap: {
    position: "relative",
  },
  cameraBadge: {
    alignItems: "center",
    backgroundColor: brand.colors.light.ink,
    borderColor: brand.colors.light.surface,
    borderRadius: 16,
    borderWidth: 3,
    bottom: 2,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: 2,
    width: 32,
  },
  photoHint: {
    color: brand.colors.light.primaryText,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 12,
  },
  removePhotoButton: {
    marginTop: 8,
    paddingVertical: 4,
  },
  removePhotoText: {
    color: brand.colors.light.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  fieldCard: {
    backgroundColor: brand.colors.light.canvas,
    borderRadius: 18,
    marginBottom: 12,
    overflow: "hidden",
  },
  fieldRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fieldDivider: {
    backgroundColor: brand.colors.light.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
  },
  label: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  input: {
    color: brand.colors.light.ink,
    fontSize: 17,
    fontWeight: "700",
    minHeight: 28,
    padding: 0,
  },
  emailCard: {
    alignItems: "center",
    backgroundColor: brand.colors.light.canvas,
    borderRadius: 18,
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emailCopy: {
    flex: 1,
  },
  emailLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  emailValue: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  emailLocked: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primary,
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 52,
  },
  saveDisabled: {
    opacity: 0.45,
  },
  saveText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
});
