import "server-only";

import { performance } from "node:perf_hooks";

import { NextResponse, type NextResponse as NextResponseType } from "next/server";

export type ServerTimingMetric =
  | "auth"
  | "user"
  | "db"
  | "enrichment"
  | "photo";

export class ServerTiming {
  private readonly durations = new Map<ServerTimingMetric, number>();

  async measure<T>(metric: ServerTimingMetric, operation: () => Promise<T>) {
    const startedAt = performance.now();

    try {
      return await operation();
    } finally {
      this.add(metric, performance.now() - startedAt);
    }
  }

  measureSync<T>(metric: ServerTimingMetric, operation: () => T) {
    const startedAt = performance.now();

    try {
      return operation();
    } finally {
      this.add(metric, performance.now() - startedAt);
    }
  }

  apply(response: NextResponseType) {
    if (this.durations.size > 0) {
      response.headers.set(
        "Server-Timing",
        [...this.durations.entries()]
          .map(([metric, duration]) => `${metric};dur=${duration.toFixed(1)}`)
          .join(", "),
      );
    }

    return response;
  }

  private add(metric: ServerTimingMetric, duration: number) {
    this.durations.set(metric, (this.durations.get(metric) ?? 0) + duration);
  }
}

export function timedJson(
  timing: ServerTiming,
  body: unknown,
  init?: ResponseInit,
) {
  return timing.apply(NextResponse.json(body, init));
}
