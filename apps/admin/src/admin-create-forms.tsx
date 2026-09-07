import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';

import type { AdminRequest } from './api';
import type {
  AdminOffer,
  AdminRestaurant,
  AdminUser,
  OfferDiscountType,
  Paginated,
  UserRole,
} from './domain';
import { getErrorMessage, Modal, Notice } from './ui';
import { uploadMenuItemImage, uploadRestaurantImage } from './uploadthing';

type MenuCategoryRow = {
  id: string;
  name: string;
  restaurantId: string;
  createdAt: string;
};

type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  restaurantId: string;
  categoryId: string;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

function MenuItemImageField({
  disabled,
  imageUrl,
  onChange,
  restaurantId,
}: {
  disabled?: boolean;
  imageUrl: string;
  onChange: (url: string) => void;
  restaurantId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputId = useId();

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      onChange(await uploadMenuItemImage(file, restaurantId));
    } catch (error) {
      setUploadError(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="thumb-field">
      <span className="thumb-field__label">Item photo</span>
      <div className="thumb-row">
        <div className={`thumb-preview${imageUrl ? '' : ' thumb-preview--empty'}`}>
          {imageUrl ? (
            <img alt="" src={imageUrl} />
          ) : (
            <span aria-hidden="true">◇</span>
          )}
        </div>
        <div className="thumb-row__actions">
          <input
            accept="image/*"
            className="sr-only"
            disabled={disabled || uploading}
            id={fileInputId}
            onChange={onFileChange}
            type="file"
          />
          <label
            className="button button--small button--secondary"
            htmlFor={fileInputId}>
            {uploading ? 'Uploading…' : imageUrl ? 'Replace' : 'Choose image'}
          </label>
          {imageUrl ? (
            <button
              className="button button--small button--secondary"
              disabled={disabled || uploading}
              onClick={() => onChange('')}
              type="button">
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {uploadError ? <Notice type="error">{uploadError}</Notice> : null}
    </div>
  );
}

function RestaurantImageField({
  disabled,
  imageUrl,
  onChange,
  restaurantId,
}: {
  disabled?: boolean;
  imageUrl: string;
  onChange: (url: string) => void;
  restaurantId?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputId = useId();

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadError('');
    setUploading(true);
    try {
      onChange(await uploadRestaurantImage(file, restaurantId));
      setShowUrlInput(false);
    } catch (error) {
      setUploadError(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="cover-field">
      <div className={`cover-card${imageUrl ? ' cover-card--filled' : ''}`}>
        {imageUrl ? (
          <img alt="Restaurant cover" className="cover-card__image" src={imageUrl} />
        ) : (
          <div className="cover-card__empty">
            <span aria-hidden="true">⌂</span>
            <p>No cover photo</p>
          </div>
        )}
        <div className="cover-card__actions">
          <input
            accept="image/*"
            className="sr-only"
            disabled={disabled || uploading}
            id={fileInputId}
            onChange={onFileChange}
            type="file"
          />
          <label
            className={`button button--small ${imageUrl ? 'button--secondary' : 'button--primary'} cover-card__upload`}
            htmlFor={fileInputId}>
            {uploading ? 'Uploading…' : imageUrl ? 'Replace' : 'Upload photo'}
          </label>
          {imageUrl ? (
            <button
              className="button button--small button--secondary"
              disabled={disabled || uploading}
              onClick={() => onChange('')}
              type="button">
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <button
        className="text-button cover-field__link"
        disabled={disabled || uploading}
        onClick={() => setShowUrlInput((open) => !open)}
        type="button">
        {showUrlInput ? 'Hide image URL' : 'Paste image URL instead'}
      </button>
      {showUrlInput ? (
        <label className="field">
          <span>Image URL</span>
          <input
            disabled={disabled || uploading}
            onChange={(event) => onChange(event.target.value)}
            placeholder="https://…"
            type="url"
            value={imageUrl}
          />
        </label>
      ) : null}
      {uploadError ? <Notice type="error">{uploadError}</Notice> : null}
    </div>
  );
}

type CreateUserDialogProps = {
  onClose: () => void;
  onCreated: () => void;
  request: AdminRequest;
};

export function CreateUserDialog({
  onClose,
  onCreated,
  request,
}: CreateUserDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('CUSTOMER');
  const [activateImmediately, setActivateImmediately] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await request('/admin/users', {
        method: 'POST',
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          activateImmediately:
            role === 'CUSTOMER' || role === 'ADMIN' ? true : activateImmediately,
        },
      });
      onCreated();
      onClose();
    } catch (submissionError) {
      setError(getErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      description="Add a customer, driver, owner, or admin."
      onClose={submitting ? () => undefined : onClose}
      title="Create account">
      <form className="modal__form" onSubmit={submit}>
        <div className="form-section">
          <p className="form-section__title">Profile</p>
          <div className="form-grid-2">
            <label className="field">
              <span>First name *</span>
              <input
                disabled={submitting}
                maxLength={80}
                onChange={(event) => setFirstName(event.target.value)}
                required
                value={firstName}
              />
            </label>
            <label className="field">
              <span>Last name *</span>
              <input
                disabled={submitting}
                maxLength={80}
                onChange={(event) => setLastName(event.target.value)}
                required
                value={lastName}
              />
            </label>
          </div>
          <label className="field">
            <span>Email *</span>
            <input
              disabled={submitting}
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="field">
            <span>Password * · min 8 characters</span>
            <input
              disabled={submitting}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
        </div>
        <div className="form-section">
          <p className="form-section__title">Access</p>
          <label className="field">
            <span>Role *</span>
            <select
              disabled={submitting}
              onChange={(event) => setRole(event.target.value as UserRole)}
              value={role}>
              <option value="CUSTOMER">Customer</option>
              <option value="DRIVER">Driver</option>
              <option value="RESTAURANT_OWNER">Restaurant owner</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </label>
          {role === 'DRIVER' || role === 'RESTAURANT_OWNER' ? (
            <label className="check-field">
              <input
                checked={activateImmediately}
                disabled={submitting}
                onChange={(event) => setActivateImmediately(event.target.checked)}
                type="checkbox"
              />
              <span>Activate now (skip pending approval)</span>
            </label>
          ) : null}
        </div>
        {error ? <Notice type="error">{error}</Notice> : null}
        <div className="modal__actions">
          <button
            className="button button--secondary"
            disabled={submitting}
            onClick={onClose}
            type="button">
            Cancel
          </button>
          <button className="button button--primary" disabled={submitting} type="submit">
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type CreateRestaurantDialogProps = {
  onClose: () => void;
  onCreated: () => void;
  request: AdminRequest;
};

export function CreateRestaurantDialog({
  onClose,
  onCreated,
  request,
}: CreateRestaurantDialogProps) {
  const [owners, setOwners] = useState<AdminUser[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [name, setName] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [approveImmediately, setApproveImmediately] = useState(true);
  const [error, setError] = useState('');
  const [loadingOwners, setLoadingOwners] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let current = true;
    void request<Paginated<AdminUser>>(
      '/admin/users?role=RESTAURANT_OWNER&accountStatus=ACTIVE&pageSize=100',
    )
      .then((data) => {
        if (!current) return;
        setOwners(data.items);
        if (data.items[0]) setOwnerId(data.items[0].id);
      })
      .catch((loadError: unknown) => {
        if (current) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (current) setLoadingOwners(false);
      });
    return () => {
      current = false;
    };
  }, [request]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerId) {
      setError('Create and activate a restaurant owner account first.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await request('/admin/restaurants', {
        method: 'POST',
        body: {
          ownerId,
          name: name.trim(),
          cuisineType: cuisineType.trim(),
          address: address.trim(),
          description: description.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          approveImmediately,
        },
      });
      onCreated();
      onClose();
    } catch (submissionError) {
      setError(getErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      description="Attach a store to an active owner."
      onClose={submitting ? () => undefined : onClose}
      title="Create restaurant">
      <form className="modal__form" onSubmit={submit}>
        <div className="form-section">
          <p className="form-section__title">Owner</p>
          <label className="field">
            <span>Owner account *</span>
            <select
              disabled={submitting || loadingOwners}
              onChange={(event) => setOwnerId(event.target.value)}
              required
              value={ownerId}>
              {owners.length === 0 ? (
                <option value="">No active owners found</option>
              ) : (
                owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.firstName} {owner.lastName} · {owner.email}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        <div className="form-section">
          <p className="form-section__title">Basics</p>
          <div className="form-grid-2">
            <label className="field">
              <span>Restaurant name *</span>
              <input
                disabled={submitting}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="field">
              <span>Cuisine *</span>
              <input
                disabled={submitting}
                maxLength={100}
                onChange={(event) => setCuisineType(event.target.value)}
                placeholder="e.g. Indian, Emirati"
                required
                value={cuisineType}
              />
            </label>
          </div>
          <label className="field">
            <span>Address *</span>
            <input
              disabled={submitting}
              maxLength={300}
              onChange={(event) => setAddress(event.target.value)}
              required
              value={address}
            />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              disabled={submitting}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short description for customers"
              rows={3}
              value={description}
            />
          </label>
        </div>

        <div className="form-section">
          <p className="form-section__title">Cover photo</p>
          <RestaurantImageField
            disabled={submitting}
            imageUrl={imageUrl}
            onChange={setImageUrl}
          />
        </div>

        <div className="form-section">
          <p className="form-section__title">Moderation</p>
          <label className="switch-field">
            <input
              checked={approveImmediately}
              disabled={submitting}
              onChange={(event) => setApproveImmediately(event.target.checked)}
              type="checkbox"
            />
            <span className="switch-field__track" aria-hidden="true" />
            <span className="switch-field__copy">
              <strong>
                {approveImmediately ? 'Approve immediately' : 'Keep pending'}
              </strong>
              <small>
                {approveImmediately
                  ? 'Store can appear in discovery after create.'
                  : 'Needs a later moderation approval.'}
              </small>
            </span>
          </label>
        </div>

        {error ? <Notice type="error">{error}</Notice> : null}
        <div className="modal__actions">
          <button
            className="button button--secondary"
            disabled={submitting}
            onClick={onClose}
            type="button">
            Cancel
          </button>
          <button className="button button--primary" disabled={submitting} type="submit">
            {submitting ? 'Creating…' : 'Create restaurant'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type EditRestaurantDialogProps = {
  item: AdminRestaurant;
  onClose: () => void;
  onUpdated: () => void;
  request: AdminRequest;
};

export function EditRestaurantDialog({
  item,
  onClose,
  onUpdated,
  request,
}: EditRestaurantDialogProps) {
  const restaurant = item.restaurant;
  const [name, setName] = useState(restaurant.name);
  const [cuisineType, setCuisineType] = useState(restaurant.cuisineType ?? '');
  const [address, setAddress] = useState(restaurant.address);
  const [description, setDescription] = useState(restaurant.description ?? '');
  const [imageUrl, setImageUrl] = useState(restaurant.imageUrl ?? '');
  const [isOpen, setIsOpen] = useState(restaurant.isOpen);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await request(`/admin/restaurants/${restaurant.id}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          cuisineType: cuisineType.trim(),
          address: address.trim(),
          description: description.trim() || null,
          imageUrl: imageUrl.trim() || null,
          isOpen,
        },
      });
      onUpdated();
      onClose();
    } catch (submissionError) {
      setError(getErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      description="Update name, cuisine, address, cover photo, and open status."
      onClose={submitting ? () => undefined : onClose}
      title="Edit restaurant">
      <form className="modal__form" onSubmit={submit}>
        <div className="owner-chip">
          <span className="avatar" aria-hidden="true">
            {item.owner.firstName.charAt(0).toUpperCase() || '?'}
          </span>
          <div>
            <strong>
              {item.owner.firstName} {item.owner.lastName}
            </strong>
            <small>{item.owner.email ?? 'No email'}</small>
          </div>
        </div>

        <div className="form-section">
          <p className="form-section__title">Basics</p>
          <div className="form-grid-2">
            <label className="field">
              <span>Restaurant name *</span>
              <input
                disabled={submitting}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="field">
              <span>Cuisine *</span>
              <input
                disabled={submitting}
                maxLength={100}
                onChange={(event) => setCuisineType(event.target.value)}
                required
                value={cuisineType}
              />
            </label>
          </div>
          <label className="field">
            <span>Address *</span>
            <input
              disabled={submitting}
              maxLength={300}
              onChange={(event) => setAddress(event.target.value)}
              required
              value={address}
            />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              disabled={submitting}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short description for customers"
              rows={3}
              value={description}
            />
          </label>
        </div>

        <div className="form-section">
          <p className="form-section__title">Cover photo</p>
          <RestaurantImageField
            disabled={submitting}
            imageUrl={imageUrl}
            onChange={setImageUrl}
            restaurantId={restaurant.id}
          />
        </div>

        <div className="form-section">
          <p className="form-section__title">Availability</p>
          <label className="switch-field">
            <input
              checked={isOpen}
              disabled={submitting}
              onChange={(event) => setIsOpen(event.target.checked)}
              type="checkbox"
            />
            <span className="switch-field__track" aria-hidden="true" />
            <span className="switch-field__copy">
              <strong>{isOpen ? 'Open for orders' : 'Closed'}</strong>
              <small>
                {isOpen
                  ? 'Customers can place orders now.'
                  : 'Hidden from ordering until reopened.'}
              </small>
            </span>
          </label>
        </div>

        {error ? <Notice type="error">{error}</Notice> : null}
        <div className="modal__actions">
          <button
            className="button button--secondary"
            disabled={submitting}
            onClick={onClose}
            type="button">
            Cancel
          </button>
          <button className="button button--primary" disabled={submitting} type="submit">
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type ManageMenuDialogProps = {
  item: AdminRestaurant;
  onClose: () => void;
  request: AdminRequest;
};

/** Categories + items in one workspace (keeps restaurant profile edit separate). */
export function ManageCategoriesDialog({
  item,
  onClose,
  request,
}: ManageMenuDialogProps) {
  const restaurantId = item.restaurant.id;
  const [categories, setCategories] = useState<MenuCategoryRow[]>([]);
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ?? null;
  const categoryItems = items.filter(
    (menuItem) => menuItem.categoryId === selectedCategoryId,
  );

  function resetItemForm() {
    setEditingItemId(null);
    setItemName('');
    setItemDescription('');
    setItemPrice('');
    setItemImageUrl('');
  }

  async function loadMenu() {
    setLoading(true);
    setError('');
    try {
      const [categoryRows, itemRows] = await Promise.all([
        request<MenuCategoryRow[]>(
          `/admin/restaurants/${restaurantId}/categories`,
        ),
        request<MenuItemRow[]>(`/admin/restaurants/${restaurantId}/menu-items`),
      ]);
      setCategories(categoryRows);
      setItems(itemRows);
      setSelectedCategoryId((current) => {
        if (current && categoryRows.some((row) => row.id === current)) {
          return current;
        }
        return categoryRows[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = categoryName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await request<MenuCategoryRow>(
        `/admin/restaurants/${restaurantId}/categories`,
        { method: 'POST', body: { name: trimmed } },
      );
      setCategoryName('');
      setNotice(`Category “${created.name}” added. Add items on the right.`);
      await loadMenu();
      setSelectedCategoryId(created.id);
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(categoryId: string) {
    const trimmed = editingCategoryName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(
        `/admin/restaurants/${restaurantId}/categories/${categoryId}`,
        { method: 'PATCH', body: { name: trimmed } },
      );
      setEditingCategoryId(null);
      setNotice('Category renamed.');
      await loadMenu();
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(categoryId: string, name: string) {
    if (
      !window.confirm(
        `Delete category “${name}”? Remove or move its items first.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(
        `/admin/restaurants/${restaurantId}/categories/${categoryId}`,
        { method: 'DELETE' },
      );
      if (selectedCategoryId === categoryId) {
        setSelectedCategoryId(null);
        resetItemForm();
      }
      setNotice('Category deleted.');
      await loadMenu();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  }

  function startEditItem(menuItem: MenuItemRow) {
    setEditingItemId(menuItem.id);
    setSelectedCategoryId(menuItem.categoryId);
    setItemName(menuItem.name);
    setItemDescription(menuItem.description ?? '');
    setItemPrice(menuItem.price);
    setItemImageUrl(menuItem.imageUrl ?? '');
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCategoryId) {
      setError('Select or create a category first.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = {
        categoryId: selectedCategoryId,
        name: itemName.trim(),
        description: itemDescription.trim() || undefined,
        price: itemPrice.trim(),
        imageUrl: itemImageUrl.trim() || undefined,
      };
      if (editingItemId) {
        await request(
          `/admin/restaurants/${restaurantId}/menu-items/${editingItemId}`,
          { method: 'PATCH', body },
        );
        setNotice('Menu item updated.');
      } else {
        await request(`/admin/restaurants/${restaurantId}/menu-items`, {
          method: 'POST',
          body,
        });
        setNotice('Menu item added.');
      }
      resetItemForm();
      await loadMenu();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function toggleItemAvailability(menuItem: MenuItemRow) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(
        `/admin/restaurants/${restaurantId}/menu-items/${menuItem.id}`,
        {
          method: 'PATCH',
          body: { isAvailable: !menuItem.isAvailable },
        },
      );
      setNotice(
        menuItem.isAvailable
          ? 'Item marked unavailable.'
          : 'Item marked available.',
      );
      await loadMenu();
    } catch (toggleError) {
      setError(getErrorMessage(toggleError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(menuItem: MenuItemRow) {
    if (!window.confirm(`Delete “${menuItem.name}”?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(
        `/admin/restaurants/${restaurantId}/menu-items/${menuItem.id}`,
        { method: 'DELETE' },
      );
      if (editingItemId === menuItem.id) resetItemForm();
      setNotice('Menu item deleted.');
      await loadMenu();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      description={`Categories on the left, dishes for the selected category on the right.`}
      onClose={busy ? () => undefined : onClose}
      title="Manage menu"
      wide>
      <div className="menu-workspace">
        <section className="menu-workspace__panel">
          <h3 className="menu-workspace__heading">1. Categories</h3>
          <form className="inline-add-row" onSubmit={createCategory}>
            <label className="field field--grow">
              <span>New category</span>
              <input
                disabled={busy}
                maxLength={80}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Starters, Mains…"
                value={categoryName}
              />
            </label>
            <button
              className="button button--primary"
              disabled={busy || !categoryName.trim()}
              type="submit">
              Add
            </button>
          </form>

          {loading ? <p className="muted-copy">Loading…</p> : null}
          {!loading && categories.length === 0 ? (
            <p className="muted-copy">
              Add a category first, then create menu items for it.
            </p>
          ) : null}

          <ul className="category-list">
            {categories.map((category) => {
              const count = items.filter(
                (menuItem) => menuItem.categoryId === category.id,
              ).length;
              const active = category.id === selectedCategoryId;
              return (
                <li
                  className={`category-list__item ${active ? 'category-list__item--active' : ''}`}
                  key={category.id}>
                  {editingCategoryId === category.id ? (
                    <>
                      <input
                        disabled={busy}
                        maxLength={80}
                        onChange={(event) =>
                          setEditingCategoryName(event.target.value)
                        }
                        value={editingCategoryName}
                      />
                      <div className="action-menu">
                        <button
                          className="button button--small button--primary"
                          disabled={busy || !editingCategoryName.trim()}
                          onClick={() => void saveCategory(category.id)}
                          type="button">
                          Save
                        </button>
                        <button
                          className="button button--small button--secondary"
                          disabled={busy}
                          onClick={() => setEditingCategoryId(null)}
                          type="button">
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        className="category-select"
                        disabled={busy}
                        onClick={() => {
                          setSelectedCategoryId(category.id);
                          resetItemForm();
                        }}
                        type="button">
                        <strong>{category.name}</strong>
                        <small>
                          {count} item{count === 1 ? '' : 's'}
                        </small>
                      </button>
                      <div className="action-menu">
                        <button
                          className="button button--small button--secondary"
                          disabled={busy}
                          onClick={() => {
                            setEditingCategoryId(category.id);
                            setEditingCategoryName(category.name);
                          }}
                          type="button">
                          Rename
                        </button>
                        <button
                          className="button button--small button--danger-outline"
                          disabled={busy}
                          onClick={() =>
                            void deleteCategory(category.id, category.name)
                          }
                          type="button">
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="menu-workspace__panel">
          <h3 className="menu-workspace__heading">
            2. Items
            {selectedCategory ? ` · ${selectedCategory.name}` : ''}
          </h3>

          {!selectedCategory ? (
            <p className="muted-copy">
              Select a category on the left to add dishes.
            </p>
          ) : (
            <>
              <ul className="menu-item-list">
                {categoryItems.length === 0 ? (
                  <li className="muted-copy">
                    No items in this category yet. Use the form below.
                  </li>
                ) : (
                  categoryItems.map((menuItem) => (
                    <li className="menu-item-list__row" key={menuItem.id}>
                      {menuItem.imageUrl ? (
                        <img alt="" src={menuItem.imageUrl} />
                      ) : (
                        <div className="menu-item-list__placeholder" />
                      )}
                      <div className="menu-item-list__copy">
                        <strong>{menuItem.name}</strong>
                        <small>
                          AED {menuItem.price}
                          {menuItem.isAvailable ? '' : ' · Unavailable'}
                        </small>
                      </div>
                      <div className="action-menu">
                        <button
                          className="button button--small button--secondary"
                          disabled={busy}
                          onClick={() => startEditItem(menuItem)}
                          type="button">
                          Edit
                        </button>
                        <button
                          className="button button--small button--secondary"
                          disabled={busy}
                          onClick={() => void toggleItemAvailability(menuItem)}
                          type="button">
                          {menuItem.isAvailable ? 'Hide' : 'Show'}
                        </button>
                        <button
                          className="button button--small button--danger-outline"
                          disabled={busy}
                          onClick={() => void deleteItem(menuItem)}
                          type="button">
                          Delete
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>

              <form className="menu-item-form" onSubmit={submitItem}>
                <h4 className="menu-workspace__subheading">
                  {editingItemId ? 'Edit item' : 'Add item to this category'}
                </h4>
                <div className="form-grid-2">
                  <label className="field">
                    <span>Name *</span>
                    <input
                      disabled={busy}
                      maxLength={140}
                      onChange={(event) => setItemName(event.target.value)}
                      required
                      value={itemName}
                    />
                  </label>
                  <label className="field">
                    <span>Price (AED) *</span>
                    <input
                      disabled={busy}
                      inputMode="decimal"
                      onChange={(event) => setItemPrice(event.target.value)}
                      pattern="^(?:0|[1-9]\d*)(?:\.\d{1,2})?$"
                      placeholder="12.50"
                      required
                      value={itemPrice}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Description</span>
                  <textarea
                    disabled={busy}
                    maxLength={1000}
                    onChange={(event) => setItemDescription(event.target.value)}
                    rows={2}
                    value={itemDescription}
                  />
                </label>
                <MenuItemImageField
                  disabled={busy}
                  imageUrl={itemImageUrl}
                  onChange={setItemImageUrl}
                  restaurantId={restaurantId}
                />
                <div className="modal__actions">
                  {editingItemId ? (
                    <button
                      className="button button--secondary"
                      disabled={busy}
                      onClick={resetItemForm}
                      type="button">
                      Cancel edit
                    </button>
                  ) : null}
                  <button
                    className="button button--primary"
                    disabled={busy}
                    type="submit">
                    {editingItemId ? 'Save item' : 'Add item'}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      {error ? <Notice type="error">{error}</Notice> : null}
      {notice ? <Notice type="success">{notice}</Notice> : null}
      <div className="modal__actions">
        <button
          className="button button--secondary"
          disabled={busy}
          onClick={onClose}
          type="button">
          Done
        </button>
      </div>
    </Modal>
  );
}

type CreateOfferDialogProps = {
  onClose: () => void;
  onCreated: () => void;
  request: AdminRequest;
};

export function CreateOfferDialog({
  onClose,
  onCreated,
  request,
}: CreateOfferDialogProps) {
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState('');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [discountType, setDiscountType] =
    useState<OfferDiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('10');
  const [minimumOrderAmount, setMinimumOrderAmount] = useState('0');
  const [usageLimit, setUsageLimit] = useState('');
  const [isFeatured, setIsFeatured] = useState(true);
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 14);
    return toLocalInput(end);
  });
  const [error, setError] = useState('');
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let current = true;
    void request<Paginated<AdminRestaurant>>(
      '/admin/restaurants?moderationStatus=APPROVED&pageSize=100',
    )
      .then((data) => {
        if (!current) return;
        setRestaurants(data.items);
        if (data.items[0]) setRestaurantId(data.items[0].restaurant.id);
      })
      .catch((loadError: unknown) => {
        if (current) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (current) setLoadingRestaurants(false);
      });
    return () => {
      current = false;
    };
  }, [request]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restaurantId) {
      setError('Approve a restaurant before creating offers.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await request('/admin/offers', {
        method: 'POST',
        body: {
          restaurantId,
          title: title.trim(),
          description: description.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          code: code.trim() || undefined,
          discountType,
          discountValue: Number(discountValue),
          minimumOrderAmount: Number(minimumOrderAmount || 0),
          usageLimit: usageLimit ? Number(usageLimit) : undefined,
          isFeatured,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        },
      });
      onCreated();
      onClose();
    } catch (submissionError) {
      setError(getErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      description="Campaign for an approved restaurant."
      onClose={submitting ? () => undefined : onClose}
      title="Create offer">
      <form className="modal__form" onSubmit={submit}>
        <label className="field">
          <span>Restaurant *</span>
          <select
            disabled={submitting || loadingRestaurants}
            onChange={(event) => setRestaurantId(event.target.value)}
            required
            value={restaurantId}>
            {restaurants.length === 0 ? (
              <option value="">No approved restaurants</option>
            ) : (
              restaurants.map((item) => (
                <option key={item.restaurant.id} value={item.restaurant.id}>
                  {item.restaurant.name}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="field">
          <span>Title *</span>
          <input
            disabled={submitting}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <div className="form-grid-2">
          <label className="field">
            <span>Code (optional)</span>
            <input
              disabled={submitting}
              maxLength={32}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              pattern="[A-Za-z0-9_-]{3,32}"
              placeholder="WASIL10"
              value={code}
            />
          </label>
          <label className="field">
            <span>Discount type *</span>
            <select
              disabled={submitting}
              onChange={(event) =>
                setDiscountType(event.target.value as OfferDiscountType)
              }
              value={discountType}>
              <option value="PERCENTAGE">Percentage</option>
              <option value="FIXED_AMOUNT">Fixed amount</option>
            </select>
          </label>
        </div>
        <div className="form-grid-2">
          <label className="field">
            <span>Discount value *</span>
            <input
              disabled={submitting}
              min={0.01}
              onChange={(event) => setDiscountValue(event.target.value)}
              required
              step="0.01"
              type="number"
              value={discountValue}
            />
          </label>
          <label className="field">
            <span>Min order amount</span>
            <input
              disabled={submitting}
              min={0}
              onChange={(event) => setMinimumOrderAmount(event.target.value)}
              step="0.01"
              type="number"
              value={minimumOrderAmount}
            />
          </label>
        </div>
        <label className="field">
          <span>Usage limit (optional)</span>
          <input
            disabled={submitting}
            min={1}
            onChange={(event) => setUsageLimit(event.target.value)}
            type="number"
            value={usageLimit}
          />
        </label>
        <div className="form-grid-2">
          <label className="field">
            <span>Starts *</span>
            <input
              disabled={submitting}
              onChange={(event) => setStartsAt(event.target.value)}
              required
              type="datetime-local"
              value={startsAt}
            />
          </label>
          <label className="field">
            <span>Ends *</span>
            <input
              disabled={submitting}
              onChange={(event) => setEndsAt(event.target.value)}
              required
              type="datetime-local"
              value={endsAt}
            />
          </label>
        </div>
        <label className="field">
          <span>Image URL (HTTPS)</span>
          <input
            disabled={submitting}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://…"
            type="url"
            value={imageUrl}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            disabled={submitting}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            value={description}
          />
        </label>
        <label className="check-field">
          <input
            checked={isFeatured}
            disabled={submitting}
            onChange={(event) => setIsFeatured(event.target.checked)}
            type="checkbox"
          />
          <span>Feature on Hot Offers</span>
        </label>
        {error ? <Notice type="error">{error}</Notice> : null}
        <div className="modal__actions">
          <button
            className="button button--secondary"
            disabled={submitting}
            onClick={onClose}
            type="button">
            Cancel
          </button>
          <button className="button button--primary" disabled={submitting} type="submit">
            {submitting ? 'Creating…' : 'Create offer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type OfferRedemptionRow = {
  id: string;
  orderId: string;
  discountAmount: string;
  status: string;
  createdAt: string;
  redeemedAt: string | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
};

type OfferRedemptionsDialogProps = {
  offer: AdminOffer;
  onClose: () => void;
  request: AdminRequest;
};

export function OfferRedemptionsDialog({
  offer,
  onClose,
  request,
}: OfferRedemptionsDialogProps) {
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    items: OfferRedemptionRow[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  } | null>(null);

  const url = useMemo(
    () => `/admin/offers/${offer.id}/redemptions?page=${page}&pageSize=20`,
    [offer.id, page],
  );

  useEffect(() => {
    let current = true;
    setLoading(true);
    void request<{
      items: OfferRedemptionRow[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }>(url)
      .then((response) => {
        if (!current) return;
        setData(response);
        setError('');
      })
      .catch((loadError: unknown) => {
        if (current) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [request, url]);

  return (
    <Modal
      description={`Redemption history for ${offer.title}. Usage ${offer.usageCount}${offer.usageLimit ? ` / ${offer.usageLimit}` : ''}.`}
      onClose={onClose}
      title="Offer redemptions">
      <div className="modal__form">
        {loading ? <p className="muted-copy">Loading redemptions…</p> : null}
        {error ? <Notice type="error">{error}</Notice> : null}
        {data && data.items.length === 0 ? (
          <p className="muted-copy">No redemptions yet for this campaign.</p>
        ) : null}
        {data && data.items.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Order</th>
                  <th>Discount</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>
                        {row.customer.firstName} {row.customer.lastName}
                      </strong>
                      <small>{row.customer.email}</small>
                    </td>
                    <td>
                      <small>#{row.orderId.slice(0, 8).toUpperCase()}</small>
                    </td>
                    <td>{row.discountAmount}</td>
                    <td>{row.status}</td>
                    <td>
                      <small>
                        {new Date(row.createdAt).toLocaleString('en-AE')}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {data && data.pagination.totalPages > 1 ? (
          <div className="modal__actions">
            <button
              className="button button--secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button">
              Previous
            </button>
            <span className="muted-copy">
              Page {data.pagination.page} / {data.pagination.totalPages}
            </span>
            <button
              className="button button--secondary"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
              type="button">
              Next
            </button>
          </div>
        ) : (
          <div className="modal__actions">
            <button className="button button--secondary" onClick={onClose} type="button">
              Close
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
