"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MutationInput } from "@/lib/mutations";
import { DEFAULT_GOALS } from "@/lib/constants";
import { keyOf } from "@/lib/dates";
import * as planning from "@/lib/planning";
import type { CheckKind, DraftRecipe, Goals, KitchenState, PantryItem, Plan, Recipe } from "@/lib/types";

/** How long a noisy edit (a tick, a goals slider) waits before it is saved. */
const DEBOUNCE_MS = 400;

export function useKitchenState() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plan, setPlan] = useState<Plan>({});
  const [goals, setGoalsState] = useState<Goals>(DEFAULT_GOALS);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [packed, setPacked] = useState<Record<string, boolean>>({});
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Actions read the plan from here rather than from a setState updater:
  // updaters must stay pure, and StrictMode runs them twice.
  const planRef = useRef<Plan>(plan);
  const tickedRef = useRef(ticked);
  const packedRef = useRef(packed);
  const goalsRef = useRef(goals);
  const pantryRef = useRef(pantry);
  const recipesRef = useRef<Recipe[]>([]);

  /**
   * Writes go out through a single chain rather than in parallel. One user
   * action can produce two of them — picking a dinner and doubling it, say —
   * and without ordering the second can land first, so the plan on disk ends
   * up a step behind what's on screen.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /**
   * Post a change. Structural edits go straight out; noisy ones coalesce.
   * `onFail` undoes an optimistic update the server refused.
   */
  const send = useCallback((mutation: MutationInput, debounceKey?: string, onFail?: () => void) => {
    const post = () => {
      queue.current = queue.current
        .then(async () => {
          const res = await fetch("/api/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mutation),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.error ?? `the server answered ${res.status}`);
          }
        })
        .catch((error: unknown) => {
          // The session keeps working, but the screen no longer matches the database.
          setSaveError(error instanceof Error ? error.message : String(error));
          onFail?.();
        });
    };

    if (!debounceKey) return post();

    clearTimeout(timers.current.get(debounceKey));
    timers.current.set(debounceKey, setTimeout(post, DEBOUNCE_MS));
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error(String(res.status));
        const state: KitchenState = await res.json();
        if (!alive) return;
        setPlan(state.plan ?? {});
        setGoalsState(state.goals ?? DEFAULT_GOALS);
        setTicked(state.ticked ?? {});
        setPacked(state.packed ?? {});
        setRecipes(state.recipes ?? []);
        setPantry(state.pantry ?? []);
      } catch {
        // Nothing saved yet, or the server is unreachable — start empty.
      }
      if (alive) setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Mirror state into the refs after each commit, before any event handler
  // can run. Actions also write the refs themselves, so two in one tick see
  // each other's result.
  useLayoutEffect(() => {
    planRef.current = plan;
    tickedRef.current = ticked;
    packedRef.current = packed;
    goalsRef.current = goals;
    pantryRef.current = pantry;
    recipesRef.current = recipes;
  }, [plan, ticked, packed, goals, pantry, recipes]);

  const commit = useCallback(
    (result: planning.PlanChange) => {
      planRef.current = result.next;
      setPlan(result.next);
      if (Object.keys(result.set).length || result.remove.length) {
        send({ op: "plan.write", set: result.set, remove: result.remove });
      }
    },
    [send]
  );

  /** A tick still waiting on its debounce would otherwise land after the clear. */
  const cancelPendingChecks = useCallback((kind: CheckKind, only: (key: string) => boolean) => {
    const prefix = `check:${kind}:`;
    for (const [key, timer] of timers.current) {
      if (key.startsWith(prefix) && only(key.slice(prefix.length))) {
        clearTimeout(timer);
        timers.current.delete(key);
      }
    }
  }, []);

  /**
   * Clear one kind of check for the given days only. Every check key starts
   * with a dateKey (the week's Sunday for a tick, the cooking night for a
   * packed item), so other weeks' ticks and packing are left alone.
   */
  const clearChecksFor = useCallback(
    (kind: CheckKind, days: Date[]) => {
      const prefixes = days.map((d) => `${keyOf(d)}|`);
      const inWeek = (key: string) => prefixes.some((p) => key.startsWith(p));
      cancelPendingChecks(kind, inWeek);
      const source = kind === "ticked" ? tickedRef : packedRef;
      const next = Object.fromEntries(Object.entries(source.current).filter(([key]) => !inWeek(key)));
      source.current = next;
      (kind === "ticked" ? setTicked : setPacked)(next);
      send({ op: "checks.clear", kind, days: days.map(keyOf) });
    },
    [send, cancelPendingChecks]
  );

  /** A new week means a new buy list, so that week's ticks and packing go too. */
  const clearAllChecks = useCallback(
    (days: Date[]) => {
      clearChecksFor("ticked", days);
      clearChecksFor("packed", days);
    },
    [clearChecksFor]
  );

  /** Local only: forget every night that points at `id`. */
  const dropRecipeFromPlan = useCallback((id: string) => {
    const next: Plan = {};
    for (const [key, entry] of Object.entries(planRef.current)) {
      if (entry && entry.recipeId !== id) next[key] = entry;
    }
    planRef.current = next;
    setPlan(next);
  }, []);

  const setPantryList = useCallback((next: PantryItem[]) => {
    pantryRef.current = next;
    setPantry(next);
  }, []);

  const actions = useMemo(
    () => ({
      assign: (dateKey: string, recipe: Recipe, servings?: number) =>
        commit(planning.assign(planRef.current, dateKey, recipe, servings)),

      clearDay: (dateKey: string) => commit(planning.clearDay(planRef.current, dateKey)),

      setServings: (dateKey: string, servings: number) =>
        commit(planning.setServings(planRef.current, dateKey, servings)),

      setCookFor: (dateKey: string, nights: 1 | 2) =>
        commit(planning.setCookFor(planRef.current, dateKey, nights)),

      /** Swap two nights, taking each kit's packing with it. Returns the doubles that had to become singles. */
      swapNights: (fromKey: string, toKey: string) => {
        const result = planning.swapNights(planRef.current, fromKey, toKey);
        commit(result);

        const rekey = (key: string) =>
          key.startsWith(`${fromKey}|`)
            ? `${toKey}${key.slice(fromKey.length)}`
            : key.startsWith(`${toKey}|`)
              ? `${fromKey}${key.slice(toKey.length)}`
              : key;
        const moved = Object.keys(packedRef.current).filter((key) => rekey(key) !== key);
        if (moved.length) {
          cancelPendingChecks("packed", (key) => moved.includes(key));
          const next: Record<string, boolean> = {};
          for (const [key, on] of Object.entries(packedRef.current)) next[rekey(key)] = on;
          packedRef.current = next;
          setPacked(next);
          send({
            op: "checks.write",
            set: moved.filter((key) => next[rekey(key)]).map((key) => ({ key: rekey(key), kind: "packed" as const })),
            remove: moved.filter((key) => !next[key]),
          });
        }
        return result.downgraded;
      },

      clearWeek: (days: Date[]) => {
        commit(planning.clearWeek(planRef.current, days));
        clearAllChecks(days);
      },

      /** `priority`: pantry keys the cook ticked for this roll to use first. */
      randomizeWeek: (days: Date[], nightKeys: string[], priority: string[] = []) => {
        commit(
          planning.randomizeWeek(
            planRef.current,
            days,
            nightKeys,
            recipesRef.current,
            Math.random,
            pantryRef.current,
            priority
          )
        );
        clearAllChecks(days);
      },

      setGoals: (update: (previous: Goals) => Goals) => {
        const next = update(goalsRef.current);
        goalsRef.current = next;
        setGoalsState(next);
        send({ op: "goals.write", goals: next }, "goals");
      },

      toggleCheck: (kind: "ticked" | "packed", key: string) => {
        const source = kind === "ticked" ? tickedRef : packedRef;
        const on = !source.current[key];
        const next = { ...source.current, [key]: on };
        source.current = next;
        (kind === "ticked" ? setTicked : setPacked)(next);
        send(
          on
            ? { op: "checks.write", set: [{ key, kind }], remove: [] }
            : { op: "checks.write", set: [], remove: [key] },
          `check:${kind}:${key}`
        );
      },

      clearChecks: (kind: CheckKind, days: Date[]) => clearChecksFor(kind, days),

      saveRecipe: (draft: DraftRecipe): Recipe => {
        const recipe: Recipe = { ...draft, id: `c${Date.now()}` };
        setRecipes((previous) => [recipe, ...previous]);
        // If the server refuses it, take it back out, along with any night
        // planned with it in the meantime (the server refused those too).
        send({ op: "recipe.add", recipe }, undefined, () => {
          setRecipes((previous) => previous.filter((r) => r.id !== recipe.id));
          dropRecipeFromPlan(recipe.id);
        });
        return recipe;
      },

      /** Add or re-date something in the kitchen. Leaving out `useBy` keeps the date it had. */
      addPantryItem: (item: string, useBy?: string) => {
        const name = item.trim();
        const key = planning.pantryKey(name);
        if (!key) return;
        const before = pantryRef.current.find((p) => p.key === key);
        const entry: PantryItem = { key, item: name, useBy: useBy ?? before?.useBy ?? null };
        setPantryList([...pantryRef.current.filter((p) => p.key !== key), entry].sort(planning.bySoonest));
        // It's an upsert, so undoing it puts back what was there, if anything.
        send({ op: "pantry.add", item: name, ...(useBy ? { useBy } : {}) }, undefined, () => {
          const rest = pantryRef.current.filter((p) => p.key !== key);
          setPantryList((before ? [...rest, before] : rest).sort(planning.bySoonest));
        });
      },

      removePantryItem: (key: string) => {
        const gone = pantryRef.current.find((p) => p.key === key);
        if (!gone) return;
        setPantryList(pantryRef.current.filter((p) => p.key !== key));
        send({ op: "pantry.remove", keys: [key] }, undefined, () =>
          setPantryList([...pantryRef.current, gone].sort(planning.bySoonest))
        );
      },

      deleteRecipe: (id: string) => {
        setRecipes((previous) => previous.filter((r) => r.id !== id));
        // Mirrors the server cascade: nothing may point at a recipe that is gone.
        dropRecipeFromPlan(id);
        send({ op: "recipe.delete", id });
      },
    }),
    [send, commit, cancelPendingChecks, clearAllChecks, clearChecksFor, dropRecipeFromPlan, setPantryList]
  );

  return { recipes, plan, goals, ticked, packed, pantry, loaded, saveError, ...actions };
}
