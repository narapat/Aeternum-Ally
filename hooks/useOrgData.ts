import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseOrgDataResult<T> {
  data: T;
  setData: (next: T) => void;
  save: () => Promise<void>;
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
  saveStatus: SaveStatus;
  errorMessage: string | null;
}

interface Options<T> {
  table: string;
  orgId: string | null;
  defaultValue: T;
  fromDb: (row: any) => T;
  toDb: (data: T) => Record<string, any>;
  /** Debounce window in ms before auto-save fires after last change. */
  debounceMs?: number;
}

/**
 * One-row-per-organization data hook with debounced auto-save and an explicit save() escape hatch.
 *
 *  - On mount: loads the row for `orgId` (or returns defaultValue if no row exists).
 *  - On setData(): updates local state and schedules an auto-save.
 *  - On save():   cancels pending auto-save and writes immediately.
 */
export function useOrgData<T>({
  table,
  orgId,
  defaultValue,
  fromDb,
  toDb,
  debounceMs = 2000,
}: Options<T>): UseOrgDataResult<T> {
  const [data, setLocalData] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dataRef = useRef(data);
  const orgIdRef = useRef(orgId);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  dataRef.current = data;
  orgIdRef.current = orgId;

  // ----- Load -----
  useEffect(() => {
    if (!orgId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    supabase
      .from(table)
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (cancelled) return;
        if (error) {
          setErrorMessage(error.message);
        } else if (row) {
          setLocalData(fromDb(row));
        } else {
          // no row yet — keep defaultValue
        }
        setIsDirty(false);
        setSaveStatus("idle");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // fromDb is intentionally omitted — callers pass module-scope (stable) refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, table]);

  // ----- Save -----
  const save = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const currentOrgId = orgIdRef.current;
    if (!currentOrgId) return;

    setSaveStatus("saving");
    setErrorMessage(null);

    const payload = { ...toDb(dataRef.current), organization_id: currentOrgId };
    const { error } = await supabase
      .from(table)
      .upsert(payload, { onConflict: "organization_id" });

    if (error) {
      setSaveStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setIsDirty(false);
    setSaveStatus("saved");

    if (savedClearTimerRef.current) clearTimeout(savedClearTimerRef.current);
    savedClearTimerRef.current = setTimeout(() => {
      setSaveStatus((cur) => (cur === "saved" ? "idle" : cur));
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  // ----- Debounced auto-save -----
  useEffect(() => {
    if (!isDirty) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      save();
    }, debounceMs);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [data, isDirty, debounceMs, save]);

  // ----- Cleanup on unmount -----
  useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedClearTimerRef.current) clearTimeout(savedClearTimerRef.current);
    },
    []
  );

  const setData = useCallback((next: T) => {
    setLocalData(next);
    setIsDirty(true);
    setSaveStatus("idle");
  }, []);

  return {
    data,
    setData,
    save,
    isDirty,
    isSaving: saveStatus === "saving",
    isLoading,
    saveStatus,
    errorMessage,
  };
}
