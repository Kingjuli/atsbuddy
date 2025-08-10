export function shortenId(id: string, head = 8, tail = 4): string {
  if (!id) return "-";
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}


