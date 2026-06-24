import { create } from "zustand";

interface SidebarState {
  isCollapsed: boolean;
  isOpenMobile: boolean;
  toggleSidebar: () => void;
  setIsOpenMobile: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: false,
  isOpenMobile: false,
  toggleSidebar: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setIsOpenMobile: (open) => set({ isOpenMobile: open }),
}));
