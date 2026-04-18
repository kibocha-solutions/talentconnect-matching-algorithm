"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { defaultJobs } from "@/data/default-jobs";
import { defaultApplications } from "@/data/default-applications";
import { checkApiStatus, type ApiStatus } from "@/lib/api";
import type { ApplicationRecord, JobRecord } from "@/lib/schemas";

type ActivityItem = {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
};

type ImportStats = {
  jobs: number;
  applications: number;
};

type WorkspaceState = {
  jobs: JobRecord[];
  applications: ApplicationRecord[];
  importStats: ImportStats;
  activity: ActivityItem[];
};

type WorkspaceContextValue = WorkspaceState & {
  apiStatus: ApiStatus;
  apiStatusLoading: boolean;
  setJobs: (updater: JobRecord[] | ((current: JobRecord[]) => JobRecord[]), activity?: Omit<ActivityItem, "id" | "createdAt">) => void;
  setApplications: (updater: ApplicationRecord[] | ((current: ApplicationRecord[]) => ApplicationRecord[]), activity?: Omit<ActivityItem, "id" | "createdAt">) => void;
  noteImportedJobs: (count: number) => void;
  noteImportedApplications: (count: number) => void;
  refreshApiStatus: () => Promise<ApiStatus>;
};

const storageKey = "talentconnect.workspace.v2";

const initialState: WorkspaceState = {
  jobs: defaultJobs,
  applications: defaultApplications,
  importStats: { jobs: 0, applications: 0 },
  activity: [
    {
      id: "seed-jobs",
      label: "Seeded jobs loaded",
      detail: "15 backend-oriented jobs are available for review.",
      createdAt: "2026-04-16T10:35:00.000Z",
    },
    {
      id: "seed-applications",
      label: "Seeded applications loaded",
      detail: "15 realistic application records are available for review.",
      createdAt: "2026-04-17T08:00:00.000Z",
    },
  ],
};

const initialApiStatus: ApiStatus = {
  health: "checking",
  matchEndpoint: "unknown",
  apiBaseUrl: "http://127.0.0.1:8000",
  message: "Checking backend status.",
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(initialState);
  const [loaded, setLoaded] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>(initialApiStatus);
  const [apiStatusLoading, setApiStatusLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        setState(JSON.parse(stored) as WorkspaceState);
      } catch {
        setState(initialState);
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [loaded, state]);

  const refreshApiStatus = useCallback(async () => {
    setApiStatusLoading(true);
    const nextStatus = await checkApiStatus();
    setApiStatus(nextStatus);
    setApiStatusLoading(false);
    return nextStatus;
  }, []);

  useEffect(() => {
    void refreshApiStatus();
  }, [refreshApiStatus]);

  const pushActivity = useCallback((activity?: Omit<ActivityItem, "id" | "createdAt">) => {
    if (!activity) {
      return;
    }

    setState((current) => ({
      ...current,
      activity: [
        {
          ...activity,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        },
        ...current.activity,
      ].slice(0, 10),
    }));
  }, []);

  const setJobs = useCallback<WorkspaceContextValue["setJobs"]>((updater, activity) => {
    setState((current) => ({
      ...current,
      jobs: typeof updater === "function" ? updater(current.jobs) : updater,
    }));
    pushActivity(activity);
  }, [pushActivity]);

  const setApplications = useCallback<WorkspaceContextValue["setApplications"]>((updater, activity) => {
    setState((current) => ({
      ...current,
      applications: typeof updater === "function" ? updater(current.applications) : updater,
    }));
    pushActivity(activity);
  }, [pushActivity]);

  const noteImportedJobs = useCallback((count: number) => {
    setState((current) => ({
      ...current,
      importStats: {
        ...current.importStats,
        jobs: current.importStats.jobs + count,
      },
    }));
  }, []);

  const noteImportedApplications = useCallback((count: number) => {
    setState((current) => ({
      ...current,
      importStats: {
        ...current.importStats,
        applications: current.importStats.applications + count,
      },
    }));
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...state,
      apiStatus,
      apiStatusLoading,
      setJobs,
      setApplications,
      noteImportedJobs,
      noteImportedApplications,
      refreshApiStatus,
    }),
    [apiStatus, apiStatusLoading, noteImportedApplications, noteImportedJobs, refreshApiStatus, setApplications, setJobs, state],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used within WorkspaceProvider.");
  }
  return value;
}

export function useOverviewMetrics() {
  const { jobs, applications, importStats } = useWorkspace();

  return useMemo(() => {
    const visibleJobs = jobs.filter((job) => job.visible && !job.archived).length;
    const archivedJobs = jobs.filter((job) => job.archived).length;

    return {
      totalJobs: jobs.length,
      visibleJobs,
      hiddenJobs: jobs.length - visibleJobs - archivedJobs,
      archivedJobs,
      totalApplications: applications.length,
      importedJobRecords: importStats.jobs,
      importedApplicationRecords: importStats.applications,
    };
  }, [applications.length, importStats.applications, importStats.jobs, jobs]);
}
