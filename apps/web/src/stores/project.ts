import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectState {
  lastProjectId: string;
  setLastProjectId: (projectId: string) => void;
  projectTimezone: string;
  setProjectTimezone: (tz: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      lastProjectId: '',
      setLastProjectId: (projectId) => set({ lastProjectId: projectId }),
      projectTimezone: 'UTC',
      setProjectTimezone: (tz) => set({ projectTimezone: tz }),
    }),
    {
      name: 'qurvo-project',
      partialize: (state) => ({ lastProjectId: state.lastProjectId }),
    },
  ),
);
