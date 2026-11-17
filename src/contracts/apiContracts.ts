import { z } from 'zod';

export const OAuthTokenContract = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

export const UserContract = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'sdet', 'developer', 'viewer']),
  active: z.boolean(),
  createdAt: z.string().min(1),
});

export const UsersListContract = z.object({
  users: z.array(UserContract),
  total: z.number().int().nonnegative(),
});

export const ProductContract = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  price: z.number().positive(),
  stock: z.number().int().nonnegative(),
});

export const ProductsListContract = z.object({
  products: z.array(ProductContract),
  total: z.number().int().nonnegative(),
});

export const OrderContract = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  totalAmount: z.number().positive(),
  status: z.enum(['pending', 'confirmed', 'cancelled']),
  createdAt: z.string().min(1),
});

export const ApiErrorContract = z.object({
  error: z.string().min(1),
  message: z.string().optional(),
  error_description: z.string().optional(),
});
