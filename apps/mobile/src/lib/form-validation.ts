type Coordinates = {
  latitude: number;
  longitude: number;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginDetails({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address.';
  if (!password) return 'Enter your password.';
  return null;
}

export function validateRegistrationDetails({
  email,
  firstName,
  lastName,
  password,
}: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}) {
  if (firstName.trim().length < 1 || firstName.trim().length > 80) {
    return 'Enter a first name between 1 and 80 characters.';
  }
  if (lastName.trim().length < 1 || lastName.trim().length > 80) {
    return 'Enter a last name between 1 and 80 characters.';
  }
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address.';
  if (password.length < 8) return 'Use a password with at least 8 characters.';
  if (password.length > 128) return 'Keep the password under 128 characters.';
  return null;
}

export function validateCoordinates(coordinates: Coordinates | null) {
  if (!coordinates) return 'Choose an exact location pin before continuing.';

  const { latitude, longitude } = coordinates;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return 'Choose a valid location pin before continuing.';
  }

  return null;
}

export function validateDeliveryDetails({
  address,
  coordinates,
}: {
  address: string;
  coordinates: Coordinates | null;
}) {
  const trimmedAddress = address.trim();
  if (trimmedAddress.length < 5) {
    return 'Enter a complete delivery address with your building, street, or area.';
  }
  if (trimmedAddress.length > 300) {
    return 'Keep the delivery address under 300 characters.';
  }

  return validateCoordinates(coordinates);
}

export function validateRestaurantDetails({
  address,
  cuisineType,
  description,
  name,
}: {
  address: string;
  cuisineType: string;
  description: string;
  name: string;
}) {
  if (name.trim().length < 2) return 'Enter a restaurant name with at least 2 characters.';
  if (name.trim().length > 100) return 'Keep the restaurant name under 100 characters.';
  if (description.trim().length > 500) return 'Keep the description under 500 characters.';
  if (address.trim().length < 5) return 'Enter a complete restaurant address.';
  if (address.trim().length > 300) return 'Keep the restaurant address under 300 characters.';
  if (cuisineType.trim().length < 2) return 'Enter at least one cuisine type.';
  if (cuisineType.trim().length > 100) return 'Keep cuisine type under 100 characters.';
  return null;
}

export function validateCategoryName(value: string) {
  const name = value.trim();
  if (!name) return 'Enter a category name.';
  if (name.length > 80) return 'Keep the category name under 80 characters.';
  return null;
}

export function validateMenuItem({
  categoryId,
  description,
  name,
  price,
}: {
  categoryId: string;
  description: string;
  name: string;
  price: string;
}) {
  if (name.trim().length < 2) return 'Enter an item name with at least 2 characters.';
  if (name.trim().length > 120) return 'Keep the item name under 120 characters.';
  if (description.trim().length > 500) return 'Keep the description under 500 characters.';
  if (!categoryId) return 'Choose a category for this item.';

  const normalizedPrice = price.trim();
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(normalizedPrice)) {
    return 'Enter a valid price with no more than two decimal places.';
  }
  if (Number.parseFloat(normalizedPrice) <= 0) {
    return 'The price must be greater than zero.';
  }

  return null;
}

export function validateReview({
  comment,
  driverRating,
  hasDriver,
  restaurantRating,
}: {
  comment: string;
  driverRating: number;
  hasDriver: boolean;
  restaurantRating: number;
}) {
  if (!Number.isInteger(restaurantRating) || restaurantRating < 1 || restaurantRating > 5) {
    return 'Please rate the restaurant from 1 to 5 stars.';
  }
  if (
    hasDriver &&
    (!Number.isInteger(driverRating) || driverRating < 1 || driverRating > 5)
  ) {
    return 'Please rate the delivery driver from 1 to 5 stars.';
  }
  if (comment.trim().length > 500) {
    return 'Keep your review under 500 characters.';
  }
  return null;
}
