import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectState {
  lastProjectId: string;
  setLastProjectId: (projectId: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      lastProjectId: '',
      setLastProjectId: (projectId) => set({ lastProjectId: projectId }),
    }),
    {
      name: 'qurvo-project',
      partialize: (state) => ({ lastProjectId: state.lastProjectId }),
    },
  ),
);
