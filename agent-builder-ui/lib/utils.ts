import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function capitalizeFirstLetter(name: string): string {
  if (!name) return "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}
