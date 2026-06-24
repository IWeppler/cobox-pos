import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItemStore } from "@/entities/cart/types";

interface CartState {
  items: CartItemStore[];
  isOpen: boolean;

  addItem: (item: CartItemStore) => void;
  removeItem: (productoId: string, variante: string) => void;
  updateQuantity: (
    productoId: string,
    variante: string,
    cantidad: number,
  ) => void;
  clearCart: () => void;

  toggleCart: () => void;
  setIsOpen: (isOpen: boolean) => void;

  getTotalItems: () => number;
  getTotalPrice: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (newItem) => {
        set((state) => {
          const existingItemIndex = state.items.findIndex(
            (item) =>
              item.productoId === newItem.productoId &&
              item.variante === newItem.variante,
          );

          if (existingItemIndex >= 0) {
            const updatedItems = [...state.items];
            const currentItem = updatedItems[existingItemIndex];

            const newQuantity = Math.min(
              currentItem.cantidad + newItem.cantidad,
              currentItem.stockMaximo,
            );

            updatedItems[existingItemIndex] = {
              ...currentItem,
              cantidad: newQuantity,
            };

            return { items: updatedItems, isOpen: true };
          }

          return {
            items: [...state.items, newItem],
            isOpen: true,
          };
        });
      },

      removeItem: (productoId, variante) => {
        set((state) => ({
          items: state.items.filter(
            (item) =>
              !(item.productoId === productoId && item.variante === variante),
          ),
        }));
      },

      updateQuantity: (productoId, variante, cantidad) => {
        set((state) => ({
          items: state.items.map((item) => {
            if (item.productoId === productoId && item.variante === variante) {
              // Nos aseguramos de no pasar el stock máximo ni bajar de 1
              const safeQuantity = Math.max(
                1,
                Math.min(cantidad, item.stockMaximo),
              );
              return { ...item, cantidad: safeQuantity };
            }
            return item;
          }),
        }));
      },

      clearCart: () => set({ items: [] }),

      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      setIsOpen: (isOpen) => set({ isOpen }),

      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.cantidad, 0);
      },

      getTotalPrice: () => {
        return get().items.reduce(
          (total, item) => total + item.precio * item.cantidad,
          0,
        );
      },
    }),
    {
      name: "vivero-tostado-storage",
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
