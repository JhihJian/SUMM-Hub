/**
 * FNV-1a 哈希算法
 * 用于将 Session ID 映射到 Consumer 实例
 */
export function fnv1aHash(str: string): number {
  const FNV_PRIME = 0x01000193;
  const FNV_OFFSET = 0x811c9dc5;

  let hash = FNV_OFFSET;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }

  // 转为无符号 32 位整数
  return hash >>> 0;
}

/**
 * 判断当前 Consumer 是否拥有该 Session
 * @param sessionId Session ID
 * @param consumerId 当前 Consumer 实例 ID
 * @param total 总 Consumer 实例数
 */
export function ownsSession(
  sessionId: string,
  consumerId: number,
  total: number
): boolean {
  const hash = fnv1aHash(sessionId);
  const assignedConsumer = hash % total;
  return assignedConsumer === consumerId;
}
