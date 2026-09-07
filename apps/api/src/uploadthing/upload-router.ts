import { createUploadthing, type FileRouter } from 'uploadthing/express';
import type { FileRoute } from 'uploadthing/types';
import type { Request } from 'express';

/**
 * The UploadThing Express route is mounted outside Nest's controller/guard
 * pipeline, so it must perform its own authorization before a presigned URL is
 * issued. This small interface keeps that boundary explicit and testable.
 */
export interface UploadAuthorizer {
  requireRestaurantOwner(
    authorizationHeader: string | undefined,
    restaurantId?: string,
  ): Promise<{
    uploadedBy: string;
    restaurantId: string | null;
  }>;
  requireActiveUser(authorizationHeader: string | undefined): Promise<{
    uploadedBy: string;
  }>;
}

type RestaurantImageInput = { restaurantId?: string };
type MenuItemImageInput = { restaurantId: string };
type ProfileImageInput = Record<string, never>;
type UploadResult = { url: string };

type TypedUploadRoute<TInput> = FileRoute<{
  input: TInput;
  output: UploadResult;
  errorShape: unknown;
}>;

export type UploadRouter = {
  restaurantImage: TypedUploadRoute<RestaurantImageInput>;
  menuItemImage: TypedUploadRoute<MenuItemImageInput>;
  profileImage: TypedUploadRoute<ProfileImageInput>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseInputObject(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Upload input must be an object');
  }
  return input as Record<string, unknown>;
}

function getRestaurantId(
  input: unknown,
  required: boolean,
): string | undefined {
  const value = parseInputObject(input);
  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'restaurantId')) {
    throw new Error('Unexpected upload input');
  }

  const restaurantId = value.restaurantId;
  if (restaurantId === undefined && !required) return undefined;
  if (typeof restaurantId !== 'string' || !UUID_PATTERN.test(restaurantId)) {
    throw new Error('A valid restaurant ID is required');
  }

  return restaurantId;
}

// UploadThing accepts any Zod-like parser. Keeping this dependency-free avoids
// a second validation stack while still making restaurant ownership part of the
// typed mobile upload contract.
const restaurantImageInputParser = {
  _input: {} as RestaurantImageInput,
  _output: {} as RestaurantImageInput,
  parseAsync: (input: unknown): Promise<RestaurantImageInput> =>
    Promise.resolve().then(() => {
      const restaurantId = getRestaurantId(input, false);
      return restaurantId ? { restaurantId } : {};
    }),
};

const menuItemImageInputParser = {
  _input: {} as MenuItemImageInput,
  _output: {} as MenuItemImageInput,
  parseAsync: (input: unknown): Promise<MenuItemImageInput> =>
    Promise.resolve().then(() => ({
      restaurantId: getRestaurantId(input, true)!,
    })),
};

const profileImageInputParser = {
  _input: {} as ProfileImageInput,
  _output: {} as ProfileImageInput,
  parseAsync: (input: unknown): Promise<ProfileImageInput> =>
    Promise.resolve().then(() => {
      const value = parseInputObject(input);
      if (Object.keys(value).length > 0) {
        throw new Error('Unexpected upload input');
      }
      return {};
    }),
};

function getAuthorizationHeader(req: Request): string | undefined {
  const value = req.headers.authorization;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

export function createUploadRouter(authorizer: UploadAuthorizer): UploadRouter {
  const f = createUploadthing();

  return {
    // A restaurant does not exist yet during initial onboarding. In that case
    // the active restaurant-owner account is authorized; editing an existing
    // restaurant must also include its ID and prove ownership.
    restaurantImage: f({
      image: {
        maxFileSize: '4MB',
        maxFileCount: 1,
      },
    })
      .input(restaurantImageInputParser)
      .middleware(async ({ req, input }) =>
        authorizer.requireRestaurantOwner(
          getAuthorizationHeader(req),
          input.restaurantId,
        ),
      )
      .onUploadComplete(({ file }) => ({ url: file.ufsUrl })),

    // Menu uploads always target an existing restaurant, so a restaurant ID is
    // required and verified before UploadThing is allowed to create a URL.
    menuItemImage: f({
      image: {
        maxFileSize: '4MB',
        maxFileCount: 1,
      },
    })
      .input(menuItemImageInputParser)
      .middleware(async ({ req, input }) =>
        authorizer.requireRestaurantOwner(
          getAuthorizationHeader(req),
          input.restaurantId,
        ),
      )
      .onUploadComplete(({ file }) => ({ url: file.ufsUrl })),

    // Any signed-in active account (customer, driver, owner, admin) can set a
    // profile photo. Ownership is the JWT subject itself.
    profileImage: f({
      image: {
        maxFileSize: '2MB',
        maxFileCount: 1,
      },
    })
      .input(profileImageInputParser)
      .middleware(async ({ req }) =>
        authorizer.requireActiveUser(getAuthorizationHeader(req)),
      )
      .onUploadComplete(({ file }) => ({ url: file.ufsUrl })),
  } satisfies FileRouter;
}
