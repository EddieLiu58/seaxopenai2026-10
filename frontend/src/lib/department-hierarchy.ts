import type { Department } from "./api/types";

export type DepartmentNode = {
  department: Department;
  children: DepartmentNode[];
};

// The API supplies prose, not parent IDs. Only explicit, unambiguous
// reporting statements are converted to edges; all other departments remain visible.
export function departmentHierarchy(
  departments: Department[],
  description: string,
) {
  const byName = new Map(
    departments.map((department) => [department.name, department]),
  );
  const escapedNames = [...byName.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const names = new RegExp(escapedNames.join("|"), "g");
  const section = description.includes("【上下隸屬】")
    ? description.split("【上下隸屬】")[1].split("【")[0]
    : description;
  const parents = new Map<string, string>();
  const explicitRoots = new Set<string>();
  const ambiguous = new Set<string>();
  if (departments.length === 0) return { roots: [], unplaced: [] };
  for (const sentence of section
    .split(/[。；;\n]/)
    .map((value) => value.trim())
    .filter(Boolean)) {
    for (const department of departments) {
      if (sentence.startsWith(`${department.name}為根節點`))
        explicitRoots.add(department.id);
    }
    const relation = sentence.match(
      /^(.+?)(?:直接隸屬於?|隸屬於|直屬於?)(.+)$/,
    );
    if (!relation) continue;
    const parent = byName.get(relation[2].trim());
    if (!parent) continue;
    const childNames = relation[1].match(names) || [];
    // Reject narrative/negation around the child names instead of guessing.
    if (!/^[、，,與和及\s]*$/.test(relation[1].replace(names, ""))) continue;
    for (const name of childNames) {
      const child = byName.get(name)!;
      if (
        child.id === parent.id ||
        (parents.has(child.id) && parents.get(child.id) !== parent.id)
      )
        ambiguous.add(child.id);
      else parents.set(child.id, parent.id);
    }
  }
  for (const id of explicitRoots) if (parents.has(id)) ambiguous.add(id);
  for (const id of ambiguous) parents.delete(id);
  // Drop cycle edges; never draw a misleading hierarchy or recurse forever.
  const cycles = new Set<string>();
  for (const id of parents.keys()) {
    const path: string[] = [];
    let cursor: string | undefined = id;
    while (cursor && parents.has(cursor)) {
      const index = path.indexOf(cursor);
      if (index !== -1) {
        path.slice(index).forEach((node) => cycles.add(node));
        break;
      }
      path.push(cursor);
      cursor = parents.get(cursor);
    }
  }
  for (const id of cycles) parents.delete(id);
  const known = new Set([
    ...parents.keys(),
    ...parents.values(),
    ...explicitRoots,
  ]);
  const build = (department: Department): DepartmentNode => ({
    department,
    children: departments
      .filter((child) => parents.get(child.id) === department.id)
      .map(build),
  });
  return {
    roots: departments
      .filter(
        (department) => known.has(department.id) && !parents.has(department.id),
      )
      .map(build),
    unplaced: departments.filter((department) => !known.has(department.id)),
  };
}
