export type StoredException = {
  id: string;
  category: string;
  details: string | null;
  occurredAt: string;
};

export type ExceptionCategoryGroup = "loading" | "vehicle" | "delivery" | "delay" | "cargo" | "other";

export type ExceptionCategoryInfo = {
  group: ExceptionCategoryGroup;
  label: string;
  badgeClass: string;
};

export function classifyExceptionCategory(category: string): ExceptionCategoryInfo {
  const norm = category.trim().toLowerCase();

  if (norm.includes("load") || norm.includes("shortfall") || norm.includes("pallet") || norm.includes("dock")) {
    return {
      group: "loading",
      label: "Loading Issue",
      badgeClass: "badge-exception-loading",
    };
  }

  if (norm.includes("vehic") || norm.includes("breakdown") || norm.includes("truck") || norm.includes("van") || norm.includes("fuel") || norm.includes("tire")) {
    return {
      group: "vehicle",
      label: "Vehicle & Fleet",
      badgeClass: "badge-exception-vehicle",
    };
  }

  if (norm.includes("deliver") || norm.includes("outlet") || norm.includes("access") || norm.includes("gate") || norm.includes("refus")) {
    return {
      group: "delivery",
      label: "Delivery Access",
      badgeClass: "badge-exception-delivery",
    };
  }

  if (norm.includes("delay") || norm.includes("traffic") || norm.includes("weather") || norm.includes("flood") || norm.includes("rain") || norm.includes("time")) {
    return {
      group: "delay",
      label: "Traffic & Delay",
      badgeClass: "badge-exception-delay",
    };
  }

  if (norm.includes("damag") || norm.includes("temp") || norm.includes("chill") || norm.includes("spoil") || norm.includes("leak") || norm.includes("qual")) {
    return {
      group: "cargo",
      label: "Cargo & Quality",
      badgeClass: "badge-exception-cargo",
    };
  }

  return {
    group: "other",
    label: "Operational Issue",
    badgeClass: "badge-exception-other",
  };
}

export function readExceptionList(value: unknown): StoredException[] {
  if (!Array.isArray(value)) return [];

  const list: StoredException[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.category !== "string") continue;

    const occurredAt = typeof record.occurredAt === "string" ? record.occurredAt : "—";
    const details = typeof record.details === "string" ? record.details : null;

    list.push({
      id: record.id,
      category: record.category.trim(),
      details: details ? details.trim() : null,
      occurredAt,
    });
  }

  // Sort by occurredAt descending (most recent first)
  return list.sort((a, b) => {
    const timeA = Date.parse(a.occurredAt);
    const timeB = Date.parse(b.occurredAt);
    if (Number.isNaN(timeA) || Number.isNaN(timeB)) return 0;
    return timeB - timeA;
  });
}

export type ExceptionsKpiSummary = {
  totalExceptions: number;
  loadingCount: number;
  vehicleCount: number;
  deliveryCount: number;
  otherCount: number;
};

export function computeExceptionsKpis(exceptions: readonly StoredException[]): ExceptionsKpiSummary {
  let loadingCount = 0;
  let vehicleCount = 0;
  let deliveryCount = 0;
  let otherCount = 0;

  for (const ex of exceptions) {
    const info = classifyExceptionCategory(ex.category);
    if (info.group === "loading") {
      loadingCount++;
    } else if (info.group === "vehicle") {
      vehicleCount++;
    } else if (info.group === "delivery") {
      deliveryCount++;
    } else {
      otherCount++;
    }
  }

  return {
    totalExceptions: exceptions.length,
    loadingCount,
    vehicleCount,
    deliveryCount,
    otherCount,
  };
}

export type ExceptionFilters = {
  search: string;
  categoryGroup: string;
};

export function filterExceptionsList(
  exceptions: readonly StoredException[],
  filters: ExceptionFilters,
): StoredException[] {
  const search = filters.search.trim().toLowerCase();
  const group = filters.categoryGroup;

  return exceptions.filter((ex) => {
    if (group && group !== "ALL") {
      const info = classifyExceptionCategory(ex.category);
      if (info.group !== group) return false;
    }

    if (search === "") return true;

    return (
      ex.id.toLowerCase().includes(search) ||
      ex.category.toLowerCase().includes(search) ||
      (ex.details && ex.details.toLowerCase().includes(search))
    );
  });
}

export function validateCreateExceptionInput(
  category: string,
  details?: string,
): { ok: true; category: string; details?: string } | { ok: false; error: string } {
  const trimmedCategory = category.trim();
  if (trimmedCategory.length === 0) {
    return { ok: false, error: "Exception category is required." };
  }
  if (trimmedCategory.toLowerCase() === "custom") {
    return { ok: false, error: "Enter a descriptive category instead of the placeholder value." };
  }

  const trimmedDetails = details?.trim();
  return {
    ok: true,
    category: trimmedCategory,
    ...(trimmedDetails && trimmedDetails.length > 0 ? { details: trimmedDetails } : {}),
  };
}

export function exportExceptionsCsv(exceptions: readonly StoredException[]): string {
  const header = [
    "Exception ID",
    "Category",
    "Category Group",
    "Details",
    "Occurred At",
    "Status",
  ].join(",");

  const rows = exceptions.map((ex) => {
    const info = classifyExceptionCategory(ex.category);
    return [
      csvEscape(ex.id),
      csvEscape(ex.category),
      csvEscape(info.label),
      csvEscape(ex.details ?? "—"),
      csvEscape(ex.occurredAt),
      "Reported",
    ].join(",");
  });

  return [header, ...rows].join("\r\n");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
