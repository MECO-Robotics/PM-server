import {
  getManufacturingItems,
  getPurchaseItems,
  getSnapshot,
  getTasks,
} from "../../data/store";
import { paginatedQuerySchema } from "../routeSchemas";

const PAGE_SIZE_OPTIONS = [15, 30, 60] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSizeOption = PAGE_SIZE_OPTIONS[0];

function parsePaginationQuery(query: unknown) {
  const parsed = paginatedQuerySchema.safeParse(query ?? {});
  const requestedPage = parsed.success ? parsed.data.page : undefined;
  const requestedPageSize = parsed.success ? parsed.data.pageSize : undefined;
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize as PageSizeOption)
    ? (requestedPageSize as PageSizeOption)
    : DEFAULT_PAGE_SIZE;

  return {
    page: requestedPage ?? 1,
    pageSize,
  };
}

export function paginateItems<T>(items: T[], query: unknown) {
  const { page: requestedPage, pageSize } = parsePaginationQuery(query);
  const totalItems = items.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export function readPersonFilter(request: { query?: unknown }) {
  const candidate = request.query as { personId?: unknown } | undefined;
  const personId =
    typeof candidate?.personId === "string" && candidate.personId.trim().length > 0
      ? candidate.personId.trim()
      : null;

  return personId;
}

export function filterTasksForPerson(personId: string | null) {
  const tasks = getTasks();
  if (!personId) {
    return tasks;
  }

  return tasks.filter((task) => {
    return (
      task.ownerId === personId ||
      (task.assigneeIds ?? []).includes(personId) ||
      task.mentorId === personId
    );
  });
}

export function filterPurchaseItemsForPerson(personId: string | null) {
  const items = getPurchaseItems();
  if (!personId) {
    return items;
  }

  return items.filter((item) => item.requestedById === personId);
}

export function filterManufacturingItemsForPerson(personId: string | null) {
  const items = getManufacturingItems();
  if (!personId) {
    return items;
  }

  return items.filter((item) => item.requestedById === personId);
}

export function filterWorkLogsForPerson(personId: string | null) {
  const workLogs = getSnapshot().workLogs;
  if (!personId) {
    return workLogs;
  }

  return workLogs.filter((workLog) => workLog.participantIds.includes(personId));
}

export function withManufacturingQaReviewCounts(
  items: ReturnType<typeof getManufacturingItems>,
  snapshot = getSnapshot(),
) {
  const counts = new Map<string, number>();
  for (const review of snapshot.qaReviews) {
    if (review.subjectType !== "manufacturing") {
      continue;
    }

    counts.set(review.subjectId, (counts.get(review.subjectId) ?? 0) + 1);
  }

  return items.map((item) => ({
    ...item,
    qaReviewCount: counts.get(item.id) ?? 0,
  }));
}
