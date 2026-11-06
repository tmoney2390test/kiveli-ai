/** Small in-memory PostgREST test double: filters execute before mutations. */
export function homeTestDb(
  tables: Record<string, any[]>,
  errors: Record<string, string> = {},
) {
  const calls: Array<{ table: string; filters: any[]; columns: string }> = [];
  const from = (table: string) => {
    const filters: any[] = [],
      state = { columns: "*", patch: null as any, one: false, limit: Infinity };
    const q: any = {
      select: (columns = "*") => {
        state.columns = columns;
        return q;
      },
      update: (patch: any) => {
        state.patch = patch;
        return q;
      },
      order: () => q,
      limit: (n: number) => {
        state.limit = n;
        return q;
      },
      single: () => {
        state.one = true;
        return q;
      },
      maybeSingle: () => {
        state.one = true;
        return q;
      },
    };
    for (const op of ["eq", "neq", "is", "in", "gt", "gte", "lt", "contains"]) {
      q[op] = (column: string, value: any) => {
        filters.push([op, column, value]);
        return q;
      };
    }
    q.then = (resolve: any, reject: any) =>
      Promise.resolve().then(() => {
        calls.push({ table, filters: [...filters], columns: state.columns });
        if (errors[table]) {
          return { data: null, error: { message: errors[table] } };
        }
        let rows = (tables[table] ?? []).filter((row) =>
          filters.every(([op, key, value]) => {
            const actual = key.split(".").reduce(
              (x: any, k: string) => x?.[k],
              row,
            );
            if (op === "eq" || op === "is") {
              return actual === value;
            }
            if (op === "neq") {
              return actual !== value;
            }
            if (op === "in") return value.includes(actual);
            if (op === "gt") return actual > value;
            if (op === "gte") return actual >= value;
            if (op === "lt") return actual < value;
            return value.every((v: any) => actual?.includes(v));
          })
        ).slice(0, state.limit);
        if (state.patch) rows.forEach((row) => Object.assign(row, state.patch));
        return { data: state.one ? rows[0] ?? null : rows, error: null };
      }).then(resolve, reject);
    return q;
  };
  return { from, calls };
}
