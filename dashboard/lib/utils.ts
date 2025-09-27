import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || apiUrl;
