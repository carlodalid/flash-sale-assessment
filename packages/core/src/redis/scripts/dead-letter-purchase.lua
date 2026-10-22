-- Gives up on a purchase the worker could not persist, atomically:
-- marks it FAILED, returns the unit to stock, records it on the dead-letter
-- stream and acknowledges the original message so it is not redelivered.
--
-- If the sale was reset since the message was queued, the message belongs to a
-- sale that no longer exists: it is only acknowledged, so it can't touch the new
-- sale's stock.
--
-- KEYS[1] sale hash        KEYS[2] stock counter     KEYS[3] purchases hash
-- KEYS[4] purchase stream  KEYS[5] dead-letter stream
-- ARGV[1] consumer group   ARGV[2] stream message id ARGV[3] saleId
-- ARGV[4] userId           ARGV[5] purchaseId        ARGV[6] failed record (JSON)
-- ARGV[7] failure reason

redis.call('XACK', KEYS[4], ARGV[1], ARGV[2])

if redis.call('HGET', KEYS[1], 'id') ~= ARGV[3] then
  return 'STALE'
end

redis.call('HSET', KEYS[3], ARGV[4], ARGV[6])
redis.call('INCR', KEYS[2])
redis.call('XADD', KEYS[5], '*',
  'purchaseId', ARGV[5],
  'saleId', ARGV[3],
  'userId', ARGV[4],
  'reason', ARGV[7])

return 'DEAD_LETTERED'
