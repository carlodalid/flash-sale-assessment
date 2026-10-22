-- The purchase gate. Redis runs scripts one at a time, so every check and write
-- below happens as a single atomic step: no two buyers can both take the last
-- unit, and no buyer can get through twice.
--
-- Enqueueing (XADD) happens inside the same step. An accepted purchase is
-- therefore always on the queue, and nothing is queued without being accepted.
--
-- KEYS[1] sale hash      KEYS[2] stock counter
-- KEYS[3] purchases hash KEYS[4] purchase stream
-- ARGV[1] userId         ARGV[2] purchase record (JSON, status PENDING)
-- ARGV[3] purchaseId     ARGV[4] createdAt (ISO-8601)

local sale = redis.call('HMGET', KEYS[1], 'id', 'startsAtMs', 'endsAtMs')
local saleId, startsAtMs, endsAtMs = sale[1], tonumber(sale[2]), tonumber(sale[3])
if not saleId then
  return 'SALE_NOT_ACTIVE'
end

-- Redis' clock, not the caller's, so every API instance agrees on the window.
local time = redis.call('TIME')
local nowMs = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if nowMs < startsAtMs or nowMs >= endsAtMs then
  return 'SALE_NOT_ACTIVE'
end

if redis.call('HEXISTS', KEYS[3], ARGV[1]) == 1 then
  return 'ALREADY_PURCHASED'
end

if tonumber(redis.call('GET', KEYS[2]) or '0') <= 0 then
  return 'SOLD_OUT'
end

redis.call('DECR', KEYS[2])
redis.call('HSET', KEYS[3], ARGV[1], ARGV[2])
redis.call('XADD', KEYS[4], '*',
  'purchaseId', ARGV[3],
  'saleId', saleId,
  'userId', ARGV[1],
  'createdAt', ARGV[4])

return 'ACCEPTED'
