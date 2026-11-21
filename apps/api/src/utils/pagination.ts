import { Response } from "express";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export function parsePaginationParams(
  query: Record<string, any> = {},
  defaultLimit = 30,
  maxLimit = 100
): PaginationParams {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(maxLimit, Math.floor(rawLimit))
      : defaultLimit;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function setPaginationAndCacheHeaders(
  res: Response,
  meta: {
    page: number;
    limit: number;
    total?: number;
    maxAgeSeconds?: number;
  }
): void {
  res.setHeader("X-Page", String(meta.page));
  res.setHeader("X-Limit", String(meta.limit));
  if (typeof meta.total === "number") {
    res.setHeader("X-Total-Count", String(meta.total));
    res.setHeader("X-Total-Pages", String(Math.max(1, Math.ceil(meta.total / meta.limit))));
  }
  const maxAge = meta.maxAgeSeconds ?? 0;
  if (maxAge > 0) {
    res.setHeader("Cache-Control", `private, max-age=${maxAge}`);
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
}
