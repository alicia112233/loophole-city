function setting(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return process.env[name] && Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * Spending limits. One "day" is one model call, at most about $0.13 on Opus 5.5.
 * A full game is 15 days plus the final newspaper, which also counts as one day.
 */
export function limits() {
  return {
    /** Hard ceiling on model calls in any 24 hours. New games stop at 80% of this. */
    daysPerDay: setting("MAX_DAYS_PER_DAY", 100),
    /** New games wait once this many calls ran in the last hour. Running games are not affected. */
    daysPerHour: setting("MAX_DAYS_PER_HOUR", 40),
    /** One full game, plus 15 more days of rewinding and trying other laws. */
    daysPerTown: setting("MAX_DAYS_PER_TOWN", 30),
    /** Joining a town is free, so a whole room can share one town. */
    townsPerIpPerDay: setting("MAX_TOWNS_PER_IP_PER_DAY", 5),
    feedbackPerIpPerDay: setting("MAX_FEEDBACK_PER_IP_PER_DAY", 5),
  };
}

/**
 * Reduces an address to the network it represents. A home IPv6 connection owns a whole
 * /64, so counting single addresses would let one player rotate through endless "new" IPs.
 */
export function networkKey(ip: string) {
  const value = ip.trim().toLowerCase().split("%")[0].replace(/^::ffff:(?=\d+\.)/, "");
  if (!value.includes(":")) return value;
  const [head, tail] = value.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = tail === undefined ? 0 : Math.max(8 - left.length - right.length, 0);
  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/** On Vercel the platform sets x-forwarded-for itself, so players cannot spoof it. */
export function clientNetwork(headers: Headers) {
  const ip = headers.get("x-forwarded-for")?.split(",")[0] || headers.get("x-real-ip") || "unknown";
  return networkKey(ip);
}