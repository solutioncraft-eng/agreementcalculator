"use client";

import { useEffect, useState } from "react";

/**
 * Renders an ISO timestamp in the viewer's own time zone. Server-side (and on
 * the first client paint) it falls back to UTC so the markup matches; the
 * browser then swaps in local time.
 */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => `${iso.slice(0, 16).replace("T", " ")} UTC`);

  useEffect(() => {
    setText(
      new Date(iso).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    );
  }, [iso]);

  return (
    <time dateTime={iso} title={`${iso.slice(0, 19).replace("T", " ")} UTC`}>
      {text}
    </time>
  );
}
